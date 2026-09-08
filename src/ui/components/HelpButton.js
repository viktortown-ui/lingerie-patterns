import { createEl } from "../../core/utils/dom.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

export function HelpButton({ language = "ru", onOpen = () => {}, topic = "quick-start" } = {}) {
  const label = copy(language, "Помощь", "Help");
  const button = createEl("button", {
    className: "help-button",
    attrs: {
      type: "button",
      title: label,
      "aria-label": label,
      "data-help-topic": topic,
    },
  });
  button.append(
    createEl("span", { className: "help-button-icon", text: "?", attrs: { "aria-hidden": "true" } }),
    createEl("span", { className: "help-button-label", text: label }),
  );
  button.addEventListener("click", () => onOpen(topic));
  return button;
}
