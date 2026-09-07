// Keep the v17 database and store identities: changing either would orphan a
// user's already imported local patterns instead of upgrading them in place.
export const STATIC_PATTERN_DB_NAME = "lekalo-pattern-library";
const DB_VERSION = 1;
export const STATIC_PATTERN_STORE_NAME = "staticPatterns";
const DB_NAME = STATIC_PATTERN_DB_NAME;
const STORE_NAME = STATIC_PATTERN_STORE_NAME;

export const STATIC_PATTERN_FORMAT = "lekalo-static-pattern";
export const STATIC_PATTERN_FORMAT_VERSION = 1;
export const MAX_STATIC_PATTERN_ITEMS = 24;
export const MAX_STATIC_PATTERN_RECORD_BYTES = 4 * 1024 * 1024;
export const MAX_STATIC_PATTERN_LIBRARY_BYTES = 16 * 1024 * 1024;
export const MAX_STATIC_PATTERN_SEGMENTS = 25_000;

const MAX_DATA_DEPTH = 32;
const MAX_DATA_NODES = 350_000;
const MAX_ENTITIES = 1_000;
const MAX_COORDINATE = 10_000_000;
const MIN_SPAN = 0.000001;
const MIN_SCALE = 0.000001;
const MAX_SCALE = 1_000_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ENTITY_KEYS = new Set(["id", "sourceElement", "groups", "presentation", "segments"]);
const GEOMETRY_KEYS = new Set([
  "kind",
  "schemaVersion",
  "editable",
  "geometryUnit",
  "viewport",
  "calibration",
  "bounds",
  "statistics",
  "entities",
  "source",
]);
const VIEWPORT_KEYS = new Set([
  "rootId",
  "svgVersion",
  "viewBox",
  "width",
  "height",
  "preserveAspectRatio",
]);
const SEGMENT_VALUE_COUNTS = Object.freeze({ M: 2, L: 2, C: 6, Z: 0 });
const LICENSES = new Set(["private", "CC0-1.0", "CC-BY-4.0", "MIT"]);

export class StaticPatternStorageError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "StaticPatternStorageError";
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new StaticPatternStorageError(code, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPassiveData(value, state = { nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > MAX_DATA_NODES) fail("data-too-complex", "Static pattern data is too complex.");
  if (depth > MAX_DATA_DEPTH) fail("data-too-deep", "Static pattern data is nested too deeply.");

  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("non-finite-data", "Static pattern data contains a non-finite number.");
    return;
  }
  if (["function", "symbol", "bigint", "undefined"].includes(typeof value)) {
    fail("executable-data", "Static pattern data contains executable or unsupported values.");
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPassiveData(item, state, depth + 1);
    return;
  }
  if (!isPlainObject(value)) fail("unsupported-data", "Static pattern data contains an unsupported object.");

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || FORBIDDEN_KEYS.has(key)) {
      fail("unsafe-key", "Static pattern data contains an unsafe key.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      fail("executable-data", "Static pattern data contains executable accessors.");
    }
    assertPassiveData(descriptor.value, state, depth + 1);
  }
}

function assertAllowedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("unsupported-field", `${label} contains unsupported field '${key}'.`);
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string") fail("invalid-field", `${label} must be text.`);
  const text = value.trim();
  if (!text || text.length > maxLength) fail("invalid-field", `${label} is empty or too long.`);
  return text;
}

function optionalText(value, label, maxLength, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") fail("invalid-field", `${label} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) fail("invalid-field", `${label} is too long.`);
  return text;
}

function safeUrl(value, label) {
  const text = optionalText(value, label, 500);
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail("invalid-url", `${label} must be a valid http(s) URL.`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    fail("invalid-url", `${label} must use http or https.`);
  }
  return parsed.href;
}

function finiteCoordinate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) {
    fail("invalid-geometry", `${label} is not a supported finite coordinate.`);
  }
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function positiveSpan(value, label) {
  const number = finiteCoordinate(value, label);
  if (number < MIN_SPAN) fail("invalid-geometry", `${label} must be at least ${MIN_SPAN}.`);
  return number;
}

function normalizeViewBox(viewport) {
  if (!isPlainObject(viewport)) fail("invalid-geometry", "Static pattern viewport is missing.");
  assertAllowedKeys(viewport, VIEWPORT_KEYS, "Static pattern viewport");
  const viewBox = viewport.viewBox;
  if (!isPlainObject(viewBox)) fail("invalid-geometry", "Static pattern viewBox is missing.");
  assertAllowedKeys(viewBox, new Set(["minX", "minY", "x", "y", "width", "height"]), "Static pattern viewBox");
  return {
    minX: finiteCoordinate(viewBox.minX ?? viewBox.x ?? 0, "viewBox.minX"),
    minY: finiteCoordinate(viewBox.minY ?? viewBox.y ?? 0, "viewBox.minY"),
    width: positiveSpan(viewBox.width, "viewBox.width"),
    height: positiveSpan(viewBox.height, "viewBox.height"),
  };
}

