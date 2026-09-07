import { createEl } from "../../core/utils/dom.js";
import { resolveText } from "../i18n/i18n.js";

const SIZE_LABELS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function suggestedIncrement(key) {
  const exact = {
    waist: 4,
    highHip: 4,
    seat: 4,
    hip: 4,
    bust: 4,
    highBust: 4,
    underbust: 4,
    crossSeam: 2,
    crossSeamFront: 1,
    waistToHighHip: 0.3,
    waistToSeat: 0.5,
    frontWidth: 1,
    backWidth: 1,
    shoulderLength: 0.3,
    frontWaistLength: 0.5,
    backWaistLength: 0.5,
    bustHeight: 0.5,
    bustPointDistance: 0.5,
  };
  return exact[key] ?? 0.5;
}

function safeId(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function GradingPanel({ schema, language = "ru", getMeasurements, onGenerate }) {
  const section = createEl("section", { className: "grading-card surface-card" });
  const heading = createEl("div", { className: "grading-heading" });
  const headingCopy = createEl("div");
  headingCopy.append(
    createEl("span", { className: "eyebrow", text: copy(language, "РАЗМЕРНЫЙ РЯД", "SIZE SET") }),
    createEl("h3", { text: copy(language, "Градация по меркам", "Measurement-rule grading") }),
  );
  const badge = createEl("span", {
    className: "grading-method-badge",
    text: copy(language, "перестроение каждого размера", "redraft every size"),
  });
  heading.append(headingCopy, badge);

  const explanation = createEl("p", {
    className: "grading-explanation",
    text: copy(
      language,
      "Задайте прибавку мерок на один размер. Приложение отдельно пересчитает каждое лекало и проверит допустимые диапазоны. Это прозрачный размерный ряд, не промышленная поточечная градация.",
      "Set the measurement increment for one size step. The app independently redrafts and validates every pattern. This is a transparent size set, not industrial point grading.",
    ),
  });

  const setup = createEl("div", { className: "grading-setup" });
  const makeSelect = (labelText, values, selected) => {
    const label = createEl("label", { className: "grading-setup-field" });
    const select = createEl("select");
    values.forEach((value) => {
      const option = createEl("option", { text: String(value), attrs: { value: String(value) } });
      option.selected = String(value) === String(selected);
      select.appendChild(option);
    });
    label.append(createEl("span", { text: labelText }), select);
    setup.appendChild(label);
    return select;
  };
  const baseSize = makeSelect(copy(language, "Текущий размер", "Current size"), SIZE_LABELS, "M");
  const smallerCount = makeSelect(copy(language, "Размеров меньше", "Smaller sizes"), [0, 1, 2, 3], 2);
  const largerCount = makeSelect(copy(language, "Размеров больше", "Larger sizes"), [0, 1, 2, 3], 2);

  const incrementDetails = createEl("details", { className: "grading-increments" });
  incrementDetails.appendChild(createEl("summary", {
    text: copy(language, "Проверить и изменить шаги мерок", "Review measurement increments"),
  }));
  const incrementGrid = createEl("div", { className: "grading-increment-grid" });
  const incrementInputs = new Map();
  (schema.fields || []).forEach((field) => {
    const label = createEl("label", { className: "grading-increment-field" });
    const labelCopy = createEl("span");
    labelCopy.append(
      createEl("strong", { text: field.code || field.key }),
      createEl("span", { text: resolveText(field.label) }),
    );
    const inputWrap = createEl("span", { className: "grading-increment-input" });
    const input = createEl("input", {
      attrs: {
        type: "number",
        min: "0",
        max: "20",
        step: "0.1",
        value: String(suggestedIncrement(field.key)),
        "aria-label": `${resolveText(field.label)} — ${copy(language, "шаг размера", "size increment")}`,
      },
    });
    inputWrap.append(input, createEl("span", { text: schema.unit || "cm" }));
    label.append(labelCopy, inputWrap);
    incrementInputs.set(field.key, input);
    incrementGrid.appendChild(label);
  });
  incrementDetails.appendChild(incrementGrid);

  const actions = createEl("div", { className: "grading-actions" });
  const generateButton = createEl("button", {
    className: "primary-button",
    text: copy(language, "Построить размерный ряд", "Build size set"),
    attrs: { type: "button" },
  });
  const status = createEl("div", { className: "grading-status", attrs: { role: "status", "aria-live": "polite" } });
  actions.append(generateButton, status);
  const results = createEl("div", { className: "grading-results" });
  let generationRevision = 0;

  const invalidate = () => {
    generationRevision += 1;
    results.innerHTML = "";
    status.classList.remove("is-error");
    status.textContent = copy(
      language,
      "Параметры изменились — пересчитайте размерный ряд.",
      "Parameters changed — rebuild the size set.",
    );
  };

  [baseSize, smallerCount, largerCount, ...incrementInputs.values()].forEach((control) => {
    control.addEventListener("input", invalidate);
  });

  const setBusy = (busy) => {
    generateButton.disabled = busy;
    generateButton.textContent = busy
      ? copy(language, "Проверяю размеры…", "Validating sizes…")
      : copy(language, "Построить размерный ряд", "Build size set");
  };

  const renderResult = (result) => {
    results.innerHTML = "";
    if (!result) return;
    const toolbar = createEl("div", { className: "grading-result-toolbar" });
    toolbar.appendChild(createEl("strong", {
      text: copy(language, `Готово размеров: ${result.variants.length}`, `${result.variants.length} sizes ready`),
    }));
    if (typeof result.downloadPackage === "function") {
      const downloadAll = createEl("button", {
        className: "primary-button compact-button",
        text: copy(language, "Скачать ZIP: DXF + паспорт", "Download ZIP: DXF + manifest"),
        attrs: { type: "button" },
      });
      downloadAll.addEventListener("click", result.downloadPackage);
      toolbar.appendChild(downloadAll);
    }
    const list = createEl("div", { className: "grading-result-list" });
    result.variants.forEach((variant) => {
      const row = createEl("div", { className: "grading-result-row" });
      const info = createEl("div");
      info.append(
        createEl("strong", { text: variant.name }),
        createEl("span", { text: variant.summary || copy(language, "геометрия проверена", "geometry checked") }),
      );
      const button = createEl("button", {
        className: "secondary-button compact-button",
        text: "DXF",
        attrs: { type: "button", "aria-label": `${copy(language, "Скачать DXF", "Download DXF")} ${variant.name}` },
      });
      button.addEventListener("click", () => result.downloadVariant?.(variant));
      row.append(info, button);
      list.appendChild(row);
    });
    results.append(toolbar, list);
  };

  generateButton.addEventListener("click", async () => {
    const requestedRevision = ++generationRevision;
    const baseIndex = SIZE_LABELS.indexOf(baseSize.value);
    const below = Math.min(Number(smallerCount.value), baseIndex);
    const above = Math.min(Number(largerCount.value), SIZE_LABELS.length - baseIndex - 1);
    const measurements = getMeasurements();
    const increments = Object.fromEntries([...incrementInputs].map(([key, input]) => {
      const value = Number(input.value);
      return [key, Number.isFinite(value) && value >= 0 ? value : 0];
    }));
    const sizes = [];
    for (let offset = -below; offset <= above; offset += 1) {
      const name = SIZE_LABELS[baseIndex + offset];
      sizes.push({
        id: safeId(name),
        name,
        deltas: Object.fromEntries(Object.entries(increments).map(([key, value]) => [key, Number((value * offset).toFixed(3))])),
      });
    }
    const specification = {
      ruleId: "lekalo-visible-measurement-steps-v1",
      baseProfile: {
        id: safeId(baseSize.value),
        name: baseSize.value,
        measurements,
      },
      sizes,
    };
    setBusy(true);
    status.classList.remove("is-error");
    status.textContent = copy(language, "Проверяю все контуры…", "Validating every contour…");
    try {
      const result = await onGenerate(specification);
      if (requestedRevision !== generationRevision) return;
      renderResult(result);
      status.textContent = copy(language, "Размерный ряд готов. Каждый DXF прошёл внутреннее повторное чтение.", "Size set ready. Every DXF passed internal round-trip parsing.");
    } catch (error) {
      if (requestedRevision !== generationRevision) return;
      results.innerHTML = "";
      status.classList.add("is-error");
      status.textContent = error?.issues?.[0] || error?.message || copy(language, "Не удалось построить размерный ряд.", "Could not build the size set.");
    } finally {
      setBusy(false);
    }
  });

  section.append(heading, explanation, setup, incrementDetails, actions, results);
  return { el: section, renderResult, invalidate };
}
