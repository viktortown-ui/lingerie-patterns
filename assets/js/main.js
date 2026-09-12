import { getModule, getModules, registerModule } from "../../src/core/pattern/registry.js";
import { moduleAcceptsDraftVersion } from "../../src/core/pattern/PatternModule.js";
import { APP_VERSION } from "../../src/core/app/version.js";
import {
  BUILT_IN_UNDERWEAR_TEMPLATES,
  exportTemplateJson,
  importTemplateJson,
  MAX_TEMPLATE_JSON_BYTES,
  resolveTemplateSettings,
  TEMPLATE_FORMAT_VERSION,
  TEMPLATE_KIND,
  TemplateStorage,
  TemplateValidationError,
} from "../../src/core/templates/index.js";
import { readStaticSvgFile, StaticSvgImportError } from "../../src/core/import/index.js";
import {
  createStaticPatternRepository,
  StaticPatternStorageError,
} from "../../src/core/import/staticPatternStore.js";
import { uid } from "../../src/core/utils/id.js";
import { StaticImportDialog } from "../../src/ui/components/StaticImportDialog.js";
import { HelpCenter } from "../../src/ui/components/HelpCenter.js";
import { Toast } from "../../src/ui/components/Toast.js";
import { getLocale, setLocale } from "../../src/ui/i18n/i18n.js";
import { Editor } from "../../src/ui/screens/Editor.js";
import { Home } from "../../src/ui/screens/Home.js";
import { StaticPattern } from "../../src/ui/screens/StaticPattern.js";
import { getState, setState, subscribe } from "../../src/ui/state/store.js";
import { initTheme } from "../../src/ui/styles/theme.js";
import { downloadBlob } from "../../src/ui/utils/download.js";
import { modules } from "../../src/patterns/index.js";

const app = document.getElementById("app");
const globalToast = Toast();
let currentView = null;

const copy = (language, ru, en) => (language === "ru" ? ru : en);

const mountView = (view) => {
  currentView?.destroy?.();
  app.replaceChildren(view, globalToast.el);
  currentView = view;
};

const showNotice = (message, duration = 4200) => globalToast.show(message, duration);

const showFatal = (title, details) => {
  if (!app) return;
  currentView?.destroy?.();
  currentView = null;
  const safeDetails = String(details || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  app.innerHTML = `
    <div class="main">
      <div class="card">
        <h2>${title}</h2>
        <p>Приложение не смогло завершить загрузку.</p>
        <p class="muted">Нажмите Ctrl+F5. Если ошибка повторится, приложите текст ниже к сообщению разработчику.</p>
        <pre style="white-space:pre-wrap; opacity:.8">${safeDetails}</pre>
      </div>
    </div>
  `;
};

window.addEventListener("error", (event) => {
  const message = String(event?.message || event?.error?.message || "");
  const stack = String(event?.error?.stack || "");
  if (/ResizeObserver loop/i.test(message) || /ResizeObserver loop/i.test(stack)) {
    event?.preventDefault?.();
    return;
  }
  showFatal("White screen error", stack || message || String(event));
});
window.addEventListener("unhandledrejection", (event) => {
  const message = String(event?.reason?.message || event?.reason || "");
  const stack = String(event?.reason?.stack || "");
  if (/ResizeObserver loop/i.test(message) || /ResizeObserver loop/i.test(stack)) return;
  showFatal("Unhandled promise rejection", stack || message || String(event));
});

modules.forEach((module) => registerModule(module));

const DEBUG_I18N = false;
const logI18n = (...args) => {
  if (DEBUG_I18N) console.debug("[i18n]", ...args);
};

let state = getState();
if (state.selectedModuleId && !getModule(state.selectedModuleId)) {
  state = setState({ selectedModuleId: null });
}
initTheme(state.theme);
setLocale(state.language);
logI18n("boot locale", getLocale());

const helpCenter = HelpCenter({ language: state.language });
document.body.appendChild(helpCenter.el);
const openHelp = (topicId = "quick-start") => helpCenter.open(topicId, state.language);

let localStorageRef = null;
let sessionStorageRef = null;
try {
  localStorageRef = globalThis.localStorage || null;
} catch {
  localStorageRef = null;
}
try {
  sessionStorageRef = globalThis.sessionStorage || null;
} catch {
  sessionStorageRef = null;
}
const STATIC_ROUTE_STORAGE_KEY = "lekalo-static-route-v1";
const readStaticRoute = () => {
  try {
    const id = sessionStorageRef?.getItem(STATIC_ROUTE_STORAGE_KEY) || "";
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id) ? id : null;
  } catch {
    return null;
  }
};
const writeStaticRoute = (id = null) => {
  try {
    if (!sessionStorageRef) return;
    if (id) sessionStorageRef.setItem(STATIC_ROUTE_STORAGE_KEY, id);
    else sessionStorageRef.removeItem(STATIC_ROUTE_STORAGE_KEY);
  } catch {
    // Route restoration is optional; the current screen remains usable.
  }
};
const restoredStaticPatternId = readStaticRoute();
const templateStorage = new TemplateStorage({ storage: localStorageRef, resolveModule: getModule });
let userTemplates = templateStorage.load();
let templateStorageWarning = templateStorage.lastError
  || templateStorage.lastWarning
  || (!localStorageRef ? { code: "storage-unavailable" } : null);
