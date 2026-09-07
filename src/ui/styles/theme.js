const THEME_KEY = "lingerie-theme";

export function initTheme(savedTheme) {
  let storedTheme = null;
  try {
    storedTheme = globalThis.localStorage?.getItem(THEME_KEY) || null;
  } catch {
    // Privacy modes may deny storage; theme selection must still work in memory.
  }
  const theme = savedTheme || storedTheme || "light";
  document.documentElement.dataset.theme = theme;
  try {
    globalThis.localStorage?.setItem(THEME_KEY, theme);
  } catch {
    // Keep the applied theme for this session.
  }
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  const next = current === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    globalThis.localStorage?.setItem(THEME_KEY, next);
  } catch {
    // Keep the applied theme for this session.
  }
  return next;
}
