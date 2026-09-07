import { createEl } from "../../core/utils/dom.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function field(label, control, helper = "") {
  const wrapper = createEl("label", { className: "library-field" });
  wrapper.appendChild(createEl("span", { className: "library-field-label", text: label }));
  wrapper.appendChild(control);
  if (helper) wrapper.appendChild(createEl("small", { text: helper }));
  return wrapper;
}

export function TemplateSaveDialog({ language, onSave }) {
  const dialog = createEl("dialog", {
    className: "library-dialog",
    attrs: {
      "aria-labelledby": "template-dialog-title",
      "aria-describedby": "template-dialog-description",
    },
  });
  const form = createEl("form", { className: "library-dialog-card", attrs: { method: "dialog" } });
  const heading = createEl("div", { className: "library-dialog-heading" });
  heading.append(
    createEl("span", { className: "eyebrow", text: copy(language, "МОЙ ШАБЛОН", "MY TEMPLATE") }),
    createEl("h2", {
      text: copy(language, "Сохранить фасон без личных мерок", "Save the style without personal measurements"),
      attrs: { id: "template-dialog-title" },
    }),
    createEl("p", {
      attrs: { id: "template-dialog-description" },
      text: copy(
        language,
        "Сохранятся только параметры фасона, обработки и безопасные поправки A/B/C. Мерки тела не попадут в файл.",
        "Only style, construction, and bounded A/B/C adjustments are saved. Body measurements are never included.",
      ),
    }),
  );

  const nameInput = createEl("input", {
    attrs: {
      type: "text",
      maxlength: "100",
      required: "",
      autocomplete: "off",
      placeholder: copy(language, "Например: Бразилиана с высокой посадкой", "For example: High-rise Brazilian"),
    },
  });
  const descriptionInput = createEl("textarea", {
    attrs: {
      maxlength: "500",
      rows: "3",
      placeholder: copy(language, "Коротко опишите посадку и материал", "Briefly describe the fit and fabric"),
    },
  });
  const authorInput = createEl("input", {
    attrs: {
      type: "text",
      maxlength: "100",
      autocomplete: "name",
      placeholder: copy(language, "Ваше имя или псевдоним", "Your name or alias"),
    },
  });
  const sourceInput = createEl("input", {
    attrs: {
      type: "url",
      maxlength: "500",
      inputmode: "url",
      placeholder: "https://…",
    },
  });
  const licenseSelect = createEl("select");
  [
    ["private", copy(language, "Личный — не публиковать", "Private — do not publish")],
    ["CC0-1.0", "CC0 1.0"],
    ["CC-BY-4.0", "CC BY 4.0"],
  ].forEach(([value, label]) => {
    licenseSelect.appendChild(createEl("option", { text: label, attrs: { value } }));
  });

  const rightsControl = createEl("label", { className: "library-confirm" });
  const rightsInput = createEl("input", { attrs: { type: "checkbox", required: "" } });
  rightsControl.append(
    rightsInput,
    createEl("span", {
      text: copy(
        language,
        "Подтверждаю: это мои настройки либо у меня есть право их сохранять и распространять на выбранных условиях.",
        "I confirm these are my settings or I have permission to save and share them under the selected terms.",
      ),
    }),
  );

  const fields = createEl("div", { className: "library-dialog-fields" });
  fields.append(
    field(copy(language, "Название", "Name"), nameInput),
    field(copy(language, "Описание", "Description"), descriptionInput),
    field(copy(language, "Автор", "Author"), authorInput),
    field(
      copy(language, "Источник или страница проекта", "Source or project page"),
      sourceInput,
      copy(language, "Необязательно. Ссылка сохраняется для происхождения шаблона.", "Optional. The link is retained as provenance."),
    ),
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
    text: copy(language, "Сохранить шаблон", "Save template"),
    attrs: { type: "submit" },
  });
  actions.append(cancel, save);
  form.append(heading, fields, status, actions);
  dialog.appendChild(form);

  const formControls = [nameInput, descriptionInput, authorInput, sourceInput, licenseSelect, rightsInput, cancel, save];
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
    if (saving || !form.reportValidity()) return;
    status.textContent = "";
    setSaving(true);
    let saved = false;
    try {
      await onSave({
        name: nameInput.value.trim(),
        description: descriptionInput.value.trim(),
        author: authorInput.value.trim(),
        sourceUrl: sourceInput.value.trim() || null,
        license: licenseSelect.value,
      });
      saved = true;
    } catch (error) {
      status.textContent = error?.message || copy(language, "Не удалось сохранить шаблон.", "Could not save the template.");
    } finally {
      setSaving(false);
      if (saved) close();
    }
  });

  document.body.appendChild(dialog);

  return {
    el: dialog,
    open(defaultName = "") {
      if (saving) return false;
      form.reset();
      status.textContent = "";
      nameInput.value = defaultName;
      licenseSelect.value = "private";
      dialog.showModal();
      window.setTimeout(() => nameInput.focus(), 0);
      return true;
    },
    close,
    destroy() {
      close();
      dialog.remove();
    },
  };
}
