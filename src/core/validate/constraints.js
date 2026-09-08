export function validateField(value, field) {
  const errors = [];
  const label = typeof field.label === "object" ? field.label : { ru: String(field.label || "Поле"), en: String(field.label || "Field") };
  const message = (ru, en) => ({ ru, en });
  if (value === "" || value === null || Number.isNaN(value)) {
    errors.push(message(`Заполните «${label.ru || label.en}»`, `${label.en || label.ru} is required`));
    return errors;
  }
  if (typeof value !== "number") {
    errors.push(message(`Введите число в поле «${label.ru || label.en}»`, `${label.en || label.ru} must be a number`));
    return errors;
  }
  if (field.min !== undefined && value < field.min) {
    errors.push(message(`Минимум: ${field.min}`, `Minimum: ${field.min}`));
  }
  if (field.max !== undefined && value > field.max) {
    errors.push(message(`Максимум: ${field.max}`, `Maximum: ${field.max}`));
  }
  return errors;
}