const staticPatternRepository = createStaticPatternRepository();
const STATIC_LIBRARY_SYNC_KEY = "lekalo-static-library-sync-v1";
const STATIC_LIBRARY_CHANNEL_NAME = "lekalo-static-library-v1";
let staticPatterns = [];
let staticLoading = true;
let staticImportDialog = null;
let staticImportDialogLanguage = null;
let currentStaticPattern = null;
let staticOpenRequest = 0;
let staticImportRequest = 0;
let staticRepositoryNoticeKey = null;
let staticLibrarySyncTimer = null;
let staticLibraryChannel = null;
let staticLibrarySyncRunning = false;
let staticLibrarySyncQueued = false;

const currentRoute = {
  screen: restoredStaticPatternId ? "home" : (state.selectedModuleId ? "editor" : "home"),
  moduleId: restoredStaticPatternId ? null : state.selectedModuleId,
  staticPatternId: null,
};

function safeFilename(value, fallback = "template") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
}

function templateErrorMessage(error, language = state.language) {
  const code = error?.code || templateStorage.lastError?.code;
  const messages = {
    "json-too-large": ["Файл шаблона слишком большой.", "The template file is too large."],
    "invalid-json": ["Файл шаблона повреждён или не является JSON.", "The template file is damaged or is not JSON."],
    "invalid-kind": ["Это не файл шаблона ЛЕКАЛО.", "This is not a LEKALO template file."],
    "built-in-id-conflict": ["Нельзя заменить встроенный шаблон импортированным файлом.", "An imported file cannot replace a built-in template."],
    "unknown-module": ["Для этого шаблона нет установленной основы.", "The required pattern base is not installed."],
    "module-version-mismatch": ["Шаблон создан для другой версии основы. Автоматическая миграция пока недоступна.", "The template targets a different base version. Automatic migration is not available yet."],
    "measurements-forbidden": ["Шаблон отклонён: файл фасона не должен содержать личные мерки.", "Template rejected: style files must not contain body measurements."],
    "storage-unavailable": ["Локальное хранилище недоступно. Шаблон не был сохранён.", "Local storage is unavailable. The template was not saved."],
    "storage-read-failed": ["Не удалось прочитать личную библиотеку. Она не была перезаписана.", "The personal library could not be read and was not overwritten."],
    "storage-write-failed": ["Не удалось записать личную библиотеку на это устройство.", "The personal library could not be written to this device."],
    "stored-library-invalid": ["Личная библиотека повреждена. Она не была перезаписана.", "The personal library is damaged and was not overwritten."],
    "stored-library-too-large": ["Личная библиотека превышает безопасный размер.", "The personal library exceeds the safe size limit."],
    "template-exists": ["Шаблон с таким идентификатором уже появился в библиотеке. Повторите импорт и подтвердите замену.", "A template with this id has appeared in the library. Import again and confirm replacement."],
    "quarantine-library-invalid": ["Карантин старых шаблонов повреждён. Рабочие шаблоны доступны, но изменения библиотеки заблокированы до восстановления локальных данных.", "The old-template quarantine is damaged. Active templates remain available, but library changes are blocked until local data is recovered."],
    "incompatible-templates-preserved": ["Часть шаблонов создана для отсутствующей или старой версии основы. Они сохранены, но скрыты до установки совместимой версии.", "Some templates target a missing or older base version. They remain preserved but hidden until a compatible version is installed."],
  };
  if (messages[code]) return copy(language, ...messages[code]);
  if (error instanceof TemplateValidationError) {
    return copy(language, `Шаблон не прошёл проверку (${error.code}).`, `Template validation failed (${error.code}).`);
  }
  return error?.message || copy(language, "Не удалось обработать шаблон.", "Could not process the template.");
}