function normalizeCalibration(value, viewBox) {
  if (!isPlainObject(value)) fail("invalid-calibration", "Static pattern calibration is missing.");
  const allowed = new Set([
    "status",
    "unit",
    "millimetersPerUnit",
    "millimetersPerUnitX",
    "millimetersPerUnitY",
    "requiresCalibration",
  ]);
  assertAllowedKeys(value, allowed, "Static pattern calibration");
  if (typeof value.requiresCalibration !== "boolean") {
    fail("invalid-calibration", "Calibration status must be explicit.");
  }
  const requiresCalibration = value.requiresCalibration;
  const scale = value.millimetersPerUnit;
  if (requiresCalibration) {
    if (scale !== null) fail("invalid-calibration", "Unknown calibration must not contain a scale.");
    return {
      status: "required",
      unit: "mm-per-svg-user-unit",
      millimetersPerUnit: null,
      millimetersPerUnitX: null,
      millimetersPerUnitY: null,
      requiresCalibration: true,
    };
  }
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
    fail("invalid-calibration", "Confirmed millimetres-per-unit scale is outside the supported range.");
  }
  const physicalWidth = viewBox.width * scale;
  const physicalHeight = viewBox.height * scale;
  if (!Number.isFinite(physicalWidth)
    || !Number.isFinite(physicalHeight)
    || physicalWidth < MIN_SPAN
    || physicalHeight < MIN_SPAN
    || physicalWidth > MAX_COORDINATE
    || physicalHeight > MAX_COORDINATE) {
    fail("invalid-calibration", "Confirmed scale produces unsupported physical dimensions.");
  }
  const normalizedScale = Number(scale.toFixed(9));
  return {
    status: value.status === "declared" ? "declared" : "derived",
    unit: "mm-per-svg-user-unit",
    millimetersPerUnit: normalizedScale,
    millimetersPerUnitX: normalizedScale,
    millimetersPerUnitY: normalizedScale,
    requiresCalibration: false,
  };
}

