import { createEl } from "../../core/utils/dom.js";
import {
  evaluateMeasurementVerification,
  invalidateMeasurementVerification,
  measurementVerificationFields,
  sanitizeMeasurementVerificationForSchema,
} from "../../core/validate/measurementVerification.js";
import { getLocale, resolveText } from "../i18n/i18n.js";

const copy = (ru, en) => (getLocale() === "ru" ? ru : en);

export function MeasurementVerification({
  schema,
  measurements,
  value = {},
  onChange = () => {},
}) {
  const fields = measurementVerificationFields(schema);
  const sanitize = (raw) => sanitizeMeasurementVerificationForSchema(schema, raw);
  const details = createEl("details", { className: "measurement-verification" });
  const summary = createEl("summary", { className: "measurement-verification-summary" });
  const summaryCopy = createEl("span", { className: "measurement-verification-summary-copy" });
  const summaryTitle = createEl("strong");
  const summaryStatus = createEl("span", { attrs: { "aria-live": "polite" } });
  summaryCopy.append(summaryTitle, summaryStatus);
  const summaryBadge = createEl("span", { className: "measurement-verification-badge" });
  summary.append(summaryCopy, summaryBadge);
  details.appendChild(summary);

  const body = createEl("div", { className: "measurement-verification-body" });
  body.append(
    createEl("p", {
      className: "measurement-verification-intro",
      text: copy(
        "Снимите мерки второй раз, не подсматривая первое значение. Это выявляет случайные ошибки, но не является гарантией посадки — пробный образец всё равно обязателен.",
        "Measure a second time without looking at the first value. This catches accidental errors but cannot guarantee fit; a toile is still required.",
      ),
    }),
  );

  let record = sanitize(value);
  let currentMeasurements = measurements || {};
  let currentEvaluation = evaluateMeasurementVerification(schema, currentMeasurements, record);

  const methodGroup = createEl("fieldset", { className: "measurement-method" });
  methodGroup.appendChild(createEl("legend", { text: copy("Кто выполнил повторный замер?", "Who took the repeat measurement?") }));
  const methodChoices = createEl("div", { className: "choice-grid measurement-method-choices" });
  const methodRadios = [];
  [
    ["self", copy("Я самостоятельно", "I measured myself")],
    ["helper", copy("Помощник", "A helper measured me")],
  ].forEach(([method, labelText]) => {
    const label = createEl("label", { className: "choice-control" });
    const input = createEl("input", {
      attrs: {
        type: "radio",
        name: `${schema.id}-measurement-method`,
        value: method,
      },
    });
    input.checked = record.method === method;
    label.append(input, createEl("span", { className: "choice-face", text: labelText }));
    methodChoices.appendChild(label);
    methodRadios.push({ method, input });
  });
  methodGroup.appendChild(methodChoices);
  body.appendChild(methodGroup);

  const grid = createEl("div", { className: "measurement-repeat-grid" });
  const rowControls = new Map();
  fields.forEach((field) => {
    const row = createEl("div", { className: "measurement-repeat-row" });
    const heading = createEl("div", { className: "measurement-repeat-heading" });
    const label = createEl("label", {
      text: resolveText(field.label),
      attrs: { for: `${schema.id}-${field.key}-repeat` },
    });
    if (field.code) label.appendChild(createEl("span", { className: "field-code", text: field.code }));
    const original = createEl("span", { className: "measurement-original" });
    heading.append(label, original);

    const inputWrap = createEl("div", { className: "number-input-wrap measurement-repeat-input" });
    const input = createEl("input", {
      attrs: {
        id: `${schema.id}-${field.key}-repeat`,
        type: "number",
        inputmode: "decimal",
        min: field.min,
        max: field.max,
        step: field.step ?? 0.5,
        value: record.repeated[field.key] ?? "",
        "aria-label": copy(`Повторно: ${resolveText(field.label)}`, `Repeat: ${resolveText(field.label)}`),
      },
    });
    inputWrap.append(input, createEl("span", { text: schema.unit === "cm" ? "см" : schema.unit, attrs: { "aria-hidden": "true" } }));
    const status = createEl("span", { className: "measurement-repeat-status", attrs: { "aria-live": "polite" } });
    row.append(heading, inputWrap, status);
    grid.appendChild(row);
    rowControls.set(field.key, { row, original, input, status });
  });
  body.appendChild(grid);
  details.appendChild(body);

  function render() {
    currentEvaluation = evaluateMeasurementVerification(schema, currentMeasurements, record);
    summaryTitle.textContent = copy("Проверка мерок", "Measurement check");
    summaryBadge.textContent = `${currentEvaluation.confirmedCount}/${currentEvaluation.total}`;
    summaryBadge.className = `measurement-verification-badge is-${currentEvaluation.status}`;
    details.classList.toggle("has-mismatch", currentEvaluation.status === "mismatch");
    details.classList.toggle("is-verified", currentEvaluation.status === "verified");
    summaryStatus.textContent = currentEvaluation.status === "verified"
      ? copy("Повторный замер совпал", "Repeat measurements match")
      : currentEvaluation.status === "mismatch"
        ? copy("Есть расхождение — перепроверьте", "A value differs; recheck it")
        : copy("Нужно заполнить перед экспортом", "Required before export");

    currentEvaluation.checks.forEach((check) => {
      const control = rowControls.get(check.key);
      if (!control) return;
      const unit = schema.unit === "cm" ? copy("см", "cm") : schema.unit;
      control.original.textContent = check.original == null
        ? copy("Первое значение не задано", "First value is missing")
        : check.repeatedValue == null
          ? copy("Первое значение сохранено и пока скрыто", "First value saved and hidden for now")
          : copy(`Первое: ${check.original} ${unit}`, `First: ${check.original} ${unit}`);
      control.row.classList.toggle("is-confirmed", check.status === "confirmed");
      control.row.classList.toggle("has-mismatch", check.status === "mismatch");
      control.input.setAttribute("aria-invalid", check.status === "mismatch" ? "true" : "false");
      control.status.textContent = check.repeatedValue != null && !check.repeatedInRange
        ? copy(
            `Повтор должен быть от ${fields.find((field) => field.key === check.key)?.min} до ${fields.find((field) => field.key === check.key)?.max} ${unit}`,
            `Repeat must be between ${fields.find((field) => field.key === check.key)?.min} and ${fields.find((field) => field.key === check.key)?.max} ${unit}`,
          )
        : check.status === "confirmed"
        ? copy("Совпало", "Matches")
        : check.status === "mismatch"
          ? copy(
              `Разница ${Number(check.difference.toFixed(3))} ${unit}; допустимо до ${check.tolerance} ${unit}`,
              `Difference ${Number(check.difference.toFixed(3))} ${unit}; maximum ${check.tolerance} ${unit}`,
            )
          : copy("Введите повторное значение", "Enter the repeat value");
    });
  }

  function emit() {
    render();
    onChange(sanitize(record), currentEvaluation);
  }

  methodRadios.forEach(({ method, input }) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      record = { ...record, method };
      emit();
    });
  });
  rowControls.forEach((control, key) => {
    control.input.addEventListener("input", () => {
      const normalized = String(control.input.value).replace(",", ".");
      const repeated = { ...record.repeated };
      if (normalized === "" || !Number.isFinite(Number(normalized))) delete repeated[key];
      else repeated[key] = Number(normalized);
      record = sanitize({ ...record, repeated });
      emit();
    });
  });

  render();
  return {
    el: details,
    refresh(nextMeasurements) {
      currentMeasurements = nextMeasurements || {};
      render();
      return currentEvaluation;
    },
    setValue(nextValue) {
      record = sanitize(nextValue);
      methodRadios.forEach(({ method, input }) => { input.checked = record.method === method; });
      rowControls.forEach((control, key) => { control.input.value = record.repeated[key] ?? ""; });
      render();
      return currentEvaluation;
    },
    getValue: () => sanitize(record),
    getEvaluation: () => currentEvaluation,
    invalidate(key, nextMeasurements = currentMeasurements) {
      if (!rowControls.has(key)) return currentEvaluation;
      record = invalidateMeasurementVerification(schema, record, key);
      rowControls.get(key).input.value = "";
      currentMeasurements = nextMeasurements || {};
      emit();
      return currentEvaluation;
    },
    reveal() {
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        if (!currentEvaluation.methodConfirmed) {
          methodRadios[0]?.input?.focus({ preventScroll: true });
          return;
        }
        const firstProblem = currentEvaluation.checks.find((check) => check.status !== "confirmed");
        rowControls.get(firstProblem?.key)?.input?.focus({ preventScroll: true });
      }, 0);
    },
  };
}