function staticSvgErrorMessage(error, language = state.language) {
  if (!(error instanceof StaticSvgImportError)) {
    return error?.message || copy(language, "Не удалось обработать SVG.", "Could not process the SVG file.");
  }
  const messages = {
    "file-too-large": ["SVG слишком большой: предел — 2 МБ.", "The SVG is too large. The limit is 2 MB."],
    "missing-viewbox": ["В SVG нет корректного viewBox. Добавьте область чертежа и повторите импорт.", "The SVG has no valid viewBox. Add a drawing viewport and try again."],
    "empty-geometry": ["В SVG нет поддерживаемых линий или контуров.", "The SVG contains no supported lines or outlines."],
    "non-uniform-calibration": ["Масштаб SVG по ширине и высоте различается. Такой файл небезопасен для раскроя.", "The SVG has different horizontal and vertical scales and is unsafe for cutting."],
    "conflicting-calibration": ["В SVG указаны противоречивые данные масштаба.", "The SVG contains conflicting scale declarations."],
    "calibration-out-of-range": ["Масштаб SVG выходит за безопасные пределы.", "The SVG scale is outside the safe range."],
    "physical-size-out-of-range": ["Физический размер SVG выходит за безопасные пределы.", "The SVG physical size is outside the safe range."],
    "invalid-encoding": ["SVG должен быть сохранён в корректной кодировке UTF-8.", "The SVG must use valid UTF-8 encoding."],
    "too-many-entities": ["В SVG слишком много отдельных контуров.", "The SVG contains too many separate entities."],
    "too-many-path-commands": ["SVG слишком сложный: превышен предел команд линий.", "The SVG is too complex and exceeds the path-command limit."],
    "too-many-elements": ["SVG слишком сложный: превышен предел элементов.", "The SVG is too complex and exceeds the element limit."],
    "svg-too-deep": ["SVG имеет слишком глубокую структуру групп.", "The SVG group structure is too deeply nested."],
  };
  if (messages[error.code]) return copy(language, ...messages[error.code]);
  if (/forbidden|unsafe|reference|event|style|doctype|entity|cdata/u.test(error.code)) {
    return copy(language, "SVG заблокирован: найден активный или небезопасный элемент.", "SVG blocked because active or unsafe content was found.");
  }
  if (/unsupported/u.test(error.code)) {
    return copy(language, `SVG использует пока неподдерживаемую конструкцию (${error.code}).`, `The SVG uses an unsupported construct (${error.code}).`);
  }
  return copy(language, `SVG не прошёл безопасную проверку (${error.code}).`, `SVG safety validation failed (${error.code}).`);
}

function staticStorageErrorMessage(error, language = state.language) {
  const messages = {
    "library-full": ["Личная SVG-библиотека заполнена: удалите ненужный файл перед добавлением нового.", "The personal SVG library is full. Remove an unused file before adding another."],
    "library-too-large": ["Личная SVG-библиотека достигла безопасного лимита 16 МБ.", "The personal SVG library reached its safe 16 MB limit."],
    "record-too-large": ["Это SVG-лекало слишком большое для локальной библиотеки.", "This SVG pattern is too large for the local library."],
    "delete-unconfirmed": ["Не удалось подтвердить удаление из постоянного хранилища. Файл не отмечен как удалённый.", "Deletion from persistent storage could not be confirmed. The file was not marked as removed."],
    "invalid-records-skipped": ["Повреждённые записи SVG пропущены; остальные файлы библиотеки доступны.", "Damaged SVG records were skipped; the rest of the library remains available."],
  };
  if (messages[error?.code]) return copy(language, ...messages[error.code]);
  if (error instanceof StaticPatternStorageError) {
    return copy(language, `SVG-лекало не прошло проверку хранилища (${error.code}).`, `SVG pattern storage validation failed (${error.code}).`);
  }
  return copy(
    language,
    "Не удалось обработать постоянную SVG-библиотеку. Новые файлы можно открыть только временно.",
    error?.message || "Could not process the persistent SVG library. New files can only be opened temporarily.",
  );
}

