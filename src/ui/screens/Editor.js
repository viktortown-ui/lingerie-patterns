import { createEl } from "../../core/utils/dom.js";
import { getModule } from "../../core/pattern/registry.js";
import { validateSchema } from "../../core/validate/validate.js";
import { svgExport } from "../../core/export/svgExport.js";
import { pdfExport } from "../../core/export/pdfExport.js";
import { uid } from "../../core/utils/id.js";
import { Form } from "../components/Form.js";
import { Preview } from "../components/Preview.js";
import { Toast } from "../components/Toast.js";
import { resolveText, t } from "../i18n/i18n.js";
import { toggleTheme } from "../styles/theme.js";
import { downloadBlob } from "../utils/download.js";
import { upsertProfile, deleteProfile, updateDraft } from "../state/store.js";

export function Editor({
  moduleId,
  language,
  state,
  onBack,
  onThemeToggle,
  onLanguageToggle,
  onPaperSizeChange,
}) {
  const module = getModule(moduleId);
  if (!module) {
    const fallback = createEl("div", { className: "card", text: t("editor.moduleNotFound") });
    return fallback;
  }

  const container = createEl("div", { className: "main" });
  const sidebar = createEl("div", { className: "card" });
  const previewCard = createEl("div", { className: "card" });
  const header = createEl("div", { className: "topbar" });
  const backButton = createEl("button", { className: "secondary", text: t("editor.back") });
  const themeButton = createEl("button", { className: "secondary", text: t("home.toggleTheme") });
  const actions = createEl("div", { className: "topbar-actions" });
  const languageLabel = createEl("span", { className: "muted", text: t("home.language") });
  const languageSelect = createEl("select", { attrs: { value: language } });
  [
    { value: "ru", label: "RU" },
    { value: "en", label: "EN" },
  ].forEach((option) => {
    const opt = createEl("option", { text: option.label, attrs: { value: option.value } });
    if (language === option.value) opt.selected = true;
    languageSelect.appendChild(opt);
  });
  // Separate title nodes: a DOM node can't live in two places at once.
  const headerTitle = createEl("h2", { text: resolveText(module.name) });
  const sidebarTitle = createEl("h3", { text: t("editor.measurements") });

  backButton.addEventListener("click", onBack);
  themeButton.addEventListener("click", () => {
    const theme = toggleTheme();
    onThemeToggle(theme);
  });
  const handleLang = (event) => onLanguageToggle(String(event.target.value));
  languageSelect.addEventListener("change", handleLang);
  languageSelect.addEventListener("input", handleLang);

  actions.append(languageLabel, languageSelect, themeButton);
  header.append(backButton, headerTitle, actions);

  const formValues = { ...module.schema.defaults };
  const lastProfile = state.profiles.find((profile) => profile.id === state.lastProfileId);
  if (lastProfile?.measurements) {
    Object.assign(formValues, lastProfile.measurements);
  }
  const optionValues = { ...module.schema.optionDefaults };
  if (lastProfile?.options) {
    Object.assign(optionValues, lastProfile.options);
  }
  const storedDraft = state.draft && state.draft.moduleId === moduleId ? state.draft : null;
  if (storedDraft?.measurements) {
    Object.assign(formValues, storedDraft.measurements);
  }
  if (storedDraft?.options) {
    Object.assign(optionValues, storedDraft.options);
  }
  const formState = { ...formValues, ...optionValues };

  let draft = null;
  let errors = validateSchema(module.schema, formValues);

  const resolveTextEn = (value) => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return value.en || "";
    return String(value);
  };

  const resolveModuleName = () => {
    const draftTitle = draft?.meta?.title;
    const moduleSchemaName = module.schema?.name;
    const candidate =
      (draftTitle && draftTitle.en) ||
      (typeof draftTitle === "string" ? draftTitle : "") ||
      (moduleSchemaName && moduleSchemaName.en) ||
      (typeof moduleSchemaName === "string" ? moduleSchemaName : "");
    const resolved = resolveTextEn(candidate).trim();
    if (!resolved || resolved.includes("module.")) return "";
    return resolved;
  };

  const resolveOptionValueLabel = (option, rawValue) => {
    const fallbackValue = rawValue ?? option.default;
    const matchedChoice = option.choices?.find(
      (choice) => String(choice.value) === String(fallbackValue)
    );
    if (matchedChoice) return resolveTextEn(matchedChoice.label);
    if (fallbackValue == null) return "";
    return resolveTextEn(fallbackValue);
  };

  const resolveSeamAllowanceLabel = () => {
    const seamValue = Number(optionValues.seamAllowance ?? 0);
    if (!Number.isFinite(seamValue) || seamValue <= 0) {
      return t("export.seamAllowanceOff");
    }
    return `${seamValue}mm`;
  };

  const measurementsSummary = () => {
    const measurements = module.schema.fields.map((field) => {
      const label = field.code
        ? `${resolveText(field.label)} (${field.code})`
        : resolveText(field.label);
      return `${label}: ${formValues[field.key]}${module.schema.unit}`;
    });
    const seamSummary = `${t("export.seamAllowanceLabel")}: ${resolveSeamAllowanceLabel()}`;
    return [...measurements, seamSummary];
  };

  let previewSettings = {
    scaleLabels: storedDraft?.preview?.scaleLabels,
    seamHighlight: storedDraft?.preview?.seamHighlight,
  };

  // Created later below. Declared here to avoid a temporal-dead-zone crash
  // when preview callbacks fire during the initial render.
  let paperSelect = null;

  const preview = Preview({
    getDraft: () => draft,
    getSummary: measurementsSummary,
    settings: previewSettings,
    onSettingsChange: (nextSettings) => {
      previewSettings = { ...previewSettings, ...nextSettings };
      updateDraft({
        moduleId,
        measurements: { ...formValues },
        options: { ...optionValues },
        paperSize: paperSelect?.value || storedDraft?.paperSize || state.paperSize || "A4",
        preview: previewSettings,
      });
    },
  });
  const toast = Toast();
  let lastWarning = "";

  const handleChange = (values, fieldErrors) => {
    module.schema.fields.forEach((field) => {
      formValues[field.key] = values[field.key];
    });
    module.schema.options?.forEach((option) => {
      optionValues[option.key] = values[option.key];
    });
    errors = fieldErrors;
    updateDraft({
      moduleId,
      measurements: { ...formValues },
      options: { ...optionValues },
      paperSize: paperSelect?.value || storedDraft?.paperSize || state.paperSize || "A4",
      preview: previewSettings,
    });
    if (Object.keys(errors).length) return;
    try {
      draft = module.draft(values, optionValues);
      preview.render();
      const warningText = draft?.meta?.warnings?.length
        ? resolveText(draft.meta.warnings[0])
        : "";
      if (warningText && warningText !== lastWarning) {
        lastWarning = warningText;
        toast.show(warningText);
      }
    } catch (error) {
      toast.show(error.message || t("editor.draftFailed"));
    }
  };

  const form = Form({
    schema: module.schema,
    values: formState,
    onChange: handleChange,
    onSubmit: () => {
      handleChange(formState, validateSchema(module.schema, formState));
    },
  });

  const profileTitle = createEl("h4", { text: t("editor.profiles") });
  const profileList = createEl("div", { className: "profile-list" });

  const renderProfiles = () => {
    profileList.innerHTML = "";
    state.profiles.forEach((profile) => {
      const item = createEl("div", { className: "profile-item" });
      const info = createEl("div", { className: "summary" });
      info.textContent = `${profile.name} • ${new Date(profile.updatedAt).toLocaleString()}`;
      const actionsRow = createEl("div");
      const loadBtn = createEl("button", { className: "secondary", text: t("editor.load") });
      const deleteBtn = createEl("button", { className: "secondary", text: t("editor.delete") });
      loadBtn.addEventListener("click", () => {
        Object.assign(formValues, profile.measurements);
        Object.assign(optionValues, profile.options);
        Object.assign(formState, formValues, optionValues);
        form.setValues(formState);
        renderProfiles();
        handleChange(formState, validateSchema(module.schema, formState));
        toast.show(t("editor.profileLoaded"));
      });
      deleteBtn.addEventListener("click", () => {
        deleteProfile(state, profile.id);
        renderProfiles();
      });
      actionsRow.append(loadBtn, deleteBtn);
      item.append(info, actionsRow);
      profileList.appendChild(item);
    });
  };

  const saveProfileButton = createEl("button", { text: t("editor.saveProfile") });
  saveProfileButton.addEventListener("click", () => {
    const name = prompt(t("editor.profileNamePrompt"));
    if (!name) return;
    const profile = {
      id: uid("profile"),
      name,
      measurements: { ...formValues },
      options: { ...optionValues },
      updatedAt: new Date().toISOString(),
    };
    upsertProfile(state, profile);
    renderProfiles();
    toast.show(t("editor.profileSaved"));
  });

  renderProfiles();

  const actionBar = createEl("div", { className: "actions" });
  const exportSvgButton = createEl("button", { text: t("editor.downloadSvg") });
  const exportPdfButton = createEl("button", { text: t("editor.downloadPdf") });
  const paperLabel = createEl("span", { className: "muted", text: t("editor.paperSize") });
  const initialPaperSize = storedDraft?.paperSize || state.paperSize || "A4";
  paperSelect = createEl("select", {
    attrs: { value: initialPaperSize },
  });
  [
    { value: "A4", label: t("editor.paperSizeA4") },
    { value: "A3", label: t("editor.paperSizeA3") },
  ].forEach((option) => {
    const opt = createEl("option", { text: option.label, attrs: { value: option.value } });
    if (initialPaperSize === option.value) opt.selected = true;
    paperSelect.appendChild(opt);
  });
  const paperHelp = createEl("div", { className: "helper-text", text: t("editor.paperHelp") });
  const tracingHelp = createEl("div", { className: "helper-text", text: t("editor.tracingHelp") });
  const paperGroup = createEl("div", { className: "action-group" });
  paperGroup.append(paperLabel, paperSelect, paperHelp, tracingHelp);
  const downloadHint = createEl("div", {
    className: "helper-text",
    text: "",
  });
  downloadHint.hidden = true;
  const showDownloadHint = (() => {
    let timeout = null;
    return (message) => {
      if (!message) return;
      downloadHint.textContent = message;
      downloadHint.hidden = false;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        downloadHint.hidden = true;
      }, 6000);
    };
  })();
  const handlePaperChange = (event) => {
    const nextPaper = String(event.target.value);
    onPaperSizeChange?.(nextPaper);
    updateDraft({
      moduleId,
      measurements: { ...formValues },
      options: { ...optionValues },
      paperSize: nextPaper,
      preview: previewSettings,
    });
  };
  paperSelect.addEventListener("change", handlePaperChange);
  paperSelect.addEventListener("input", handlePaperChange);

  exportSvgButton.addEventListener("click", () => {
    if (!draft) return toast.show(t("editor.generateDraftFirst"));
    const svg = svgExport(draft, measurementsSummary(), {
      resolveText,
      labels: {
        unitsLabel: t("export.unitsLabel"),
        seamAllowanceLabel: t("export.seamAllowanceLabel"),
        seamAllowanceOn: t("export.seamAllowanceOn"),
        seamAllowanceOff: t("export.seamAllowanceOff"),
        legendLines: t("export.legendShort"),
        calibration: t("export.calibrationMark"),
        calibrationLarge: t("export.calibrationLarge"),
        patternTitle: t("export.patternTitle"),
      },
    });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    downloadBlob({
      blob,
      filename: `${module.id}.svg`,
      mimeType: "image/svg+xml",
      onFallbackMessage: () => showDownloadHint(t("editor.downloadFallback")),
    });
  });

  exportPdfButton.addEventListener("click", () => {
    if (!draft) return toast.show(t("editor.generateDraftFirst"));
    const optionsSummary = module.schema.options?.length
      ? module.schema.options
          .map((option) => {
            const valueLabel = resolveOptionValueLabel(option, optionValues[option.key]);
            return `${resolveTextEn(option.label)}: ${valueLabel}`;
          })
          .filter(Boolean)
          .join(", ")
      : "No options selected";
    const seamAllowanceValue = Number(optionValues.seamAllowance ?? 0);
    const seamSummary =
      Number.isFinite(seamAllowanceValue) && seamAllowanceValue > 0
        ? `${seamAllowanceValue}mm`
        : "0mm";
    const moduleName = resolveModuleName();
    const headerTitleText = resolveTextEn(draft?.meta?.title).trim();
    const infoModuleName = moduleName && moduleName !== headerTitleText ? moduleName : "";

    const { data } = pdfExport(draft, {
      marginMm: 10,
      paperSize: paperSelect?.value || state.paperSize || "A4",
      resolveText: resolveTextEn,
      info: {
        moduleName: infoModuleName,
        generatedAt: new Date().toISOString(),
        optionsSummary,
        seamAllowance: seamSummary,
        seamAllowanceApplied: draft.meta?.seamAllowanceApplied,
        legendText: "Legend: cut line = solid, stitch line = dashed",
        instructionText:
          "Print at 100% / Actual size. Disable 'Fit to page'. Measure the 50mm and 100mm marks with a ruler.",
      },
      labels: {
        patternLabel: "Pattern",
        generatedLabel: "Generated",
        optionsLabel: "Options",
        seamAllowanceLabel: "Seam allowance",
      },
    });
    downloadBlob({
      blob: data,
      filename: `${module.id}.pdf`,
      mimeType: "application/pdf",
      onFallbackMessage: () => showDownloadHint(t("editor.downloadFallback")),
    });
  });

  actionBar.append(paperGroup, exportSvgButton, exportPdfButton, downloadHint);

  sidebar.append(sidebarTitle, form.el, profileTitle, profileList, saveProfileButton);
  previewCard.append(preview.el);

  container.append(header, sidebar, previewCard, actionBar, toast.el);

  handleChange(formValues, errors);

  return container;
}
