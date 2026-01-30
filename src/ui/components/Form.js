import { createEl } from "../../core/utils/dom.js";
import { validateSchema } from "../../core/validate/validate.js";
import { resolveText, t } from "../i18n/i18n.js";

export function Form({ schema, values, onChange, onSubmit }) {
  const form = createEl("form", { className: "form" });
  const errorsEl = createEl("div", { className: "error" });
  const inputs = new Map();

  const renderFields = () => {
    schema.fields.forEach((field) => {
      const group = createEl("div", { className: "form-group" });
      const label = createEl("label", { text: resolveText(field.label) });
      const input = createEl("input", {
        attrs: {
          type: "number",
          min: field.min,
          max: field.max,
          step: field.step ?? 1,
          value: values[field.key] ?? "",
        },
      });
      const helper = createEl("div", {
        className: "helper-text",
        text: resolveText(field.description || ""),
      });
      const error = createEl("div", { className: "error" });

      input.addEventListener("input", (event) => {
        values[field.key] = event.target.value === "" ? "" : Number(event.target.value);
        const fieldErrors = validateSchema(schema, values);
        error.textContent = fieldErrors[field.key]?.[0] || "";
        onChange(values, fieldErrors);
      });

      inputs.set(field.key, input);
      group.append(label, input, helper, error);
      form.appendChild(group);
    });

    if (schema.options?.length) {
      const optionTitle = createEl("h4", { text: t("form.options") });
      form.appendChild(optionTitle);

      schema.options.forEach((option) => {
        const group = createEl("div", { className: "form-group" });
        const label = createEl("label", { text: resolveText(option.label) });
        const select = createEl("select", {
          attrs: { value: values[option.key] ?? option.default },
        });
        option.choices.forEach((choice) => {
          const opt = createEl("option", {
            text: resolveText(choice.label),
            attrs: { value: choice.value },
          });
          if (values[option.key] === choice.value) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
        const helper = createEl("div", {
          className: "helper-text",
          text: resolveText(option.description || ""),
        });

        select.addEventListener("change", (event) => {
          values[option.key] = event.target.value;
          onChange(values, validateSchema(schema, values));
        });

        inputs.set(option.key, select);
        group.append(label, select, helper);
        form.appendChild(group);
      });
    }
  };

  renderFields();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const errors = validateSchema(schema, values);
    errorsEl.textContent = Object.values(errors).flat().join(" ");
    if (Object.keys(errors).length) return;
    onSubmit(values);
  });

  form.appendChild(errorsEl);
  const setValues = (nextValues) => {
    Object.entries(nextValues).forEach(([key, value]) => {
      const input = inputs.get(key);
      if (input) input.value = value;
    });
  };

  return { el: form, setValues };
}