function templateStorageError(failure = { code: "storage-unavailable" }) {
  const error = new Error("Template storage failed.", { cause: failure.error });
  error.code = failure.code || "storage-unavailable";
  return error;
}

function refreshUserTemplates() {
  const loaded = templateStorage.load();
  if (templateStorage.lastError) {
    throw templateStorageError(templateStorage.lastError);
  }
  userTemplates = loaded;
  templateStorageWarning = templateStorage.lastWarning || null;
}

function persistTemplate(template, options) {
  if (!templateStorage.upsert(template, options)) {
    const failure = templateStorage.lastError || { code: "storage-unavailable" };
    throw templateStorageError(failure);
  }
  refreshUserTemplates();
}

function nextTemplateId() {
  const occupied = new Set([
    ...BUILT_IN_UNDERWEAR_TEMPLATES.map((template) => template.id),
    ...userTemplates.map((template) => template.id),
  ]);
  let id;
  do id = uid("user-template"); while (occupied.has(id));
  return id;
}

function nextStaticPatternId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `static-${String(random).toLowerCase()}`;
}

function makeUserTemplate({ moduleId, moduleVersion, metadata, options, adjustments }) {
  const displayName = String(metadata?.name || "").trim();
  const description = String(metadata?.description || "").trim();
  const author = String(metadata?.author || "").trim() || copy(state.language, "Локальный пользователь", "Local user");
  const privateTemplate = metadata?.license === "private";
  const template = {
    kind: TEMPLATE_KIND,
    formatVersion: TEMPLATE_FORMAT_VERSION,
    id: nextTemplateId(),
    version: "1.0.0",
    moduleId,
    moduleVersion,
    name: { ru: displayName, en: displayName },
    status: "draft",
    license: privateTemplate
      ? { spdx: "LicenseRef-Private", name: "Private local use" }
      : { spdx: metadata.license },
    provenance: {
      kind: "original",
      author,
      source: "Created locally in LEKALO Pattern Studio.",
      sourceVersion: APP_VERSION,
      ...(metadata?.sourceUrl ? { sourceUrl: metadata.sourceUrl } : {}),
    },
    options: { ...options },
    adjustments: { ...adjustments },
  };
  if (description) template.description = { ru: description, en: description };
  return template;
}

function handleLanguageToggle(language) {
  logI18n("language toggle requested", language);
  staticImportDialog?.destroy?.();
  staticImportDialog = null;
  setLocale(language);
  setState({ language });
}

function applyTemplate(template) {
  try {
    const module = getModule(template.moduleId);
    const settings = resolveTemplateSettings(template, module);
    const candidate = state.draftsByModule?.[template.moduleId]
      || (state.draft?.moduleId === template.moduleId ? state.draft : null);
    const stored = candidate && moduleAcceptsDraftVersion(module, candidate.moduleVersion)
      ? candidate
      : null;
    const nextDraft = {
      moduleId: template.moduleId,
      moduleVersion: module.version,
      measurements: stored
        ? Object.fromEntries(module.schema.fields
            .filter((field) => Object.hasOwn(stored.measurements || {}, field.key))
            .map((field) => [field.key, stored.measurements[field.key]]))
        : null,
      options: settings.options,
      adjustments: settings.adjustments,
      paperSize: stored?.paperSize || state.paperSize || "A4",
      preview: stored?.preview || { scaleLabels: true, seamHighlight: false, editPoints: false },
    };
    state = setState({ selectedModuleId: template.moduleId, draft: nextDraft });
    renderEditor(template.moduleId);
    showNotice(copy(state.language, "Фасон применён. Ваши мерки сохранены отдельно.", "Style applied. Your measurements remain separate."));
  } catch (error) {
    showNotice(templateErrorMessage(error), 6000);
  }
}

