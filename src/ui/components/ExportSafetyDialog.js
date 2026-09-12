import { createEl } from "../../core/utils/dom.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

export function ExportSafetyDialog({ language }) {
  const dialog = createEl("dialog", {
    className: "library-dialog export-safety-dialog",
    attrs: {
      "aria-labelledby": "export-safety-title",
      "aria-describedby": "export-safety-description",
    },
  });
  const form = createEl("form", { className: "library-dialog-card export-safety-card", attrs: { method: "dialog" } });
  const heading = createEl("div", { className: "library-dialog-heading" });
  const formatLabel = createEl("span", { className: "eyebrow" });
  heading.append(
    formatLabel,
    createEl("h2", {
      text: copy(language, "Экспериментальная выкройка", "Experimental pattern"),
      attrs: { id: "export-safety-title" },
    }),
    createEl("p", {
      text: copy(
        language,
        "Формулы строят отправную точку, но форма чашки или посадка этой модели ещё не подтверждены серией физических примерок.",
        "The formulas create a starting point, but this model's cup shape or fit has not yet been validated through a physical fitting series.",
      ),
      attrs: { id: "export-safety-description" },
    }),
  );
  const warning = createEl("div", { className: "export-safety-warning" });
  const list = createEl("ul");
  [
    copy(language, "Сначала сшейте пробный образец из близкого по свойствам материала.", "First sew a toile in a material with similar properties."),
    copy(language, "Проверьте посадку и внесите контролируемые изменения до раскроя основной ткани.", "Check the fit and make controlled changes before cutting final fabric."),
    copy(language, "Файл будет явно помечен: не проверено для производства.", "The file will be clearly marked as not verified for production."),
  ].forEach((text) => list.appendChild(createEl("li", { text })));
  warning.appendChild(list);

  const acknowledgement = createEl("label", { className: "library-confirm export-safety-confirm" });
  const checkbox = createEl("input", { attrs: { type: "checkbox" } });
  const acknowledgementCopy = createEl("span", {
    text: copy(
      language,
      "Понимаю: это только основа для макета, а не гарантированная производственная выкройка.",
      "I understand this is a toile-only base, not a production-verified pattern.",
    ),
  });
  acknowledgement.append(checkbox, acknowledgementCopy);
  const status = createEl("p", { className: "library-dialog-status", attrs: { role: "alert", "aria-live": "assertive" } });
  const actions = createEl("div", { className: "library-dialog-actions" });
  const cancel = createEl("button", {
    className: "secondary-button",
    text: copy(language, "Отмена", "Cancel"),
    attrs: { type: "button" },
  });
  const proceed = createEl("button", {
    className: "primary-button",
    text: copy(language, "Скачать для макета", "Download for toile"),
    attrs: { type: "submit", disabled: "" },
  });
  actions.append(cancel, proceed);
  form.append(heading, warning, acknowledgement, status, actions);
  dialog.appendChild(form);
  document.body.appendChild(dialog);

  let pendingAction = null;
  const close = () => {
    pendingAction = null;
    if (dialog.open) dialog.close();
  };
  checkbox.addEventListener("change", () => {
    proceed.disabled = !checkbox.checked;
    status.textContent = "";
  });
  cancel.addEventListener("click", close);
  dialog.addEventListener("cancel", () => { pendingAction = null; });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!checkbox.checked || typeof pendingAction !== "function") {
      status.textContent = copy(language, "Подтвердите, что начнёте с пробного образца.", "Confirm that you will start with a toile.");
      return;
    }
    const action = pendingAction;
    pendingAction = null;
    dialog.close();
    action();
  });

  return {
    el: dialog,
    open({ format = "", onConfirm } = {}) {
      if (typeof onConfirm !== "function") return false;
      pendingAction = onConfirm;
      checkbox.checked = false;
      proceed.disabled = true;
      status.textContent = "";
      formatLabel.textContent = copy(language, `БЕЗОПАСНЫЙ ЭКСПОРТ • ${format}`, `SAFE EXPORT • ${format}`);
      dialog.showModal();
      window.setTimeout(() => checkbox.focus(), 0);
      return true;
    },
    close,
    destroy() {
      close();
      dialog.remove();
    },
  };
}
