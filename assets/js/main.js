import { registerModule, getModules } from "../../src/core/pattern/registry.js";
import { initTheme } from "../../src/ui/styles/theme.js";
import { Home } from "../../src/ui/screens/Home.js";
import { Editor } from "../../src/ui/screens/Editor.js";
import { loadState, saveState } from "../../src/ui/state/store.js";
import { modules } from "../../src/patterns/index.js";

const app = document.getElementById("app");

modules.forEach((module) => registerModule(module));

const state = loadState();
initTheme(state.theme);

function renderHome() {
  app.innerHTML = "";
  app.appendChild(Home({
    modules: getModules(),
    onSelect: (moduleId) => {
      state.selectedModuleId = moduleId;
      saveState(state);
      renderEditor(moduleId);
    },
    onThemeToggle: (theme) => {
      state.theme = theme;
      saveState(state);
    },
  }));
}

function renderEditor(moduleId) {
  app.innerHTML = "";
  app.appendChild(Editor({
    moduleId,
    modules: getModules(),
    state,
    onBack: () => renderHome(),
    onThemeToggle: (theme) => {
      state.theme = theme;
      saveState(state);
    },
  }));
}

if (state.selectedModuleId) {
  renderEditor(state.selectedModuleId);
} else {
  renderHome();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
