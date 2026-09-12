import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProfileCount,
  JsonImportError,
  jsonImportErrorMessage,
  MAX_JSON_IMPORT_BYTES,
  MAX_PROFILE_COUNT,
  profileListFromBackup,
  readBoundedJsonFile,
} from "../src/ui/utils/jsonImport.js";

function textFile(text, declaredSize = new TextEncoder().encode(text).byteLength) {
  let reads = 0;
  return {
    size: declaredSize,
    async text() {
      reads += 1;
      return text;
    },
    get reads() { return reads; },
  };
}

test("bounded JSON import rejects oversized files before reading them", async () => {
  const oversized = textFile("{}", MAX_JSON_IMPORT_BYTES + 1);
  await assert.rejects(() => readBoundedJsonFile(oversized), (error) => (
    error instanceof JsonImportError && error.code === "file-too-large"
  ));
  assert.equal(oversized.reads, 0, "file.text() must not run after the declared size exceeds the limit");

  const lyingFile = textFile(`"${"x".repeat(32)}"`, 1);
  await assert.rejects(
    () => readBoundedJsonFile(lyingFile, { maxBytes: 16 }),
    (error) => error instanceof JsonImportError && error.code === "file-too-large",
  );
  assert.equal(lyingFile.reads, 1, "actual UTF-8 size is checked after reading a size-inconsistent file");
});

test("bounded JSON import parses valid content and classifies malformed input", async () => {
  assert.deepEqual(await readBoundedJsonFile(textFile('{"ok":true}')), { ok: true });
  await assert.rejects(
    () => readBoundedJsonFile(textFile("{broken")),
    (error) => error instanceof JsonImportError && error.code === "invalid-json",
  );
  await assert.rejects(
    () => readBoundedJsonFile({ size: 1, async text() { throw new Error("disk failure"); } }),
    (error) => error instanceof JsonImportError && error.code === "read-failed",
  );
});

test("profile import count is bounded and errors are clear in Russian and English", () => {
  assert.equal(assertProfileCount(Array.from({ length: MAX_PROFILE_COUNT })).length, MAX_PROFILE_COUNT);
  let limitError;
  assert.throws(
    () => assertProfileCount(Array.from({ length: MAX_PROFILE_COUNT + 1 })),
    (error) => {
      limitError = error;
      return error instanceof JsonImportError && error.code === "too-many-profiles";
    },
  );
  assert.match(jsonImportErrorMessage(limitError, "ru", "profiles"), /не более 250/i);
  assert.match(jsonImportErrorMessage(limitError, "en", "profiles"), /maximum is 250/i);

  const sizeError = new JsonImportError("file-too-large", "large", { maxBytes: MAX_JSON_IMPORT_BYTES });
  assert.match(jsonImportErrorMessage(sizeError, "ru"), /2 МБ/);
  assert.match(jsonImportErrorMessage(sizeError, "en"), /2 MB/);
  assert.match(jsonImportErrorMessage(new JsonImportError("invalid-json", "bad"), "ru"), /JSON/);
  assert.match(jsonImportErrorMessage(new JsonImportError("invalid-json", "bad"), "en"), /JSON/);
});

test("profile backup wrappers fail closed on unknown format or future version", () => {
  const profiles = [{ id: "p1" }];
  assert.equal(profileListFromBackup(profiles), profiles, "the historical bare-array backup remains readable");
  assert.equal(profileListFromBackup({ format: "lekalo-profiles", version: 1, profiles }), profiles);
  assert.throws(
    () => profileListFromBackup({ format: "other", version: 1, profiles }),
    (error) => error instanceof JsonImportError && error.code === "unsupported-profile-format",
  );
  assert.throws(
    () => profileListFromBackup({ format: "lekalo-profiles", version: 999, profiles }),
    (error) => error instanceof JsonImportError && error.code === "unsupported-profile-version" && error.version === 999,
  );
  assert.equal(
    jsonImportErrorMessage(new JsonImportError("unsupported-profile-version", "", { version: 999 }), "ru", "profiles"),
    "Версия резервной копии профилей 999 не поддерживается.",
  );
});
