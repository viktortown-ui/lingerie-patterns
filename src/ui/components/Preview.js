import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";

export function Preview({ getDraft, getSummary }) {
  const wrapper = createEl("div", { className: "preview" });
  const toolbar = createEl("div", { className: "preview-toolbar" });
  const fitButton = createEl("button", {
    className: "secondary",
    type: "button",
    textContent: "Fit",
  });
  const zoomOutButton = createEl("button", {
    className: "secondary",
    type: "button",
    textContent: "-",
  });
  const zoomInButton = createEl("button", {
    className: "secondary",
    type: "button",
    textContent: "+",
  });
  const zoomLabel = createEl("span", {
    className: "preview-zoom-label",
    textContent: "100%",
  });
  const viewport = createEl("div", { className: "preview-viewport" });

  toolbar.append(fitButton, zoomOutButton, zoomInButton, zoomLabel);
  wrapper.append(toolbar, viewport);

  let svgEl = null;
  let viewBoxSize = null;
  let zoomMode = "fit";
  let manualZoom = 1;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const updateZoomLabel = (scale) => {
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };

  const parseViewBox = (svg) => {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const [, , width, height] = viewBox.split(/\s+/).map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }
    }
    const widthAttr = parseFloat(svg.getAttribute("width"));
    const heightAttr = parseFloat(svg.getAttribute("height"));
    if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr)) {
      return { width: widthAttr, height: heightAttr };
    }
    return null;
  };

  const getFitScale = () => {
    if (!viewBoxSize || !viewport) {
      return 1;
    }
    const { clientWidth, clientHeight } = viewport;
    if (!clientWidth || !clientHeight) {
      return 1;
    }
    return Math.min(
      clientWidth / viewBoxSize.width,
      clientHeight / viewBoxSize.height,
    );
  };

  const applyZoom = () => {
    if (!svgEl || !viewBoxSize) {
      return;
    }
    const scale = zoomMode === "fit" ? getFitScale() : manualZoom;
    const widthPx = viewBoxSize.width * scale;
    const heightPx = viewBoxSize.height * scale;
    svgEl.style.width = `${widthPx}px`;
    svgEl.style.height = `${heightPx}px`;
    updateZoomLabel(scale);
  };

  fitButton.addEventListener("click", () => {
    zoomMode = "fit";
    applyZoom();
  });

  zoomOutButton.addEventListener("click", () => {
    zoomMode = "manual";
    manualZoom = clamp(manualZoom / 1.1, 0.1, 6);
    applyZoom();
  });

  zoomInButton.addEventListener("click", () => {
    zoomMode = "manual";
    manualZoom = clamp(manualZoom * 1.1, 0.1, 6);
    applyZoom();
  });

  const resizeObserver = new ResizeObserver(() => {
    if (zoomMode === "fit") {
      applyZoom();
    }
  });

  resizeObserver.observe(viewport);

  const render = () => {
    clearEl(viewport);
    const draft = getDraft();
    if (!draft) {
      viewport.textContent = "No preview yet.";
      return;
    }
    const svgString = svgExport(draft, getSummary());
    const container = createEl("div");
    container.innerHTML = svgString;
    const nextSvg = container.querySelector("svg");
    if (!nextSvg) {
      viewport.textContent = "Preview unavailable.";
      return;
    }
    viewBoxSize = parseViewBox(nextSvg);
    nextSvg.removeAttribute("width");
    nextSvg.removeAttribute("height");
    nextSvg.style.display = "block";
    viewport.appendChild(nextSvg);
    svgEl = nextSvg;
    zoomMode = "fit";
    manualZoom = 1;
    applyZoom();
  };

  render();

  return { el: wrapper, render };
}
