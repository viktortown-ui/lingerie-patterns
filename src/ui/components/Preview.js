import { createEl, clearEl } from "../../core/utils/dom.js";
import { svgExport } from "../../core/export/svgExport.js";

export function Preview({ getDraft, getSummary }) {
  const wrapper = createEl("div", { className: "preview" });

  const render = () => {
    clearEl(wrapper);
    const draft = getDraft();
    if (!draft) {
      wrapper.textContent = "No preview yet.";
      return;
    }
    const svgString = svgExport(draft, getSummary());
    wrapper.innerHTML = svgString;
  };

  render();

  return { el: wrapper, render };
}
