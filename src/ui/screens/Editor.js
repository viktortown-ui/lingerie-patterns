import { createEl } from "../../core/utils/dom.js";
import { getModule } from "../../core/pattern/registry.js";
import { validateSchema } from "../../core/validate/validate.js";
import { svgExport } from "../../core/export/svgExport.js";
import { pdfExport } from "../../core/export/pdfExport.js";
import { buildDxfExport } from "../../core/export/dxfExport.js";
import { createStoredZip, parseStoredZip } from "../../core/export/storedZip.js";
import { createRuleBasedSizeBatch } from "../../core/grading/patternBatch.js";
import { uid } from "../../core/utils/id.js";
import { Form } from "../components/Form.js";
import { HelpButton } from "../components/HelpButton.js";
import { PatternAdjuster } from "../components/PatternAdjuster.js";
import { GradingPanel } from "../components/GradingPanel.js";
import { Preview } from "../components/Preview.js";
import { TemplateSaveDialog } from "../components/TemplateSaveDialog.js";
import { Toast } from "../components/Toast.js";
import { resolveText } from "../i18n/i18n.js";
import { toggleTheme } from "../styles/theme.js";
import { downloadBlob } from "../utils/download.js";
import {
  canonicalizeOptions,
  completeProfileValues,
  formatProfileDate,
  prepareImportedProfiles,
  subscribeProfileChanges,
} from "../utils/profiles.js";
import {
  assertProfileCount,
  JsonImportError,
  jsonImportErrorMessage,
  readBoundedJsonFile,
} from "../utils/jsonImport.js";
import {
  deleteProfile,
  getState,
  isPersistenceAvailable,
  replaceProfiles,
  setState,
  subscribe,
  updateDraft,
  upsertProfile,
} from "../state/store.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function resolveEnglish(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.en || value.ru || "";
  return String(value);
}

function safeFilename(value) {
  return String(value || "pattern")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "pattern";
}

function normalizedAdjustments(schema, source = {}) {
  return Object.fromEntries((schema.adjustments || []).map((definition) => {
    const fallback = Number(definition.default ?? schema.adjustmentDefaults?.[definition.key]) || 0;
    const raw = Number(source[definition.key]);
    const finite = Number.isFinite(raw) ? raw : fallback;
    const min = Number.isFinite(definition.min) ? definition.min : finite;
    const max = Number.isFinite(definition.max) ? definition.max : finite;
    const step = Number(definition.step) || 1;
    const snapped = Math.round(finite / step) * step;
    const precision = String(step).split(".")[1]?.length || 0;
    return [definition.key, Number(Math.min(max, Math.max(min, snapped)).toFixed(precision))];
  }));
}

function addSectionTitle(container, eyebrow, title, description) {
  const heading = createEl("div", { className: "result-heading" });
  heading.append(
    createEl("span", { className: "eyebrow", text: eyebrow }),
    createEl("h3", { text: title }),
  );
  if (description) heading.appendChild(createEl("p", { text: description }));
  container.appendChild(heading);
}

function languageControl(language, onLanguageToggle) {
  const group = createEl("div", { className: "language-control" });
  [["ru", "RU"], ["en", "EN"]].forEach(([value, label]) => {
    const button = createEl("button", {
      className: language === value ? "language-button is-active" : "language-button",
      text: label,
      attrs: { type: "button", "aria-pressed": language === value ? "true" : "false" },
    });
    button.addEventListener("click", () => onLanguageToggle(value));
    group.appendChild(button);
  });
  return group;
}

