import test from "node:test";
import assert from "node:assert/strict";
import { createStoredZip, crc32, parseStoredZip, StoredZipError } from "../src/core/export/storedZip.js";

const decoder = new TextDecoder();

test("stored ZIP is deterministic and round-trips UTF-8 paths and content", () => {
  const entries = [
    { name: "manifest.json", content: '{"version":1}' },
    { name: "dxf/size-S.dxf", content: "0\r\nEOF\r\n" },
    { name: "notes/пример.txt", content: "Проверка" },
  ];
  const first = createStoredZip(entries);
  const second = createStoredZip(entries);
  const files = parseStoredZip(first);

  assert.deepEqual(first, second);
  assert.deepEqual(files.map((file) => file.name), entries.map((entry) => entry.name));
  assert.equal(decoder.decode(files[0].content), entries[0].content);
  assert.equal(decoder.decode(files[2].content), entries[2].content);
  assert.equal(files[1].crc32, crc32(files[1].content));
});

test("stored ZIP rejects unsafe names, duplicates, and corrupted payloads", () => {
  assert.throws(() => createStoredZip([{ name: "../escape.txt", content: "x" }]), StoredZipError);
  for (const name of [
    "C:/escape.txt",
    "bad\0name.txt",
    "bad\ud800name.txt",
    "NUL.txt",
    "trail. ",
    "e\u0301.txt",
    "bad<name>.txt",
    'bad"name.txt',
    "bad|name.txt",
    "bad?.txt",
    "bad*.txt",
  ]) {
    assert.throws(() => createStoredZip([{ name, content: "x" }]), StoredZipError, name);
  }
  assert.throws(
    () => createStoredZip([{ name: "same.txt", content: "a" }, { name: "same.txt", content: "b" }]),
    /duplicate/i,
  );
  assert.throws(
    () => createStoredZip([{ name: "Case.txt", content: "a" }, { name: "case.txt", content: "b" }]),
    /duplicate/i,
  );

  const archive = createStoredZip([{ name: "file.txt", content: "hello" }]);
  const corrupted = archive.slice();
  const payloadOffset = 30 + new TextEncoder().encode("file.txt").length;
  corrupted[payloadOffset] ^= 0xff;
  assert.throws(() => parseStoredZip(corrupted), /CRC mismatch/i);
});
