import { sanitizeMeasurementVerification } from "../../core/validate/measurementVerification.js";

const STORAGE_KEY = "lingerie-pattern-state";
const LEGACY_PROFILE_MODULE_ID = "panties_basic";
const PAPER_SIZES = new Set(["A4", "A3", "LETTER", "A0"]);
const LANGUAGES = new Set(["ru", "en"]);
const THEMES = new Set(["light", "dark"]);
const INVALID_MODULE_VERSION = "invalid-local-version";
const subscribers = new Set();
let currentState = null;
let generatedProfileCounter = 0;
let persistenceAvailable = true;
let lastKnownStorageValue = null;

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeRecordKey(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && !["__proto__", "prototype", "constructor"].includes(value);
}

function normalizeValueRecord(raw) {
  if (!isPlainRecord(raw)) return null;
  const result = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (!safeRecordKey(key)) return;
    if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "string" || typeof value === "boolean") result[key] = value;
  });
  return result;
}

function normalizeMeasurementVerification(raw) {
  const normalized = sanitizeMeasurementVerification(raw);
  return normalized.method || Object.keys(normalized.repeated).length ? normalized : null;
}

function normalizeModuleVersion(value) {
  if (value == null) return null;
  return typeof value === "string" && value.length > 0 && value.length <= 64
    ? value
    : INVALID_MODULE_VERSION;
}

function createProfileId() {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `profile-${randomId}`;
  generatedProfileCounter += 1;
  return `profile-${Date.now().toString(36)}-${generatedProfileCounter.toString(36)}`;
}

function normalizeProfiles(rawProfiles) {
  if (!Array.isArray(rawProfiles)) return [];
  const usedIds = new Set();
  return rawProfiles
    .filter((profile) => profile && typeof profile === "object" && typeof profile.name === "string" && profile.name.trim())
    .map((profile) => {
      let id = typeof profile.id === "string" ? profile.id.trim().slice(0, 256) : "";
      while (!id || usedIds.has(id)) id = createProfileId();
      usedIds.add(id);
      const requestedModuleId = typeof profile.moduleId === "string" ? profile.moduleId.trim() : "";
      const moduleId = safeRecordKey(requestedModuleId)
        ? profile.moduleId.trim()
        : LEGACY_PROFILE_MODULE_ID;
      const normalized = {
        id,
        name: profile.name.trim().slice(0, 200),
        moduleId,
      };
      if (profile.schemaVersion != null) {
        normalized.schemaVersion = normalizeModuleVersion(profile.schemaVersion);
      }
      if (typeof profile.updatedAt === "string") normalized.updatedAt = profile.updatedAt.slice(0, 64);
      const measurements = normalizeValueRecord(profile.measurements);
      const options = normalizeValueRecord(profile.options);
      const adjustments = normalizeValueRecord(profile.adjustments);
      const measurementVerification = normalizeMeasurementVerification(profile.measurementVerification);
      if (measurements) normalized.measurements = measurements;
      if (options) normalized.options = options;
      if (adjustments) normalized.adjustments = adjustments;
      if (measurementVerification) normalized.measurementVerification = measurementVerification;
      return normalized;
    });
}

function normalizeProfileSelections(rawSelections, profiles, legacyId = null) {
  const selections = {};
  if (rawSelections && typeof rawSelections === "object" && !Array.isArray(rawSelections)) {
    Object.entries(rawSelections).forEach(([moduleId, profileId]) => {
      if (typeof profileId !== "string") return;
      const match = profiles.find((profile) => profile.id === profileId && profile.moduleId === moduleId);
      if (match) selections[moduleId] = match.id;
    });
  }
  if (typeof legacyId === "string") {
    const legacyProfile = profiles.find((profile) => profile.id === legacyId);
    if (legacyProfile && !selections[legacyProfile.moduleId]) {
      selections[legacyProfile.moduleId] = legacyProfile.id;
    }
  }
  return selections;
}

function reconcileProfileSelections(rawSelections, profiles) {
  const next = {};
  Object.entries(rawSelections || {}).forEach(([moduleId, profileId]) => {
    const selected = profiles.find((profile) => profile.id === profileId && profile.moduleId === moduleId);
    const fallback = profiles.find((profile) => profile.moduleId === moduleId);
    if (selected || fallback) next[moduleId] = (selected || fallback).id;
  });
  return next;
}

function detectLanguage() {
  const lang = globalThis.navigator?.language?.toLowerCase() || "";
  return lang.startsWith("ru") ? "ru" : "en";
}