export function Editor({
  moduleId,
  language,
  state,
  onBack,
  onSaveTemplate = async () => {},
  onThemeToggle,
  onLanguageToggle,
  onPaperSizeChange,
  onOpenHelp = () => {},
}) {
  const module = getModule(moduleId);
  if (!module) return createEl("div", { className: "empty-state", text: copy(language, "Модель не найдена.", "Pattern module not found.") });

  const page = createEl("div", { className: "studio-page" });
  const header = createEl("header", { className: "app-header studio-header" });
  const backButton = createEl("button", {
    className: "back-button",
    text: copy(language, "← Все модели", "← All patterns"),
    attrs: { type: "button" },
  });
  backButton.addEventListener("click", onBack);
  const headerTitle = createEl("div", { className: "studio-title" });
  headerTitle.append(
    createEl("span", { className: "eyebrow", text: "ЛЕКАЛО / PATTERN STUDIO" }),
    createEl("h1", { text: resolveText(module.schema?.name || module.name) }),
  );
  const headerActions = createEl("div", { className: "header-actions" });
  const themeButton = createEl("button", {
    className: "icon-button theme-button",
    text: copy(language, "Сменить тему", "Toggle theme"),
    attrs: { type: "button" },
  });
  themeButton.addEventListener("click", () => onThemeToggle(toggleTheme()));
  headerActions.append(
    languageControl(language, onLanguageToggle),
    HelpButton({ language, onOpen: onOpenHelp, topic: "style-controls" }),
    themeButton,
  );
  header.append(backButton, headerTitle, headerActions);

  const candidateStoredDraft = state.draftsByModule?.[moduleId]
    || (state.draft?.moduleId === moduleId ? state.draft : null);
  // Legacy drafts without a version remain readable. Once a version is stored,
  // never apply it to a different drafting engine silently.
  const storedDraft = candidateStoredDraft
    && (!candidateStoredDraft.moduleVersion || candidateStoredDraft.moduleVersion === module.version)
    ? candidateStoredDraft
    : null;
  const moduleProfiles = (Array.isArray(state.profiles) ? state.profiles : []).filter((profile) => profile.moduleId === moduleId);
  const selectedProfileId = state.lastProfileIdByModule?.[moduleId]
    || (moduleProfiles.some((profile) => profile.id === state.lastProfileId) ? state.lastProfileId : null);
  const lastProfile = moduleProfiles.find((profile) => profile.id === selectedProfileId);
  const values = {
    ...module.schema.defaults,
    ...module.schema.optionDefaults,
    ...module.schema.adjustmentDefaults,
    ...(lastProfile?.measurements || {}),
    ...(lastProfile?.options || {}),
    ...(lastProfile?.adjustments || {}),
    ...(storedDraft?.measurements || {}),
    ...(storedDraft?.options || {}),
    ...(storedDraft?.adjustments || {}),
  };
  Object.assign(values, canonicalizeOptions(module.schema, values));
  Object.assign(values, normalizedAdjustments(module.schema, values));
  const editableKeys = [
    ...module.schema.fields.map((field) => field.key),
    ...(module.schema.options || []).map((option) => option.key),
    ...(module.schema.adjustments || []).map((adjustment) => adjustment.key),
  ];
  const snapshotValues = () => Object.fromEntries(editableKeys.map((key) => [key, values[key]]));
  const sameSnapshot = (left, right) => editableKeys.every((key) => Object.is(left?.[key], right?.[key]));
  const history = [snapshotValues()];
  let historyIndex = 0;
  let applyingHistory = false;
  let updateHistoryControls = () => {};
  const recordHistory = () => {
    if (applyingHistory) return;
    const next = snapshotValues();
    if (sameSnapshot(next, history[historyIndex])) return;
    history.splice(historyIndex + 1);
    history.push(next);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
    updateHistoryControls();
  };
  let paperSize = storedDraft?.paperSize || state.paperSize || "A4";
  let previewSettings = {
    scaleLabels: storedDraft?.preview?.scaleLabels ?? true,
    seamHighlight: storedDraft?.preview?.seamHighlight ?? false,
    editPoints: storedDraft?.preview?.editPoints ?? false,
  };
  let currentErrors = validateSchema(module.schema, values);
  let draft = null;
  let lastWarning = "";

  const measurementValues = () => Object.fromEntries(module.schema.fields.map((field) => [field.key, values[field.key]]));
  const optionValues = () => Object.fromEntries((module.schema.options || []).map((option) => [option.key, values[option.key]]));
  const adjustmentValues = () => Object.fromEntries((module.schema.adjustments || []).map((adjustment) => [adjustment.key, values[adjustment.key]]));
  const persistDraft = () => updateDraft({
    moduleId,
    moduleVersion: module.version,
    measurements: measurementValues(),
    options: optionValues(),
    adjustments: adjustmentValues(),
    paperSize,
    preview: previewSettings,
  });
  const measurementsSummary = () => module.schema.fields.map((field) => {
    const code = field.code ? " (" + field.code + ")" : "";
    return resolveText(field.label) + code + ": " + values[field.key] + module.schema.unit;
  });
  const adjustmentsSummary = (english = false) => (module.schema.adjustments || [])
    .filter((definition) => Math.abs(Number(values[definition.key]) || 0) > 0.0001)
    .map((definition) => {
      const value = Number(values[definition.key]) || 0;
      const sign = value > 0 ? "+" : "";
      const label = english ? resolveEnglish(definition.label) : resolveText(definition.label);
      return `${definition.code || definition.key} ${label}: ${sign}${value}${definition.unit || module.schema.unit}`;
    });
  const completeSummary = () => [...measurementsSummary(), ...adjustmentsSummary()];

  const workspace = createEl("div", { className: "studio-workspace" });
  const controlsColumn = createEl("aside", { className: "controls-column surface-card", attrs: { id: "studio-measurements" } });
  const draftColumn = createEl("main", { className: "draft-column", attrs: { id: "studio-pattern" } });
  const resultColumn = createEl("aside", { className: "result-column", attrs: { id: "studio-results" } });
  const previewCard = createEl("section", { className: "preview-card surface-card" });
  const previewTop = createEl("div", { className: "preview-card-top" });
  const previewTitle = createEl("div");
  previewTitle.append(
    createEl("span", { className: "eyebrow", text: copy(language, "ЖИВОЙ ЧЕРТЁЖ", "LIVE DRAFT") }),
    createEl("h2", { text: copy(language, "Предпросмотр деталей", "Pattern preview") }),
  );
  const liveStatus = createEl("span", { className: "live-status", text: copy(language, "Пересчитывается автоматически", "Updates automatically") });
  previewTop.append(previewTitle, liveStatus);

  const paperSelect = createEl("select", { className: "paper-select", attrs: { "aria-label": copy(language, "Формат бумаги", "Paper size") } });
  [
    ["A4", copy(language, "A4 — домашний принтер", "A4 — home printer")],
    ["A3", copy(language, "A3 — меньше листов", "A3 — fewer tiles")],
    ["LETTER", copy(language, "Letter — США/Канада", "Letter — US/Canada")],
    ["A0", copy(language, "A0 — плоттер", "A0 — plotter")],
  ].forEach(([value, label]) => {
    const option = createEl("option", { text: label, attrs: { value } });
    option.selected = value === paperSize;
    paperSelect.appendChild(option);
  });

  let adjuster = null;
  const preview = Preview({
    getDraft: () => draft,
    getSummary: completeSummary,
    settings: previewSettings,
    onSettingsChange: (nextSettings) => {
      previewSettings = { ...previewSettings, ...nextSettings };
      persistDraft();
    },
    onAdjustmentChange: (key, value) => {
      handleAdjustmentChange(key, value);
    },
  });

  const qualityCard = createEl("section", { className: "result-card surface-card" });
  const materialsCard = createEl("section", { className: "result-card surface-card" });
  const instructionsCard = createEl("section", { className: "result-card surface-card" });
  const profileCard = createEl("section", { className: "result-card surface-card profile-card" });
  resultColumn.append(qualityCard, materialsCard, instructionsCard, profileCard);

  const exportCard = createEl("section", { className: "export-card surface-card" });
  const exportInfo = createEl("div", { className: "export-info" });
  exportInfo.append(
    createEl("span", { className: "eyebrow", text: copy(language, "ЭКСПОРТ", "EXPORT") }),
    createEl("strong", { text: copy(language, "Печать в реальном размере", "True-size output") }),
    createEl("span", { text: copy(language, "Для PDF сначала распечатайте контрольную страницу при 100% / Actual size. DXF формируется в миллиметрах и проходит внутреннее повторное чтение.", "For PDF, print the calibration page at 100% / Actual size first. DXF is written in millimetres and passes an internal round-trip read.") }),
  );
  const exportControls = createEl("div", { className: "export-controls" });
  const svgButton = createEl("button", { className: "secondary-button export-button", text: "SVG", attrs: { type: "button" } });
  const dxfButton = createEl("button", { className: "secondary-button export-button", text: "DXF (mm)", attrs: { type: "button" } });
  const pdfButton = createEl("button", { className: "primary-button export-button", text: copy(language, "Скачать PDF", "Download PDF"), attrs: { type: "button" } });
  const templateButton = createEl("button", {
    className: "secondary-button export-button template-save-button",
    text: copy(language, "Сохранить фасон", "Save style"),
    attrs: { type: "button" },
  });
  const projectButton = createEl("button", { className: "secondary-button export-button", text: copy(language, "Проект JSON", "Project JSON"), attrs: { type: "button" } });
  const projectOpenLabel = createEl("label", {
    className: "secondary-button export-button file-button",
    text: copy(language, "Открыть JSON", "Open JSON"),
  });
  const projectOpenInput = createEl("input", { attrs: { type: "file", accept: "application/json,.json" } });
  projectOpenLabel.appendChild(projectOpenInput);
  exportControls.append(paperSelect, svgButton, dxfButton, pdfButton, templateButton, projectButton, projectOpenLabel);
  exportCard.append(exportInfo, exportControls);

  const toast = Toast();
  const templateDialog = TemplateSaveDialog({
    language,
    onSave: async (metadata) => {
      await onSaveTemplate({
        moduleId,
        moduleVersion: module.version,
        metadata,
        options: optionValues(),
        adjustments: adjustmentValues(),
      });
      toast.show(copy(language, "Фасон сохранён без личных мерок", "Style saved without body measurements"));
    },
  });
  const exportButtons = [svgButton, dxfButton, pdfButton, projectButton];
  const setExportEnabled = (enabled) => exportButtons.forEach((button) => { button.disabled = !enabled; });

  function renderQuality() {
    qualityCard.innerHTML = "";
    addSectionTitle(
      qualityCard,
      copy(language, "ПРОВЕРКА", "CHECKS"),
      copy(language, "Готовность выкройки", "Pattern readiness"),
      copy(language, "Математические проверки не заменяют примерку.", "Geometry checks do not replace a fitting."),
    );
    if (!draft) {
      const errorCount = Object.values(currentErrors).filter((items) => items?.length).length;
      qualityCard.appendChild(createEl("div", {
        className: "quality-empty",
        text: errorCount
          ? copy(language, "Исправьте отмеченные мерки — экспорт временно заблокирован.", "Fix the highlighted measurements. Export is temporarily locked.")
          : copy(language, "Не удалось построить чертёж.", "The draft could not be generated."),
      }));
      return;
    }
    const warnings = draft.meta?.warnings || [];
    const status = createEl("div", { className: warnings.length ? "quality-status is-warning" : "quality-status is-pass" });
    status.append(
      createEl("span", { className: "quality-status-icon", text: warnings.length ? "!" : "✓" }),
      createEl("div"),
    );
    status.lastChild.append(
      createEl("strong", { text: warnings.length ? copy(language, "Нужна проверка", "Review needed") : copy(language, "Геометрия согласована", "Geometry is consistent") }),
      createEl("span", { text: resolveText(draft.meta?.fitNotice || "") }),
    );
    qualityCard.appendChild(status);
    (draft.meta?.checks || []).forEach((check) => {
      const row = createEl("div", { className: "check-row" });
      row.append(
        createEl("span", { className: check.status === "pass" ? "check-dot is-pass" : "check-dot is-warning", text: check.status === "pass" ? "✓" : "!" }),
        createEl("span", { className: "check-label", text: resolveText(check.label) }),
        createEl("strong", { text: resolveText(check.value) }),
      );
      qualityCard.appendChild(row);
    });
    warnings.forEach((warning) => qualityCard.appendChild(createEl("div", { className: "warning-note", text: resolveText(warning) })));
  }

  function renderMaterials() {
    materialsCard.innerHTML = "";
    addSectionTitle(materialsCard, copy(language, "РАСЧЁТ", "ESTIMATE"), copy(language, "Материалы", "Materials"));
    if (!draft) {
      materialsCard.appendChild(createEl("p", { className: "muted", text: copy(language, "Появятся после корректного ввода мерок.", "Available after valid measurements.") }));
      return;
    }
    (draft.meta?.materials || []).forEach((item) => {
      const row = createEl("div", { className: "material-row" });
      row.append(createEl("span", { text: resolveText(item.label) }), createEl("strong", { text: resolveText(item.value) }));
      materialsCard.appendChild(row);
    });
    materialsCard.appendChild(createEl("p", { className: "estimate-note", text: copy(language, "Расход ткани — ориентир без автоматической раскладки на полотне.", "Fabric amount is an estimate before marker layout.") }));
  }

  function renderInstructions() {
    instructionsCard.innerHTML = "";
    addSectionTitle(instructionsCard, copy(language, "ПОШИВ", "SEWING"), copy(language, "Персональный порядок", "Personal sequence"));
    const list = createEl("ol", { className: "instruction-list" });
    (draft?.meta?.instructions || []).forEach((instruction) => list.appendChild(createEl("li", { text: resolveText(instruction) })));
    if (!list.children.length) list.appendChild(createEl("li", { text: copy(language, "Инструкция появится после построения.", "Instructions appear after drafting.") }));
    instructionsCard.appendChild(list);
  }

  let form = null;
  let gradingPanel = null;
  const profileList = createEl("div", { className: "saved-profile-list" });

  function renderProfiles() {
    profileList.innerHTML = "";
    const profiles = (Array.isArray(getState().profiles) ? getState().profiles : []).filter((profile) => profile.moduleId === moduleId);
    if (!profiles.length) {
      profileList.appendChild(createEl("span", { className: "muted", text: copy(language, "Сохранённых профилей пока нет.", "No saved profiles yet.") }));
      return;
    }
    profiles.forEach((profile) => {
      const row = createEl("div", { className: "saved-profile" });
      const info = createEl("button", { className: "profile-load", attrs: { type: "button" } });
      info.append(createEl("strong", { text: profile.name }), createEl("span", { text: formatProfileDate(profile.updatedAt, language) }));
      info.addEventListener("click", () => {
        const profileValues = completeProfileValues(module.schema, profile);
        Object.assign(profileValues, canonicalizeOptions(module.schema, profileValues));
        Object.assign(profileValues, normalizedAdjustments(module.schema, profileValues));
        setState({
          lastProfileId: profile.id,
          lastProfileIdByModule: {
            ...(getState().lastProfileIdByModule || {}),
            [moduleId]: profile.id,
          },
          draft: {
            moduleId,
            measurements: Object.fromEntries(module.schema.fields.map((field) => [field.key, profileValues[field.key]])),
            options: Object.fromEntries((module.schema.options || []).map((option) => [option.key, profileValues[option.key]])),
            adjustments: Object.fromEntries((module.schema.adjustments || []).map((adjustment) => [adjustment.key, profileValues[adjustment.key]])),
            paperSize,
            preview: previewSettings,
          },
        });
        Object.assign(values, profileValues);
        adjuster?.setValues(profileValues);
        form?.setValues(profileValues);
        toast.show(copy(language, "Профиль загружен", "Profile loaded"));
      });
      const remove = createEl("button", { className: "profile-delete", text: "×", attrs: { type: "button", "aria-label": copy(language, "Удалить профиль", "Delete profile") } });
      remove.addEventListener("click", () => {
        if (!window.confirm(copy(language, "Удалить этот профиль мерок?", "Delete this measurement profile?"))) return;
        deleteProfile(null, profile.id);
        if (!isPersistenceAvailable()) {
          toast.show(copy(language, "Удалено только из текущего сеанса: локальное хранилище недоступно.", "Removed for this session only: local storage is unavailable."));
        }
      });
      row.append(info, remove);
      profileList.appendChild(row);
    });
  }

  function buildProfileCard() {
    profileCard.innerHTML = "";
    addSectionTitle(profileCard, copy(language, "ЛОКАЛЬНО", "LOCAL"), copy(language, "Профили мерок", "Measurement profiles"), copy(language, "Хранятся только в этой версии на этом устройстве.", "Stored only in this app version on this device."));
    const buttons = createEl("div", { className: "profile-actions" });
    const save = createEl("button", { className: "primary-button compact-button", text: copy(language, "Сохранить текущий", "Save current"), attrs: { type: "button" } });
    const backup = createEl("button", { className: "secondary-button compact-button", text: copy(language, "Резервная копия", "Backup"), attrs: { type: "button" } });
    const importLabel = createEl("label", { className: "secondary-button compact-button file-button", text: copy(language, "Импорт", "Import") });
    const importInput = createEl("input", { attrs: { type: "file", accept: "application/json,.json" } });
    importLabel.appendChild(importInput);
    save.addEventListener("click", () => {
      if (!draft || Object.keys(currentErrors).length) return toast.show(copy(language, "Сначала исправьте мерки.", "Fix the measurements first."));
      const name = window.prompt(copy(language, "Название профиля", "Profile name"), copy(language, "Мои мерки", "My measurements"));
      if (!name?.trim()) return;
      upsertProfile(null, {
        id: uid("profile"),
        moduleId,
        schemaVersion: module.version,
        name: name.trim(),
        measurements: measurementValues(),
        options: optionValues(),
        adjustments: adjustmentValues(),
        updatedAt: new Date().toISOString(),
      });
      toast.show(isPersistenceAvailable()
        ? copy(language, "Профиль сохранён", "Profile saved")
        : copy(language, "Профиль доступен только до закрытия окна: браузер блокирует локальное хранилище.", "The profile is available only until this window closes because the browser blocks local storage."));
    });
    backup.addEventListener("click", () => {
      const payload = { format: "lekalo-profiles", version: 1, exportedAt: new Date().toISOString(), profiles: getState().profiles || [] };
      downloadBlob({ blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename: "lekalo-profiles.json", mimeType: "application/json" });
    });
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const parsed = await readBoundedJsonFile(file);
        const incoming = Array.isArray(parsed) ? parsed : parsed.profiles;
        assertProfileCount(incoming);
        const existingProfiles = Array.isArray(getState().profiles) ? getState().profiles : [];
        const validIncoming = prepareImportedProfiles(incoming, existingProfiles, () => uid("profile"), moduleId);
        const checkedIncoming = validIncoming.map((profile) => {
          const profileModule = getModule(profile.moduleId);
          if (!profileModule) throw new Error("Unknown profile module");
          const profileValues = completeProfileValues(profileModule.schema, profile);
          const profileOptions = canonicalizeOptions(profileModule.schema, profileValues);
          Object.assign(profileValues, profileOptions);
          const profileAdjustments = normalizedAdjustments(profileModule.schema, profileValues);
          Object.assign(profileValues, profileAdjustments);
          if (Object.keys(validateSchema(profileModule.schema, profileValues)).length) {
            throw new Error("Invalid profile values");
          }
          return {
            ...profile,
            measurements: Object.fromEntries(profileModule.schema.fields.map((field) => [field.key, profileValues[field.key]])),
            options: profileOptions,
            adjustments: profileAdjustments,
          };
        });
        const merged = new Map(existingProfiles.map((profile) => [profile.id, profile]));
        checkedIncoming.forEach((profile) => merged.set(profile.id, profile));
        const mergedProfiles = [...merged.values()];
        assertProfileCount(mergedProfiles);
        replaceProfiles(mergedProfiles);
        toast.show(isPersistenceAvailable()
          ? copy(language, "Профили импортированы", "Profiles imported")
          : copy(language, "Профили импортированы только в текущий сеанс: локальное хранилище недоступно.", "Profiles were imported for this session only because local storage is unavailable."));
      } catch (error) {
        toast.show(jsonImportErrorMessage(error, language, "profiles"));
      } finally {
        importInput.value = "";
      }
    });
    buttons.append(save, backup, importLabel);
    profileCard.append(buttons, profileList);
    renderProfiles();
  }

  function refreshResult() {
    renderQuality();
    renderMaterials();
    renderInstructions();
    setExportEnabled(Boolean(draft) && Object.keys(currentErrors).length === 0);
  }

  function handleChange(nextValues, fieldErrors) {
    Object.assign(values, nextValues);
    recordHistory();
    currentErrors = fieldErrors;
    gradingPanel?.invalidate();
    persistDraft();
    if (Object.keys(fieldErrors).length) {
      draft = null;
      preview.render();
      refreshResult();
      liveStatus.textContent = copy(language, "Исправьте отмеченные поля", "Fix highlighted fields");
      liveStatus.classList.add("is-warning");
      return;
    }
    try {
      draft = module.draft(measurementValues(), optionValues(), adjustmentValues());
      preview.render();
      refreshResult();
      const persisted = isPersistenceAvailable();
      liveStatus.textContent = persisted
        ? copy(language, "Сохранено • чертёж актуален", "Saved • draft is current")
        : copy(language, "Чертёж актуален • автосохранение недоступно", "Draft is current • autosave unavailable");
      liveStatus.classList.toggle("is-warning", !persisted);
      const warning = draft.meta?.warnings?.[0] ? resolveText(draft.meta.warnings[0]) : "";
      if (warning && warning !== lastWarning) {
        lastWarning = warning;
        toast.show(warning);
      }
    } catch (error) {
      draft = null;
      preview.render();
      refreshResult();
      liveStatus.textContent = copy(language, "Построение остановлено", "Drafting stopped");
      liveStatus.classList.add("is-warning");
      toast.show(error?.message || copy(language, "Не удалось построить выкройку.", "Drafting failed."));
    }
  }

  function handleAdjustmentChange(key, nextValue) {
    const definition = (module.schema.adjustments || []).find((item) => item.key === key);
    if (!definition) return;
    const number = Number(nextValue);
    if (!Number.isFinite(number)) return;
    const normalized = normalizedAdjustments(module.schema, { ...adjustmentValues(), [key]: number });
    values[key] = normalized[key];
    adjuster?.setValues({ [key]: values[key] });
    handleChange({}, currentErrors);
  }

  function handleAdjustmentReset(defaults) {
    const normalized = normalizedAdjustments(module.schema, defaults);
    Object.assign(values, normalized);
    adjuster?.setValues(normalized);
    handleChange({}, currentErrors);
  }

  const historyToolbar = createEl("div", { className: "history-toolbar" });
  const undoButton = createEl("button", {
    className: "secondary-button compact-button",
    text: copy(language, "↶ Отменить", "↶ Undo"),
    attrs: { type: "button", "aria-label": copy(language, "Отменить последнее изменение", "Undo last change") },
  });
  const redoButton = createEl("button", {
    className: "secondary-button compact-button",
    text: copy(language, "↷ Вернуть", "↷ Redo"),
    attrs: { type: "button", "aria-label": copy(language, "Вернуть отменённое изменение", "Redo change") },
  });
  const historyStatus = createEl("span", {
    className: "history-status",
    attrs: { "aria-live": "polite" },
  });
  updateHistoryControls = () => {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length - 1;
    historyStatus.textContent = copy(
      language,
      `История ${historyIndex + 1}/${history.length}`,
      `History ${historyIndex + 1}/${history.length}`,
    );
  };
  const restoreHistory = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= history.length || nextIndex === historyIndex) return;
    historyIndex = nextIndex;
    applyingHistory = true;
    try {
      const restored = history[historyIndex];
      Object.assign(values, restored);
      adjuster?.setValues(restored);
      form?.setValues(restored);
    } finally {
      applyingHistory = false;
    }
    updateHistoryControls();
  };
  undoButton.addEventListener("click", () => restoreHistory(historyIndex - 1));
  redoButton.addEventListener("click", () => restoreHistory(historyIndex + 1));
  historyToolbar.append(undoButton, redoButton, historyStatus);
  updateHistoryControls();

  form = Form({
    schema: module.schema,
    values,
    onChange: handleChange,
    onSubmit: () => {
      draftColumn.scrollIntoView({ behavior: "smooth", block: "start" });
      toast.show(copy(language, "Результат и проверки обновлены", "Result and checks updated"));
    },
  });
  controlsColumn.append(historyToolbar, form.el);
  if (module.schema.adjustments?.length) {
    adjuster = PatternAdjuster({
      schema: module.schema,
      values: adjustmentValues(),
      language,
      onChange: handleAdjustmentChange,
      onReset: handleAdjustmentReset,
    });
    controlsColumn.appendChild(adjuster.el);
  }

  paperSelect.addEventListener("change", () => {
    paperSize = paperSelect.value;
    onPaperSizeChange?.(paperSize);
    persistDraft();
  });

  const exportOptionsSummary = () => (module.schema.options || []).map((option) => {
    const raw = values[option.key];
    const choice = option.choices.find((item) => String(item.value) === String(raw));
    return resolveEnglish(option.label) + ": " + resolveEnglish(choice?.label || raw);
  }).join(", ");
  const filenameBase = safeFilename(moduleId);

  svgButton.addEventListener("click", () => {
    if (!draft) return;
    const svg = svgExport(draft, completeSummary(), {
      resolveText,
      labels: {
        unitsLabel: copy(language, "Единицы", "Units"),
        seamAllowanceLabel: copy(language, "Припуски", "Seam allowances"),
        seamAllowanceOff: copy(language, "нет", "off"),
        legendLines: copy(language, "Сплошная — линия кроя; пунктир — линия строчки", "Solid = cut line; dashed = stitch line"),
        calibration: "50mm",
        calibrationLarge: "100mm",
        pieceLabel: copy(language, "Деталь", "Piece"),
        cutLabel: copy(language, "Крой", "Cut"),
        materialLabel: copy(language, "Материал", "Material"),
        moduleLabel: copy(language, "Модель", "Module"),
      },
    });
    downloadBlob({ blob: new Blob([svg], { type: "image/svg+xml" }), filename: filenameBase + ".svg", mimeType: "image/svg+xml" });
  });

  dxfButton.addEventListener("click", () => {
    if (!draft) return;
    try {
      const result = buildDxfExport(draft, {
        outputUnit: "mm",
        curveTolerance: 0.2,
        resolveText: resolveEnglish,
      });
      downloadBlob({
        blob: new Blob([result.data], { type: "application/dxf" }),
        filename: filenameBase + "_mm.dxf",
        mimeType: "application/dxf",
      });
      toast.show(copy(
        language,
        `DXF готов: ${result.report.pathCount} контуров, единицы мм, внутренняя проверка пройдена. Перед раскроем проверьте импорт в CAD производства.`,
        `DXF ready: ${result.report.pathCount} contours, millimetres, internal round-trip passed. Verify import in the production CAD before cutting.`,
      ));
    } catch (error) {
      toast.show(error?.issues?.[0] || error?.message || copy(language, "Не удалось подготовить DXF.", "Could not create DXF."));
    }
  });

  const buildGradingResult = async (specification) => {
    const batch = createRuleBasedSizeBatch(
      module,
      {
        ...specification,
        baseProfile: {
          ...specification.baseProfile,
          options: optionValues(),
          adjustments: adjustmentValues(),
        },
      },
      {
        commonOptions: optionValues(),
        commonAdjustments: adjustmentValues(),
      },
    );
    const variants = batch.variants.map((variant) => {
      const dxf = buildDxfExport(variant.draft, {
        outputUnit: "mm",
        curveTolerance: 0.2,
        resolveText: resolveEnglish,
      });
      const fileName = `${filenameBase}_${safeFilename(variant.name || variant.id)}_mm.dxf`;
      return {
        id: variant.id,
        name: variant.name,
        summary: copy(
          language,
          `${dxf.report.pathCount} контуров • мм • проверено чтением`,
          `${dxf.report.pathCount} contours • mm • round-trip checked`,
        ),
        fileName,
        dxf,
      };
    });
    const manifest = {
      format: "lekalo-dxf-size-set",
      version: 1,
      batch: batch.manifest,
      qualification: {
        method: batch.method,
        industrialPointGrade: false,
        aamaAstmCertified: false,
        factoryImportVerified: false,
        internalDxfRoundTrip: true,
      },
      files: variants.map((variant) => ({
        sizeId: variant.id,
        sizeName: variant.name,
        file: `dxf/${variant.fileName}`,
        report: variant.dxf.report,
      })),
    };
    const archive = createStoredZip([
      { name: "manifest.json", content: JSON.stringify(manifest, null, 2) },
      ...variants.map((variant) => ({ name: `dxf/${variant.fileName}`, content: variant.dxf.data })),
    ]);
    const archiveEntries = parseStoredZip(archive);
    if (archiveEntries.length !== variants.length + 1) {
      throw new Error("DXF package round-trip failed.");
    }
    return {
      variants,
      downloadVariant: (variant) => downloadBlob({
        blob: new Blob([variant.dxf.data], { type: "application/dxf" }),
        filename: variant.fileName,
        mimeType: "application/dxf",
      }),
      downloadPackage: () => downloadBlob({
        blob: new Blob([archive], { type: "application/zip" }),
        filename: `${filenameBase}_size-set_dxf.zip`,
        mimeType: "application/zip",
      }),
    };
  };

  pdfButton.addEventListener("click", () => {
    if (!draft) return;
    const result = pdfExport(draft, {
      marginMm: 10,
      overlapMm: 10,
      paperSize,
      resolveText: resolveEnglish,
      info: {
        moduleName: resolveEnglish(module.schema.name),
        generatedAt: new Date().toISOString().slice(0, 10),
        optionsSummary: [exportOptionsSummary(), ...adjustmentsSummary(true)].filter(Boolean).join("; "),
        seamAllowance: String(draft.meta?.seamAllowanceMm || 0) + "mm",
        legendText: "Solid = cut line; dashed = stitch line",
        instructionText: "Print calibration page first. Use 100% / Actual size. Disable Fit and Shrink.",
      },
      labels: {
        patternLabel: "Pattern",
        generatedLabel: "Generated",
        optionsLabel: "Options",
        seamAllowanceLabel: "Seam allowance",
      },
    });
    downloadBlob({ blob: result.data, filename: filenameBase + "_" + paperSize + ".pdf", mimeType: "application/pdf" });
    const totalPages = result.totalPageCount ?? result.pageCount + 1;
    toast.show(copy(language, "PDF подготовлен: " + totalPages + " стр. (первая — контрольная)", "PDF ready: " + totalPages + " pages (calibration first)."));
  });

  projectButton.addEventListener("click", () => {
    if (!draft) return;
    const payload = {
      format: "lekalo-project",
      version: 2,
      moduleId,
      moduleVersion: module.version,
      savedAt: new Date().toISOString(),
      measurements: measurementValues(),
      options: optionValues(),
      adjustments: adjustmentValues(),
      paperSize,
      checks: draft.meta?.checks || [],
    };
    downloadBlob({ blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename: filenameBase + "-project.json", mimeType: "application/json" });
  });

  templateButton.addEventListener("click", () => {
    const modelName = resolveText(module.schema?.name || module.name);
    templateDialog.open(copy(language, `Мой фасон — ${modelName}`, `My style — ${modelName}`));
  });

  projectOpenInput.addEventListener("change", async () => {
    const file = projectOpenInput.files?.[0];
    if (!file) return;
    try {
      const parsed = await readBoundedJsonFile(file);
      if (parsed?.format !== "lekalo-project" || parsed?.moduleId !== moduleId) {
        throw new Error(copy(language, "Это файл другой модели или неизвестного формата.", "This file belongs to another pattern or has an unknown format."));
      }
      if (parsed.moduleVersion && parsed.moduleVersion !== module.version) {
        throw new Error(copy(
          language,
          `Проект создан для версии ${parsed.moduleVersion}, а установлена ${module.version}. Автоматическая миграция пока недоступна.`,
          `This project targets version ${parsed.moduleVersion}, while ${module.version} is installed. Automatic migration is not available yet.`,
        ));
      }
      const nextValues = {
        ...module.schema.defaults,
        ...module.schema.optionDefaults,
        ...module.schema.adjustmentDefaults,
        ...(parsed.measurements || {}),
        ...(parsed.options || {}),
        ...(parsed.adjustments || {}),
      };
      Object.assign(nextValues, canonicalizeOptions(module.schema, nextValues));
      Object.assign(nextValues, normalizedAdjustments(module.schema, nextValues));
      const importedErrors = validateSchema(module.schema, nextValues);
      if (Object.keys(importedErrors).length) {
        throw new Error(copy(language, "В проекте есть недопустимые мерки.", "The project contains invalid measurements."));
      }
      if (["A4", "A3", "LETTER", "A0"].includes(parsed.paperSize)) {
        paperSize = parsed.paperSize;
        paperSelect.value = paperSize;
        onPaperSizeChange?.(paperSize);
      }
      Object.assign(values, nextValues);
      adjuster?.setValues(normalizedAdjustments(module.schema, nextValues));
      form?.setValues(nextValues);
      toast.show(copy(language, "Проект открыт и пересчитан", "Project opened and recalculated"));
    } catch (error) {
      toast.show(error instanceof JsonImportError
        ? jsonImportErrorMessage(error, language, "project")
        : error?.message || copy(language, "Не удалось открыть проект.", "Could not open the project."));
    } finally {
      projectOpenInput.value = "";
    }
  });

  gradingPanel = GradingPanel({
    schema: module.schema,
    language,
    getMeasurements: measurementValues,
    onGenerate: buildGradingResult,
  });
  previewCard.append(previewTop, preview.el);
  draftColumn.append(previewCard, exportCard, gradingPanel.el);
  buildProfileCard();
  const unsubscribeProfileChanges = subscribeProfileChanges(subscribe, renderProfiles);
  workspace.append(controlsColumn, draftColumn, resultColumn);
  const mobileNavigation = createEl("nav", {
    className: "mobile-studio-nav",
    attrs: { "aria-label": copy(language, "Разделы редактора", "Editor sections") },
  });
  const mobileSections = [
    [controlsColumn, copy(language, "Мерки", "Measure")],
    [draftColumn, copy(language, "Лекало", "Pattern")],
    [resultColumn, copy(language, "Итоги", "Results")],
  ].map(([target, label], index) => {
    const button = createEl("button", {
      className: index === 0 ? "is-active" : "",
      text: label,
      attrs: { type: "button", "aria-current": index === 0 ? "page" : "false" },
    });
    button.addEventListener("click", () => {
      mobileSections.forEach((entry) => {
        entry.button.classList.toggle("is-active", entry.button === button);
        entry.button.setAttribute("aria-current", entry.button === button ? "page" : "false");
      });
      target.scrollIntoView({
        block: "start",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      });
    });
    mobileNavigation.appendChild(button);
    return { target, button };
  });
  const sectionObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      mobileSections.forEach((entry) => {
        const active = entry.target === visible.target;
        entry.button.classList.toggle("is-active", active);
        entry.button.setAttribute("aria-current", active ? "page" : "false");
      });
    }, { rootMargin: "-18% 0px -58% 0px", threshold: [0.01, 0.2, 0.5] })
    : null;
  mobileSections.forEach((entry) => sectionObserver?.observe(entry.target));

  const handleHistoryShortcut = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      restoreHistory(historyIndex - 1);
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      restoreHistory(historyIndex + 1);
    }
  };
  document.addEventListener("keydown", handleHistoryShortcut);

  page.append(header, workspace, mobileNavigation, toast.el);
  page.destroy = () => {
    document.removeEventListener("keydown", handleHistoryShortcut);
    unsubscribeProfileChanges();
    sectionObserver?.disconnect();
    preview.destroy?.();
    templateDialog.destroy();
  };
  refreshResult();
  return page;
}
