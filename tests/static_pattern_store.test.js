import assert from "node:assert/strict";
import test from "node:test";

import {
  createStaticPatternRepository,
  MAX_STATIC_PATTERN_ITEMS,
  MAX_STATIC_PATTERN_SEGMENTS,
  normalizeStaticPatternRecord,
  STATIC_PATTERN_DB_NAME,
  STATIC_PATTERN_FORMAT,
  STATIC_PATTERN_FORMAT_VERSION,
  STATIC_PATTERN_STORE_NAME,
} from "../src/core/import/staticPatternStore.js";
import { MAX_STATIC_SVG_PATH_COMMANDS } from "../src/core/import/staticSvg.js";
import { importStaticSvg } from "../src/core/import/staticSvg.js";
import { serializeStaticPatternSvg } from "../src/core/import/staticPatternSvg.js";

function geometry(overrides = {}) {
  return {
    kind: "lekalo-static-pattern",
    schemaVersion: 1,
    editable: false,
    geometryUnit: "svg-user-unit",
    viewport: {
      viewBox: { minX: 0, minY: 0, width: 100, height: 200 },
      preserveAspectRatio: "xMidYMid meet",
    },
    calibration: {
      status: "derived",
      unit: "mm-per-svg-user-unit",
      millimetersPerUnit: 1,
      millimetersPerUnitX: 1,
      millimetersPerUnitY: 1,
      requiresCalibration: false,
    },
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 200, width: 100, height: 200 },
    statistics: { entityCount: 1, pathCommandCount: 4 },
    entities: [{
      id: "piece-1",
      sourceElement: "path",
      groups: [],
      presentation: { stroke: "black" },
      segments: [
        { type: "M", values: [0, 0] },
        { type: "L", values: [100, 0] },
        { type: "L", values: [100, 200] },
        { type: "Z", values: [] },
      ],
    }],
    source: {
      mediaType: "image/svg+xml",
      byteLength: 100,
      sha256: "a".repeat(64),
      hash: { algorithm: "SHA-256", value: "a".repeat(64) },
    },
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: "static-test",
    name: "My pattern",
    source: { fileName: "pattern.svg", byteLength: 100, sha256: "a".repeat(64) },
    provenance: { license: "private", author: "Owner", sourceUrl: "" },
    geometry: geometry(),
    ...overrides,
  };
}

test("IndexedDB identity remains compatible with the v17 local library", () => {
  assert.equal(STATIC_PATTERN_DB_NAME, "lekalo-pattern-library");
  assert.equal(STATIC_PATTERN_STORE_NAME, "staticPatterns");
});

test("static records are strictly normalized and always marked personal-unverified", () => {
  const normalized = normalizeStaticPatternRecord(record({
    status: "fit-validated",
    measurements: { waist: 70 },
  }));
  assert.equal(normalized.format, STATIC_PATTERN_FORMAT);
  assert.equal(normalized.formatVersion, STATIC_PATTERN_FORMAT_VERSION);
  assert.equal(normalized.status, "personal-unverified");
  assert.equal(normalized.measurements, undefined);
  assert.equal(normalized.provenance.author, "Owner");
  assert.deepEqual(Object.keys(normalized.geometry.entities[0]), ["id", "segments"]);
  assert.equal(normalized.geometry.statistics.pathCommandCount, 4);
  assert.ok(normalized.storageBytes > 0);
});

test("static records reject executable values, poisoned keys, and non-finite geometry", () => {
  assert.throws(
    () => normalizeStaticPatternRecord(record({ geometry: { run() {} } })),
    /executable|unsupported/i,
  );
  assert.throws(() => normalizeStaticPatternRecord(record({
    geometry: geometry({
      entities: [{ id: "piece", segments: [{ type: "M", values: [Infinity, 0] }] }],
    }),
  })), /non-finite/i);
  const poisoned = JSON.parse(`{
    "id":"static-test",
    "name":"Bad",
    "geometry":{"__proto__":{"polluted":true}}
  }`);
  assert.throws(() => normalizeStaticPatternRecord(poisoned), /unsafe key/i);
  assert.equal({}.polluted, undefined);
});

test("explicit future record or geometry versions fail closed", () => {
  assert.throws(() => normalizeStaticPatternRecord(record({ formatVersion: 2 })), /version/i);
  assert.throws(() => normalizeStaticPatternRecord(record({ format: "another-format" })), /format/i);
  assert.throws(
    () => normalizeStaticPatternRecord(record({ geometry: geometry({ schemaVersion: 2 }) })),
    /version|normalized/i,
  );
  assert.throws(
    () => normalizeStaticPatternRecord(record({ geometry: geometry({ editable: true }) })),
    /normalized|inert/i,
  );
});

test("parser and store share the same 25000-segment ceiling", () => {
  assert.equal(MAX_STATIC_PATTERN_SEGMENTS, MAX_STATIC_SVG_PATH_COMMANDS);
  const makeSegments = (count) => Array.from({ length: count }, (_, index) => (
    index === 0
      ? { type: "M", values: [0, 0] }
      : { type: "L", values: [index % 100, index % 200] }
  ));
  const atLimit = normalizeStaticPatternRecord(record({
    geometry: geometry({
      entities: [{ id: "piece", segments: makeSegments(MAX_STATIC_PATTERN_SEGMENTS) }],
    }),
  }));
  assert.equal(atLimit.geometry.statistics.pathCommandCount, MAX_STATIC_PATTERN_SEGMENTS);
  assert.throws(() => normalizeStaticPatternRecord(record({
    geometry: geometry({
      entities: [{ id: "piece", segments: makeSegments(MAX_STATIC_PATTERN_SEGMENTS + 1) }],
    }),
  })), /25000|segments/i);
});

test("memory list returns summaries and get returns the full record", async () => {
  const repository = createStaticPatternRepository({ indexedDb: null });
  const result = await repository.save(record());
  assert.equal(result.persistent, false);

  const summaries = await repository.list();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].geometry, undefined);
  assert.equal(summaries[0].statistics.entityCount, 1);

  const stored = await repository.get("static-test");
  assert.equal(stored.name, "My pattern");
  assert.equal(stored.geometry.entities.length, 1);
  await repository.remove("static-test");
  assert.equal((await repository.list()).length, 0);
});

test("memory fallback enforces its item limit without losing earlier records", async () => {
  const repository = createStaticPatternRepository({ indexedDb: null });
  for (let index = 0; index < MAX_STATIC_PATTERN_ITEMS; index += 1) {
    await repository.save(record({ id: `static-${index}`, name: `Pattern ${index}` }));
  }
  await assert.rejects(
    () => repository.save(record({ id: "static-overflow", name: "Overflow" })),
    /limited/i,
  );
  assert.equal((await repository.list()).length, MAX_STATIC_PATTERN_ITEMS);
});

test("real importer geometry survives store summary, full reload, and safe serialization", async () => {
  const imported = await importStaticSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30" width="40mm" height="30mm">
      <path id="front" d="M0 0 L40 0 C40 10 25 30 0 30 Z"/>
    </svg>
  `);
  const repository = createStaticPatternRepository({ indexedDb: null });
  await repository.save(record({ id: "real-import", geometry: imported }));

  const [summary] = await repository.list();
  assert.equal(summary.statistics.entityCount, 1);
  assert.equal(summary.geometry, undefined);
  const reopened = await repository.get("real-import");
  const svg = serializeStaticPatternSvg(reopened.geometry, { title: reopened.name });
  assert.match(svg, /width="40mm"/);
  assert.match(svg, /id="front"/);
});
