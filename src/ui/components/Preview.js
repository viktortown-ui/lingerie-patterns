import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";
import { Units } from "../../core/geometry/Units.js";
import { collectPaths, hasSeamPaths } from "../../core/pattern/panels.js";
import { resolveText, t } from "../i18n/i18n.js";

export function Preview({ getDraft, getSummary }) {
  const wrapper = createEl("div", { className: "preview" });
  const storageKey = "lingerie-preview-scale-labels";

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

  const viewport = createEl("div", { className: "preview-viewport" });
  const labelLayer = createEl("div", { className: "preview-label-layer" });
  const infoPanel = createEl("div", { className: "preview-info" });
  const infoTitle = createEl("div", { className: "preview-info-title" });
  const infoScale = createEl("div", { className: "preview-info-line" });
  const infoSummary = createEl("div", { className: "preview-info-line" });
  const infoLegend = createEl("div", { className: "preview-info-line" });

  toolbar.append(fitButton, zoomOutButton, zoomInButton, resetButton, zoomLabel, labelToggle);
  infoPanel.append(infoTitle, infoScale, infoSummary, infoLegend);
  wrapper.append(toolbar, viewport, infoPanel);

  let svgEl = null;
  let viewBoxSize = null;
  let pxPerUnit = 1;

  // Zoom is absolute: 1.0 = 100% of SVG units
  let zoomFactor = 1;
  let fitMode = true;
  const minZoom = 0.25;
  const maxZoom = 3;
  let scaleLabels = storedScaleLabels;
  let labelEntries = [];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const updateZoomLabel = () => {
    zoomLabel.textContent = `${Math.round(zoomFactor * 100)}%`;
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
      labelLayer.hidden = true;
      return;
    }
    labelCheckbox.disabled = false;

    const svgString = svgExport(draft, getSummary(), {
      resolveText,
      mode: "preview",
      showLabels: scaleLabels,
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
    svgEl = nextSvg;
    svgEl.querySelectorAll("path,line,polyline,polygon").forEach((el) => {
      el.setAttribute("vector-effect", "non-scaling-stroke");
    });

    const unit = draft.meta?.unit || "cm";
    pxPerUnit = Units.toMm(1, unit) * (96 / 25.4);
    const seamAllowanceApplied = Boolean(draft.meta?.seamAllowanceApplied && hasSeamPaths(collectPaths(draft)));
    const seamAllowanceLabel = seamAllowanceApplied ? t("export.seamAllowanceOn") : t("export.seamAllowanceOff");
    const scaleInfo = `${t("export.unitsLabel")}: ${unit} | ${t("export.seamAllowanceLabel")}: ${seamAllowanceLabel}`;
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

    if (fitMode) {
      applyFit();
    } else {
      applyZoom();
    }

    positionLabels();
  };

  render();

  return { el: wrapper, render };
}
