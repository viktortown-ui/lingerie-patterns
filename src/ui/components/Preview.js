import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";
import { resolveText, t } from "../i18n/i18n.js";

export function Preview({ getDraft, getSummary }) {
  const wrapper = createEl("div", { className: "preview" });

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

  const viewport = createEl("div", { className: "preview-viewport" });
  const infoPanel = createEl("div", { className: "preview-info" });
  const infoTitle = createEl("div", { className: "preview-info-title" });
  const infoScale = createEl("div", { className: "preview-info-line" });
  const infoSummary = createEl("div", { className: "preview-info-line" });
  const infoLegend = createEl("div", { className: "preview-info-line" });

  toolbar.append(fitButton, zoomOutButton, zoomInButton, resetButton, zoomLabel);
  infoPanel.append(infoTitle, infoScale, infoSummary, infoLegend);
  wrapper.append(toolbar, viewport, infoPanel);

  let svgEl = null;
  let viewBoxSize = null;

  // Zoom is absolute: 1.0 = 100% of SVG units
  let zoomFactor = 1;
  let fitMode = true;
  const maxFitZoom = 1;

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
    return Math.min(w / viewBoxSize.width, h / viewBoxSize.height);
  };

  const applyZoom = () => {
    if (!svgEl || !viewBoxSize) return;

    const scale = zoomFactor;

    // Set explicit pixel size so scrollbars represent scaled extents.
    svgEl.style.width = `${viewBoxSize.width * scale}px`;
    svgEl.style.height = `${viewBoxSize.height * scale}px`;

    updateZoomLabel();
  };

  const setZoomFactor = (next) => {
    fitMode = false;
    zoomFactor = clamp(next, 0.1, 10);
    applyZoom();
  };

  const applyFit = () => {
    fitMode = true;
    zoomFactor = clamp(Math.min(getFitScale(), maxFitZoom), 0.1, 10);
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

  const resizeObserver = new ResizeObserver(() => {
    if (fitMode) {
      applyFit();
    } else {
      applyZoom();
    }
  });
  resizeObserver.observe(viewport);

  const render = () => {
    clearEl(viewport);
    const draft = getDraft();
    if (!draft) {
      viewport.textContent = t("preview.noPreview");
      infoPanel.hidden = true;
      return;
    }

    const svgString = svgExport(draft, getSummary(), {
      resolveText,
      mode: "preview",
      labels: {
        unitsLabel: t("export.unitsLabel"),
        seamAllowanceLabel: t("export.seamAllowanceLabel"),
        seamAllowanceOn: t("export.seamAllowanceOn"),
        seamAllowanceOff: t("export.seamAllowanceOff"),
        legendLines: t("export.legendShort"),
        calibration: t("export.calibrationMark"),
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
    svgEl = nextSvg;
    svgEl.querySelectorAll("path,line,polyline,polygon").forEach((el) => {
      el.setAttribute("vector-effect", "non-scaling-stroke");
    });

    const unit = draft.meta?.unit || "cm";
    const hasSeamPaths = Object.keys(draft.paths || {}).some((name) => name.toLowerCase().includes("seam"));
    const seamAllowanceApplied = Boolean(draft.meta?.seamAllowanceApplied && hasSeamPaths);
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

    applyFit();
  };

  render();

  return { el: wrapper, render };
}
