import { createEl } from "../../core/utils/dom.js";
import { resolveText } from "../i18n/i18n.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function decimals(step) {
  const text = String(step ?? 1);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function normalizeValue(raw, definition) {
  const fallback = Number(definition.default) || 0;
  const value = Number(raw);
  const finite = Number.isFinite(value) ? value : fallback;
  const minimum = Number.isFinite(definition.min) ? definition.min : finite;
  const maximum = Number.isFinite(definition.max) ? definition.max : finite;
  const step = Number(definition.step) || 1;
  const snapped = Math.round(finite / step) * step;
  return Number(clamp(snapped, minimum, maximum).toFixed(decimals(step)));
}

export function PatternAdjuster({ schema, values = {}, language = "ru", onChange, onReset }) {
  const definitions = Array.isArray(schema?.adjustments) ? schema.adjustments : [];
  const root = createEl("section", { className: "pattern-adjuster" });
  const header = createEl("div", { className: "pattern-adjuster-header" });
  const title = createEl("div");
  title.append(
    createEl("span", {
      className: "eyebrow",
      text: language === "ru" ? "ТОЧНАЯ ПОСАДКА" : "FIT TUNING",
    }),
    createEl("h3", {
      text: language === "ru" ? "Управляемые точки A / B / C" : "Guided A / B / C points",
    }),
  );
  const resetButton = createEl("button", {
    className: "secondary-button compact-button",
    text: language === "ru" ? "Сбросить" : "Reset",
    attrs: { type: "button" },
  });
  header.append(title, resetButton);

  const explanation = createEl("p", {
    className: "pattern-adjuster-help",
    text: language === "ru"
      ? "Тяните метки на чертеже или задайте поправку здесь. Это параметрические изменения: сопряжённые швы остаются согласованными."
      : "Drag a marker on the draft or enter an adjustment here. These are parametric edits, so matched seams remain coordinated.",
  });
  const list = createEl("div", { className: "pattern-adjuster-list" });
  const controls = new Map();

  const emit = (definition, raw) => {
    const value = normalizeValue(raw, definition);
    const control = controls.get(definition.key);
    if (control) {
      control.range.value = String(value);
      control.number.value = String(value);
      control.card.classList.toggle("is-modified", value !== (Number(definition.default) || 0));
    }
    onChange?.(definition.key, value);
  };

  definitions.forEach((definition) => {
    const value = normalizeValue(values[definition.key], definition);
    const card = createEl("div", { className: "pattern-adjustment-card" });
    const cardTop = createEl("div", { className: "pattern-adjustment-top" });
    const label = createEl("label", { className: "pattern-adjustment-label" });
    const code = createEl("span", { className: "pattern-point-code", text: definition.code || definition.key });
    const labelText = createEl("span", { text: resolveText(definition.label) });
    label.append(code, labelText);

    const numberWrap = createEl("div", { className: "adjustment-number-wrap" });
    const number = createEl("input", {
      attrs: {
        type: "number",
        min: String(definition.min),
        max: String(definition.max),
        step: String(definition.step || 0.1),
        value: String(value),
        "aria-label": resolveText(definition.label),
      },
    });
    const unit = createEl("span", { text: definition.unit || schema.unit || "cm" });
    numberWrap.append(number, unit);
    cardTop.append(label, numberWrap);

    const range = createEl("input", {
      className: "pattern-adjustment-range",
      attrs: {
        type: "range",
        min: String(definition.min),
        max: String(definition.max),
        step: String(definition.step || 0.1),
        value: String(value),
        "aria-label": resolveText(definition.label),
      },
    });
    const scale = createEl("div", { className: "pattern-adjustment-scale" });
    scale.append(
      createEl("span", { text: `${definition.min}` }),
      createEl("span", { text: "0" }),
      createEl("span", { text: `+${definition.max}` }),
    );
    if (definition.description) {
      card.append(cardTop, range, scale, createEl("p", {
        className: "pattern-adjustment-description",
        text: resolveText(definition.description),
      }));
    } else {
      card.append(cardTop, range, scale);
    }
    card.classList.toggle("is-modified", value !== (Number(definition.default) || 0));
    range.addEventListener("input", () => emit(definition, range.value));
    number.addEventListener("input", () => {
      if (number.value === "" || !Number.isFinite(Number(number.value))) return;
      emit(definition, number.value);
    });
    number.addEventListener("change", () => emit(definition, number.value));
    controls.set(definition.key, { card, range, number });
    list.appendChild(card);
  });

  resetButton.addEventListener("click", () => {
    const defaults = Object.fromEntries(definitions.map((definition) => [
      definition.key,
      normalizeValue(definition.default ?? 0, definition),
    ]));
    definitions.forEach((definition) => {
      const value = defaults[definition.key];
      const control = controls.get(definition.key);
      if (!control) return;
      control.range.value = String(value);
      control.number.value = String(value);
      control.card.classList.toggle("is-modified", value !== (Number(definition.default) || 0));
    });
    if (onReset) onReset(defaults);
    else definitions.forEach((definition) => onChange?.(definition.key, defaults[definition.key]));
  });

  root.append(header, explanation, list);

  return {
    el: root,
    setValues(nextValues = {}) {
      definitions.forEach((definition) => {
        if (!Object.prototype.hasOwnProperty.call(nextValues, definition.key)) return;
        const value = normalizeValue(nextValues[definition.key], definition);
        const control = controls.get(definition.key);
        if (!control) return;
        control.range.value = String(value);
        control.number.value = String(value);
        control.card.classList.toggle("is-modified", value !== (Number(definition.default) || 0));
      });
    },
  };
}
