import assert from "node:assert/strict";
import test from "node:test";

import { subscribeProfileChanges } from "../src/ui/utils/profiles.js";

const STORAGE_KEY = "lingerie-pattern-state";
const storeUrl = new URL("../src/ui/state/store.js", import.meta.url);

test("an external storage event refreshes only the profile list and cleanup unsubscribes", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousAddEventListener = Object.getOwnPropertyDescriptor(globalThis, "addEventListener");
  let storageListener = null;
  let persisted = JSON.stringify({ profiles: [], language: "ru" });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key) { return key === STORAGE_KEY ? persisted : null; },
      setItem(key, value) { if (key === STORAGE_KEY) persisted = value; },
    },
  });
  Object.defineProperty(globalThis, "addEventListener", {
    configurable: true,
    value(type, listener) {
      if (type === "storage") storageListener = listener;
    },
  });

  try {
    const store = await import(`${storeUrl.href}?profile-sync=${Date.now()}-${Math.random()}`);
    store.getState();
    assert.equal(typeof storageListener, "function", "store must listen for browser storage events");

    const formSentinel = { waist: 77, untouched: true };
    const renderedCollections = [];
    const unsubscribe = subscribeProfileChanges(store.subscribe, (profiles) => {
      renderedCollections.push(profiles.map((profile) => profile.id));
    });

    const firstExternalState = JSON.stringify({
      profiles: [{ id: "external-a", moduleId: "panties_basic", name: "External A" }],
      language: "ru",
    });
    storageListener({ key: STORAGE_KEY, newValue: firstExternalState });
    assert.deepEqual(renderedCollections, [["external-a"]]);
    assert.deepEqual(formSentinel, { waist: 77, untouched: true }, "profile refresh must not rebuild or mutate form values");

    unsubscribe();
    const secondExternalState = JSON.stringify({
      profiles: [{ id: "external-b", moduleId: "panties_basic", name: "External B" }],
      language: "ru",
    });
    storageListener({ key: STORAGE_KEY, newValue: secondExternalState });
    assert.deepEqual(renderedCollections, [["external-a"]], "destroy cleanup must stop profile-list renders");
    assert.equal(store.getState().profiles[0].id, "external-b", "cleanup must not prevent state synchronization");
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete globalThis.localStorage;
    if (previousAddEventListener) Object.defineProperty(globalThis, "addEventListener", previousAddEventListener);
    else delete globalThis.addEventListener;
  }
});
