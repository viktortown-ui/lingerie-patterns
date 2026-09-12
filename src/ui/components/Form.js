import { createEl } from "../../core/utils/dom.js";
import { validateSchema } from "../../core/validate/validate.js";
import { getLocale, resolveText } from "../i18n/i18n.js";
import { MeasurementVerification } from "./MeasurementVerification.js";

const copy = (ru, en) => (getLocale() === "ru" ? ru : en);

function displayError(error) {
  if (!error) return "";
  return typeof error === "string" ? error : resolveText(error);
}

function measurementGuide(bodyRegion = "lower", schemaId = "") {
  const guide = createEl("div", { className: "measurement-guide" });
  if (schemaId === "bralette_soft") {
    guide.innerHTML = `
    <div class="measurement-figure" aria-hidden="true">
      <svg viewBox="0 0 220 290">
        <path class="body-shape" d="M87 18c-12 8-16 23-13 39-18 14-31 33-35 59l26 18 10-20-7 146h84l-7-146 10 20 26-18c-4-26-17-45-35-59 3-16-1-31-13-39-13-9-33-9-46 0Z"/>
        <path class="measure-line" d="M55 106c37 12 73 12 110 0M58 132c35 10 69 10 104 0"/>
        <path class="measure-vertical" d="M110 42v63"/><path class="measure-arc" d="M85 102c17-8 33-8 50 0"/>
        <text x="24" y="108">OG</text><text x="20" y="135">OPG</text><text x="116" y="78">VG</text><text x="91" y="99">CG</text>
      </svg>
    </div>
    <div class="measurement-guide-copy"><strong>${copy("Только четыре работающие мерки", "Only four measurements used")}</strong><span>${copy("ОГ и ОПГ держите горизонтально; ВГ снимайте от основания шеи до центра груди; ЦГ — между центрами. Повторите каждую мерку ниже.", "Keep bust and underbust level; measure bust height from neck base to bust point and spacing between bust points. Repeat every value below.")}</span></div>`;
    return guide;
  }
  if (bodyRegion === "upper") {
    guide.innerHTML = `
    <div class="measurement-figure" aria-hidden="true">
      <svg viewBox="0 0 220 290">
        <path class="body-shape" d="M87 18c-12 8-16 23-13 39-18 14-31 33-35 59l26 18 10-20-7 146h84l-7-146 10 20 26-18c-4-26-17-45-35-59 3-16-1-31-13-39-13-9-33-9-46 0Z"/>
        <path class="measure-line" d="M60 93c33 10 67 10 100 0M55 116c37 12 73 12 110 0M69 168c27 8 55 8 82 0"/>
        <path class="measure-vertical" d="M110 38v130M151 41l17 54"/><path class="measure-arc" d="M83 68c17-9 37-9 54 0"/>
        <text x="22" y="94">OG1</text><text x="22" y="118">OG</text><text x="32" y="171">OT</text><text x="116" y="153">DTP</text><text x="170" y="70">DP</text><text x="91" y="65">SHG</text>
      </svg>
    </div>
    <div class="measurement-guide-copy"><strong>${copy("Горизонтали без перекоса", "Keep circumferences level")}</strong><span>${copy("Снимайте мерки поверх тонкого белья: обхваты держите параллельно полу, а длины ведите от одной точки основания шеи.", "Measure over light underwear: keep circumferences parallel to the floor and take lengths from the same neck-base point.")}</span></div>`;
    return guide;
  }
  guide.innerHTML = `
    <div class="measurement-figure" aria-hidden="true">
      <svg viewBox="0 0 220 290">
        <path class="body-shape" d="M91 20c-13 8-17 22-14 40-6 13-10 27-10 42-1 20 7 29 6 46-2 24-15 44-17 72-2 25 10 43 24 50h60c14-7 26-25 24-50-2-28-15-48-17-72-1-17 7-26 6-46 0-15-4-29-10-42 3-18-1-32-14-40-11-7-27-7-38 0Z"/>
        <path class="measure-line" d="M69 92c27 7 55 7 82 0"/><path class="measure-line" d="M66 120c29 8 59 8 88 0"/><path class="measure-line" d="M61 151c33 10 65 10 98 0"/>
        <path class="measure-vertical" d="M159 92v59"/><path class="measure-arc" d="M110 92c-4 42-5 83 0 128 5-45 4-86 0-128Z"/>
        <text x="28" y="91">OT</text><text x="24" y="120">OB1</text><text x="24" y="154">OB</text><text x="166" y="117">VT1</text><text x="166" y="148">VT</text><text x="116" y="212">DS</text>
      </svg>
    </div>
    <div class="measurement-guide-copy"><strong>${copy("Одна линия талии", "One fixed waistline")}</strong><span>${copy("Завяжите тонкую ленту на талии и не сдвигайте её, пока снимаете вертикали и дуги сидения.", "Tie a narrow tape at the waist and keep it in place while taking verticals and crotch arcs.")}</span></div>`;
  return guide;
}