async function exportUserTemplate(template) {
  try {
    const text = exportTemplateJson(template, getModule(template.moduleId));
    await downloadBlob({
      blob: new Blob([text], { type: "application/json" }),
      filename: `${safeFilename(template.id, "lekalo-template")}.lekalo-template.json`,
      mimeType: "application/json",
    });
    showNotice(copy(state.language, "Файл шаблона скачан без личных мерок.", "Template downloaded without body measurements."));
  } catch (error) {
    showNotice(templateErrorMessage(error), 6000);
  }
}

async function importUserTemplate(file) {
  try {
    if (!file || !Number.isSafeInteger(file.size) || file.size > MAX_TEMPLATE_JSON_BYTES) {
      throw new TemplateValidationError("json-too-large", "templateJson", "Template file is too large.");
    }
    const template = importTemplateJson(await file.text(), getModule);
    if (BUILT_IN_UNDERWEAR_TEMPLATES.some((item) => item.id === template.id)) {
      throw new TemplateValidationError("built-in-id-conflict", "template.id", "A built-in template uses this id.");
    }
    refreshUserTemplates();
    const existing = userTemplates.some((item) => item.id === template.id);
    if (existing && !window.confirm(copy(state.language, "Заменить личный шаблон с таким же идентификатором?", "Replace the personal template with the same id?"))) return;
    persistTemplate(template, { replaceExisting: existing });
    if (currentRoute.screen === "home") renderHome({ resetScroll: false });
    showNotice(copy(state.language, "Шаблон проверен и добавлен в личную библиотеку.", "Template validated and added to your personal library."));
  } catch (error) {
    showNotice(templateErrorMessage(error), 6500);
  }
}

function removeUserTemplate(id) {
  try {
    if (!templateStorage.remove(id)) {
      const failure = templateStorage.lastError || { code: "storage-unavailable" };
      throw templateStorageError(failure);
    }
    refreshUserTemplates();
    if (currentRoute.screen === "home") renderHome({ resetScroll: false });
    showNotice(copy(state.language, "Личный шаблон удалён.", "Personal template removed."));
  } catch (error) {
    showNotice(templateErrorMessage(error), 6000);
  }
}

async function refreshStaticPatterns({ rerender = false } = {}) {
  const listedPatterns = await staticPatternRepository.list();
  const readError = staticPatternRepository.lastError;
  if (readError) {
    const merged = new Map(staticPatterns.map((pattern) => [pattern.id, pattern]));
    listedPatterns.forEach((pattern) => merged.set(pattern.id, pattern));
    staticPatterns = Array.from(merged.values()).sort((left, right) => (
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
    ));
  } else {
    staticPatterns = listedPatterns;
  }
  staticLoading = false;
  if (rerender && currentRoute.screen === "home") renderHome({ resetScroll: false });
  const repositoryIssue = staticPatternRepository.lastError || staticPatternRepository.lastWarning;
  if (repositoryIssue) {
    const issueKey = `${repositoryIssue.code || "storage-unavailable"}:${repositoryIssue.count || 0}`;
    if (issueKey !== staticRepositoryNoticeKey) {
      staticRepositoryNoticeKey = issueKey;
      window.setTimeout(() => showNotice(staticStorageErrorMessage(repositoryIssue), 6500), 0);
    }
  } else {
    staticRepositoryNoticeKey = null;
  }
  return { patterns: staticPatterns, authoritative: !readError, error: readError };
}

function announceStaticLibraryChange() {
  try {
    staticLibraryChannel?.postMessage({ type: "changed" });
  } catch {
    // The localStorage pulse below is the compatibility fallback.
  }
  try {
    localStorageRef?.setItem(STATIC_LIBRARY_SYNC_KEY, `${Date.now()}:${uid("sync")}`);
  } catch {
    // Cross-tab refresh is best-effort when all browser messaging is blocked.
  }
}

