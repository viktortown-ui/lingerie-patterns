import assert from "node:assert/strict";
import test from "node:test";

const storeUrl = new URL("../src/ui/state/store.js", import.meta.url);

async function freshStore(name) {
  return import(`${storeUrl.href}?test=${encodeURIComponent(name)}-${Date.now()}-${Math.random()}`);
}

async function withStorage(storage, callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  try {
    await callback();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
}

test("state loading survives blocked or corrupt local storage", async () => {
  await withStorage({
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  }, async () => {
    const store = await freshStore("blocked");
    const state = store.loadState();
    assert.deepEqual(state.profiles, []);
    assert.equal(state.draft, null);
    assert.equal(store.isPersistenceAvailable(), false);
    assert.equal(store.saveState(state), false);
    assert.equal(store.isPersistenceAvailable(), false);
    assert.doesNotThrow(() => store.setState({ theme: "dark" }));
    assert.equal(store.getState().theme, "dark");
  });

  await withStorage({
    getItem() { return "{not-json"; },
    setItem() {},
  }, async () => {
    const store = await freshStore("corrupt");
    assert.equal(store.loadState().draft, null);
  });
});

test("draft migration preserves adjustments and edit-point preference", async () => {
  const persisted = {
    language: "ru",
    paperSize: "A3",
    profiles: [],
    draft: {
      moduleId: "panties_basic",
      measurements: { waist: 72 },
      options: { seamAllowance: 6 },
      adjustments: { frontWaistDepth: 1.2 },
      preview: { scaleLabels: false, seamHighlight: true, editPoints: true },
    },
  };
  let saved = null;
  await withStorage({
    getItem() { return JSON.stringify(persisted); },
    setItem(_key, value) { saved = JSON.parse(value); },
  }, async () => {
    const store = await freshStore("migration");
    const state = store.loadState();
    assert.deepEqual(state.draft.adjustments, { frontWaistDepth: 1.2 });
    assert.deepEqual(state.draftsByModule.panties_basic.adjustments, { frontWaistDepth: 1.2 });
    assert.deepEqual(state.draft.preview, {
      scaleLabels: false,
      seamHighlight: true,
      editPoints: true,
    });
    assert.equal(store.saveState(state), true);
    assert.equal(saved.draft.preview.editPoints, true);
  });
});

test("draft persistence preserves a bounded module version", async () => {
  await withStorage({
    getItem() {
      return JSON.stringify({
        draft: {
          moduleId: "panties_basic",
          moduleVersion: "1.2.3",
          measurements: {},
          options: {},
          adjustments: {},
        },
      });
    },
    setItem() {},
  }, async () => {
    const store = await freshStore("module-version");
    assert.equal(store.loadState().draft.moduleVersion, "1.2.3");
  });
});

test("legacy drafts receive safe preview defaults", async () => {
  await withStorage({
    getItem() {
      return JSON.stringify({
        profiles: {},
        draft: { moduleId: "panties_basic", measurements: {}, options: {} },
      });
    },
    setItem() {},
  }, async () => {
    const store = await freshStore("legacy");
    assert.deepEqual(store.loadState().profiles, []);
    assert.deepEqual(store.loadState().draft.preview, {
      scaleLabels: true,
      seamHighlight: false,
      editPoints: false,
    });
  });
});

test("invalid persisted locale and paper size fall back to supported values", async () => {
  await withStorage({
    getItem() {
      return JSON.stringify({
        language: "xx",
        paperSize: "BOGUS",
        draft: { moduleId: "panties_basic", paperSize: "BOGUS", measurements: {}, options: {} },
      });
    },
    setItem() {},
  }, async () => {
    const store = await freshStore("invalid-enums");
    const state = store.loadState();
    assert.ok(["ru", "en"].includes(state.language));
    assert.equal(state.paperSize, "A4");
    assert.equal(state.draft.paperSize, null);
  });
});

test("persisted state is allowlisted and nested records cannot poison storage", async () => {
  let saved = null;
  const raw = `{
    "language":"ru",
    "theme":"javascript:bad",
    "junk":"${"x".repeat(2000)}",
    "profiles":[{
      "id":"safe",
      "name":"Safe profile",
      "moduleId":"panties_basic",
      "updatedAt":"2026-09-07T00:00:00.000Z",
      "measurements":{"waist":72,"nested":{"large":"payload"},"__proto__":{"polluted":true}},
      "extraBlob":"${"y".repeat(2000)}"
    }],
    "draft":{"moduleId":"panties_basic","measurements":[72],"options":{},"adjustments":{}},
    "draftsByModule":{"__proto__":{"moduleId":"__proto__","measurements":{"waist":99}}}
  }`;
  await withStorage({
    getItem() { return raw; },
    setItem(_key, value) { saved = value; },
  }, async () => {
    const store = await freshStore("allowlisted-state");
    const state = store.getState();
    assert.equal(Object.hasOwn(state, "junk"), false);
    assert.equal(state.theme, null);
    assert.equal(Object.hasOwn(state.profiles[0], "extraBlob"), false);
    assert.deepEqual(state.profiles[0].measurements, { waist: 72 });
    assert.equal(state.draft.measurements, null);
    assert.equal(Object.hasOwn(state.draftsByModule, "__proto__"), false);
    assert.equal(Object.getPrototypeOf(state.draftsByModule), Object.prototype);
    store.setState({ theme: "dark" });
    assert.equal(saved.includes('"junk"'), false);
    assert.equal(saved.includes("extraBlob"), false);
  });
});

test("legacy profiles receive distinct ids and deleting one preserves the other", async () => {
  await withStorage({
    getItem() {
      return JSON.stringify({
        profiles: [
          { name: "Legacy A", measurements: { waist: 70 } },
          { name: "Legacy B", measurements: { waist: 80 } },
        ],
      });
    },
    setItem() {},
  }, async () => {
    const store = await freshStore("legacy-profile-ids");
    const profiles = store.getState().profiles;
    assert.equal(profiles.length, 2);
    assert.ok(profiles[0].id);
    assert.ok(profiles[1].id);
    assert.notEqual(profiles[0].id, profiles[1].id);
    assert.deepEqual(profiles.map((profile) => profile.moduleId), ["panties_basic", "panties_basic"]);

    store.deleteProfile(null, profiles[0].id);
    assert.deepEqual(store.getState().profiles.map((profile) => profile.name), ["Legacy B"]);
  });
});

test("profile selections are remembered independently per module and survive imports", async () => {
  await withStorage({ getItem() { return null; }, setItem() {} }, async () => {
    const store = await freshStore("profile-selection-map");
    store.getState();
    store.upsertProfile(null, { id: "basic-a", moduleId: "panties_basic", name: "A" });
    store.upsertProfile(null, { id: "basic-b", moduleId: "panties_basic", name: "B" });
    store.setState({
      lastProfileId: "basic-a",
      lastProfileIdByModule: { ...store.getState().lastProfileIdByModule, panties_basic: "basic-a" },
    });
    store.upsertProfile(null, { id: "thong-t", moduleId: "panties_thong_basic", name: "T" });

    assert.deepEqual(store.getState().lastProfileIdByModule, {
      panties_basic: "basic-a",
      panties_thong_basic: "thong-t",
    });

    store.replaceProfiles([
      ...store.getState().profiles,
      { id: "basic-c", moduleId: "panties_basic", name: "C" },
    ]);
    assert.equal(store.getState().lastProfileIdByModule.panties_basic, "basic-a");
    assert.equal(store.getState().lastProfileIdByModule.panties_thong_basic, "thong-t");

    store.deleteProfile(null, "basic-a");
    assert.equal(store.getState().lastProfileIdByModule.panties_basic, "basic-b");
    assert.equal(store.getState().lastProfileIdByModule.panties_thong_basic, "thong-t");
  });
});

test("legacy global profile selection migrates into its module", async () => {
  await withStorage({
    getItem() {
      return JSON.stringify({
        profiles: [{ id: "legacy-selected", name: "Legacy", moduleId: "panties_basic" }],
        lastProfileId: "legacy-selected",
      });
    },
    setItem() {},
  }, async () => {
    const store = await freshStore("legacy-profile-selection");
    assert.deepEqual(store.getState().lastProfileIdByModule, { panties_basic: "legacy-selected" });
  });
});

test("unsaved drafts are retained independently for every module", async () => {
  await withStorage({ getItem() { return null; }, setItem() {} }, async () => {
    const store = await freshStore("drafts-by-module");
    store.getState();
    store.updateDraft({ moduleId: "panties_basic", measurements: { waist: 75 } });
    store.updateDraft({ moduleId: "panties_thong_basic", measurements: { waist: 81 } });
    assert.equal(store.getState().draftsByModule.panties_basic.measurements.waist, 75);
    assert.equal(store.getState().draftsByModule.panties_thong_basic.measurements.waist, 81);
    assert.equal(store.getState().draft.moduleId, "panties_thong_basic", "legacy alias follows current draft");
  });
});

test("stale tabs rebase mutations instead of overwriting profiles and module drafts", async () => {
  let persisted = null;
  await withStorage({
    getItem() { return persisted; },
    setItem(_key, value) { persisted = value; },
  }, async () => {
    const firstTab = await freshStore("race-first");
    const secondTab = await freshStore("race-second");
    firstTab.getState();
    secondTab.getState();

    firstTab.upsertProfile(null, { id: "from-first", moduleId: "panties_basic", name: "First" });
    secondTab.updateDraft({ moduleId: "crop_top_basic", measurements: { bust: 92 } });
    let saved = JSON.parse(persisted);
    assert.deepEqual(saved.profiles.map((profile) => profile.id), ["from-first"]);
    assert.equal(saved.draftsByModule.crop_top_basic.measurements.bust, 92);

    const staleImportSnapshot = [...secondTab.getState().profiles];
    firstTab.updateDraft({ moduleId: "panties_basic", measurements: { waist: 74 } });
    firstTab.upsertProfile(null, { id: "late-first", moduleId: "panties_basic", name: "Late" });
    secondTab.replaceProfiles([
      ...staleImportSnapshot,
      { id: "from-second", moduleId: "crop_top_basic", name: "Second" },
    ]);
    saved = JSON.parse(persisted);
    assert.deepEqual(new Set(saved.profiles.map((profile) => profile.id)), new Set(["from-first", "late-first", "from-second"]));
    assert.equal(saved.draftsByModule.panties_basic.measurements.waist, 74);
    assert.equal(saved.draftsByModule.crop_top_basic.measurements.bust, 92);
  });
});