function normalizeEntities(entities) {
  if (!Array.isArray(entities) || !entities.length || entities.length > MAX_ENTITIES) {
    fail("invalid-geometry", `Static pattern must contain 1–${MAX_ENTITIES} entities.`);
  }
  const ids = new Set();
  let segmentCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const normalized = entities.map((entity, entityIndex) => {
    if (!isPlainObject(entity)) fail("invalid-geometry", "Static pattern entity must be an object.");
    assertAllowedKeys(entity, ENTITY_KEYS, "Static pattern entity");
    const id = requiredText(entity.id, "entity.id", 128);
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u.test(id) || ids.has(id)) {
      fail("invalid-geometry", "Static pattern entity ids must be unique safe identifiers.");
    }
    ids.add(id);
    if (!Array.isArray(entity.segments) || !entity.segments.length) {
      fail("invalid-geometry", `Entity '${id}' has no segments.`);
    }
    let hasMove = false;
    let hasDrawing = false;
    const segments = entity.segments.map((segment) => {
      segmentCount += 1;
      if (segmentCount > MAX_STATIC_PATTERN_SEGMENTS) {
        fail("too-many-segments", `Static pattern exceeds ${MAX_STATIC_PATTERN_SEGMENTS} normalized segments.`);
      }
      if (!isPlainObject(segment)) fail("invalid-geometry", `Entity '${id}' contains an invalid segment.`);
      assertAllowedKeys(segment, new Set(["type", "values"]), "Static pattern segment");
      const type = segment.type;
      const expected = SEGMENT_VALUE_COUNTS[type];
      if (expected === undefined || !Array.isArray(segment.values) || segment.values.length !== expected) {
        fail("invalid-geometry", `Entity '${id}' contains an unsupported segment.`);
      }
      if (type !== "M" && !hasMove) fail("invalid-geometry", `Entity '${id}' must begin with M.`);
      if (type === "M") hasMove = true;
      if (type === "L" || type === "C") hasDrawing = true;
      const values = segment.values.map((number, index) => finiteCoordinate(number, `${id}.segment[${index}]`));
      for (let index = 0; index < values.length; index += 2) {
        minX = Math.min(minX, values[index]);
        minY = Math.min(minY, values[index + 1]);
        maxX = Math.max(maxX, values[index]);
        maxY = Math.max(maxY, values[index + 1]);
      }
      return { type, values };
    });
    if (!hasDrawing) fail("invalid-geometry", `Entity '${id}' has no drawable segment.`);
    return { id, segments };
  });

  return {
    entities: normalized,
    statistics: { entityCount: normalized.length, pathCommandCount: segmentCount },
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

function normalizeGeometry(geometry) {
  if (!isPlainObject(geometry)) fail("invalid-geometry", "Static pattern geometry is missing.");
  assertAllowedKeys(geometry, GEOMETRY_KEYS, "Static pattern geometry");
  if (geometry.kind !== STATIC_PATTERN_FORMAT || geometry.schemaVersion !== 1 || geometry.editable !== false) {
    fail("unsupported-geometry", "Only normalized, inert static SVG geometry version 1 can be stored.");
  }
  if (geometry.geometryUnit !== "svg-user-unit") {
    fail("unsupported-geometry", "Static pattern geometry unit is unsupported.");
  }
  const viewBox = normalizeViewBox(geometry.viewport);
  const calibration = normalizeCalibration(geometry.calibration, viewBox);
  const { entities, statistics, bounds } = normalizeEntities(geometry.entities);
  return {
    kind: STATIC_PATTERN_FORMAT,
    schemaVersion: 1,
    editable: false,
    geometryUnit: "svg-user-unit",
    viewport: {
      viewBox,
      preserveAspectRatio: "xMidYMid meet",
    },
    calibration,
    bounds,
    statistics,
    entities,
  };
}

function normalizeSource(value, geometrySource = null) {
  const source = isPlainObject(value) ? value : {};
  const nested = isPlainObject(geometrySource) ? geometrySource : {};
  const byteLength = source.byteLength ?? nested.byteLength ?? null;
  if (byteLength !== null && (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > MAX_STATIC_PATTERN_RECORD_BYTES)) {
    fail("invalid-source", "Static pattern source byte length is invalid.");
  }
  const sha256 = optionalText(source.sha256 ?? nested.sha256 ?? nested.hash?.value, "source.sha256", 64);
  if (sha256 && !/^[0-9a-f]{64}$/u.test(sha256)) fail("invalid-source", "Static pattern source hash is invalid.");
  return {
    fileName: optionalText(source.fileName, "source.fileName", 180, "pattern.svg"),
    byteLength,
    sha256,
  };
}

function normalizeProvenance(value) {
  const provenance = isPlainObject(value) ? value : {};
  const license = optionalText(provenance.license, "provenance.license", 32, "private") || "private";
  if (!LICENSES.has(license)) fail("invalid-license", "Static pattern usage terms are unsupported.");
  return {
    author: optionalText(provenance.author, "provenance.author", 120),
    sourceUrl: safeUrl(provenance.sourceUrl, "provenance.sourceUrl"),
    license,
  };
}

function normalizeWarnings(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12) fail("invalid-field", "Static pattern warnings are invalid.");
  return value.map((warning) => requiredText(warning, "warning", 300));
}

function normalizeTimestamp(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = requiredText(value, "timestamp", 40);
  if (!Number.isFinite(Date.parse(text))) fail("invalid-field", "Static pattern timestamp is invalid.");
  return new Date(text).toISOString();
}

function utf8Size(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function withStableStorageSize(record) {
  const output = { ...record, storageBytes: 0 };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const size = utf8Size(output);
    if (size === output.storageBytes) break;
    output.storageBytes = size;
  }
  if (output.storageBytes > MAX_STATIC_PATTERN_RECORD_BYTES) {
    fail("record-too-large", `Static pattern exceeds ${MAX_STATIC_PATTERN_RECORD_BYTES} bytes.`);
  }
  return output;
}

