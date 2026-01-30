import { createEl } from "../../core/utils/dom.js";
import { resolveText, t } from "../i18n/i18n.js";
import { toggleTheme } from "../styles/theme.js";

export function Home({ modules, language, onSelect, onThemeToggle, onLanguageToggle }) {
  const container = createEl("div", { className: "main" });
  const card = createEl("div", { className: "card" });
  const header = createEl("div", { className: "topbar" });
  const title = createEl("h2", { text: t("home.title") });
  const actions = createEl("div", { className: "topbar-actions" });
  const languageLabel = createEl("span", { className: "muted", text: t("home.language") });
  const languageSelect = createEl("select", {
    attrs: { value: language },
  });
  [
    { value: "ru", label: "RU" },
    { value: "en", label: "EN" },
  ].forEach((option) => {
    const opt = createEl("option", { text: option.label, attrs: { value: option.value } });
    if (language === option.value) opt.selected = true;
    languageSelect.appendChild(opt);
  });
  const themeButton = createEl("button", { className: "secondary", text: t("home.toggleTheme") });

  const handleLang = (event) => onLanguageToggle(String(event.target.value));
  languageSelect.addEventListener("change", handleLang);
  languageSelect.addEventListener("input", handleLang);

  themeButton.addEventListener("click", () => {
    const theme = toggleTheme();
    onThemeToggle(theme);
  });

  actions.append(languageLabel, languageSelect, themeButton);
  header.append(title, actions);

  const list = createEl("div", { className: "profile-list" });
  modules.forEach((module) => {
    const item = createEl("div", { className: "profile-item" });
    const info = createEl("div", {
      text: `${resolveText(module.name)} (${resolveText(module.category)})`,
    });
    const button = createEl("button", { text: t("home.open") });
    button.addEventListener("click", () => onSelect(module.id));
    item.append(info, button);
    list.appendChild(item);
  });

  card.appendChild(createEl("p", { text: t("home.selectModule") }));
  card.appendChild(list);

  container.append(header, card);
  return container;
}