function defaultState() {
  return {
    profiles: [],
    lastProfileId: null,
    lastProfileIdByModule: {},
    selectedModuleId: null,
    theme: null,
    language: detectLanguage(),
    paperSize: "A4",
    draft: null,
    draftsByModule: {},
  };
}

function normalizeDraft(raw) {
  if (!isPlainRecord(raw)) return null;
  const defaultPreview = { scaleLabels: true, seamHighlight: false, editPoints: false };
  const preview = isPlainRecord(raw.preview) ? raw.preview : null;
  const requestedModuleId = typeof raw.moduleId === "string" ? raw.moduleId.trim() : "";
  const measurementVerification = normalizeMeasurementVerification(raw.measurementVerification);
  return {
    moduleId: safeRecordKey(requestedModuleId) ? requestedModuleId : null,
    moduleVersion: normalizeModuleVersion(raw.moduleVersion),
    measurements: normalizeValueRecord(raw.measurements),
    options: normalizeValueRecord(raw.options),
    adjustments: normalizeValueRecord(raw.adjustments),
    ...(measurementVerification ? { measurementVerification } : {}),
    paperSize: PAPER_SIZES.has(raw.paperSize) ? raw.paperSize : null,
    preview: preview
      ? {
          scaleLabels:
            typeof preview.scaleLabels === "boolean" ? preview.scaleLabels : defaultPreview.scaleLabels,
          seamHighlight:
            typeof preview.seamHighlight === "boolean" ? preview.seamHighlight : defaultPreview.seamHighlight,
          editPoints:
            typeof preview.editPoints === "boolean" ? preview.editPoints : defaultPreview.editPoints,
        }
      : defaultPreview,
  };
}

function normalizeParsedState(parsed) {
  if (!isPlainRecord(parsed)) return defaultState();
  const normalizedDraft = normalizeDraft(parsed.draft);
  const draftsByModule = normalizeDraftsByModule(parsed.draftsByModule, normalizedDraft);
  const profiles = normalizeProfiles(parsed.profiles);
  const lastProfileId = typeof parsed.lastProfileId === "string"
    && profiles.some((profile) => profile.id === parsed.lastProfileId)
    ? parsed.lastProfileId
    : null;
  const selectedModuleId = typeof parsed.selectedModuleId === "string" && safeRecordKey(parsed.selectedModuleId.trim())
    ? parsed.selectedModuleId.trim()
    : null;
  return {
    profiles,
    lastProfileId,
    lastProfileIdByModule: normalizeProfileSelections(parsed.lastProfileIdByModule, profiles, parsed.lastProfileId),
    selectedModuleId,
    theme: THEMES.has(parsed.theme) ? parsed.theme : null,
    language: LANGUAGES.has(parsed.language) ? parsed.language : defaultState().language,
    paperSize: PAPER_SIZES.has(parsed.paperSize) ? parsed.paperSize : defaultState().paperSize,
    draft: normalizedDraft,
    draftsByModule,
  };
}

export function loadState() {
  let raw = null;
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      persistenceAvailable = false;
      return defaultState();
    }
    raw = storage.getItem(STORAGE_KEY) ?? null;
    lastKnownStorageValue = raw;
    persistenceAvailable = true;
  } catch {
    persistenceAvailable = false;
    return defaultState();
  }
  if (!raw) {
    return defaultState();
  }
  try {
    return normalizeParsedState(JSON.parse(raw));
  } catch (error) {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      persistenceAvailable = false;
      return false;
    }
    const serialized = JSON.stringify(state);
    storage.setItem(STORAGE_KEY, serialized);
    lastKnownStorageValue = serialized;
    persistenceAvailable = true;
    return true;
  } catch {
    persistenceAvailable = false;
    return false;
  }
}

function latestPersistedState(fallback) {
  if (!persistenceAvailable) return fallback;
  try {
    const storage = globalThis.localStorage;
    if (!storage) return fallback;
    const raw = storage.getItem(STORAGE_KEY) ?? null;
    if (!raw || raw === lastKnownStorageValue) return fallback;
    const next = normalizeParsedState(JSON.parse(raw));
    lastKnownStorageValue = raw;
    return next;
  } catch {
    return fallback;
  }
}

function normalizeDraftsByModule(rawDrafts, legacyDraft = null) {
  const drafts = {};
  if (isPlainRecord(rawDrafts)) {
    Object.entries(rawDrafts).forEach(([moduleId, rawDraft]) => {
      const draft = normalizeDraft(rawDraft);
      if (!draft || !safeRecordKey(moduleId)) return;
      drafts[moduleId] = { ...draft, moduleId };
    });
  }
  if (legacyDraft?.moduleId && !drafts[legacyDraft.moduleId]) {
    drafts[legacyDraft.moduleId] = legacyDraft;
  }
  return drafts;
}

