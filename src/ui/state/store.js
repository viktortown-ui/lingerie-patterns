const STORAGE_KEY = "lingerie-pattern-state";

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
    };
  } catch (error) {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function upsertProfile(state, profile) {
  const existingIndex = state.profiles.findIndex((item) => item.id === profile.id);
  if (existingIndex >= 0) {
    state.profiles[existingIndex] = profile;
  } else {
    state.profiles.push(profile);
  }
  state.lastProfileId = profile.id;
  saveState(state);
}

export function deleteProfile(state, profileId) {
  state.profiles = state.profiles.filter((item) => item.id !== profileId);
  if (state.lastProfileId === profileId) {
    state.lastProfileId = state.profiles[0]?.id || null;
  }
  saveState(state);
}
