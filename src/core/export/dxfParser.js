const SUPPORTED_ENTITY_TYPES = new Set(["POLYLINE", "VERTEX", "SEQEND", "LINE", "POINT", "TEXT"]);

export class DxfParseError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `${message} (line ${line})`);
    this.name = "DxfParseError";
    this.line = line;
  }
}

function finiteNumber(value, label, line) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new DxfParseError(`${label} must be finite.`, line);
  return number;
}

function integer(value, label, line) {
  const number = finiteNumber(value, label, line);
  if (!Number.isInteger(number)) throw new DxfParseError(`${label} must be an integer.`, line);
  return number;
}

function firstValue(records, code) {
  return records.find((record) => record.code === code)?.value;
}

function values(records, code) {
  return records.filter((record) => record.code === code).map((record) => record.value);
}

function parsePairs(text) {
  if (typeof text !== "string" || !text.trim()) throw new DxfParseError("DXF text is empty.");
  if (!/^[\x00-\x7F]*$/.test(text)) throw new DxfParseError("ASCII DXF contains non-ASCII bytes.");
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length % 2 !== 0) throw new DxfParseError("DXF must contain complete code/value pairs.", lines.length);
  const pairs = [];
  for (let index = 0; index < lines.length; index += 2) {
    const codeText = lines[index].trim();
    if (!/^-?\d+$/.test(codeText)) throw new DxfParseError(`Invalid group code: ${codeText}.`, index + 1);
    pairs.push({ code: Number(codeText), value: lines[index + 1].trim(), line: index + 1 });
  }
  return pairs;
}

function splitRecords(pairs) {
  const records = [];
  let current = null;
  pairs.forEach((pair) => {
    if (pair.code === 0) {
      if (current) records.push(current);
      current = { type: pair.value, pairs: [], line: pair.line };
    } else {
      if (!current) throw new DxfParseError("A DXF record must begin with group code 0.", pair.line);
      current.pairs.push(pair);
    }
  });
  if (current) records.push(current);
  return records;
}

function parseLayerTable(records) {
  const layers = [];
  let inLayerTable = false;
  records.forEach((record) => {
    if (record.type === "TABLE" && firstValue(record.pairs, 2) === "LAYER") {
      inLayerTable = true;
      return;
    }
    if (record.type === "ENDTAB" && inLayerTable) {
      inLayerTable = false;
      return;
    }
    if (inLayerTable && record.type === "LAYER") {
      const name = firstValue(record.pairs, 2);
      if (!name) throw new DxfParseError("LAYER record is missing its name.", record.line);
      layers.push({
        name,
        color: integer(firstValue(record.pairs, 62) ?? 7, "Layer color", record.line),
        lineType: firstValue(record.pairs, 6) || "CONTINUOUS",
      });
    }
  });
  if (new Set(layers.map((layer) => layer.name)).size !== layers.length) {
    throw new DxfParseError("DXF contains duplicate layer names.");
  }
  return layers;
}

function entityBase(record) {
  const layer = firstValue(record.pairs, 8);
  if (!layer) throw new DxfParseError(`${record.type} is missing layer code 8.`, record.line);
  return {
    type: record.type,
    layer,
    xdata: values(record.pairs, 1000),
    line: record.line,
  };
}

