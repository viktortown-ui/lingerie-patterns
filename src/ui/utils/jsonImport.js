export const MAX_JSON_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_PROFILE_COUNT = 250;

export class JsonImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "JsonImportError";
    this.code = code;
    Object.assign(this, details);
  }
}

function normalizedPositiveLimit(value, fallback, label) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return limit;
}

/** Reads a browser File only after its declared byte size passes a hard limit. */
export async function readBoundedJsonFile(file, options = {}) {
  const maxBytes = normalizedPositiveLimit(options.maxBytes, MAX_JSON_IMPORT_BYTES, "maxBytes");
  if (!file || typeof file.text !== "function" || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new JsonImportError("invalid-file", "A valid local file is required.");
  }
  if (file.size > maxBytes) {
    throw new JsonImportError("file-too-large", "The selected JSON file is too large.", { maxBytes });
  }

  let text;
  try {
    text = await file.text();
  } catch (cause) {
    throw new JsonImportError("read-failed", "The selected file could not be read.", { cause });
  }
  if (typeof text !== "string") {
    throw new JsonImportError("read-failed", "The selected file did not return text content.");
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new JsonImportError("file-too-large", "The selected JSON content is too large.", { maxBytes });
  }

  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new JsonImportError("invalid-json", "The selected file is not valid JSON.", { cause });
  }
}

export function assertProfileCount(profiles, maxProfiles = MAX_PROFILE_COUNT) {
  const limit = normalizedPositiveLimit(maxProfiles, MAX_PROFILE_COUNT, "maxProfiles");
  if (!Array.isArray(profiles)) {
    throw new JsonImportError("invalid-profile-list", "The profile backup must contain an array.");
  }
  if (profiles.length > limit) {
    throw new JsonImportError("too-many-profiles", "The profile collection exceeds the supported limit.", {
      maxProfiles: limit,
    });
  }
  return profiles;
}

export function jsonImportErrorMessage(error, language = "ru", context = "project") {
  const russian = language === "ru";
  if (error?.code === "file-too-large") {
    const megabytes = Math.max(1, Math.floor((error.maxBytes || MAX_JSON_IMPORT_BYTES) / (1024 * 1024)));
    return russian
      ? `Файл слишком большой. Максимальный размер — ${megabytes} МБ.`
      : `The file is too large. Maximum size is ${megabytes} MB.`;
  }
  if (error?.code === "too-many-profiles") {
    const limit = error.maxProfiles || MAX_PROFILE_COUNT;
    return russian
      ? `Слишком много профилей. Допустимо не более ${limit}.`
      : `There are too many profiles. The maximum is ${limit}.`;
  }
  if (error?.code === "invalid-json") {
    return russian ? "Файл содержит некорректный JSON." : "The file contains invalid JSON.";
  }
  if (error?.code === "invalid-profile-list") {
    return russian
      ? "Файл профилей имеет неверную структуру."
      : "The profile file has an invalid structure.";
  }
  if (error?.code === "invalid-file" || error?.code === "read-failed") {
    return russian ? "Не удалось прочитать выбранный файл." : "Could not read the selected file.";
  }
  if (context === "profiles") {
    return russian ? "Не удалось импортировать файл профилей." : "Could not import the profile file.";
  }
  return russian ? "Не удалось открыть проект." : "Could not open the project.";
}
