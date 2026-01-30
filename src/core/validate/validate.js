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
  return errors;
}