export function normalizeStaticPatternRecord(input) {
  assertPassiveData(input);
  if (!isPlainObject(input)) fail("invalid-record", "Static pattern record must be an object.");
  if (input.format !== undefined && input.format !== STATIC_PATTERN_FORMAT) {
    fail("unsupported-format", "Static pattern record format is unsupported.");
  }
  if (input.formatVersion !== undefined && input.formatVersion !== STATIC_PATTERN_FORMAT_VERSION) {
    fail("unsupported-version", "Static pattern record version is unsupported.");
  }
  const geometry = normalizeGeometry(input.geometry);
  const now = new Date().toISOString();
  const createdAt = normalizeTimestamp(input.createdAt, now);
  const record = {
    format: STATIC_PATTERN_FORMAT,
    formatVersion: STATIC_PATTERN_FORMAT_VERSION,
    id: requiredText(input.id, "id", 128),
    name: requiredText(input.name, "name", 120),
    description: optionalText(input.description, "description", 600),
    status: "personal-unverified",
    source: normalizeSource(input.source, input.geometry?.source),
    provenance: normalizeProvenance(input.provenance),
    calibration: geometry.calibration,
    warnings: normalizeWarnings(input.warnings),
    createdAt,
    updatedAt: normalizeTimestamp(input.updatedAt, createdAt),
    geometry,
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(record.id)) {
    fail("invalid-field", "Static pattern id is invalid.");
  }
  return withStableStorageSize(record);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarize(record) {
  return clone({
    format: record.format,
    formatVersion: record.formatVersion,
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    source: record.source,
    provenance: record.provenance,
    calibration: record.calibration,
    warnings: record.warnings,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statistics: record.geometry.statistics,
    storageBytes: record.storageBytes,
  });
}

function sortNewestFirst(records) {
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}

function openDatabase(indexedDb, onVersionChange = () => {}) {
  return new Promise((resolve, reject) => {
    let request;
    let settled = false;
    let timeoutId = null;
    const settle = (callback, value) => {
      if (settled) return false;
      settled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      callback(value);
      return true;
    };
    try {
      request = indexedDb.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        onVersionChange();
      };
      settle(resolve, db);
    };
    request.onerror = () => settle(reject, request.error || new Error("IndexedDB could not be opened."));
    request.onblocked = () => undefined;
    timeoutId = setTimeout(() => {
      settle(reject, new Error("IndexedDB open or upgrade remained blocked."));
    }, 5000);
  });
}

function approximateStoredBytes(value) {
  const claimed = value?.storageBytes;
  if (Number.isSafeInteger(claimed) && claimed > 0 && claimed <= MAX_STATIC_PATTERN_RECORD_BYTES) {
    return claimed;
  }
  try {
    return Math.min(utf8Size(value), MAX_STATIC_PATTERN_RECORD_BYTES);
  } catch {
    return MAX_STATIC_PATTERN_RECORD_BYTES;
  }
}

function transactionFailure(transaction, fallback) {
  return transaction.error || fallback || new Error("IndexedDB transaction failed.");
}

function scanTransaction(db, mode, onValue, onEnd = () => {}) {
  return new Promise((resolve, reject) => {
    let transaction;
    let failure = null;
    try {
      transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        try {
          if (cursor) {
            onValue(cursor.value, cursor, store);
            cursor.continue();
          } else {
            onEnd(store);
          }
        } catch (error) {
          failure = error;
          try { transaction.abort(); } catch { reject(error); }
        }
      };
      request.onerror = () => {
        failure = request.error || new Error("IndexedDB cursor failed.");
      };
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transactionFailure(transaction, failure));
    transaction.onerror = () => {
      failure ||= transaction.error;
    };
  });
}

function requestTransaction(db, mode, makeRequest) {
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    let failure = null;
    try {
      transaction = db.transaction(STORE_NAME, mode);
      const request = makeRequest(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => { failure = request.error || new Error("IndexedDB request failed."); };
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transactionFailure(transaction, failure));
    transaction.onerror = () => { failure ||= transaction.error; };
  });
}

