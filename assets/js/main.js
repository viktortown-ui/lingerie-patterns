import { registerModule, getModules } from "../../src/core/pattern/registry.js";
import { initTheme } from "../../src/ui/styles/theme.js";
import { Home } from "../../src/ui/screens/Home.js";
import { Editor } from "../../src/ui/screens/Editor.js";
import { loadState, saveState } from "../../src/ui/state/store.js";
import { setLocale } from "../../src/ui/i18n/i18n.js";
import { modules } from "../../src/patterns/index.js";

const app = document.getElementById("app");

modules.forEach((module) => registerModule(module));

const state = loadState();
initTheme(state.theme);
setLocale(state.language);

const handleLanguageToggle = (language) => {
  state.language = language;
  saveState(state);
  setLocale(language);
};

function renderHome() {
  app.innerHTML = "";
  app.appendChild(
    Home({
      modules: getModules(),
      language: state.language,
      onSelect: (moduleId) => {
        state.selectedModuleId = moduleId;
        saveState(state);
        renderEditor(moduleId);
      },
      onThemeToggle: (theme) => {
        state.theme = theme;
        saveState(state);
      },
      onLanguageToggle: (language) => {
        handleLanguageToggle(language);
        renderHome();
      },
    })
  );
}

function renderEditor(moduleId) {
  app.innerHTML = "";
  app.appendChild(
    Editor({
      moduleId,
      modules: getModules(),
      language: state.language,
      state,
      onBack: () => renderHome(),
      onThemeToggle: (theme) => {
        state.theme = theme;
        saveState(state);
      },
      onLanguageToggle: (language) => {
        handleLanguageToggle(language);
        renderEditor(moduleId);
      },
    })
  );
}

if (state.selectedModuleId) {
  renderEditor(state.selectedModuleId);
} else {
  renderHome();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Relative path so it works under GitHub Pages subpath (/<repo>/)
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}
