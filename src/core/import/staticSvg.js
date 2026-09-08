export const MAX_STATIC_SVG_BYTES = 2 * 1024 * 1024;
export const MAX_STATIC_SVG_ENTITIES = 1_000;
export const MAX_STATIC_SVG_PATH_COMMANDS = 25_000;
export const MAX_STATIC_SVG_COORDINATE = 10_000_000;
export const MAX_STATIC_SVG_ELEMENTS = 10_000;
export const MAX_STATIC_SVG_DEPTH = 64;

const MIN_GEOMETRY_SPAN = 0.000001;
const MIN_MILLIMETERS_PER_UNIT = 0.000001;
const MAX_MILLIMETERS_PER_UNIT = 1_000_000;

const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 1, 0, 0]);
const NUMBER_SOURCE = "[+-]?(?:(?:\\d+(?:\\.\\d*)?)|(?:\\.\\d+))(?:[eE][+-]?\\d+)?";
const NUMBER_AT_START = new RegExp(`^${NUMBER_SOURCE}`);
const SINGLE_NUMBER = new RegExp(`^${NUMBER_SOURCE}$`);
const SAFE_ID = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const PRESENTATION_ATTRIBUTES = new Set([
  "fill",
  "fill-rule",
  "opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
  "vector-effect",
]);
const ELEMENT_ATTRIBUTES = Object.freeze({
  svg: new Set([
    "data-mm-per-unit",
    "height",
    "preserveAspectRatio",
    "version",
    "viewBox",
    "width",
    "xmlns",
    "xmlns:xlink",
  ]),
  g: new Set(),
  path: new Set(["d"]),
  line: new Set(["x1", "x2", "y1", "y2"]),
  polyline: new Set(["points"]),
  polygon: new Set(["points"]),
  rect: new Set(["height", "width", "x", "y"]),
});
const DRAWABLE_ELEMENTS = new Set(["path", "line", "polyline", "polygon", "rect"]);
const FORBIDDEN_ELEMENTS = new Set(["script", "foreignobject", "style", "iframe", "object", "embed"]);
const REFERENCE_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);

export class StaticSvgImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "StaticSvgImportError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new StaticSvgImportError(code, message, details);
}

function positiveSafeLimit(value, fallback, name) {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return normalized;
}

function limitsFrom(options = {}) {
  return {
    maxBytes: positiveSafeLimit(options.maxBytes, MAX_STATIC_SVG_BYTES, "maxBytes"),
    maxEntities: positiveSafeLimit(options.maxEntities, MAX_STATIC_SVG_ENTITIES, "maxEntities"),
    maxElements: positiveSafeLimit(options.maxElements, MAX_STATIC_SVG_ELEMENTS, "maxElements"),
    maxDepth: positiveSafeLimit(options.maxDepth, MAX_STATIC_SVG_DEPTH, "maxDepth"),
    maxPathCommands: positiveSafeLimit(
      options.maxPathCommands,
      MAX_STATIC_SVG_PATH_COMMANDS,
      "maxPathCommands",
    ),
    maxCoordinate: positiveSafeLimit(
      options.maxCoordinate,
      MAX_STATIC_SVG_COORDINATE,
      "maxCoordinate",
    ),
  };
}

function utf8Bytes(source) {
  return new TextEncoder().encode(source);
}

