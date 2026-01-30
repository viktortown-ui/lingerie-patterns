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
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      language: parsed.language || defaultState().language,
      paperSize: parsed.paperSize || defaultState().paperSize,
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
