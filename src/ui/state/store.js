const STORAGE_KEY = "lingerie-pattern-state";
const subscribers = new Set();
let currentState = null;

function detectLanguage() {
  const lang = navigator?.language?.toLowerCase() || "";
  return lang.startsWith("ru") ? "ru" : "en";
}

function defaultState() {
  return {
    profiles: [],
    lastProfileId: null,
    selectedModuleId: null,
    theme: null,
    language: detectLanguage(),
    paperSize: "A4",
    draft: null,
  };
}

function normalizeDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  const defaultPreview = { scaleLabels: true, seamHighlight: false };
  const preview = raw.preview && typeof raw.preview === "object" ? raw.preview : null;
  return {
    moduleId: typeof raw.moduleId === "string" ? raw.moduleId : null,
    measurements: raw.measurements && typeof raw.measurements === "object" ? raw.measurements : null,
    options: raw.options && typeof raw.options === "object" ? raw.options : null,
    paperSize: typeof raw.paperSize === "string" ? raw.paperSize : null,
    preview: preview
      ? {
          scaleLabels:
            typeof preview.scaleLabels === "boolean" ? preview.scaleLabels : defaultPreview.scaleLabels,
          seamHighlight:
            typeof preview.seamHighlight === "boolean" ? preview.seamHighlight : defaultPreview.seamHighlight,
        }
      : defaultPreview,
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(raw);
    const normalizedDraft = normalizeDraft(parsed.draft);
    return {
      ...defaultState(),
      ...parsed,
      language: parsed.language || defaultState().language,
      paperSize: parsed.paperSize || defaultState().paperSize,
      draft: normalizedDraft,
    };
  } catch (error) {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  currentState = { ...prevState, ...patch };
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
  const prevDraft = prevState.draft && typeof prevState.draft === "object" ? prevState.draft : {};
  const nextDraft = { ...prevDraft, ...patch };
  currentState = { ...prevState, draft: nextDraft };
  saveState(currentState);
  notify(prevState);
  return currentState;
}

export function upsertProfile(state, profile) {
  const prevState = currentState ?? state;
  const existingIndex = state.profiles.findIndex((item) => item.id === profile.id);
  if (existingIndex >= 0) {
    state.profiles[existingIndex] = profile;
  } else {
    state.profiles.push(profile);
  }
  state.lastProfileId = profile.id;
  currentState = state;
  saveState(state);
  notify(prevState);
}

export function deleteProfile(state, profileId) {
  const prevState = currentState ?? state;
  state.profiles = state.profiles.filter((item) => item.id !== profileId);
  if (state.lastProfileId === profileId) {
    state.lastProfileId = state.profiles[0]?.id || null;
  }
  currentState = state;
  saveState(state);
  notify(prevState);
}
