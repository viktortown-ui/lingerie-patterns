import { createEl } from "../../core/utils/dom.js";

export function Toast() {
  const el = createEl("div", { className: "toast", text: "" });
  let timeoutId;

  const show = (message, duration = 2400) => {
    el.textContent = message;
    el.style.display = "block";
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      el.style.display = "none";
    }, duration);
  };

  el.style.display = "none";

  return { el, show };
}
