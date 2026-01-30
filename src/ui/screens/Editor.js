import { createEl } from "../../core/utils/dom.js";
import { getModule } from "../../core/pattern/registry.js";
import { validateSchema } from "../../core/validate/validate.js";
import { svgExport } from "../../core/export/svgExport.js";
import { pdfExport } from "../../core/export/pdfExport.js";
import { uid } from "../../core/utils/id.js";
import { Form } from "../components/Form.js";
import { Preview } from "../components/Preview.js";
import { Toast } from "../components/Toast.js";
import { toggleTheme } from "../styles/theme.js";
import { upsertProfile, deleteProfile } from "../state/store.js";

export function Editor({ moduleId, state, onBack, onThemeToggle }) {
  const module = getModule(moduleId);
  if (!module) {
    const fallback = createEl("div", { className: "card", text: "Module not found." });
    return fallback;
  }

  const container = createEl("div", { className: "main" });
  const sidebar = createEl("div", { className: "card" });
  const previewCard = createEl("div", { className: "card" });
  const header = createEl("div", { className: "topbar" });
  const backButton = createEl("button", { className: "secondary", text: "Back" });
  const themeButton = createEl("button", { className: "secondary", text: "Toggle theme" });
  // Separate title nodes: a DOM node can't live in two places at once.
  const headerTitle = createEl("h2", { text: module.name });
  const sidebarTitle = createEl("h3", { text: "Measurements" });

  backButton.addEventListener("click", onBack);
  themeButton.addEventListener("click", () => {
    const theme = toggleTheme();
    onThemeToggle(theme);
  });

  header.append(backButton, headerTitle, themeButton);

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
    module.schema.fields.map((field) => `${field.label}: ${formValues[field.key]}${module.schema.unit}`);

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
      toast.show(error.message || "Draft failed");
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

  const profileTitle = createEl("h4", { text: "Profiles" });
  const profileList = createEl("div", { className: "profile-list" });

  const renderProfiles = () => {
    profileList.innerHTML = "";
    state.profiles.forEach((profile) => {
      const item = createEl("div", { className: "profile-item" });
      const info = createEl("div", { className: "summary" });
      info.textContent = `${profile.name} • ${new Date(profile.updatedAt).toLocaleString()}`;
      const actions = createEl("div");
      const loadBtn = createEl("button", { className: "secondary", text: "Load" });
      const deleteBtn = createEl("button", { className: "secondary", text: "Delete" });
      loadBtn.addEventListener("click", () => {
        Object.assign(formValues, profile.measurements);
        Object.assign(optionValues, profile.options);
        Object.assign(formState, formValues, optionValues);
        form.setValues(formState);
        renderProfiles();
        handleChange(formState, validateSchema(module.schema, formState));
        toast.show("Profile loaded");
      });
      deleteBtn.addEventListener("click", () => {
        deleteProfile(state, profile.id);
        renderProfiles();
      });
      actions.append(loadBtn, deleteBtn);
      item.append(info, actions);
      profileList.appendChild(item);
    });
  };

  const saveProfileButton = createEl("button", { text: "Save profile" });
  saveProfileButton.addEventListener("click", () => {
    const name = prompt("Profile name");
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
    toast.show("Profile saved");
  });

  renderProfiles();

  const actionBar = createEl("div", { className: "actions" });
  const exportSvgButton = createEl("button", { text: "Download SVG" });
  const exportPdfButton = createEl("button", { text: "Download PDF (A4)" });

  exportSvgButton.addEventListener("click", () => {
    if (!draft) return toast.show("Generate a draft first");
    const svg = svgExport(draft, measurementsSummary());
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = createEl("a", { attrs: { href: url, download: `${module.id}.svg` } });
    link.click();
    URL.revokeObjectURL(url);
  });

  exportPdfButton.addEventListener("click", () => {
    if (!draft) return toast.show("Generate a draft first");
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