function stretchCalculator(values, controls, emitChange) {
  const box = createEl("div", { className: "stretch-calculator" });
  const heading = createEl("div", { className: "calculator-heading" });
  heading.append(createEl("strong", { text: copy("Калькулятор растяжимости", "Stretch calculator") }), createEl("span", { text: copy("Проверьте образец поперёк долевой", "Test a swatch across the grain") }));
  const fields = createEl("div", { className: "calculator-fields" });
  const original = createEl("label");
  const stretched = createEl("label");
  const originalInput = createEl("input", { attrs: { type: "number", min: "5", max: "30", step: "0.5", value: "10" } });
  const stretchedInput = createEl("input", { attrs: { type: "number", min: "5", max: "60", step: "0.5", value: "18" } });
  original.append(createEl("span", { text: copy("Было, см", "Original, cm") }), originalInput);
  stretched.append(createEl("span", { text: copy("Стало, см", "Stretched, cm") }), stretchedInput);
  const result = createEl("div", { className: "calculator-result" });
  const resultValue = createEl("strong", { text: "80%" });
  const resultHint = createEl("span");
  const apply = createEl("button", { className: "secondary-button compact-button", text: copy("Применить безопасное значение", "Use a conservative value"), attrs: { type: "button" } });
  result.append(resultValue, resultHint, apply);
  fields.append(original, stretched, result);
  let suggested = 25;
  const update = () => {
    const start = Number(originalInput.value);
    const end = Number(stretchedInput.value);
    const maximum = start > 0 && end >= start ? ((end - start) / start) * 100 : 0;
    suggested = Math.max(10, Math.min(40, Math.round((maximum * 0.36) / 5) * 5));
    resultValue.textContent = `${Math.round(maximum)}%`;
    resultHint.textContent = copy(`Рабочее значение для старта: около ${suggested}%`, `Conservative starting point: about ${suggested}%`);
    apply.disabled = maximum <= 0;
  };
  originalInput.addEventListener("input", update);
  stretchedInput.addEventListener("input", update);
  apply.addEventListener("click", () => {
    const control = controls.get("workingStretchX");
    if (!control) return;
    const nearest = control.option.choices.reduce((best, choice) => Math.abs(Number(choice.value) - suggested) < Math.abs(Number(best.value) - suggested) ? choice : best);
    values.workingStretchX = nearest.value;
    control.setValue(nearest.value);
    emitChange();
  });
  update();
  box.append(heading, fields);
  return box;
}

