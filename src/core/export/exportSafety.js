export const EXPERIMENTAL_EXPORT_CODE = "EXPERIMENTAL_TOILE_ONLY";
export const EXPERIMENTAL_EXPORT_WARNING =
  "EXPERIMENTAL PATTERN - TOILE ONLY - FIT NOT VERIFIED - NOT FOR PRODUCTION";
export const EXPERIMENTAL_EXPORT_SHORT_WARNING =
  "EXPERIMENTAL - TOILE ONLY - FIT NOT VERIFIED";

const EXPERIMENTAL_FILENAME_SUFFIX = "_EXPERIMENTAL_TOILE_ONLY";

const READY_EXPORT_SAFETY = Object.freeze({
  experimental: false,
  requiresConfirmation: false,
  status: null,
  code: null,
  usage: null,
  productionVerified: null,
  warning: "",
  shortWarning: "",
  filenameSuffix: "",
});

const EXPERIMENTAL_EXPORT_SAFETY = Object.freeze({
  experimental: true,
  requiresConfirmation: true,
  status: "experimental",
  code: EXPERIMENTAL_EXPORT_CODE,
  usage: "toile-only",
  productionVerified: false,
  warning: EXPERIMENTAL_EXPORT_WARNING,
  shortWarning: EXPERIMENTAL_EXPORT_SHORT_WARNING,
  filenameSuffix: EXPERIMENTAL_FILENAME_SUFFIX,
});

function statusValues({ module, moduleStatus, draft } = {}) {
  return [
    moduleStatus,
    module?.status,
    draft?.status,
    draft?.meta?.moduleStatus,
    draft?.meta?.fitStatus,
  ].filter((value) => typeof value === "string");
}

/**
 * Resolves the strictest known export status. A disagreement between the module
 * descriptor and its generated draft can never hide an experimental status.
 */
export function resolveExportSafety(context = {}) {
  return statusValues(context).includes("experimental")
    ? EXPERIMENTAL_EXPORT_SAFETY
    : READY_EXPORT_SAFETY;
}

/** Returns the strictest already-resolved policy for a compound export. */
export function strictestExportSafety(policies = []) {
  return Array.isArray(policies) && policies.some((policy) => policy?.experimental)
    ? EXPERIMENTAL_EXPORT_SAFETY
    : READY_EXPORT_SAFETY;
}

/** Adds a stable, ASCII-only warning suffix without duplicating it. */
export function qualifyExportFilename(fileName, safety = READY_EXPORT_SAFETY) {
  const value = String(fileName || "pattern");
  if (!safety?.experimental) return value;

  const dotIndex = value.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const base = hasExtension ? value.slice(0, dotIndex) : value;
  const extension = hasExtension ? value.slice(dotIndex) : "";
  if (base.endsWith(EXPERIMENTAL_FILENAME_SUFFIX)) return value;
  return `${base}${EXPERIMENTAL_FILENAME_SUFFIX}${extension}`;
}
