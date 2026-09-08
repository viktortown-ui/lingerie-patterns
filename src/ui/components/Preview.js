import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";
import { Units } from "../../core/geometry/Units.js";
import { collectPaths, hasSeamPaths } from "../../core/pattern/panels.js";
import { resolveText, t } from "../i18n/i18n.js";

const CONTROL_HANDLE_EDGE_INSET = 4;
const CONTROL_HANDLE_GAP = 6;

export function Preview({
  getDraft,
  getSummary,
  settings = {},
  onSettingsChange,
  onAdjustmentChange,
}) {
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
    attrs: { type: "button", title: t("preview.zoomOut"), "aria-label": t("preview.zoomOut") },
  });
  const zoomInButton = createEl("button", {
    className: "secondary",
    text: "+",
    attrs: { type: "button", title: t("preview.zoomIn"), "aria-label": t("preview.zoomIn") },
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
  const editPointsButton = createEl("button", {
    className: "secondary",
    text: t("preview.editPoints"),
    attrs: { type: "button", "aria-pressed": "false" },
  });
  const fullscreenButton = createEl("button", {
    className: "secondary preview-fullscreen-button",
    text: t("preview.fullscreen"),
    attrs: { type: "button" },
  });
  const calibrationControls = createEl("div", { className: "preview-calibration-controls" });
  const calibrationSliderId = "preview-screen-calibration";
  const calibrationLabel = createEl("label", {
    text: t("preview.screenScale"),
    attrs: { for: calibrationSliderId },
  });
  const calibrationValue = createEl("span", { className: "preview-calibration-value", text: "100%" });
  const calibrationDown = createEl("button", {
    className: "secondary",
    text: "−",
    attrs: { type: "button", title: t("preview.decreaseScale"), "aria-label": t("preview.decreaseScale") },
  });
  const calibrationUp = createEl("button", {
    className: "secondary",
    text: "+",
    attrs: { type: "button", title: t("preview.increaseScale"), "aria-label": t("preview.increaseScale") },
  });
  const calibrationSlider = createEl("input", {
    attrs: {
      type: "range",
      id: calibrationSliderId,
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
  const initialScaleLabels =
    typeof settings.scaleLabels === "boolean" ? settings.scaleLabels : storedScaleLabels;
  labelCheckbox.checked = initialScaleLabels;
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
  const initialSeamHighlight =
    typeof settings.seamHighlight === "boolean" ? settings.seamHighlight : storedSeamHighlight;
  seamHighlightCheckbox.checked = initialSeamHighlight;
  seamHighlightToggle.append(seamHighlightCheckbox, seamHighlightText);

  const viewport = createEl("div", {
    className: "preview-viewport",
    attrs: {
      tabindex: "0",
      role: "region",
      "aria-label": t("preview.canvas"),
      "aria-keyshortcuts": "ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown",
    },
  });
  const labelLayer = createEl("div", { className: "preview-label-layer" });
  const controlLayer = createEl("div", { className: "preview-control-layer" });
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
    calibrateButton,
    editPointsButton,
    fullscreenButton
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
  const minFitZoom = 0.04;
  const maxZoom = 3;
  let scaleLabels = initialScaleLabels;
  let highlightSeamAllowance = initialSeamHighlight;
  let editPoints = Boolean(settings.editPoints);
  let labelEntries = [];
  let controlEntries = [];

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
    const percent = `${Math.round(calibrationMultiplier * 100)}%`;
    calibrationValue.textContent = percent;
    calibrationSlider.setAttribute("aria-valuetext", percent);
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
    const w = Math.max(1, (viewport.clientWidth || 1) - 4);
    const h = Math.max(1, (viewport.clientHeight || 1) - 4);
    return Math.min(w / (viewBoxSize.width * pxPerUnit), h / (viewBoxSize.height * pxPerUnit));
  };

  const applyZoom = () => {
    if (!svgEl || !viewBoxSize) return;

    const scale = zoomFactor;

    // Set explicit pixel size so scrollbars represent scaled extents.
    // Round to whole pixels to reduce sub-pixel shimmer at certain zoom/calibration values.
    const wPx = Math.max(1, Math.round(viewBoxSize.width * pxPerUnit * scale));
    const hPx = Math.max(1, Math.round(viewBoxSize.height * pxPerUnit * scale));
    svgEl.style.width = `${wPx}px`;
    svgEl.style.height = `${hPx}px`;
    updateZoomLabel();
    updateCanvasPanMode();
    positionLabels();
    positionControlHandles();
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
    zoomFactor = clamp(getFitScale(), minFitZoom, maxZoom);
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
  const notifySettings = () => {
    onSettingsChange?.({
      scaleLabels,
      seamHighlight: highlightSeamAllowance,
      editPoints,
    });
  };
  labelCheckbox.addEventListener("change", () => {
    scaleLabels = labelCheckbox.checked;
    try {
      localStorage.setItem(storageKey, String(scaleLabels));
    } catch {
      // ignore storage failures
    }
    render();
    notifySettings();
  });
  seamHighlightCheckbox.addEventListener("change", () => {
    highlightSeamAllowance = seamHighlightCheckbox.checked;
    try {
      localStorage.setItem(seamHighlightStorageKey, String(highlightSeamAllowance));
    } catch {
      // ignore storage failures
    }
    render();
    notifySettings();
  });
  const updateEditPointsButton = () => {
    editPointsButton.classList.toggle("is-active", editPoints);
    editPointsButton.setAttribute("aria-pressed", editPoints ? "true" : "false");
  };
  editPointsButton.addEventListener("click", () => {
    editPoints = !editPoints;
    updateEditPointsButton();
    renderControlHandles(getDraft());
    notifySettings();
  });
  updateEditPointsButton();

  const updateFullscreenButton = () => {
    const active = document.fullscreenElement === wrapper;
    fullscreenButton.textContent = active ? t("preview.exitFullscreen") : t("preview.fullscreen");
    fullscreenButton.classList.toggle("is-active", active);
  };
  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement === wrapper) {
        await document.exitFullscreen();
      } else if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by browser policy. The normal preview remains usable.
    }
  });
  const handleFullscreenChange = () => {
    updateFullscreenButton();
    requestAnimationFrame(() => fitMode ? applyFit() : applyZoom());
  };
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  updateFullscreenButton();
  notifySettings();

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

  viewport.addEventListener("keydown", (event) => {
    if (!canvasOverflows()) return;
    const arrowStep = event.shiftKey ? 90 : 44;
    const pageStep = Math.max(120, Math.round(viewport.clientHeight * 0.82));
    const movement = {
      ArrowLeft: [-arrowStep, 0],
      ArrowRight: [arrowStep, 0],
      ArrowUp: [0, -arrowStep],
      ArrowDown: [0, arrowStep],
      PageUp: [0, -pageStep],
      PageDown: [0, pageStep],
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    viewport.scrollBy({ left: movement[0], top: movement[1], behavior: "auto" });
  });

  // Drag-to-pan (mouse + touch via Pointer Events)
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;
  let pinchStartDistance = null;
  let pinchStartZoom = zoomFactor;

  viewport.style.cursor = "grab";

  const canvasOverflows = () => viewport.scrollWidth > viewport.clientWidth + 1
    || viewport.scrollHeight > viewport.clientHeight + 1;

  function updateCanvasPanMode() {
    const pannable = canvasOverflows();
    viewport.classList.toggle("is-canvas-pannable", pannable);
    viewport.style.cursor = pannable ? "grab" : "default";
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    if (!canvasOverflows()) return;
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
    viewport.style.cursor = canvasOverflows() ? "grab" : "default";
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

  let resizeRaf = 0;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      if (fitMode) {
        applyFit();
      } else {
        applyZoom();
      }
      positionLabels();
      positionControlHandles();
      updateCalibrationOverlay();
    });
  });
  resizeObserver.observe(viewport);

  viewport.addEventListener("scroll", () => {
    positionLabels();
    positionControlHandles();
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
      const left = point.x - viewportRect.left + viewport.scrollLeft;
      const top = point.y - viewportRect.top + viewport.scrollTop;
      el.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%)`;
    });
    labelLayer.hidden = false;
  };

  const positionControlHandles = () => {
    if (!svgEl || !editPoints || !controlEntries.length) {
      controlLayer.hidden = true;
      return;
    }
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return;
    const viewportRect = viewport.getBoundingClientRect();
    const placements = controlEntries.map(({ definition, el, dragPoint }) => {
      const source = dragPoint || definition.point;
      const point = new DOMPoint(source.x, source.y).matrixTransform(ctm);
      return {
        el,
        idealX: point.x - viewportRect.left + viewport.scrollLeft,
        idealY: point.y - viewportRect.top + viewport.scrollTop,
        width: Math.max(1, el.offsetWidth),
        height: Math.max(1, el.offsetHeight),
      };
    });

    // Fit mode keeps the whole draft visible, so its edge points can land under
    // half of a touch target. Keep handles inside the visible viewport and move
    // only labels that would collide. During manual zoom/pan their true canvas
    // positions are retained so handles scroll naturally with the geometry.
    if (fitMode) {
      const leftEdge = viewport.scrollLeft;
      const topEdge = viewport.scrollTop;
      const rightEdge = leftEdge + viewport.clientWidth;
      const bottomEdge = topEdge + viewport.clientHeight;
      const placed = [];
      const clampPlacement = (placement, x, y) => {
        const minX = leftEdge + placement.width / 2 + CONTROL_HANDLE_EDGE_INSET;
        const maxX = rightEdge - placement.width / 2 - CONTROL_HANDLE_EDGE_INSET;
        const minY = topEdge + placement.height / 2 + CONTROL_HANDLE_EDGE_INSET;
        const maxY = bottomEdge - placement.height / 2 - CONTROL_HANDLE_EDGE_INSET;
        return {
          x: maxX >= minX ? clamp(x, minX, maxX) : (leftEdge + rightEdge) / 2,
          y: maxY >= minY ? clamp(y, minY, maxY) : (topEdge + bottomEdge) / 2,
        };
      };
      const overlap = (candidate, placement, other) => {
        const overlapX = Math.max(0,
          (placement.width + other.width) / 2 + CONTROL_HANDLE_GAP
            - Math.abs(candidate.x - other.x));
        const overlapY = Math.max(0,
          (placement.height + other.height) / 2 + CONTROL_HANDLE_GAP
            - Math.abs(candidate.y - other.y));
        return overlapX * overlapY;
      };

      placements.forEach((placement) => {
        const anchor = clampPlacement(placement, placement.idealX, placement.idealY);
        const candidates = [anchor];
        placed.forEach((other) => {
          const horizontalDistance = (placement.width + other.width) / 2 + CONTROL_HANDLE_GAP;
          const verticalDistance = (placement.height + other.height) / 2 + CONTROL_HANDLE_GAP;
          candidates.push(
            clampPlacement(placement, other.x - horizontalDistance, anchor.y),
            clampPlacement(placement, other.x + horizontalDistance, anchor.y),
            clampPlacement(placement, anchor.x, other.y - verticalDistance),
            clampPlacement(placement, anchor.x, other.y + verticalDistance),
          );
        });
        const ranked = candidates.map((candidate) => {
          const overlapAreas = placed.map((other) => overlap(candidate, placement, other));
          return {
            ...candidate,
            collisions: overlapAreas.filter((area) => area > 0).length,
            overlapArea: overlapAreas.reduce((sum, area) => sum + area, 0),
            distance: (candidate.x - anchor.x) ** 2 + (candidate.y - anchor.y) ** 2,
          };
        }).sort((left, right) => left.collisions - right.collisions
          || left.overlapArea - right.overlapArea
          || left.distance - right.distance);
        Object.assign(placement, ranked[0]);
        placed.push(placement);
      });
    } else {
      placements.forEach((placement) => {
        placement.x = placement.idealX;
        placement.y = placement.idealY;
      });
    }

    placements.forEach(({ el, x, y }) => {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
    controlLayer.hidden = false;
  };

  const renderControlHandles = (draft) => {
    controlLayer.innerHTML = "";
    controlEntries = [];
    const definitions = Array.isArray(draft?.meta?.editablePoints)
      ? draft.meta.editablePoints.filter((item) => item?.point && item?.key)
      : [];
    editPointsButton.disabled = definitions.length === 0;
    if (!definitions.length || !editPoints) {
      controlLayer.hidden = true;
      return;
    }

    definitions.forEach((definition) => {
      const label = resolveText(definition.label) || definition.key;
      const handle = createEl("button", {
        className: "pattern-control-handle",
        attrs: {
          type: "button",
          title: `${definition.code || definition.key}: ${label}`,
          "aria-label": `${definition.code || definition.key}: ${label}`,
        },
      });
      const code = createEl("span", {
        className: "pattern-control-code",
        text: definition.code || definition.key,
      });
      const value = createEl("span", {
        className: "pattern-control-value",
        text: `${Number(definition.value || 0).toFixed(1)} ${definition.unit || ""}`.trim(),
      });
      handle.append(code, value);
      const entry = { definition, el: handle, valueEl: value, dragPoint: null };

      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 && event.pointerType !== "touch") return;
        event.preventDefault();
        event.stopPropagation();
        const ctm = svgEl?.getScreenCTM();
        if (!ctm) return;
        const inverse = ctm.inverse();
        const start = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
        const startValue = Number(definition.value) || 0;
        let nextValue = startValue;
        handle.classList.add("is-dragging");
        handle.setPointerCapture?.(event.pointerId);

        const move = (moveEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          moveEvent.preventDefault();
          const current = new DOMPoint(moveEvent.clientX, moveEvent.clientY).matrixTransform(inverse);
          const delta = definition.axis === "x" ? current.x - start.x : current.y - start.y;
          const response = Number(definition.response) || 1;
          const direction = Number(definition.direction) || 1;
          const raw = startValue + (delta / response) * direction;
          const min = Number.isFinite(definition.min) ? definition.min : raw;
          const max = Number.isFinite(definition.max) ? definition.max : raw;
          const step = Number(definition.step) || 0.1;
          nextValue = Math.min(max, Math.max(min, Math.round(raw / step) * step));
          const appliedDelta = ((nextValue - startValue) * response) / direction;
          entry.dragPoint = {
            x: definition.point.x + (definition.axis === "x" ? appliedDelta : 0),
            y: definition.point.y + (definition.axis === "y" ? appliedDelta : 0),
          };
          value.textContent = `${nextValue.toFixed(1)} ${definition.unit || ""}`.trim();
          positionControlHandles();
        };
        const end = (endEvent) => {
          if (endEvent.pointerId !== event.pointerId) return;
          handle.classList.remove("is-dragging");
          handle.releasePointerCapture?.(event.pointerId);
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          entry.dragPoint = null;
          if (nextValue !== startValue) onAdjustmentChange?.(definition.key, nextValue);
          else positionControlHandles();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      });

      controlEntries.push(entry);
      controlLayer.appendChild(handle);
    });
    positionControlHandles();
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
      editPointsButton.disabled = true;
      labelLayer.hidden = true;
      controlLayer.hidden = true;
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
    viewport.appendChild(controlLayer);
    viewport.appendChild(calibrationOverlay);
    svgEl = nextSvg;
    // Export strokes are expressed in physical pattern units. At a typical
    // fit-to-window zoom those values become fractions of a screen pixel, so
    // keep the saved SVG/PDF precise and strengthen only this DOM preview.
    svgEl.querySelectorAll("path,line,polyline,polygon,circle").forEach((el) => {
      el.setAttribute("vector-effect", "non-scaling-stroke");

      const role = el.getAttribute("data-role");
      if (role === "cut") {
        el.setAttribute("stroke", "#211a1c");
        el.setAttribute("stroke-width", "1.8");
      } else if (role === "seam") {
        el.setAttribute("stroke", "#6d253d");
        el.setAttribute("stroke-width", "1.35");
      } else if (el.hasAttribute("data-highlight-for")) {
        el.setAttribute("stroke-width", "4.5");
      } else if (el.getAttribute("stroke") && el.getAttribute("stroke") !== "none") {
        el.setAttribute("stroke-width", "1.1");
      }
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
    renderControlHandles(draft);

    positionLabels();
    positionControlHandles();
  };

  render();

  const destroy = () => {
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    resizeObserver.disconnect();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = 0;
  };

  return { el: wrapper, render, destroy };
}