async function synchronizeStaticLibrary() {
  try {
    const refresh = await refreshStaticPatterns();
    if (!refresh.authoritative) return;
    if (currentRoute.screen === "home") {
      const pendingId = readStaticRoute();
      renderHome({ resetScroll: false, preserveStaticRoute: Boolean(pendingId) });
      if (pendingId && staticPatterns.some((pattern) => pattern.id === pendingId)) {
        openStaticPattern(pendingId);
      } else if (pendingId) {
        writeStaticRoute();
      }
      return;
    }
    if (currentRoute.screen !== "static" || !currentRoute.staticPatternId) return;
    const currentId = currentRoute.staticPatternId;
    if (!staticPatterns.some((pattern) => pattern.id === currentId)) {
      renderHome({ resetScroll: false });
      showNotice(copy(
        state.language,
        "Это SVG-лекало удалено в другой вкладке.",
        "This SVG pattern was removed in another tab.",
      ));
      return;
    }
    const refreshed = await staticPatternRepository.get(currentId);
    if (staticPatternRepository.lastError) return;
    if (currentRoute.screen === "static" && currentRoute.staticPatternId === currentId) {
      if (refreshed) {
        renderStaticPattern(refreshed);
      } else {
        renderHome({ resetScroll: false });
        showNotice(copy(
          state.language,
          "Это SVG-лекало удалено в другой вкладке.",
          "This SVG pattern was removed in another tab.",
        ));
      }
    }
  } catch (error) {
    showNotice(staticStorageErrorMessage(error), 6500);
  }
}

function scheduleStaticLibrarySync() {
  if (staticLibrarySyncTimer !== null) return;
  staticLibrarySyncTimer = window.setTimeout(() => {
    staticLibrarySyncTimer = null;
    if (staticLibrarySyncRunning) {
      staticLibrarySyncQueued = true;
      return;
    }
    staticLibrarySyncRunning = true;
    (async () => {
      do {
        staticLibrarySyncQueued = false;
        await synchronizeStaticLibrary();
      } while (staticLibrarySyncQueued);
    })().finally(() => {
      staticLibrarySyncRunning = false;
    });
  }, 30);
}

function openStaticLibraryChannel() {
  if (staticLibraryChannel || typeof globalThis.BroadcastChannel !== "function") return;
  try {
    staticLibraryChannel = new globalThis.BroadcastChannel(STATIC_LIBRARY_CHANNEL_NAME);
    staticLibraryChannel.addEventListener("message", scheduleStaticLibrarySync);
  } catch {
    staticLibraryChannel = null;
  }
}

function closeStaticLibraryChannel() {
  try { staticLibraryChannel?.close(); } catch { /* The channel may already be closed. */ }
  staticLibraryChannel = null;
}

openStaticLibraryChannel();
window.addEventListener("pagehide", closeStaticLibraryChannel);
window.addEventListener("pageshow", (event) => {
  openStaticLibraryChannel();
  if (event.persisted) scheduleStaticLibrarySync();
});

function ensureStaticImportDialog() {
  if (staticImportDialog && staticImportDialogLanguage !== state.language) {
    staticImportDialog.destroy();
    staticImportDialog = null;
  }
  if (!staticImportDialog) {
    staticImportDialog = StaticImportDialog({
      language: state.language,
      onSave: async ({ file, geometry, metadata }) => {
        const createdAt = new Date().toISOString();
        let result;
        try {
          result = await staticPatternRepository.save({
            id: nextStaticPatternId(),
            name: metadata.name,
            description: metadata.description,
            createdAt,
            updatedAt: createdAt,
            source: {
              fileName: file?.name || "pattern.svg",
              byteLength: geometry.source?.byteLength ?? file?.size ?? null,
              sha256: geometry.source?.sha256 || "",
            },
            provenance: {
              author: metadata.author,
              sourceUrl: metadata.sourceUrl || "",
              license: metadata.license,
            },
            calibration: geometry.calibration,
            warnings: geometry.calibration?.requiresCalibration
              ? ["Scale is not confirmed. Verify a known length before cutting."]
              : [],
            geometry,
          });
        } catch (error) {
          throw new Error(staticStorageErrorMessage(error));
        }
        await refreshStaticPatterns({ rerender: true });
        if (result.persistent) announceStaticLibraryChange();
        showNotice(result.persistent
          ? copy(state.language, "SVG безопасно добавлен в личную библиотеку.", "SVG safely added to your personal library.")
          : copy(state.language, "SVG открыт временно: постоянное хранилище недоступно.", "SVG is available temporarily because persistent storage is unavailable."), 5600);
      },
    });
    staticImportDialogLanguage = state.language;
  }
  return staticImportDialog;
}