export function isPersistenceAvailable() {
  return persistenceAvailable;
}

export function getState() {
  if (!currentState) {
    currentState = loadState();
  }
  return currentState;
}

function notify(prevState) {
  subscribers.forEach((listener) => listener(currentState, prevState));
}

export function setState(patch) {
  const prevState = currentState ?? getState();
  const base = latestPersistedState(prevState);
  currentState = { ...base, ...patch };
  if (patch?.draft?.moduleId) {
    currentState.draftsByModule = {
      ...(base.draftsByModule || {}),
      [patch.draft.moduleId]: patch.draft,
    };
  }
  saveState(currentState);
  notify(prevState);
  return currentState;
}

export function subscribe(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function updateDraft(patch) {
  const prevState = currentState ?? getState();
  const base = latestPersistedState(prevState);
  const moduleId = patch?.moduleId || base.draft?.moduleId;
  const moduleDraft = moduleId ? base.draftsByModule?.[moduleId] : null;
  const prevDraft = moduleDraft && typeof moduleDraft === "object"
    ? moduleDraft
    : base.draft && typeof base.draft === "object" && base.draft.moduleId === moduleId
      ? base.draft
      : {};
  const nextDraft = { ...prevDraft, ...patch };
  currentState = {
    ...base,
    draft: nextDraft,
    draftsByModule: moduleId
      ? { ...(base.draftsByModule || {}), [moduleId]: nextDraft }
      : { ...(base.draftsByModule || {}) },
  };
  saveState(currentState);
  notify(prevState);
  return currentState;
}

export function upsertProfile(state, profile) {
  const prevState = currentState ?? state ?? getState();
  const base = latestPersistedState(prevState);
  const profiles = normalizeProfiles(base.profiles);
  const [normalizedProfile] = normalizeProfiles([profile]);
  if (!normalizedProfile) return base;
  const existingIndex = profiles.findIndex((item) => item.id === normalizedProfile.id);
  if (existingIndex >= 0) {
    profiles[existingIndex] = normalizedProfile;
  } else {
    profiles.push(normalizedProfile);
  }
  currentState = {
    ...base,
    profiles,
    lastProfileId: normalizedProfile.id,
    lastProfileIdByModule: {
      ...(base.lastProfileIdByModule || {}),
      [normalizedProfile.moduleId]: normalizedProfile.id,
    },
  };
  saveState(currentState);
  notify(prevState);
  return currentState;
}

export function deleteProfile(state, profileId) {
  const prevState = currentState ?? state ?? getState();
  const base = latestPersistedState(prevState);
  if (typeof profileId !== "string" || !profileId) return base;
  const profiles = normalizeProfiles(base.profiles).filter((item) => item.id !== profileId);
  const lastProfileId = base.lastProfileId === profileId ? profiles[0]?.id || null : base.lastProfileId;
  const lastProfileIdByModule = reconcileProfileSelections(base.lastProfileIdByModule, profiles);
  currentState = { ...base, profiles, lastProfileId, lastProfileIdByModule };
  saveState(currentState);
  notify(prevState);
  return currentState;
}

export function replaceProfiles(profiles) {
  const prevState = currentState ?? getState();
  const base = latestPersistedState(prevState);
  const merged = new Map(normalizeProfiles(base.profiles).map((profile) => [profile.id, profile]));
  normalizeProfiles(profiles).forEach((profile) => merged.set(profile.id, profile));
  const clean = [...merged.values()];
  const lastProfileId = clean.some((profile) => profile.id === base.lastProfileId)
    ? base.lastProfileId
    : clean[0]?.id || null;
  const lastProfileIdByModule = reconcileProfileSelections(base.lastProfileIdByModule, clean);
  currentState = { ...base, profiles: clean, lastProfileId, lastProfileIdByModule };
  saveState(currentState);
  notify(prevState);
  return currentState;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("storage", (event) => {
    if (event?.key !== STORAGE_KEY || event.newValue === lastKnownStorageValue) return;
    try {
      const nextState = event.newValue == null
        ? defaultState()
        : normalizeParsedState(JSON.parse(event.newValue));
      const prevState = currentState;
      lastKnownStorageValue = event.newValue;
      currentState = nextState;
      if (prevState) notify(prevState);
    } catch {
      // Ignore malformed writes from another tab; retain the last valid session state.
    }
  });
}