async function sha256Hex(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  if (globalThis.process?.versions?.node) {
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(bytes).digest("hex");
  }

  fail("hash-unavailable", "SHA-256 is not available in this runtime.");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function assertSourceEnvelope(source, limits, sourceBytes = null) {
  if (typeof source !== "string") {
    fail("invalid-source", "SVG source must be a string.");
  }
  const bytes = sourceBytes instanceof Uint8Array ? sourceBytes : utf8Bytes(source);
  if (bytes.byteLength > limits.maxBytes) {
    fail("file-too-large", "SVG source exceeds the byte limit.", { maxBytes: limits.maxBytes });
  }
  if (source.includes("\0") || /[\u0001-\u0008\u000B\u000C\u000E-\u001F]/u.test(source)) {
    fail("invalid-xml-character", "SVG source contains a forbidden control character.");
  }
  if (/<!\s*DOCTYPE\b/i.test(source)) {
    fail("doctype-forbidden", "DOCTYPE declarations are not allowed.");
  }
  if (/<!\s*ENTITY\b/i.test(source)) {
    fail("entity-forbidden", "ENTITY declarations are not allowed.");
  }
  if (source.includes("&")) {
    fail("entity-reference-forbidden", "XML entity references are not allowed.");
  }
  if (/url\s*\(/i.test(source)) {
    fail("css-url-forbidden", "CSS url() references are not allowed.");
  }
  if (/<!\[CDATA\[/i.test(source)) {
    fail("cdata-forbidden", "CDATA sections are not allowed.");
  }
  return bytes;
}

function findTagEnd(source, start) {
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    } else if (character === "<") {
      fail("malformed-xml", "A tag contains an unexpected '<' character.", { offset: index });
    }
  }
  fail("malformed-xml", "An SVG tag is not terminated.", { offset: start - 1 });
}

function parseAttributes(raw, offset) {
  const attributes = new Map();
  const foldedNames = new Set();
  let index = 0;

  while (index < raw.length) {
    while (/\s/u.test(raw[index] || "")) index += 1;
    if (index >= raw.length) break;

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(raw.slice(index));
    if (!nameMatch) {
      fail("malformed-xml", "An SVG attribute name is malformed.", { offset: offset + index });
    }
    const name = nameMatch[0];
    index += name.length;
    while (/\s/u.test(raw[index] || "")) index += 1;
    if (raw[index] !== "=") {
      fail("malformed-xml", `Attribute '${name}' must have a quoted value.`, { offset: offset + index });
    }
    index += 1;
    while (/\s/u.test(raw[index] || "")) index += 1;
    const quote = raw[index];
    if (quote !== '"' && quote !== "'") {
      fail("malformed-xml", `Attribute '${name}' must use quotes.`, { offset: offset + index });
    }
    index += 1;
    const valueStart = index;
    while (index < raw.length && raw[index] !== quote) {
      if (raw[index] === "<") {
        fail("malformed-xml", `Attribute '${name}' contains '<'.`, { offset: offset + index });
      }
      index += 1;
    }
    if (index >= raw.length) {
      fail("malformed-xml", `Attribute '${name}' is not terminated.`, { offset: offset + valueStart });
    }
    const value = raw.slice(valueStart, index);
    index += 1;

    const folded = name.toLowerCase();
    if (foldedNames.has(folded)) {
      fail("duplicate-attribute", `Duplicate attribute '${name}' is not allowed.`, { attribute: name });
    }
    foldedNames.add(folded);
    attributes.set(name, value);
  }

  return attributes;
}

function tokenizeXml(source, limits) {
  const tokens = [];
  let index = source.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let xmlDeclarationSeen = false;
  let nonPreambleTokenSeen = false;
  let elementCount = 0;

  while (index < source.length) {
    if (source[index] !== "<") {
      const next = source.indexOf("<", index);
      const end = next === -1 ? source.length : next;
      const text = source.slice(index, end);
      if (text.trim()) {
        tokens.push({ type: "text", value: text, offset: index });
        nonPreambleTokenSeen = true;
      }
      index = end;
      continue;
    }

    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) fail("malformed-xml", "An SVG comment is not terminated.", { offset: index });
      if (source.slice(index + 4, end).includes("--")) {
        fail("malformed-xml", "An SVG comment contains an invalid '--' sequence.", { offset: index });
      }
      index = end + 3;
      continue;
    }

    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) fail("malformed-xml", "A processing instruction is not terminated.", { offset: index });
      const instruction = source.slice(index + 2, end).trim();
      if (nonPreambleTokenSeen || xmlDeclarationSeen || !/^xml\s+/i.test(instruction)) {
        fail("processing-instruction-forbidden", "Only one leading XML declaration is allowed.", {
          offset: index,
        });
      }
      xmlDeclarationSeen = true;
      index = end + 2;
      continue;
    }

    if (source.startsWith("<!", index)) {
      fail("declaration-forbidden", "XML declarations other than comments are not allowed.", { offset: index });
    }

    const end = findTagEnd(source, index + 1);
    let body = source.slice(index + 1, end).trim();
    if (!body) fail("malformed-xml", "An empty SVG tag is not allowed.", { offset: index });
    nonPreambleTokenSeen = true;

    if (body.startsWith("/")) {
      body = body.slice(1).trim();
      const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)\s*$/.exec(body);
      if (!match) fail("malformed-xml", "An SVG closing tag is malformed.", { offset: index });
      tokens.push({ type: "end", name: match[1], offset: index });
      index = end + 1;
      continue;
    }

    let selfClosing = false;
    if (/\/\s*$/u.test(body)) {
      selfClosing = true;
      body = body.replace(/\/\s*$/u, "").trimEnd();
    }
    const nameMatch = /^([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(body);
    if (!nameMatch) fail("malformed-xml", "An SVG opening tag is malformed.", { offset: index });
    const name = nameMatch[1];
    const remainder = body.slice(name.length);
    if (remainder && !/^\s/u.test(remainder)) {
      fail("malformed-xml", `Tag '${name}' is malformed.`, { offset: index });
    }
    const attributes = parseAttributes(remainder, index + 1 + name.length);
    elementCount += 1;
    if (elementCount > limits.maxElements) {
      fail("too-many-elements", "SVG exceeds the element limit.", { maxElements: limits.maxElements });
    }
    tokens.push({ type: "start", name, attributes, selfClosing, offset: index });
    index = end + 1;
  }

  return tokens;
}

