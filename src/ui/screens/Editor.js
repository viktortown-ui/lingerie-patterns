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
import { upsertProfile, deleteProfile } from "../state/store.js";

export function Editor({ moduleId, language, state, onBack, onThemeToggle, onLanguageToggle }) {
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
  const formState = { ...formValues, ...optionValues };

  let draft = null;
  let errors = validateSchema(module.schema, formValues);

  const measurementsSummary = () =>
    module.schema.fields.map(
      (field) => `${resolveText(field.label)}: ${formValues[field.key]}${module.schema.unit}`
    );

  const preview = Preview({
    getDraft: () => draft,
    getSummary: measurementsSummary,
  });
  const toast = Toast();

  const handleChange = (values, fieldErrors) => {
    module.schema.fields.forEach((field) => {
      formValues[field.key] = values[field.key];
    });
    module.schema.options?.forEach((option) => {
      optionValues[option.key] = values[option.key];
    });
    errors = fieldErrors;
    if (Object.keys(errors).length) return;
    try {
      draft = module.draft(values, optionValues);
      preview.render();
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

  exportSvgButton.addEventListener("click", () => {
    if (!draft) return toast.show(t("editor.generateDraftFirst"));
    const svg = svgExport(draft, measurementsSummary());
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = createEl("a", { attrs: { href: url, download: `${module.id}.svg` } });
    link.click();
    URL.revokeObjectURL(url);
  });

  exportPdfButton.addEventListener("click", () => {
    if (!draft) return toast.show(t("editor.generateDraftFirst"));
    const { data } = pdfExport(draft, { marginMm: 10 });
    const url = URL.createObjectURL(data);
    const link = createEl("a", { attrs: { href: url, download: `${module.id}.pdf` } });
    link.click();
    URL.revokeObjectURL(url);
  });

  actionBar.append(exportSvgButton, exportPdfButton);

  sidebar.append(sidebarTitle, form.el, profileTitle, profileList, saveProfileButton);
  previewCard.append(preview.el);

  container.append(header, sidebar, previewCard, actionBar, toast.el);

  handleChange(formValues, errors);

  return container;
}
