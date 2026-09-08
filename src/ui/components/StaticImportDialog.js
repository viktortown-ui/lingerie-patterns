import { createEl } from "../../core/utils/dom.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function field(label, control, helper = "") {
  const wrapper = createEl("label", { className: "library-field" });
  wrapper.append(createEl("span", { className: "library-field-label", text: label }), control);
  if (helper) wrapper.appendChild(createEl("small", { text: helper }));
  return wrapper;
}

function displayFileName(name) {
  return String(name || "pattern.svg").replace(/\.svg$/iu, "").trim().slice(0, 120) || "SVG pattern";
}

export function StaticImportDialog({ language, onSave }) {
  const dialog = createEl("dialog", {
    className: "library-dialog",
    attrs: {
      "aria-labelledby": "static-import-dialog-title",
      "aria-describedby": "static-import-dialog-description",
    },
  });
  const form = createEl("form", { className: "library-dialog-card", attrs: { method: "dialog" } });
  const heading = createEl("div", { className: "library-dialog-heading" });
  heading.append(
    createEl("span", { className: "eyebrow", text: copy(language, "БЕЗОПАСНЫЙ ИМПОРТ", "SAFE IMPORT") }),
    createEl("h2", {
      text: copy(language, "Добавить статическое SVG-лекало", "Add a static SVG pattern"),
      attrs: { id: "static-import-dialog-title" },
    }),
    createEl("p", {
      attrs: { id: "static-import-dialog-description" },
      text: copy(
        language,
        "Приложение уже удалило исходную разметку и оставило только проверенные линии. Импорт не создаёт формулы, размеры или градацию.",
        "The original markup has already been discarded, leaving only validated geometry. Import does not create formulas, sizes, or grading.",
      ),
    }),
  );

  const importSummary = createEl("div", { className: "import-summary" });
  const nameInput = createEl("input", { attrs: { type: "text", maxlength: "120", required: "", autocomplete: "off" } });
  const descriptionInput = createEl("textarea", { attrs: { rows: "3", maxlength: "600" } });
  const authorInput = createEl("input", { attrs: { type: "text", maxlength: "120", autocomplete: "name" } });
  const sourceInput = createEl("input", { attrs: { type: "url", maxlength: "500", inputmode: "url", placeholder: "https://…" } });
  const licenseSelect = createEl("select");
  [
    ["private", copy(language, "Личный файл — не распространять", "Private file — do not redistribute")],
    ["CC0-1.0", "CC0 1.0"],
    ["CC-BY-4.0", "CC BY 4.0"],
    ["MIT", "MIT"],
  ].forEach(([value, label]) => licenseSelect.appendChild(createEl("option", { text: label, attrs: { value } })));

  const rightsControl = createEl("label", { className: "library-confirm" });
  const rightsInput = createEl("input", { attrs: { type: "checkbox", required: "" } });
  rightsControl.append(
    rightsInput,
    createEl("span", {
      text: copy(
        language,
        "Подтверждаю, что файл мой либо у меня есть право его использовать. Я проверю масштаб до раскроя.",
        "I confirm that I own this file or have permission to use it. I will verify scale before cutting.",
      ),
    }),
  );

  const fields = createEl("div", { className: "library-dialog-fields" });
  fields.append(
    field(copy(language, "Название", "Name"), nameInput),
    field(copy(language, "Описание", "Description"), descriptionInput),
    field(copy(language, "Автор", "Author"), authorInput),
    field(copy(language, "Источник", "Source"), sourceInput),
    field(copy(language, "Условия использования", "Usage terms"), licenseSelect),
    rightsControl,
  );

  const status = createEl("p", {
    className: "library-dialog-status",
    attrs: { role: "alert", "aria-live": "assertive" },
  });
  const actions = createEl("div", { className: "library-dialog-actions" });
  const cancel = createEl("button", {
    className: "secondary-button",
    text: copy(language, "Отмена", "Cancel"),
    attrs: { type: "button" },
  });
  const save = createEl("button", {
    className: "primary-button",
    text: copy(language, "Добавить в мою библиотеку", "Add to my library"),
    attrs: { type: "submit" },
  });
  actions.append(cancel, save);
  form.append(heading, importSummary, fields, status, actions);
  dialog.appendChild(form);

  const formControls = [nameInput, descriptionInput, authorInput, sourceInput, licenseSelect, rightsInput, cancel, save];
  let pending = null;
  let saving = false;
  const setSaving = (value) => {
    saving = value;
    formControls.forEach((control) => {
      control.disabled = value;
    });
    if (value) form.setAttribute("aria-busy", "true");
    else form.removeAttribute("aria-busy");
  };
  const close = () => {
    if (saving) return false;
    pending = null;
    if (dialog.open) dialog.close();
    return true;
  };
  cancel.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("cancel", (event) => {
    if (saving) event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || !pending || !form.reportValidity()) return;
    status.textContent = "";
    setSaving(true);
    let saved = false;
    try {
      await onSave({
        ...pending,
        metadata: {
          name: nameInput.value.trim(),
          description: descriptionInput.value.trim(),
          author: authorInput.value.trim(),
          sourceUrl: sourceInput.value.trim() || null,
          license: licenseSelect.value,
        },
      });
      pending = null;
      saved = true;
    } catch (error) {
      status.textContent = error?.message || copy(language, "Не удалось сохранить SVG-лекало.", "Could not save the SVG pattern.");
    } finally {
      setSaving(false);
      if (saved) close();
    }
  });
  document.body.appendChild(dialog);

  return {
    el: dialog,
    open({ file, geometry }) {
      if (saving || dialog.open) return false;
      pending = { file, geometry };
      form.reset();
      status.textContent = "";
      nameInput.value = displayFileName(file?.name);
      licenseSelect.value = "private";
      importSummary.replaceChildren();
      const millimetersPerUnit = geometry?.calibration?.millimetersPerUnit;
      const calibrationKnown = geometry?.calibration?.requiresCalibration === false
        && typeof millimetersPerUnit === "number"
        && Number.isFinite(millimetersPerUnit)
        && millimetersPerUnit >= 1e-6
        && millimetersPerUnit <= 1e6;
      [
        [copy(language, "Файл", "File"), file?.name || "pattern.svg"],
        [copy(language, "Контуры", "Entities"), String(geometry?.statistics?.entityCount ?? geometry?.entities?.length ?? 0)],
        [copy(language, "Команды линий", "Path commands"), String(geometry?.statistics?.pathCommandCount ?? 0)],
        [
          copy(language, "Масштаб", "Scale"),
          calibrationKnown
            ? copy(language, `распознан: ${geometry.calibration.millimetersPerUnit} мм/ед.`, `detected: ${geometry.calibration.millimetersPerUnit} mm/unit`)
            : copy(language, "не распознан — обязательна ручная проверка", "not detected — manual verification required"),
        ],
      ].forEach(([label, value]) => {
        const item = createEl("div");
        item.append(createEl("span", { text: label }), createEl("strong", { text: value }));
        importSummary.appendChild(item);
      });
      importSummary.classList.toggle("has-warning", !calibrationKnown);
      dialog.showModal();
      window.setTimeout(() => nameInput.focus(), 0);
      return true;
    },
    close,
    destroy() {
      pending = null;
      close();
      dialog.remove();
    },
  };
}