async function importStaticPattern(file) {
  const requestId = ++staticImportRequest;
  const startedOnHome = currentRoute.screen === "home";
  try {
    const geometry = await readStaticSvgFile(file);
    if (requestId !== staticImportRequest || !startedOnHome || currentRoute.screen !== "home") return;
    if (!ensureStaticImportDialog().open({ file, geometry })) {
      showNotice(copy(
        state.language,
        "Сначала завершите уже открытый импорт SVG.",
        "Finish the currently open SVG import first.",
      ));
    }
  } catch (error) {
    if (requestId !== staticImportRequest) return;
    showNotice(staticSvgErrorMessage(error), 7000);
  }
}

async function removeStaticPattern(id) {
  const sourceScreen = currentRoute.screen;
  const sourcePatternId = currentRoute.staticPatternId;
  try {
    const result = await staticPatternRepository.remove(id);
    staticPatterns = staticPatterns.filter((pattern) => pattern.id !== id);
    await refreshStaticPatterns();
    if (result.persistent) announceStaticLibraryChange();
    if (currentRoute.screen === "home"
      || (sourceScreen === "static" && sourcePatternId === id
        && currentRoute.screen === "static" && currentRoute.staticPatternId === id)) {
      renderHome({ resetScroll: false });
    }
    showNotice(copy(state.language, "SVG-лекало удалено из личной библиотеки.", "SVG pattern removed from your personal library."));
  } catch (error) {
    showNotice(staticStorageErrorMessage(error), 6000);
  }
}

function renderHome({ resetScroll = true, preserveStaticRoute = false } = {}) {
  staticOpenRequest += 1;
  currentStaticPattern = null;
  if (!preserveStaticRoute) writeStaticRoute();
  logI18n("render home", getLocale());
  currentRoute.screen = "home";
  currentRoute.moduleId = null;
  currentRoute.staticPatternId = null;
  mountView(Home({
    modules: getModules(),
    language: state.language,
    builtInTemplates: BUILT_IN_UNDERWEAR_TEMPLATES,
    userTemplates,
    staticPatterns,
    staticLoading,
    onSelect: (moduleId) => {
      state = setState({ selectedModuleId: moduleId });
      renderEditor(moduleId);
    },
    onOpenTemplate: applyTemplate,
    onExportTemplate: exportUserTemplate,
    onDeleteTemplate: removeUserTemplate,
    onImportTemplate: importUserTemplate,
    onImportSvg: importStaticPattern,
    onOpenStatic: (pattern) => openStaticPattern(pattern.id),
    onDeleteStatic: removeStaticPattern,
    onOpenHelp: openHelp,
    onThemeToggle: (theme) => {
      state = setState({ theme });
    },
    onLanguageToggle: handleLanguageToggle,
  }));
  if (resetScroll) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  if (templateStorageWarning) {
    const warning = templateStorageWarning;
    templateStorageWarning = null;
    window.setTimeout(() => showNotice(templateErrorMessage(warning), 6500), 0);
  }
}