export function Form({
  schema,
  values,
  measurementVerification = {},
  onMeasurementVerificationChange = () => {},
  onChange,
  onSubmit,
  onStepChange,
}) {
  const form = createEl("form", { className: "wizard-form" });
  const sections = schema.sections?.length ? schema.sections : [{ id: "measurements", title: { ru: "Параметры", en: "Parameters" }, description: "" }];
  const controls = new Map();
  const panels = [];
  const stepButtons = [];
  let activeStep = 0;
  let currentErrors = validateSchema(schema, values);
  const measurementCheck = MeasurementVerification({
    schema,
    measurements: values,
    value: measurementVerification,
    onChange: onMeasurementVerificationChange,
  });
  const stepper = createEl("nav", { className: "wizard-stepper", attrs: { "aria-label": copy("Шаги построения", "Drafting steps") } });

  const setActiveStep = (nextIndex, { moveFocus = false } = {}) => {
    activeStep = Math.max(0, Math.min(sections.length - 1, nextIndex));
    panels.forEach((panel, index) => { panel.hidden = index !== activeStep; });
    stepButtons.forEach((button, index) => {
      button.classList.toggle("is-active", index === activeStep);
      button.classList.toggle("is-complete", index < activeStep);
      button.setAttribute("aria-current", index === activeStep ? "step" : "false");
    });
    onStepChange?.(sections[activeStep], activeStep);
    if (moveFocus) {
      requestAnimationFrame(() => {
        const activePanel = panels[activeStep];
        activePanel?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
        activePanel?.focus({ preventScroll: true });
      });
    }
  };

  sections.forEach((section, index) => {
    const stepNumber = section.step || index + 1;
    const button = createEl("button", {
      className: "wizard-step",
      attrs: {
        type: "button",
        "aria-label": `${copy("Шаг", "Step")} ${stepNumber}: ${resolveText(section.title)}`,
      },
    });
    button.append(createEl("span", { className: "wizard-step-number", text: String(stepNumber).padStart(2, "0") }), createEl("span", { className: "wizard-step-label", text: resolveText(section.title) }));
    button.addEventListener("click", () => setActiveStep(index, { moveFocus: true }));
    stepButtons.push(button);
    stepper.appendChild(button);
  });
  form.appendChild(stepper);

  const emitChange = () => {
    currentErrors = validateSchema(schema, values);
    const verification = measurementCheck.refresh(values);
    controls.forEach((control, key) => {
      if (!control.error) return;
      control.error.textContent = displayError(currentErrors[key]?.[0]);
      control.wrapper?.classList.toggle("has-error", Boolean(currentErrors[key]?.length));
      control.input?.setAttribute("aria-invalid", currentErrors[key]?.length ? "true" : "false");
    });
    onChange(values, currentErrors, verification);
  };

  sections.forEach((section, sectionIndex) => {
    const panelHeadingId = `${schema.id}-${section.id || sectionIndex}-heading`.replace(/[^a-zA-Z0-9_-]/g, "-");
    const panel = createEl("section", {
      className: "wizard-panel",
      attrs: { tabindex: "-1", "aria-labelledby": panelHeadingId },
    });
    const panelHeading = createEl("div", { className: "wizard-panel-heading" });
    panelHeading.append(createEl("div", { className: "eyebrow", text: `${copy("ШАГ", "STEP")} ${section.step || sectionIndex + 1}` }), createEl("h3", { text: resolveText(section.title), attrs: { id: panelHeadingId } }), createEl("p", { text: resolveText(section.description || "") }));
    panel.appendChild(panelHeading);
    if (section.id === "measurements") panel.appendChild(measurementGuide(schema.bodyRegion, schema.id));

    const fields = schema.fields.filter((field) => (field.section || "measurements") === section.id);
    if (fields.length) {
      const fieldGrid = createEl("div", { className: "measurement-grid" });
      fields.forEach((field) => {
        const wrapper = createEl("div", { className: "field-card" });
        const top = createEl("div", { className: "field-card-top" });
        const fieldId = `${schema.id}-${field.key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
        const helperId = `${fieldId}-helper`;
        const errorId = `${fieldId}-error`;
        const fieldLabel = createEl("label", { className: "field-label", attrs: { for: fieldId } });
        fieldLabel.appendChild(createEl("span", { className: "field-label-text", text: resolveText(field.label) }));
        if (field.code) fieldLabel.appendChild(createEl("span", { className: "field-code", text: field.code }));
        const valueWrap = createEl("div", { className: "number-input-wrap" });
        const input = createEl("input", { attrs: { id: fieldId, type: "number", inputmode: "decimal", min: field.min, max: field.max, step: field.step ?? 0.5, value: values[field.key] ?? "", "aria-label": resolveText(field.label), "aria-describedby": `${helperId} ${errorId}` } });
        valueWrap.append(input, createEl("span", { text: schema.unit === "cm" ? "см" : schema.unit, attrs: { "aria-hidden": "true" } }));
        top.append(fieldLabel, valueWrap);
        const helper = createEl("div", { className: "field-helper", text: resolveText(field.description || ""), attrs: { id: helperId } });
        const impact = field.impact
          ? createEl("div", {
              className: "field-impact",
              text: `${copy("Влияет на: ", "Affects: ")}${resolveText(field.impact)}`,
            })
          : null;
        const error = createEl("div", { className: "field-error", attrs: { id: errorId, role: "alert", "aria-live": "polite" } });
        input.addEventListener("input", () => {
          const normalized = String(input.value).replace(",", ".");
          values[field.key] = normalized === "" ? "" : Number(normalized);
          measurementCheck.invalidate(field.key, values);
          emitChange();
        });
        controls.set(field.key, { wrapper, input, error, setValue(value) { input.value = value ?? ""; } });
        wrapper.append(top, helper);
        if (impact) wrapper.appendChild(impact);
        wrapper.appendChild(error);
        fieldGrid.appendChild(wrapper);
      });
      panel.appendChild(fieldGrid);
    }
    if (section.id === "measurements") panel.appendChild(measurementCheck.el);

    const options = (schema.options || []).filter((option) => (option.section || "style") === section.id);
    if (section.id === "fabric") panel.appendChild(stretchCalculator(values, controls, emitChange));
    if (options.length) {
      const optionList = createEl("div", { className: "option-list" });
      options.forEach((option) => {
        const wrapper = createEl("fieldset", { className: "option-card" });
        const error = createEl("div", { className: "field-error option-error", attrs: { role: "alert" } });
        const helperText = resolveText(option.description || "");
        wrapper.appendChild(createEl("legend", { text: resolveText(option.label) }));
        if (helperText) wrapper.appendChild(createEl("p", { className: "field-helper", text: helperText }));
        const choices = createEl("div", { className: option.display === "cards" ? "choice-grid choice-grid--cards" : "choice-grid" });
        const radios = [];
        option.choices.forEach((choice) => {
          const label = createEl("label", { className: "choice-control" });
          const input = createEl("input", { attrs: { type: "radio", name: `${schema.id}-${option.key}`, value: String(choice.value) } });
          input.checked = String(values[option.key] ?? option.default) === String(choice.value);
          input.addEventListener("change", () => { if (input.checked) { values[option.key] = choice.value; emitChange(); } });
          label.append(input, createEl("span", { className: "choice-face", text: resolveText(choice.label) }));
          choices.appendChild(label);
          radios.push({ input, value: choice.value });
        });
        controls.set(option.key, { wrapper, option, error, setValue(value) { radios.forEach((radio) => { radio.input.checked = String(radio.value) === String(value); }); } });
        wrapper.append(choices, error);
        optionList.appendChild(wrapper);
      });
      panel.appendChild(optionList);
    }

    const navigation = createEl("div", { className: "wizard-navigation" });
    const back = createEl("button", { className: "secondary-button", text: copy("Назад", "Back"), attrs: { type: "button" } });
    back.disabled = sectionIndex === 0;
    back.addEventListener("click", () => setActiveStep(sectionIndex - 1, { moveFocus: true }));
    const next = createEl("button", { className: "primary-button", text: sectionIndex === sections.length - 1 ? copy("Показать результат", "Show result") : copy("Продолжить", "Continue"), attrs: { type: "button" } });
    next.addEventListener("click", () => {
      const relevantKeys = [
        ...schema.fields.filter((field) => (field.section || "measurements") === section.id),
        ...(schema.options || []).filter((option) => (option.section || "style") === section.id),
      ].map((item) => item.key);
      const firstInvalidKey = relevantKeys.find((key) => currentErrors[key]?.length);
      if (firstInvalidKey) {
        const control = controls.get(firstInvalidKey);
        (control?.input || control?.wrapper?.querySelector("input"))?.focus();
        control?.wrapper?.classList.add("attention");
        return;
      }
      if (sectionIndex === sections.length - 1) onSubmit?.(values); else setActiveStep(sectionIndex + 1, { moveFocus: true });
    });
    navigation.append(back, createEl("span", { className: "autosave-note", text: copy("Сохраняется автоматически", "Saved automatically") }), next);
    panel.appendChild(navigation);
    panel.hidden = sectionIndex !== 0;
    panels.push(panel);
    form.appendChild(panel);
  });

  const setValues = (nextValues, { preserveMeasurementVerification = false } = {}) => {
    const changedMeasurements = (schema.fields || [])
      .filter((field) => !Object.is(values[field.key], nextValues?.[field.key]))
      .map((field) => field.key);
    Object.assign(values, nextValues);
    if (!preserveMeasurementVerification) {
      changedMeasurements.forEach((key) => measurementCheck.invalidate(key, values));
    }
    controls.forEach((control, key) => control.setValue?.(values[key]));
    emitChange();
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); onSubmit?.(values); });
  setActiveStep(0);
  emitChange();
  return {
    el: form,
    setValues,
    setMeasurementVerification: (nextValue) => measurementCheck.setValue(nextValue),
    getMeasurementVerification: () => measurementCheck.getValue(),
    getMeasurementVerificationEvaluation: () => measurementCheck.getEvaluation(),
    revealMeasurementVerification: () => measurementCheck.reveal(),
    setStep: (nextIndex) => setActiveStep(nextIndex, { moveFocus: true }),
    getActiveStep: () => activeStep,
  };
}