export function createStaticPatternRepository({ indexedDb = globalThis.indexedDB } = {}) {
  const memory = new Map();
  let persistentAvailable = Boolean(indexedDb);
  let databasePromise = null;
  let lastError = null;
  let invalidRecordsSkipped = 0;

  const database = async () => {
    if (!indexedDb) return null;
    databasePromise ||= openDatabase(indexedDb, () => {
      databasePromise = null;
      persistentAvailable = false;
    });
    try {
      const db = await databasePromise;
      persistentAvailable = true;
      return db;
    } catch (error) {
      lastError = error;
      persistentAvailable = false;
      databasePromise = null;
      return null;
    }
  };

  const invalidateDatabase = (db, error) => {
    lastError = error;
    persistentAvailable = false;
    try { db?.close?.(); } catch { /* A failed connection may already be closed. */ }
    databasePromise = null;
  };

  const memoryRecords = () => Array.from(memory.values());
  const checkMemoryCapacity = (record) => {
    const others = memoryRecords().filter((item) => item.id !== record.id);
    if (others.length >= MAX_STATIC_PATTERN_ITEMS) {
      fail("library-full", `Static pattern library is limited to ${MAX_STATIC_PATTERN_ITEMS} items.`);
    }
    const total = others.reduce((sum, item) => sum + item.storageBytes, 0) + record.storageBytes;
    if (total > MAX_STATIC_PATTERN_LIBRARY_BYTES) {
      fail("library-too-large", `Static pattern library exceeds ${MAX_STATIC_PATTERN_LIBRARY_BYTES} bytes.`);
    }
  };

  return {
    get persistent() { return persistentAvailable; },
    get lastError() { return lastError; },
    get lastWarning() {
      return invalidRecordsSkipped ? { code: "invalid-records-skipped", count: invalidRecordsSkipped } : null;
    },

    async list() {
      const db = await database();
      if (!db) return sortNewestFirst(memoryRecords().map(summarize));
      const summaries = [];
      invalidRecordsSkipped = 0;
      try {
        await scanTransaction(db, "readonly", (value) => {
          try {
            summaries.push(summarize(normalizeStaticPatternRecord(value)));
          } catch {
            invalidRecordsSkipped += 1;
          }
        });
        lastError = null;
        const merged = new Map(summaries.map((summary) => [summary.id, summary]));
        memoryRecords().forEach((record) => merged.set(record.id, summarize(record)));
        return sortNewestFirst(Array.from(merged.values()));
      } catch (error) {
        invalidateDatabase(db, error);
        return sortNewestFirst(memoryRecords().map(summarize));
      }
    },

    async get(id) {
      const safeId = requiredText(id, "id", 128);
      if (memory.has(safeId)) return clone(memory.get(safeId));
      const db = await database();
      if (!db) return null;
      try {
        const value = await requestTransaction(db, "readonly", (store) => store.get(safeId));
        lastError = null;
        return value === undefined ? null : clone(normalizeStaticPatternRecord(value));
      } catch (error) {
        invalidateDatabase(db, error);
        return null;
      }
    },

    async save(input) {
      const record = normalizeStaticPatternRecord(input);
      const db = await database();
      if (!db) {
        checkMemoryCapacity(record);
        memory.set(record.id, clone(record));
        return { persistent: false, record: clone(record) };
      }
      const temporaryOthers = memoryRecords().filter((item) => item.id !== record.id);
      let otherCount = temporaryOthers.length;
      let otherBytes = temporaryOthers.reduce((sum, item) => sum + item.storageBytes, 0);
      try {
        await scanTransaction(db, "readwrite", (value) => {
          try {
            const existing = normalizeStaticPatternRecord(value);
            if (existing.id !== record.id && !memory.has(existing.id)) {
              otherCount += 1;
              otherBytes += existing.storageBytes;
            }
          } catch {
            invalidRecordsSkipped += 1;
            const existingId = typeof value?.id === "string" ? value.id : null;
            if (existingId !== record.id && (!existingId || !memory.has(existingId))) {
              otherCount += 1;
              otherBytes += approximateStoredBytes(value);
            }
          }
        }, (store) => {
          if (otherCount >= MAX_STATIC_PATTERN_ITEMS) {
            fail("library-full", `Static pattern library is limited to ${MAX_STATIC_PATTERN_ITEMS} items.`);
          }
          if (otherBytes + record.storageBytes > MAX_STATIC_PATTERN_LIBRARY_BYTES) {
            fail("library-too-large", `Static pattern library exceeds ${MAX_STATIC_PATTERN_LIBRARY_BYTES} bytes.`);
          }
          store.put(record);
        });
        memory.delete(record.id);
        lastError = null;
        return { persistent: true, record: clone(record) };
      } catch (error) {
        if (error instanceof StaticPatternStorageError) throw error;
        invalidateDatabase(db, error);
        checkMemoryCapacity(record);
        memory.set(record.id, clone(record));
        return { persistent: false, record: clone(record) };
      }
    },

    async remove(id) {
      const safeId = requiredText(id, "id", 128);
      const removedFromMemory = memory.delete(safeId);
      const db = await database();
      if (!db) {
        if (removedFromMemory || !indexedDb) return { persistent: false };
        throw new StaticPatternStorageError(
          "delete-unconfirmed",
          "Persistent storage is unavailable, so deletion could not be confirmed.",
          { cause: lastError },
        );
      }
      try {
        await requestTransaction(db, "readwrite", (store) => store.delete(safeId));
        lastError = null;
        return { persistent: true };
      } catch (error) {
        invalidateDatabase(db, error);
        if (removedFromMemory) return { persistent: false };
        throw new StaticPatternStorageError(
          "delete-unconfirmed",
          "Static pattern deletion did not complete.",
          { cause: error },
        );
      }
    },
  };
}
