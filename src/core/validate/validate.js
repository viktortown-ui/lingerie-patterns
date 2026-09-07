import { validateField } from "./constraints.js";

export function validateSchema(schema, values) {
  const errors = {};
  schema.fields.forEach((field) => {
    const value = values[field.key];
    const numeric = value === "" ? value : Number(value);
    const fieldErrors = validateField(numeric, field);
    if (fieldErrors.length) {
      errors[field.key] = fieldErrors;
    }
  });
  (schema.options || []).forEach((option) => {
    const value = values[option.key];
    const allowed = (option.choices || []).some((choice) => String(choice.value) === String(value));
    if (!allowed) {
      errors[option.key] = [{
        ru: `Выберите допустимый вариант для «${option.label?.ru || option.label?.en || option.key}».`,
        en: `Choose a valid value for “${option.label?.en || option.label?.ru || option.key}”.`,
      }];
    }
  });
  if (typeof schema.validate === "function") {
    const relationalErrors = schema.validate(values) || {};
    Object.entries(relationalErrors).forEach(([key, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages];
      errors[key] = [...(errors[key] || []), ...list.filter(Boolean)];
    });
  }
  return errors;
}