function parseEntities(records, layerNames) {
  const entities = [];
  let inEntities = false;
  let polyline = null;

  const finishPolyline = (record) => {
    if (!polyline) throw new DxfParseError("SEQEND without POLYLINE.", record.line);
    if (polyline.vertices.length < 3) {
      throw new DxfParseError("POLYLINE must contain at least three vertices.", polyline.line);
    }
    entities.push(polyline);
    polyline = null;
  };

  records.forEach((record) => {
    if (record.type === "SECTION" && firstValue(record.pairs, 2) === "ENTITIES") {
      if (inEntities) throw new DxfParseError("Nested ENTITIES section.", record.line);
      inEntities = true;
      return;
    }
    if (record.type === "ENDSEC" && inEntities) {
      if (polyline) throw new DxfParseError("POLYLINE is missing SEQEND.", polyline.line);
      inEntities = false;
      return;
    }
    if (!inEntities) return;
    if (!SUPPORTED_ENTITY_TYPES.has(record.type)) {
      throw new DxfParseError(`Unsupported entity type: ${record.type}.`, record.line);
    }

    if (record.type === "POLYLINE") {
      if (polyline) throw new DxfParseError("Nested POLYLINE entities are invalid.", record.line);
      const base = entityBase(record);
      polyline = {
        ...base,
        closed: (integer(firstValue(record.pairs, 70) ?? 0, "POLYLINE flags", record.line) & 1) === 1,
        vertices: [],
      };
      return;
    }
    if (record.type === "VERTEX") {
      if (!polyline) throw new DxfParseError("VERTEX outside a POLYLINE.", record.line);
      const vertexLayer = firstValue(record.pairs, 8);
      if (vertexLayer && vertexLayer !== polyline.layer) {
        throw new DxfParseError("VERTEX layer differs from its POLYLINE layer.", record.line);
      }
      polyline.vertices.push({
        x: finiteNumber(firstValue(record.pairs, 10), "VERTEX x", record.line),
        y: finiteNumber(firstValue(record.pairs, 20), "VERTEX y", record.line),
        z: finiteNumber(firstValue(record.pairs, 30) ?? 0, "VERTEX z", record.line),
      });
      return;
    }
    if (record.type === "SEQEND") {
      finishPolyline(record);
      return;
    }
    if (polyline) throw new DxfParseError("POLYLINE must end with SEQEND before another entity.", record.line);

    const base = entityBase(record);
    if (record.type === "LINE") {
      entities.push({
        ...base,
        start: {
          x: finiteNumber(firstValue(record.pairs, 10), "LINE start x", record.line),
          y: finiteNumber(firstValue(record.pairs, 20), "LINE start y", record.line),
          z: finiteNumber(firstValue(record.pairs, 30) ?? 0, "LINE start z", record.line),
        },
        end: {
          x: finiteNumber(firstValue(record.pairs, 11), "LINE end x", record.line),
          y: finiteNumber(firstValue(record.pairs, 21), "LINE end y", record.line),
          z: finiteNumber(firstValue(record.pairs, 31) ?? 0, "LINE end z", record.line),
        },
      });
    } else if (record.type === "POINT") {
      entities.push({
        ...base,
        point: {
          x: finiteNumber(firstValue(record.pairs, 10), "POINT x", record.line),
          y: finiteNumber(firstValue(record.pairs, 20), "POINT y", record.line),
          z: finiteNumber(firstValue(record.pairs, 30) ?? 0, "POINT z", record.line),
        },
      });
    } else if (record.type === "TEXT") {
      const height = finiteNumber(firstValue(record.pairs, 40), "TEXT height", record.line);
      if (height <= 0) throw new DxfParseError("TEXT height must be positive.", record.line);
      entities.push({
        ...base,
        point: {
          x: finiteNumber(firstValue(record.pairs, 10), "TEXT x", record.line),
          y: finiteNumber(firstValue(record.pairs, 20), "TEXT y", record.line),
          z: finiteNumber(firstValue(record.pairs, 30) ?? 0, "TEXT z", record.line),
        },
        height,
        text: firstValue(record.pairs, 1) || "",
      });
    }
  });

  if (inEntities) throw new DxfParseError("ENTITIES section is missing ENDSEC.");
  if (polyline) throw new DxfParseError("POLYLINE is missing SEQEND.", polyline.line);
  entities.forEach((entity) => {
    if (!layerNames.has(entity.layer)) {
      throw new DxfParseError(`Entity refers to undefined layer ${entity.layer}.`, entity.line);
    }
  });
  return entities;
}

function parseHeader(records) {
  const header = {};
  let inHeader = false;
  records.forEach((record) => {
    if (record.type === "SECTION" && firstValue(record.pairs, 2) === "HEADER") {
      inHeader = true;
      return;
    }
    if (record.type === "ENDSEC" && inHeader) {
      inHeader = false;
      return;
    }
    if (!inHeader) return;
    // HEADER variables are not code-0 records, so splitRecords attaches them to SECTION.
  });

  const headerSection = records.find(
    (record) => record.type === "SECTION" && firstValue(record.pairs, 2) === "HEADER",
  );
  if (!headerSection) throw new DxfParseError("DXF is missing its HEADER section.");
  const pairs = headerSection.pairs;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.code !== 9) continue;
    const valuesForVariable = [];
    for (let cursor = index + 1; cursor < pairs.length && pairs[cursor].code !== 9; cursor += 1) {
      valuesForVariable.push(pairs[cursor]);
      index = cursor;
    }
    header[pair.value] = valuesForVariable;
  }
  return header;
}

/**
 * Strict parser for the deliberately small ASCII-DXF subset emitted by dxfExport.js.
 * It is also used as an internal round-trip gate before an export is returned.
 */
export function parseAsciiDxf(text, options = {}) {
  const pairs = parsePairs(text);
  const records = splitRecords(pairs);
  if (records[0]?.type !== "SECTION") throw new DxfParseError("DXF must begin with SECTION.", records[0]?.line);
  if (records.at(-1)?.type !== "EOF") throw new DxfParseError("DXF must end with EOF.", records.at(-1)?.line);
  const header = parseHeader(records);
  const layers = parseLayerTable(records);
  if (!layers.length) throw new DxfParseError("DXF has no layer table.");
  const layerNames = new Set(layers.map((layer) => layer.name));
  const requiredLayers = options.requiredLayers || ["CUT", "SEAM", "NOTCH", "GRAIN", "TEXT"];
  requiredLayers.forEach((layer) => {
    if (!layerNames.has(layer)) throw new DxfParseError(`DXF is missing required layer ${layer}.`);
  });
  const entities = parseEntities(records, layerNames);
  const insUnitsPair = header.$INSUNITS?.find((pair) => pair.code === 70);
  if (!insUnitsPair) throw new DxfParseError("DXF header is missing $INSUNITS.");
  const insUnits = integer(insUnitsPair.value, "$INSUNITS", insUnitsPair.line);
  if (![1, 4, 5].includes(insUnits)) throw new DxfParseError(`Unsupported $INSUNITS code ${insUnits}.`, insUnitsPair.line);

  const closedLayers = new Set(options.closedLayers || ["CUT", "SEAM"]);
  entities.forEach((entity) => {
    if (entity.type === "POLYLINE" && closedLayers.has(entity.layer) && !entity.closed) {
      throw new DxfParseError(`${entity.layer} POLYLINE must be closed.`, entity.line);
    }
  });

  return {
    version: header.$ACADVER?.find((pair) => pair.code === 1)?.value || null,
    insUnits,
    layers,
    entities,
    comments: pairs.filter((pair) => pair.code === 999).map((pair) => pair.value),
  };
}
