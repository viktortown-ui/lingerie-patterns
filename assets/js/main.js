import { registerModule, getModules } from "../../src/core/pattern/registry.js";
import { initTheme } from "../../src/ui/styles/theme.js";
import { Home } from "../../src/ui/screens/Home.js";
import { Editor } from "../../src/ui/screens/Editor.js";
import { getState, setState, subscribe } from "../../src/ui/state/store.js";
import { getLocale, setLocale } from "../../src/ui/i18n/i18n.js";
import { modules } from "../../src/patterns/index.js";

const app = document.getElementById("app");

modules.forEach((module) => registerModule(module));

const DEBUG_I18N = false;
const logI18n = (...args) => {
  if (DEBUG_I18N) console.debug("[i18n]", ...args);
};

let state = getState();
initTheme(state.theme);
setLocale(state.language);
logI18n("boot locale", getLocale());

const currentRoute = {
  screen: state.selectedModuleId ? "editor" : "home",
  moduleId: state.selectedModuleId,
};

const handleLanguageToggle = (language) => {
  logI18n("language toggle requested", language);
  setLocale(language);
  setState({ language });
};

function renderHome() {
  logI18n("render home", getLocale());
  currentRoute.screen = "home";
  currentRoute.moduleId = null;
  app.innerHTML = "";
  app.appendChild(
    Home({
      modules: getModules(),
      language: state.language,
      onSelect: (moduleId) => {
        state.selectedModuleId = moduleId;
        setState({ selectedModuleId: moduleId });
        renderEditor(moduleId);
      },
      onThemeToggle: (theme) => {
        state.theme = theme;
        setState({ theme });
      },
      onLanguageToggle: (language) => {
        handleLanguageToggle(language);
      },
    })
  );
}

function renderEditor(moduleId) {
  logI18n("render editor", moduleId, getLocale());
  currentRoute.screen = "editor";
  currentRoute.moduleId = moduleId;
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
        setState({ theme });
      },
      onLanguageToggle: (language) => {
        handleLanguageToggle(language);
      },
      onPaperSizeChange: (paperSize) => {
        setState({ paperSize });
      },
    })
  );
}

const renderCurrentRoute = () => {
  if (currentRoute.screen === "editor" && currentRoute.moduleId) {
    renderEditor(currentRoute.moduleId);
  } else {
    renderHome();
  }
};

subscribe((nextState, prevState) => {
  state = nextState;
  if (prevState?.language !== nextState.language) {
    logI18n("language updated", prevState?.language, "->", nextState.language);
    setLocale(nextState.language);
    renderCurrentRoute();
  }
});

window.addEventListener("localechange", (event) => {
  logI18n("localechange event", event.detail);
  if (event.detail !== state.language) {
    setState({ language: event.detail });
  }
});

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
