export function validateField(value, field) {
  const errors = [];
  if (value === "" || value === null || Number.isNaN(value)) {
    errors.push(`${field.label} is required`);
    return errors;
  }
  if (typeof value !== "number") {
    errors.push(`${field.label} must be a number`);
    return errors;
  }
  if (field.min !== undefined && value < field.min) {
    errors.push(`${field.label} must be at least ${field.min}`);
  }
  if (field.max !== undefined && value > field.max) {
    errors.push(`${field.label} must be at most ${field.max}`);
  }
  return errors;
}
