import { createEl } from "../../core/utils/dom.js";
import { toggleTheme } from "../styles/theme.js";

export function Home({ modules, onSelect, onThemeToggle }) {
  const container = createEl("div", { className: "main" });
  const card = createEl("div", { className: "card" });
  const header = createEl("div", { className: "topbar" });
  const title = createEl("h2", { text: "Lingerie Pattern Studio" });
  const themeButton = createEl("button", { className: "secondary", text: "Toggle theme" });

  themeButton.addEventListener("click", () => {
    const theme = toggleTheme();
    onThemeToggle(theme);
  });

  header.append(title, themeButton);

  const list = createEl("div", { className: "profile-list" });
  modules.forEach((module) => {
    const item = createEl("div", { className: "profile-item" });
    const info = createEl("div", { text: `${module.name} (${module.category})` });
    const button = createEl("button", { text: "Open" });
    button.addEventListener("click", () => onSelect(module.id));
    item.append(info, button);
    list.appendChild(item);
  });

  card.appendChild(createEl("p", { text: "Select a pattern module to begin." }));
  card.appendChild(list);

  container.append(header, card);
  return container;
}
