const THEME_KEY = "lingerie-theme";

export function initTheme(savedTheme) {
  const theme = savedTheme || localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  return next;
}
