import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, toggleTheme } from "../src/ui/styles/theme.js";

test("theme remains usable when browser storage is blocked", () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: {} } },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
    },
  });
  try {
    assert.doesNotThrow(() => initTheme(null));
    assert.equal(globalThis.document.documentElement.dataset.theme, "light");
    assert.equal(toggleTheme(), "dark");
    assert.equal(globalThis.document.documentElement.dataset.theme, "dark");
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
  }
});
