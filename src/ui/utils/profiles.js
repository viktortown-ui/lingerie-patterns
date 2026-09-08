export function completeProfileValues(schema, profile = {}) {
  return {
    ...(schema.defaults || {}),
    ...(schema.optionDefaults || {}),
    ...(schema.adjustmentDefaults || {}),
    ...(profile.measurements && typeof profile.measurements === "object" ? profile.measurements : {}),
    ...(profile.options && typeof profile.options === "object" ? profile.options : {}),
    ...(profile.adjustments && typeof profile.adjustments === "object" ? profile.adjustments : {}),
  };
}

export function canonicalizeOptions(schema, source = {}) {
  return Object.fromEntries((schema.options || []).map((option) => {
    const value = source[option.key];
    const exact = (option.choices || []).find((choice) => Object.is(choice.value, value));
    const compatible = exact || (option.choices || []).find((choice) => String(choice.value) === String(value));
    return [option.key, compatible ? compatible.value : value];
  }));
}

export function formatProfileDate(value, language = "ru") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
}

/** Subscribes a renderer only to profile collection changes and returns its cleanup. */
export function subscribeProfileChanges(subscribe, renderProfiles) {
  if (typeof subscribe !== "function" || typeof renderProfiles !== "function") {
    throw new TypeError("Profile synchronization requires subscribe and render callbacks.");
  }
  return subscribe((nextState, previousState) => {
    if (nextState?.profiles !== previousState?.profiles) {
      renderProfiles(nextState?.profiles || []);
    }
  });
}

export function prepareImportedProfiles(incoming, existingProfiles = [], createId, fallbackModuleId = null) {
  if (!Array.isArray(incoming)) throw new Error("Invalid profile backup");

  const isPlainRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
  const optionalRecord = (value) => value == null || isPlainRecord(value);

  const isValid = (profile) => (
    isPlainRecord(profile)
    && typeof profile.name === "string"
    && profile.name.trim()
    && (profile.id == null || typeof profile.id === "string")
    && (profile.moduleId == null || typeof profile.moduleId === "string")
    && optionalRecord(profile.measurements)
    && optionalRecord(profile.options)
    && optionalRecord(profile.adjustments)
  );
  if (!incoming.every(isValid)) throw new Error("Invalid profile backup");

  const valid = incoming;
  const explicitIds = new Set();
  valid.forEach((profile) => {
    const explicitId = typeof profile.id === "string" ? profile.id.trim() : "";
    if (!explicitId) return;
    if (explicitIds.has(explicitId)) throw new Error("Duplicate profile id");
    explicitIds.add(explicitId);
  });

  const usedIds = new Set(
    existingProfiles
      .map((profile) => (typeof profile?.id === "string" ? profile.id.trim() : ""))
      .filter(Boolean),
  );

  return valid.map((profile) => {
    let id = typeof profile.id === "string" ? profile.id.trim() : "";
    if (!id) {
      do {
        id = createId();
      } while (!id || usedIds.has(id));
    }
    usedIds.add(id);
    const moduleId = typeof profile.moduleId === "string" && profile.moduleId.trim()
      ? profile.moduleId.trim()
      : fallbackModuleId;
    return { ...profile, id, name: profile.name.trim(), ...(moduleId ? { moduleId } : {}) };
  });
}