function parseFiniteNumber(value, label, maxCoordinate, { nonNegative = false, positive = false } = {}) {
  const trimmed = String(value).trim();
  if (!SINGLE_NUMBER.test(trimmed)) {
    fail("invalid-number", `${label} must be a finite decimal number.`, { field: label, value });
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number) || Math.abs(number) > maxCoordinate) {
    fail("coordinate-out-of-range", `${label} is outside the supported coordinate range.`, {
      field: label,
      value,
      maxCoordinate,
    });
  }
  if (positive && number <= 0) fail("invalid-number", `${label} must be greater than zero.`, { field: label });
  if (nonNegative && number < 0) fail("invalid-number", `${label} cannot be negative.`, { field: label });
  return number;
}

function parseNumberList(value, label, maxCoordinate) {
  const numbers = [];
  let index = 0;
  const source = String(value);
  while (index < source.length) {
    while (/[\s,]/u.test(source[index] || "")) index += 1;
    if (index >= source.length) break;
    const match = NUMBER_AT_START.exec(source.slice(index));
    if (!match) fail("invalid-number-list", `${label} contains invalid numeric data.`, { field: label, offset: index });
    numbers.push(parseFiniteNumber(match[0], label, maxCoordinate));
    index += match[0].length;
  }
  return numbers;
}

function parseViewBox(value, maxCoordinate) {
  const numbers = parseNumberList(value, "viewBox", maxCoordinate);
  if (numbers.length !== 4
    || numbers[2] < MIN_GEOMETRY_SPAN
    || numbers[3] < MIN_GEOMETRY_SPAN) {
    fail("invalid-viewbox", "viewBox must contain minX, minY, positive width and positive height.");
  }
  return { minX: numbers[0], minY: numbers[1], width: numbers[2], height: numbers[3] };
}

function parseLength(value, label, maxCoordinate) {
  const match = new RegExp(`^(${NUMBER_SOURCE})(mm|cm|in|pt|pc|px)?$`, "i").exec(String(value).trim());
  if (!match) fail("unsupported-length", `${label} uses an unsupported SVG length.`, { field: label, value });
  const numeric = parseFiniteNumber(match[1], label, maxCoordinate, { positive: true });
  const unit = (match[2] || "px").toLowerCase();
  const millimetersPerUnit = {
    mm: 1,
    cm: 10,
    in: 25.4,
    pt: 25.4 / 72,
    pc: 25.4 / 6,
    px: 25.4 / 96,
  }[unit];
  const millimeters = numeric * millimetersPerUnit;
  if (!Number.isFinite(millimeters)
    || millimeters < MIN_GEOMETRY_SPAN
    || millimeters > maxCoordinate) {
    fail("physical-size-out-of-range", `${label} is outside the supported physical-size range.`, {
      field: label,
      value,
    });
  }
  return {
    value: numeric,
    unit,
    millimeters,
  };
}

function parseTransform(value, maxCoordinate) {
  const source = String(value).trim();
  const match = /^([A-Za-z]+)\s*\(([^()]*)\)\s*$/.exec(source);
  if (!match) {
    fail("unsupported-transform", "Only one matrix, translate, scale or rotate transform is supported.", {
      value,
    });
  }
  const name = match[1].toLowerCase();
  const values = parseNumberList(match[2], "transform", maxCoordinate);
  let matrix;

  if (name === "matrix" && values.length === 6) {
    matrix = values;
  } else if (name === "translate" && (values.length === 1 || values.length === 2)) {
    matrix = [1, 0, 0, 1, values[0], values[1] ?? 0];
  } else if (name === "scale" && (values.length === 1 || values.length === 2)) {
    matrix = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
  } else if (name === "rotate" && (values.length === 1 || values.length === 3)) {
    const radians = values[0] * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const rotation = [cosine, sine, -sine, cosine, 0, 0];
    if (values.length === 1) {
      matrix = rotation;
    } else {
      const [angle, cx, cy] = values;
      void angle;
      matrix = multiplyMatrices(
        [1, 0, 0, 1, cx, cy],
        multiplyMatrices(rotation, [1, 0, 0, 1, -cx, -cy]),
      );
    }
  } else {
    fail("unsupported-transform", `Transform '${match[1]}' has an unsupported form.`, { value });
  }

  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (matrix.some((number) => !Number.isFinite(number) || Math.abs(number) > maxCoordinate)
    || !Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    fail("unsafe-transform", "The SVG transform is singular or outside the supported range.", { value });
  }
  return matrix;
}