function renderEditor(moduleId) {
  staticOpenRequest += 1;
  currentStaticPattern = null;
  writeStaticRoute();
  if (!getModule(moduleId)) {
    state = setState({ selectedModuleId: null });
    renderHome();
    return;
  }
  logI18n("render editor", moduleId, getLocale());
  currentRoute.screen = "editor";
  currentRoute.moduleId = moduleId;
  currentRoute.staticPatternId = null;
  mountView(Editor({
    moduleId,
    modules: getModules(),
    language: state.language,
    state,
    onBack: () => {
      state = setState({ selectedModuleId: null });
      renderHome();
    },
    onSaveTemplate: async (payload) => {
      try {
        const template = makeUserTemplate(payload);
        persistTemplate(template);
        return template;
      } catch (error) {
        throw new Error(templateErrorMessage(error));
      }
    },
    onThemeToggle: (theme) => {
      state = setState({ theme });
    },
    onLanguageToggle: handleLanguageToggle,
    onPaperSizeChange: (paperSize) => {
      state = setState({ paperSize });
    },
    onOpenHelp: openHelp,
  }));
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

async function openStaticPattern(patternId) {
  const requestId = ++staticOpenRequest;
  const sourceScreen = currentRoute.screen;
  try {
    const pattern = await staticPatternRepository.get(patternId);
    if (!pattern && staticPatternRepository.lastError) throw staticPatternRepository.lastError;
    if (requestId !== staticOpenRequest || sourceScreen !== "home" || currentRoute.screen !== "home") return;
    if (!pattern) {
      writeStaticRoute();
      renderHome({ resetScroll: false });
      showNotice(copy(state.language, "SVG-лекало не найдено.", "SVG pattern not found."));
      return;
    }
    renderStaticPattern(pattern);
  } catch (error) {
    if (requestId !== staticOpenRequest) return;
    if (staticPatternRepository.lastError) {
      showNotice(staticStorageErrorMessage(error), 6000);
      return;
    }
    writeStaticRoute();
    if (currentRoute.screen === "home") renderHome({ resetScroll: false });
    showNotice(staticStorageErrorMessage(error), 6000);
  }
}

function renderStaticPattern(pattern) {
  if (!pattern) {
    renderHome();
    showNotice(copy(state.language, "SVG-лекало не найдено.", "SVG pattern not found."));
    return;
  }
  staticOpenRequest += 1;
  currentStaticPattern = pattern;
  currentRoute.screen = "static";
  currentRoute.moduleId = null;
  currentRoute.staticPatternId = pattern.id;
  writeStaticRoute(pattern.id);
  mountView(StaticPattern({
    pattern,
    language: state.language,
    onBack: () => renderHome(),
    onDelete: removeStaticPattern,
    onNotice: showNotice,
    onThemeToggle: (theme) => {
      state = setState({ theme });
    },
    onLanguageToggle: handleLanguageToggle,
    onOpenHelp: openHelp,
  }));
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function renderCurrentRoute() {
  if (currentRoute.screen === "editor" && currentRoute.moduleId) renderEditor(currentRoute.moduleId);
  else if (currentRoute.screen === "static"
    && currentRoute.staticPatternId
    && currentStaticPattern?.id === currentRoute.staticPatternId) {
    renderStaticPattern(currentStaticPattern);
  }
  else renderHome();
}

subscribe((nextState, prevState) => {
  state = nextState;
  if (prevState?.language !== nextState.language) {
    logI18n("language updated", prevState?.language, "->", nextState.language);
    setLocale(nextState.language);
    renderCurrentRoute();
  }
});

window.addEventListener("localechange", (event) => {
  logI18n("localechange event", event.detail);
  if (event.detail !== state.language) setState({ language: event.detail });
});

let templateStorageSyncTimer = null;
window.addEventListener("storage", (event) => {
  if (!localStorageRef) return;
  if (event.storageArea && event.storageArea !== localStorageRef) return;
  if (event.key === STATIC_LIBRARY_SYNC_KEY) {
    scheduleStaticLibrarySync();
    return;
  }
  if (event.key !== null
    && event.key !== templateStorage.key
    && event.key !== templateStorage.quarantineKey) return;
  if (templateStorageSyncTimer !== null) return;
  templateStorageSyncTimer = window.setTimeout(() => {
    templateStorageSyncTimer = null;
    try {
      refreshUserTemplates();
      if (currentRoute.screen === "home") renderHome({ resetScroll: false });
    } catch (error) {
      showNotice(templateErrorMessage(error), 6500);
    }
  }, 0);
});

if (restoredStaticPatternId) renderHome({ preserveStaticRoute: true });
else if (state.selectedModuleId) renderEditor(state.selectedModuleId);
else renderHome();

refreshStaticPatterns({ rerender: !restoredStaticPatternId }).then((refresh) => {
  if (restoredStaticPatternId
    && currentRoute.screen === "home"
    && readStaticRoute() === restoredStaticPatternId) {
    if (refresh.authoritative) openStaticPattern(restoredStaticPatternId);
    else renderHome({ resetScroll: false, preserveStaticRoute: true });
  }
}).catch((error) => {
  staticLoading = false;
  if (currentRoute.screen === "home") renderHome({ resetScroll: false });
  showNotice(staticStorageErrorMessage(error), 6500);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update?.())
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      showNotice(copy(
        state.language,
        "Обновление готово и применится при следующем запуске.",
        "An update is ready and will apply on the next launch.",
      ), 6200);
    });
  });
}
