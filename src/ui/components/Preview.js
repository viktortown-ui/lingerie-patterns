import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";
import { Units } from "../../core/geometry/Units.js";
import { collectPaths, hasSeamPaths } from "../../core/pattern/panels.js";
import { resolveText, t } from "../i18n/i18n.js";

export function Preview({ getDraft, getSummary }) {
  const wrapper = createEl("div", { className: "preview" });
  const storageKey = "lingerie-preview-scale-labels";
  const seamHighlightStorageKey = "lingerie-preview-seam-highlight";
  const calibrationStorageKey = "lingerie-screen-calibration";

  const toolbar = createEl("div", { className: "preview-toolbar" });
  const fitButton = createEl("button", {
    className: "secondary",
    text: t("preview.fit"),
    attrs: { type: "button" },
  });
  const zoomOutButton = createEl("button", {
    className: "secondary",
    text: "−",
    attrs: { type: "button", title: t("preview.zoomOut") },
  });
  const zoomInButton = createEl("button", {
    className: "secondary",
    text: "+",
    attrs: { type: "button", title: t("preview.zoomIn") },
  });
  const resetButton = createEl("button", {
    className: "secondary",
    text: t("preview.reset"),
    attrs: { type: "button" },
  });
  const zoomLabel = createEl("span", { className: "preview-zoom-label", text: "100%" });
  const labelToggle = createEl("label", { className: "toggle preview-label-toggle" });
  const labelCheckbox = createEl("input", { attrs: { type: "checkbox" } });
  const labelText = createEl("span", { text: t("preview.scaleLabels") });
  const seamHighlightToggle = createEl("label", { className: "toggle preview-label-toggle" });
  const seamHighlightCheckbox = createEl("input", { attrs: { type: "checkbox" } });
  const seamHighlightText = createEl("span", { text: t("preview.highlightSeamAllowance") });
  const calibrateButton = createEl("button", {
    className: "secondary",
    text: t("preview.calibrateScreen"),
    attrs: { type: "button" },
  });
  const calibrationControls = createEl("div", { className: "preview-calibration-controls" });
  const calibrationLabel = createEl("span", { text: t("preview.screenScale") });
  const calibrationValue = createEl("span", { className: "preview-calibration-value", text: "100%" });
  const calibrationDown = createEl("button", {
    className: "secondary",
    text: "−",
    attrs: { type: "button", title: t("preview.decreaseScale") },
  });
  const calibrationUp = createEl("button", {
    className: "secondary",
    text: "+",
    attrs: { type: "button", title: t("preview.increaseScale") },
  });
  const calibrationSlider = createEl("input", {
    attrs: {
      type: "range",
      min: "0.7",
      max: "1.3",
      step: "0.01",
      value: "1",
    },
  });
  const storedScaleLabels = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null) return true;
      return raw === "true";
    } catch {
      return true;
    }
  })();
  labelCheckbox.checked = storedScaleLabels;
  labelToggle.append(labelCheckbox, labelText);
  const storedSeamHighlight = (() => {
    try {
      const raw = localStorage.getItem(seamHighlightStorageKey);
      if (raw == null) return false;
      return raw === "true";
    } catch {
      return false;
    }
  })();
  seamHighlightCheckbox.checked = storedSeamHighlight;
  seamHighlightToggle.append(seamHighlightCheckbox, seamHighlightText);

  const viewport = createEl("div", { className: "preview-viewport" });
  const labelLayer = createEl("div", { className: "preview-label-layer" });
  const calibrationOverlay = createEl("div", { className: "preview-calibration-overlay" });
  const calibrationLine = createEl("div", { className: "preview-calibration-line" });
  const calibrationLineLabel = createEl("div", {
    className: "preview-calibration-caption",
    text: t("export.calibrationLarge"),
  });
  const calibrationSquare = createEl("div", { className: "preview-calibration-square" });
  const calibrationSquareLabel = createEl("div", {
    className: "preview-calibration-caption",
    text: t("export.calibrationLarge"),
  });
  const infoPanel = createEl("div", { className: "preview-info" });
  const infoTitle = createEl("div", { className: "preview-info-title" });
  const infoScale = createEl("div", { className: "preview-info-line" });
  const infoSummary = createEl("div", { className: "preview-info-line" });
  const infoLegend = createEl("div", { className: "preview-info-line" });

  calibrationControls.append(
    calibrationLabel,
    calibrationDown,
    calibrationUp,
    calibrationSlider,
    calibrationValue
  );
  calibrationControls.hidden = true;
  calibrationOverlay.append(calibrationLineLabel, calibrationLine, calibrationSquareLabel, calibrationSquare);
  calibrationOverlay.hidden = true;

  toolbar.append(
    fitButton,
    zoomOutButton,
    zoomInButton,
    resetButton,
    zoomLabel,
    labelToggle,
    seamHighlightToggle,
    calibrateButton
  );
  infoPanel.append(infoTitle, infoScale, infoSummary, infoLegend);
  wrapper.append(toolbar, calibrationControls, viewport, infoPanel);

  let svgEl = null;
  let viewBoxSize = null;
  let pxPerUnit = 1;
  let basePxPerUnit = 1;
  let calibrationMultiplier = 1;
  let calibrationActive = false;

  // Zoom is absolute: 1.0 = 100% of SVG units
  let zoomFactor = 1;
  let fitMode = true;
  const minZoom = 0.25;
  const maxZoom = 3;
  let scaleLabels = storedScaleLabels;
  let highlightSeamAllowance = storedSeamHighlight;
  let labelEntries = [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clampCalibration = (value) => clamp(value, 0.7, 1.3);

  const loadCalibration = () => {
    try {
      const stored = Number(localStorage.getItem(calibrationStorageKey));
      if (Number.isFinite(stored) && stored > 0) {
        return stored;
      }
    } catch {
      // ignore storage failures
    }
    return 1;
  };

  const persistCalibration = (value) => {
    try {
      localStorage.setItem(calibrationStorageKey, String(value));
    } catch {
      // ignore storage failures
    }
  };

  const updateZoomLabel = () => {
    zoomLabel.textContent = `${Math.round(zoomFactor * 100)}%`;
  };

  const updateCalibrationLabel = () => {
    calibrationValue.textContent = `${Math.round(calibrationMultiplier * 100)}%`;
  };

  const updateCalibrationOverlay = () => {
    if (!calibrationActive) {
      calibrationOverlay.hidden = true;
      return;
    }
    const unit = getDraft()?.meta?.unit || "cm";
    const sizeUnits = Units.fromMm(100, unit);
    const sizePx = sizeUnits * basePxPerUnit * calibrationMultiplier;
    calibrationLine.style.width = `${sizePx}px`;
    calibrationSquare.style.width = `${sizePx}px`;
    calibrationSquare.style.height = `${sizePx}px`;
    calibrationOverlay.hidden = false;
  };

  const parseViewBox = (svg) => {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const [, , width, height] = viewBox.split(/\s+/).map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) return { width, height };
    }
    return null;
  };

  const getFitScale = () => {
    if (!viewBoxSize) return 1;
    const w = viewport.clientWidth || 1;
    const h = viewport.clientHeight || 1;
    return Math.min(w / (viewBoxSize.width * pxPerUnit), h / (viewBoxSize.height * pxPerUnit));
  };

  const applyZoom = () => {
    if (!svgEl || !viewBoxSize) return;

    const scale = zoomFactor;

    // Set explicit pixel size so scrollbars represent scaled extents.
    svgEl.style.width = `${viewBoxSize.width * pxPerUnit * scale}px`;
    svgEl.style.height = `${viewBoxSize.height * pxPerUnit * scale}px`;

    updateZoomLabel();
    positionLabels();
  };

  const updatePreviewScale = () => {
    const draft = getDraft();
    const unit = draft?.meta?.unit || "cm";
    basePxPerUnit = Units.toMm(1, unit) * (96 / 25.4);
    const multiplier = calibrationActive ? calibrationMultiplier : 1;
    pxPerUnit = basePxPerUnit * multiplier;
    updateCalibrationOverlay();
    if (fitMode) {
      applyFit();
    } else {
      applyZoom();
    }
  };

  const setZoomFactor = (next) => {
    fitMode = false;
    zoomFactor = clamp(next, minZoom, maxZoom);
    applyZoom();
  };

  const applyFit = () => {
    fitMode = true;
    zoomFactor = clamp(getFitScale(), minZoom, maxZoom);
    applyZoom();
  };

  const resetZoom = () => {
    fitMode = false;
    setZoomFactor(1);
  };

  fitButton.addEventListener("click", applyFit);
  resetButton.addEventListener("click", resetZoom);
  zoomOutButton.addEventListener("click", () => setZoomFactor(zoomFactor / 1.15));
  zoomInButton.addEventListener("click", () => setZoomFactor(zoomFactor * 1.15));
  labelCheckbox.addEventListener("change", () => {
    scaleLabels = labelCheckbox.checked;
    try {
      localStorage.setItem(storageKey, String(scaleLabels));
    } catch {
      // ignore storage failures
    }
    render();
  });
  seamHighlightCheckbox.addEventListener("change", () => {
    highlightSeamAllowance = seamHighlightCheckbox.checked;
    try {
      localStorage.setItem(seamHighlightStorageKey, String(highlightSeamAllowance));
    } catch {
      // ignore storage failures
    }
    render();
  });

  calibrationMultiplier = loadCalibration();
  calibrationSlider.value = String(calibrationMultiplier);
  updateCalibrationLabel();

  const setCalibrationMultiplier = (value) => {
    calibrationMultiplier = clampCalibration(value);
    calibrationSlider.value = String(calibrationMultiplier);
    updateCalibrationLabel();
    persistCalibration(calibrationMultiplier);
    updatePreviewScale();
  };

  calibrationDown.addEventListener("click", () => {
    setCalibrationMultiplier(calibrationMultiplier - 0.02);
  });
  calibrationUp.addEventListener("click", () => {
    setCalibrationMultiplier(calibrationMultiplier + 0.02);
  });
  calibrationSlider.addEventListener("input", (event) => {
    setCalibrationMultiplier(Number(event.target.value));
  });

  calibrateButton.addEventListener("click", () => {
    calibrationActive = !calibrationActive;
    calibrationControls.hidden = !calibrationActive;
    calibrationOverlay.hidden = !calibrationActive;
    calibrateButton.classList.toggle("is-active", calibrationActive);
    updatePreviewScale();
  });

  // Ctrl/⌘ + wheel zoom (keeps normal scroll otherwise)
  viewport.addEventListener(
    "wheel",
    (e) => {
      const zoomKey = e.ctrlKey || e.metaKey;
      if (!zoomKey) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      setZoomFactor(zoomFactor * (dir > 0 ? 1.08 : 1 / 1.08));
    },
    { passive: false }
  );

  // Drag-to-pan (mouse + touch via Pointer Events)
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pinchStartDistance = null;
  let pinchStartZoom = zoomFactor;

  viewport.style.cursor = "grab";

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    dragging = true;
    viewport.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = viewport.scrollLeft;
    startScrollTop = viewport.scrollTop;
    viewport.style.cursor = "grabbing";
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (pinchStartDistance !== null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    viewport.scrollLeft = startScrollLeft - dx;
    viewport.scrollTop = startScrollTop - dy;
  });

  const endDrag = () => {
    dragging = false;
    viewport.style.cursor = "grab";
  };

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  viewport.addEventListener("pointerleave", endDrag);

  const getTouchDistance = (touches) => {
    const [first, second] = touches;
    if (!first || !second) return null;
    const dx = second.clientX - first.clientX;
    const dy = second.clientY - first.clientY;
    return Math.hypot(dx, dy);
  };

  viewport.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 2) return;
      pinchStartDistance = getTouchDistance(e.touches);
      pinchStartZoom = zoomFactor;
      dragging = false;
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 2 || pinchStartDistance === null) return;
      const nextDistance = getTouchDistance(e.touches);
      if (!nextDistance) return;
      e.preventDefault();
      const scale = nextDistance / pinchStartDistance;
      setZoomFactor(pinchStartZoom * scale);
    },
    { passive: false }
  );

  viewport.addEventListener(
    "touchend",
    () => {
      pinchStartDistance = null;
    },
    { passive: true }
  );

  const resizeObserver = new ResizeObserver(() => {
    if (fitMode) {
      applyFit();
    } else {
      applyZoom();
    }
    positionLabels();
  });
  resizeObserver.observe(viewport);

  viewport.addEventListener("scroll", () => {
    positionLabels();
  });

  const positionLabels = () => {
    if (!svgEl || scaleLabels || !labelEntries.length) {
      labelLayer.hidden = true;
      return;
    }
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const viewportRect = viewport.getBoundingClientRect();
    labelEntries.forEach(({ annotation, el }) => {
      const point = new DOMPoint(annotation.point.x, annotation.point.y).matrixTransform(ctm);
      const left = point.x - viewportRect.left;
      const top = point.y - viewportRect.top;
      el.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`;
    });
    labelLayer.hidden = false;
  };

  const renderOverlayLabels = (draft) => {
    labelLayer.innerHTML = "";
    labelEntries = [];
    const labels = (draft.annotations || []).filter((anno) => anno.type === "label");
    labels.forEach((annotation) => {
      const text = resolveText(annotation.text);
      if (!text) return;
      const labelEl = createEl("span", { className: "preview-label", text });
      labelLayer.appendChild(labelEl);
      labelEntries.push({ annotation, el: labelEl });
    });
  };

  const render = () => {
    clearEl(viewport);
    const draft = getDraft();
    if (!draft) {
      viewport.textContent = t("preview.noPreview");
      infoPanel.hidden = true;
      labelCheckbox.disabled = true;
      seamHighlightCheckbox.disabled = true;
      labelLayer.hidden = true;
      calibrationOverlay.hidden = true;
      return;
    }
    labelCheckbox.disabled = false;
    seamHighlightCheckbox.disabled = false;

    const svgString = svgExport(draft, getSummary(), {
      resolveText,
      mode: "preview",
      showLabels: scaleLabels,
      highlightSeamAllowance,
      labels: {
        unitsLabel: t("export.unitsLabel"),
        seamAllowanceLabel: t("export.seamAllowanceLabel"),
        seamAllowanceOn: t("export.seamAllowanceOn"),
        seamAllowanceOff: t("export.seamAllowanceOff"),
        legendLines: t("export.legendShort"),
        calibration: t("export.calibrationMark"),
        calibrationLarge: t("export.calibrationLarge"),
        patternTitle: t("export.patternTitle"),
      },
    });
    const container = createEl("div");
    container.innerHTML = svgString;
    const nextSvg = container.querySelector("svg");
    if (!nextSvg) {
      viewport.textContent = t("preview.unavailable");
      infoPanel.hidden = true;
      return;
    }

    viewBoxSize = parseViewBox(nextSvg);

    // Preview must not use physical mm sizing; we control px size.
    nextSvg.removeAttribute("width");
    nextSvg.removeAttribute("height");
    nextSvg.style.display = "block";

    viewport.appendChild(nextSvg);
    viewport.appendChild(labelLayer);
    viewport.appendChild(calibrationOverlay);
    svgEl = nextSvg;
    svgEl.querySelectorAll("path,line,polyline,polygon").forEach((el) => {
      el.setAttribute("vector-effect", "non-scaling-stroke");
    });

    updatePreviewScale();
    const seamAllowanceApplied = Boolean(draft.meta?.seamAllowanceApplied && hasSeamPaths(collectPaths(draft)));
    const seamAllowanceLabel =
      seamAllowanceApplied && draft.meta?.seamAllowanceMm
        ? `${draft.meta.seamAllowanceMm}mm`
        : t("export.seamAllowanceOff");
    const scaleInfo = `${t("export.unitsLabel")}: ${draft.meta?.unit || "cm"} | ${t(
      "export.seamAllowanceLabel"
    )}: ${seamAllowanceLabel}`;
    const summaryText = getSummary().join(", ");
    const titleText = resolveText(draft.meta?.title) || t("export.patternTitle");

    infoTitle.textContent = titleText;
    infoScale.textContent = scaleInfo;
    infoSummary.textContent = summaryText;
    infoSummary.hidden = !summaryText;
    infoLegend.textContent = seamAllowanceApplied ? t("export.legendShort") : "";
    infoLegend.hidden = !seamAllowanceApplied;
    infoPanel.hidden = false;

    renderOverlayLabels(draft);

    positionLabels();
  };

  render();

  return { el: wrapper, render };
}