function multiplyMatrices(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function transformedPoint(x, y, matrix, maxCoordinate) {
  const point = {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || Math.abs(point.x) > maxCoordinate || Math.abs(point.y) > maxCoordinate) {
    fail("coordinate-out-of-range", "A transformed point is outside the supported coordinate range.", {
      maxCoordinate,
    });
  }
  if (Object.is(point.x, -0)) point.x = 0;
  if (Object.is(point.y, -0)) point.y = 0;
  return point;
}

function createPathTokenReader(value) {
  const source = String(value);
  let index = 0;
  let buffered = null;

  const read = () => {
    while (/[\s,]/u.test(source[index] || "")) index += 1;
    if (index >= source.length) return null;
    const offset = index;
    if (/[A-Za-z]/u.test(source[index])) {
      const token = { type: "command", value: source[index], offset };
      index += 1;
      return token;
    }
    const match = NUMBER_AT_START.exec(source.slice(index));
    if (!match) fail("invalid-path-data", "Path data contains an invalid token.", { offset: index });
    const token = { type: "number", value: match[0], offset };
    index += match[0].length;
    return token;
  };

  return {
    peek() {
      if (buffered === null) buffered = read();
      return buffered;
    },
    next() {
      const token = this.peek();
      buffered = null;
      return token;
    },
    endOffset: source.length,
  };
}

function parsePathData(value, matrix, state) {
  const reader = createPathTokenReader(value);
  if (!reader.peek()) fail("empty-geometry", "A path element has no path data.");
  const segments = [];
  let command = null;
  let current = null;
  let subpathStart = null;
  let hasDrawingSegment = false;

  const addSegment = (segment) => {
    state.commandCount += 1;
    if (state.commandCount > state.limits.maxPathCommands) {
      fail("too-many-path-commands", "SVG exceeds the path-command limit.", {
        maxPathCommands: state.limits.maxPathCommands,
      });
    }
    segments.push(segment);
  };
  const localPoint = (x, y) => ({ x, y });
  const outputPoint = (point) => transformedPoint(
    point.x,
    point.y,
    matrix,
    state.limits.maxCoordinate,
  );
  const requireCurrent = () => {
    if (!current) fail("invalid-path-data", "A drawing command appears before the first moveto command.");
  };
  const readGroup = (count, label) => {
    const numbers = [];
    for (let item = 0; item < count; item += 1) {
      const token = reader.next();
      if (!token || token.type !== "number") {
        fail("invalid-path-data", `${label} has an incomplete coordinate group.`, {
          offset: token?.offset ?? reader.endOffset,
        });
      }
      numbers.push(parseFiniteNumber(token.value, "path coordinate", state.limits.maxCoordinate));
    }
    return numbers;
  };

  while (reader.peek()) {
    if (reader.peek().type === "command") {
      const token = reader.next();
      command = token.value;
      if (!/[MLHVQCZmlhvqcz]/u.test(command)) {
        fail("unsupported-path-command", `Path command '${command}' is not supported.`, {
          command,
          offset: token.offset,
        });
      }
      if (command.toUpperCase() === "Z") {
        requireCurrent();
        addSegment({ type: "Z", values: [] });
        current = { ...subpathStart };
        command = null;
        continue;
      }
    } else if (!command) {
      fail("invalid-path-data", "Path coordinates are missing a command.", { offset: reader.peek().offset });
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4 }[upper];
    let groups = 0;

    while (reader.peek()?.type === "number") {
      const numbers = readGroup(arity, command);
      groups += 1;

      if (upper === "M") {
        const base = relative && current ? current : { x: 0, y: 0 };
        const next = localPoint(numbers[0] + base.x, numbers[1] + base.y);
        current = next;
        if (groups === 1) subpathStart = next;
        const output = outputPoint(next);
        addSegment({ type: groups === 1 ? "M" : "L", values: [output.x, output.y] });
        if (groups > 1) hasDrawingSegment = true;
      } else if (upper === "L") {
        requireCurrent();
        const next = localPoint(
          numbers[0] + (relative ? current.x : 0),
          numbers[1] + (relative ? current.y : 0),
        );
        current = next;
        const output = outputPoint(next);
        addSegment({ type: "L", values: [output.x, output.y] });
        hasDrawingSegment = true;
      } else if (upper === "H") {
        requireCurrent();
        current = localPoint(numbers[0] + (relative ? current.x : 0), current.y);
        const output = outputPoint(current);
        addSegment({ type: "L", values: [output.x, output.y] });
        hasDrawingSegment = true;
      } else if (upper === "V") {
        requireCurrent();
        current = localPoint(current.x, numbers[0] + (relative ? current.y : 0));
        const output = outputPoint(current);
        addSegment({ type: "L", values: [output.x, output.y] });
        hasDrawingSegment = true;
      } else if (upper === "C") {
        requireCurrent();
        const cp1 = localPoint(
          numbers[0] + (relative ? current.x : 0),
          numbers[1] + (relative ? current.y : 0),
        );
        const cp2 = localPoint(
          numbers[2] + (relative ? current.x : 0),
          numbers[3] + (relative ? current.y : 0),
        );
        const next = localPoint(
          numbers[4] + (relative ? current.x : 0),
          numbers[5] + (relative ? current.y : 0),
        );
        const outputCp1 = outputPoint(cp1);
        const outputCp2 = outputPoint(cp2);
        const output = outputPoint(next);
        addSegment({
          type: "C",
          values: [outputCp1.x, outputCp1.y, outputCp2.x, outputCp2.y, output.x, output.y],
        });
        current = next;
        hasDrawingSegment = true;
      } else if (upper === "Q") {
        requireCurrent();
        const control = localPoint(
          numbers[0] + (relative ? current.x : 0),
          numbers[1] + (relative ? current.y : 0),
        );
        const next = localPoint(
          numbers[2] + (relative ? current.x : 0),
          numbers[3] + (relative ? current.y : 0),
        );
        const cp1 = localPoint(
          current.x + (2 / 3) * (control.x - current.x),
          current.y + (2 / 3) * (control.y - current.y),
        );
        const cp2 = localPoint(
          next.x + (2 / 3) * (control.x - next.x),
          next.y + (2 / 3) * (control.y - next.y),
        );
        const outputCp1 = outputPoint(cp1);
        const outputCp2 = outputPoint(cp2);
        const output = outputPoint(next);
        addSegment({
          type: "C",
          values: [outputCp1.x, outputCp1.y, outputCp2.x, outputCp2.y, output.x, output.y],
        });
        current = next;
        hasDrawingSegment = true;
      }

      if (upper === "M" && groups === 1) command = relative ? "l" : "L";
    }

    if (!groups) {
      const nextToken = reader.peek();
      if (nextToken?.type === "command" && !/[MLHVQCZmlhvqcz]/u.test(nextToken.value)) {
        fail("unsupported-path-command", `Path command '${nextToken.value}' is not supported.`, {
          command: nextToken.value,
          offset: nextToken.offset,
        });
      }
      fail("invalid-path-data", `Path command '${command}' has no coordinates.`, {
        offset: nextToken?.offset ?? reader.endOffset,
      });
    }
  }

  if (!hasDrawingSegment) fail("empty-geometry", "A path element contains no drawable segment.");
  return segments;
}

function presentationFrom(attributes) {
  const presentation = {};
  for (const name of PRESENTATION_ATTRIBUTES) {
    if (!attributes.has(name)) continue;
    const value = attributes.get(name).trim();
    if (name === "fill" || name === "stroke") {
      if (!/^(?:none|currentColor|transparent|#[0-9A-Fa-f]{3,8}|[A-Za-z]+)$/u.test(value)) {
        fail("unsupported-paint", `Attribute '${name}' uses an unsupported paint value.`, { attribute: name });
      }
    } else if (name === "fill-rule" && !/^(?:nonzero|evenodd)$/u.test(value)) {
      fail("unsupported-presentation", "fill-rule must be 'nonzero' or 'evenodd'.", { attribute: name });
    } else if (name === "stroke-linecap" && !/^(?:butt|round|square)$/u.test(value)) {
      fail("unsupported-presentation", "stroke-linecap is unsupported.", { attribute: name });
    } else if (name === "stroke-linejoin" && !/^(?:miter|round|bevel)$/u.test(value)) {
      fail("unsupported-presentation", "stroke-linejoin is unsupported.", { attribute: name });
    } else if (name === "vector-effect" && !/^(?:none|non-scaling-stroke)$/u.test(value)) {
      fail("unsupported-presentation", "vector-effect is unsupported.", { attribute: name });
    } else if (name === "opacity") {
      const opacity = parseFiniteNumber(value, "opacity", 1, { nonNegative: true });
      if (opacity > 1) fail("unsupported-presentation", "opacity must be between zero and one.");
      presentation[name] = opacity;
      continue;
    } else if (name === "stroke-width") {
      presentation[name] = parseLength(value, "stroke-width", MAX_STATIC_SVG_COORDINATE);
      continue;
    }
    presentation[name] = value;
  }
  return presentation;
}

function validateAttributes(tag, attributes) {
  for (const [name] of attributes) {
    const folded = name.toLowerCase();
    if (folded.startsWith("on")) {
      fail("event-attribute-forbidden", `Event attribute '${name}' is not allowed.`, { attribute: name });
    }
    if (REFERENCE_ATTRIBUTES.has(folded)) {
      fail("reference-attribute-forbidden", `Reference attribute '${name}' is not allowed.`, { attribute: name });
    }
    if (folded === "style") {
      fail("style-attribute-forbidden", "Inline style attributes are not allowed.", { attribute: name });
    }
    if (name === "id" || name === "transform" || PRESENTATION_ATTRIBUTES.has(name)) continue;
    if (!ELEMENT_ATTRIBUTES[tag].has(name)) {
      fail("unsupported-attribute", `Attribute '${name}' is not supported on <${tag}>.`, {
        element: tag,
        attribute: name,
      });
    }
  }
  if (attributes.has("id") && !SAFE_ID.test(attributes.get("id"))) {
    fail("unsafe-id", "SVG id must use a conservative identifier syntax.", { value: attributes.get("id") });
  }
}

function requiredAttribute(attributes, name, tag) {
  if (!attributes.has(name)) {
    fail("missing-attribute", `<${tag}> requires attribute '${name}'.`, { element: tag, attribute: name });
  }
  return attributes.get(name);
}

function shapeSegments(tag, attributes, matrix, state) {
  const max = state.limits.maxCoordinate;
  if (tag === "path") {
    return parsePathData(requiredAttribute(attributes, "d", tag), matrix, state);
  }

  const add = (segments, type, points = []) => {
    state.commandCount += 1;
    if (state.commandCount > state.limits.maxPathCommands) {
      fail("too-many-path-commands", "SVG exceeds the path-command limit.", {
        maxPathCommands: state.limits.maxPathCommands,
      });
    }
    const values = points.flatMap((point) => {
      const output = transformedPoint(point.x, point.y, matrix, max);
      return [output.x, output.y];
    });
    segments.push({ type, values });
  };

  if (tag === "line") {
    const p1 = {
      x: parseFiniteNumber(attributes.get("x1") ?? 0, "x1", max),
      y: parseFiniteNumber(attributes.get("y1") ?? 0, "y1", max),
    };
    const p2 = {
      x: parseFiniteNumber(attributes.get("x2") ?? 0, "x2", max),
      y: parseFiniteNumber(attributes.get("y2") ?? 0, "y2", max),
    };
    const segments = [];
    add(segments, "M", [p1]);
    add(segments, "L", [p2]);
    return segments;
  }

  if (tag === "polyline" || tag === "polygon") {
    const values = parseNumberList(requiredAttribute(attributes, "points", tag), "points", max);
    if (values.length < (tag === "polygon" ? 6 : 4) || values.length % 2 !== 0) {
      fail("invalid-points", `<${tag}> requires complete coordinate pairs.`, { element: tag });
    }
    const points = [];
    for (let index = 0; index < values.length; index += 2) {
      points.push({ x: values[index], y: values[index + 1] });
    }
    const segments = [];
    add(segments, "M", [points[0]]);
    points.slice(1).forEach((point) => add(segments, "L", [point]));
    if (tag === "polygon") add(segments, "Z");
    return segments;
  }

  const x = parseFiniteNumber(attributes.get("x") ?? 0, "x", max);
  const y = parseFiniteNumber(attributes.get("y") ?? 0, "y", max);
  const width = parseFiniteNumber(requiredAttribute(attributes, "width", tag), "width", max, { positive: true });
  const height = parseFiniteNumber(requiredAttribute(attributes, "height", tag), "height", max, { positive: true });
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  corners.forEach((point) => transformedPoint(point.x, point.y, matrix, max));
  const segments = [];
  add(segments, "M", [corners[0]]);
  corners.slice(1).forEach((point) => add(segments, "L", [point]));
  add(segments, "Z");
  return segments;
}

function boundsFromEntities(entities) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  entities.forEach((entity) => {
    entity.segments.forEach((segment) => {
      for (let index = 0; index < segment.values.length; index += 2) {
        const x = segment.values[index];
        const y = segment.values[index + 1];
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function calibrationFrom(rootAttributes, viewBox, maxCoordinate) {
  const width = rootAttributes.has("width")
    ? parseLength(rootAttributes.get("width"), "width", maxCoordinate)
    : null;
  const height = rootAttributes.has("height")
    ? parseLength(rootAttributes.get("height"), "height", maxCoordinate)
    : null;
  const fromWidth = width ? width.millimeters / viewBox.width : null;
  const fromHeight = height ? height.millimeters / viewBox.height : null;
  const declared = rootAttributes.has("data-mm-per-unit")
    ? parseFiniteNumber(rootAttributes.get("data-mm-per-unit"), "data-mm-per-unit", maxCoordinate, { positive: true })
    : null;

  const assertScale = (value, label) => {
    if (value === null) return;
    if (!Number.isFinite(value)
      || value < MIN_MILLIMETERS_PER_UNIT
      || value > MAX_MILLIMETERS_PER_UNIT) {
      fail("calibration-out-of-range", `${label} is outside the supported calibration range.`, {
        millimetersPerUnit: value,
      });
    }
  };
  assertScale(fromWidth, "Horizontal calibration");
  assertScale(fromHeight, "Vertical calibration");
  assertScale(declared, "Declared calibration");

  if (fromWidth && fromHeight) {
    const relativeDifference = Math.abs(fromWidth - fromHeight) / Math.max(fromWidth, fromHeight);
    if (relativeDifference > 0.001) {
      fail("non-uniform-calibration", "Physical width and height imply different SVG scales.", {
        millimetersPerUnitX: fromWidth,
        millimetersPerUnitY: fromHeight,
      });
    }
  }

  const derived = fromWidth && fromHeight ? (fromWidth + fromHeight) / 2 : (fromWidth ?? fromHeight);
  assertScale(derived, "Derived calibration");
  if (declared && derived) {
    const relativeDifference = Math.abs(declared - derived) / Math.max(declared, derived);
    if (relativeDifference > 0.001) {
      fail("conflicting-calibration", "Declared calibration conflicts with physical SVG dimensions.", {
        declaredMillimetersPerUnit: declared,
        derivedMillimetersPerUnit: derived,
      });
    }
  }

  const millimetersPerUnit = declared ?? derived ?? null;
  if (millimetersPerUnit !== null) {
    const physicalWidth = viewBox.width * millimetersPerUnit;
    const physicalHeight = viewBox.height * millimetersPerUnit;
    if (!Number.isFinite(physicalWidth)
      || !Number.isFinite(physicalHeight)
      || physicalWidth < MIN_GEOMETRY_SPAN
      || physicalHeight < MIN_GEOMETRY_SPAN
      || physicalWidth > maxCoordinate
      || physicalHeight > maxCoordinate) {
      fail("physical-size-out-of-range", "The confirmed calibration produces unsupported physical dimensions.", {
        physicalWidth,
        physicalHeight,
      });
    }
  }
  return {
    status: declared ? "declared" : (derived ? "derived" : "required"),
    unit: "mm-per-svg-user-unit",
    millimetersPerUnit,
    millimetersPerUnitX: declared ?? fromWidth ?? derived ?? null,
    millimetersPerUnitY: declared ?? fromHeight ?? derived ?? null,
    requiresCalibration: millimetersPerUnit === null,
  };
}

function parseStaticSvg(source, limits) {
  const tokens = tokenizeXml(source, limits);
  const stack = [];
  const entities = [];
  const usedIds = new Set();
  let rootAttributes = null;
  let rootClosed = false;
  const state = { commandCount: 0, limits };

  for (const token of tokens) {
    if (token.type === "text") {
      fail("unsupported-text", "Text nodes are not supported in static pattern SVG.", { offset: token.offset });
    }
    if (token.type === "end") {
      const frame = stack.pop();
      if (!frame || frame.tag !== token.name) {
        fail("malformed-xml", `Closing tag </${token.name}> does not match the open element.`, {
          offset: token.offset,
        });
      }
      if (frame.tag === "svg") rootClosed = true;
      continue;
    }

    const foldedTag = token.name.toLowerCase();
    if (FORBIDDEN_ELEMENTS.has(foldedTag)) {
      fail("forbidden-element", `Element <${token.name}> is not allowed.`, { element: token.name });
    }
    if (!Object.hasOwn(ELEMENT_ATTRIBUTES, token.name)) {
      fail("unsupported-element", `Element <${token.name}> is not supported.`, { element: token.name });
    }
    if (rootClosed) fail("multiple-root-elements", "Content appears after the closing </svg> element.");
    if (!rootAttributes && token.name !== "svg") {
      fail("missing-svg-root", "The document root must be an <svg> element.");
    }
    if (rootAttributes && token.name === "svg") {
      fail("nested-svg-forbidden", "Nested <svg> elements are not supported.");
    }
    if (stack.length && DRAWABLE_ELEMENTS.has(stack.at(-1).tag)) {
      fail("unsupported-child-content", `Element <${stack.at(-1).tag}> cannot contain child elements.`);
    }
    if (stack.length + 1 > limits.maxDepth) {
      fail("svg-too-deep", "SVG exceeds the supported nesting depth.", { maxDepth: limits.maxDepth });
    }

    validateAttributes(token.name, token.attributes);
    if (token.attributes.has("id")) {
      const id = token.attributes.get("id");
      if (usedIds.has(id)) fail("duplicate-id", `Duplicate SVG id '${id}' is not allowed.`, { id });
      usedIds.add(id);
    }
    const parent = stack.at(-1);
    const localMatrix = token.attributes.has("transform")
      ? parseTransform(token.attributes.get("transform"), limits.maxCoordinate)
      : IDENTITY_MATRIX;
    const matrix = parent ? multiplyMatrices(parent.matrix, localMatrix) : localMatrix;
    const combinedDeterminant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    if (matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > limits.maxCoordinate)
      || !Number.isFinite(combinedDeterminant) || Math.abs(combinedDeterminant) < 1e-12) {
      fail("unsafe-transform", "Combined SVG transforms are singular or exceed the supported range.");
    }
    const inheritedPresentation = parent?.presentation || {};
    const presentation = { ...inheritedPresentation, ...presentationFrom(token.attributes) };
    const groups = parent?.groups ? [...parent.groups] : [];

    if (token.name === "svg") {
      rootAttributes = token.attributes;
      if (token.attributes.get("xmlns") && token.attributes.get("xmlns") !== "http://www.w3.org/2000/svg") {
        fail("invalid-namespace", "The SVG namespace is not recognized.");
      }
      if (token.attributes.get("xmlns:xlink")
        && token.attributes.get("xmlns:xlink") !== "http://www.w3.org/1999/xlink") {
        fail("invalid-namespace", "The XLink namespace is not recognized.");
      }
      if (token.attributes.has("version")
        && !/^(?:1\.0|1\.1|2\.0)$/u.test(token.attributes.get("version").trim())) {
        fail("unsupported-svg-version", "Only SVG versions 1.0, 1.1 and 2.0 are recognized.");
      }
      if (!token.attributes.has("viewBox")) {
        fail("missing-viewbox", "A finite, positive viewBox is required for static pattern import.");
      }
      if (token.attributes.has("preserveAspectRatio")
        && token.attributes.get("preserveAspectRatio").trim() !== "xMidYMid meet") {
        fail("unsupported-aspect-ratio", "Only the default 'xMidYMid meet' aspect ratio is supported.");
      }
    } else if (token.name === "g") {
      if (token.attributes.has("id")) groups.push(token.attributes.get("id"));
    } else {
      if (entities.length >= limits.maxEntities) {
        fail("too-many-entities", "SVG exceeds the drawable-entity limit.", { maxEntities: limits.maxEntities });
      }
      const segments = shapeSegments(token.name, token.attributes, matrix, state);
      let entityId = token.attributes.get("id");
      if (!entityId) {
        let suffix = entities.length + 1;
        do {
          entityId = `imported-${suffix}`;
          suffix += 1;
        } while (usedIds.has(entityId));
        usedIds.add(entityId);
      }
      entities.push({
        id: entityId,
        sourceElement: token.name,
        groups,
        presentation,
        segments,
      });
    }

    if (!token.selfClosing) {
      stack.push({ tag: token.name, matrix, presentation, groups });
    } else if (token.name === "svg") {
      rootClosed = true;
    }
  }

  if (!rootAttributes) fail("missing-svg-root", "The document has no <svg> root element.");
  if (stack.length) fail("malformed-xml", `Element <${stack.at(-1).tag}> is not closed.`);
  if (!rootClosed) fail("malformed-xml", "The <svg> root element is not closed.");
  if (!entities.length) fail("empty-geometry", "SVG contains no supported drawable geometry.");

  const viewBox = parseViewBox(rootAttributes.get("viewBox"), limits.maxCoordinate);
  const calibration = calibrationFrom(rootAttributes, viewBox, limits.maxCoordinate);
  return {
    kind: "lekalo-static-pattern",
    schemaVersion: 1,
    editable: false,
    geometryUnit: "svg-user-unit",
    viewport: {
      rootId: rootAttributes.get("id") || null,
      svgVersion: rootAttributes.get("version")?.trim() || null,
      viewBox,
      width: rootAttributes.has("width")
        ? parseLength(rootAttributes.get("width"), "width", limits.maxCoordinate)
        : null,
      height: rootAttributes.has("height")
        ? parseLength(rootAttributes.get("height"), "height", limits.maxCoordinate)
        : null,
      preserveAspectRatio: "xMidYMid meet",
    },
    calibration,
    bounds: boundsFromEntities(entities),
    statistics: {
      entityCount: entities.length,
      pathCommandCount: state.commandCount,
    },
    entities,
  };
}

/**
 * Parses a deliberately small, non-executable SVG subset into inert geometry.
 * The source is never inserted into a DOM and is not returned to the caller.
 */
async function importStaticSvgSource(source, options = {}, sourceBytes = null) {
  const limits = limitsFrom(options);
  const bytes = assertSourceEnvelope(source, limits, sourceBytes);
  const pattern = parseStaticSvg(source, limits);
  const digest = await sha256Hex(bytes);
  return deepFreeze({
    ...pattern,
    source: {
      mediaType: "image/svg+xml",
      byteLength: bytes.byteLength,
      sha256: digest,
      hash: { algorithm: "SHA-256", value: digest },
    },
  });
}

export async function importStaticSvg(source, options = {}) {
  return importStaticSvgSource(source, options);
}

/** Reads a browser File-like object only after its declared size passes the hard limit. */
export async function readStaticSvgFile(file, options = {}) {
  const limits = limitsFrom(options);
  if (!file || typeof file.text !== "function" || !Number.isSafeInteger(file.size) || file.size < 0) {
    fail("invalid-file", "A valid local SVG file is required.");
  }
  if (file.size > limits.maxBytes) {
    fail("file-too-large", "SVG file exceeds the byte limit.", { maxBytes: limits.maxBytes });
  }
  let source;
  let sourceBytes = null;
  try {
    if (typeof file.arrayBuffer === "function") {
      const buffer = await file.arrayBuffer();
      sourceBytes = new Uint8Array(buffer);
      if (sourceBytes.byteLength > limits.maxBytes) {
        fail("file-too-large", "SVG file exceeds the byte limit.", { maxBytes: limits.maxBytes });
      }
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
      } catch {
        fail("invalid-encoding", "SVG file must use valid UTF-8 encoding.");
      }
    } else {
      source = await file.text();
    }
  } catch (cause) {
    if (cause instanceof StaticSvgImportError) throw cause;
    fail("read-failed", "The selected SVG file could not be read.", { cause });
  }
  if (typeof source !== "string") {
    fail("read-failed", "The selected SVG file did not return text content.");
  }
  return importStaticSvgSource(source, options, sourceBytes);
}
