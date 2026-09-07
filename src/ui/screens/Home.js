import { createEl } from "../../core/utils/dom.js";
import { LibraryHub } from "../components/LibraryHub.js";
import { resolveText } from "../i18n/i18n.js";
import { toggleTheme } from "../styles/theme.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function brand() {
  const wrapper = createEl("div", { className: "brand" });
  const mark = createEl("div", { className: "brand-mark", text: "Л" });
  const text = createEl("div");
  text.append(createEl("strong", { text: "ЛЕКАЛО" }), createEl("span", { text: "Pattern Studio" }));
  wrapper.append(mark, text);
  return wrapper;
}

function modelArt(moduleId) {
  const art = createEl("div", { className: `model-art model-art--${moduleId}` });
  const drawings = {
    panties_thong_basic: `<svg viewBox="0 0 320 210" aria-hidden="true">
        <path class="art-fill" d="M43 54c37 13 76 20 117 20s80-7 117-20l-30 49c-20 25-39 52-51 82h-28l-8-43-8 43h-28c-12-30-31-57-51-82L43 54Z"/>
        <path class="art-line" d="M43 54c37 13 76 20 117 20s80-7 117-20M73 103c28 8 57 12 87 12s59-4 87-12M160 74v68"/>
        <circle class="art-dot" cx="43" cy="54" r="5"/><circle class="art-dot" cx="277" cy="54" r="5"/>
      </svg>`,
    bralette_soft: `<svg viewBox="0 0 320 210" aria-hidden="true">
        <path class="art-fill" d="M45 160 72 70l55-27 33 70 33-70 55 27 27 90c-70 18-160 18-230 0Z"/>
        <path class="art-line" d="M45 160c70 18 160 18 230 0M72 70c24 8 43 23 55 45 8 15 19 25 33 30 14-5 25-15 33-30 12-22 31-37 55-45M127 43l33 70 33-70"/>
        <path class="art-dash" d="M83 66 104 16M237 66 216 16M160 113v34"/>
      </svg>`,
    crop_top_basic: `<svg viewBox="0 0 320 210" aria-hidden="true">
        <path class="art-fill" d="M76 38 124 24c12 16 60 16 72 0l48 14-20 53-22-10 8 98H110l8-98-22 10-20-53Z"/>
        <path class="art-line" d="M76 38 124 24c12 16 60 16 72 0l48 14M96 91l22-10M224 91l-22-10M110 179h100"/>
        <path class="art-dash" d="M160 37v142M111 157c32 8 66 8 98 0"/>
      </svg>`,
    panties_basic: `<svg viewBox="0 0 320 210" aria-hidden="true">
        <path class="art-fill" d="M38 52c38 14 79 21 122 21s84-7 122-21l-25 68c-13 34-47 63-97 66-50-3-84-32-97-66L38 52Z"/>
        <path class="art-line" d="M38 52c38 14 79 21 122 21s84-7 122-21M63 120c31-8 57-2 76 18 9 10 16 23 21 39 5-16 12-29 21-39 19-20 45-26 76-18"/>
        <path class="art-dash" d="M160 73v104"/>
      </svg>`,
  };
  art.innerHTML = drawings[moduleId] || drawings.panties_basic;
  return art;
}

function languageControl(language, onLanguageToggle) {
  const group = createEl("div", { className: "language-control" });
  [{ value: "ru", label: "RU" }, { value: "en", label: "EN" }].forEach(({ value, label }) => {
    const button = createEl("button", {
      className: language === value ? "language-button is-active" : "language-button",
      text: label,
      attrs: { type: "button", "aria-pressed": language === value ? "true" : "false" },
    });
    button.addEventListener("click", () => onLanguageToggle(value));
    group.appendChild(button);
  });
  return group;
}

function heroTitle(language) {
  const title = createEl("h1");
  title.append(
    document.createTextNode(copy(language, "Выкройка, которая ", "A pattern that ")),
    createEl("em", { text: copy(language, "начинается с вас", "starts with you") }),
  );
  return title;
}

export function Home({
  modules,
  language,
  onSelect,
  onThemeToggle,
  onLanguageToggle,
  builtInTemplates = [],
  userTemplates = [],
  staticPatterns = [],
  staticLoading = false,
  onOpenTemplate = () => {},
  onExportTemplate = () => {},
  onDeleteTemplate = () => {},
  onImportTemplate = async () => {},
  onImportSvg = async () => {},
  onOpenStatic = () => {},
  onDeleteStatic = () => {},
}) {
  const page = createEl("div", { className: "home-page" });
  const header = createEl("header", { className: "app-header" });
  const headerActions = createEl("div", { className: "header-actions" });
  const themeButton = createEl("button", {
    className: "icon-button",
    text: copy(language, "Сменить тему", "Toggle theme"),
    attrs: { type: "button" },
  });
  themeButton.addEventListener("click", () => onThemeToggle(toggleTheme()));
  headerActions.append(languageControl(language, onLanguageToggle), themeButton);
  header.append(brand(), headerActions);

  const hero = createEl("section", { className: "hero" });
  const heroCopy = createEl("div", { className: "hero-copy" });
  heroCopy.append(
    createEl("div", {
      className: "eyebrow",
      text: copy(language, "БЕСПЛАТНО • ЛОКАЛЬНО • БЕЗ РЕГИСТРАЦИИ", "FREE • LOCAL • NO ACCOUNT"),
    }),
    heroTitle(language),
    createEl("p", {
      className: "hero-lead",
      text: copy(
        language,
        "Снимите мерки, проверьте ткань и получите персональное лекало с контрольными швами, расходом материалов и точной печатью.",
        "Enter measurements, test the fabric, and get a personal draft with seam checks, material estimates, and true-scale printing.",
      ),
    }),
  );
  const promises = createEl("div", { className: "promise-row" });
  [
    copy(language, "Мерки остаются на компьютере", "Measurements stay on this computer"),
    copy(language, "Работает без интернета", "Works offline"),
    copy(language, "SVG + PDF + проверяемый DXF", "SVG + PDF + checked DXF"),
  ].forEach((text) => promises.appendChild(createEl("span", { text })));
  heroCopy.append(promises);

  const journey = createEl("div", { className: "journey-card" });
  journey.appendChild(createEl("div", { className: "journey-title", text: copy(language, "От мерки до печати", "From tape to print") }));
  [
    ["01", copy(language, "Тело", "Body"), copy(language, "Связанные мерки для модели", "Connected measurements for each pattern")],
    ["02", copy(language, "Материал", "Fabric"), copy(language, "Растяжимость и восстановление", "Stretch and recovery")],
    ["03", copy(language, "Фасон", "Style"), copy(language, "Посадка и покрытие", "Rise and coverage")],
    ["04", copy(language, "Результат", "Result"), copy(language, "Проверки, пошив и печать", "Checks, sewing, and print")],
  ].forEach(([number, title, subtitle]) => {
    const row = createEl("div", { className: "journey-step" });
    const text = createEl("div", { className: "journey-text" });
    text.append(createEl("strong", { text: title }), createEl("span", { text: subtitle }));
    row.append(createEl("span", { className: "journey-number", text: number }), text);
    journey.appendChild(row);
  });
  hero.append(heroCopy, journey);

  const catalog = createEl("section", { className: "catalog-section" });
  const catalogHead = createEl("div", { className: "section-heading" });
  catalogHead.append(
    createEl("div", { className: "eyebrow", text: copy(language, "БИБЛИОТЕКА ОСНОВ", "PATTERN LIBRARY") }),
    createEl("h2", { text: copy(language, "Бельё и эластичные топы по меркам", "Custom lingerie and stretch tops") }),
    createEl("p", {
      text: copy(
        language,
        "Выберите основу. Посадка, покрытие, материал, обработка и точные параметры доступны внутри каждой модели.",
        "Choose a starting point. Fit, coverage, material, construction, and fine controls remain adjustable inside every pattern.",
      ),
    }),
  );
  const grid = createEl("div", { className: "model-grid" });
  modules.filter((module) => !module.hidden).forEach((module) => {
    const card = createEl("article", { className: "model-card" });
    const visual = modelArt(module.id);
    visual.appendChild(createEl("span", {
      className: "status-badge",
      text: module.status === "ready-for-toile"
        ? copy(language, "Готово к пробному образцу", "Ready for a toile")
        : copy(language, "Экспериментальная основа", "Experimental base"),
    }));
    const content = createEl("div", { className: "model-card-content" });
    const tags = createEl("div", { className: "tag-row" });
    (module.tags || []).forEach((tag) => tags.appendChild(createEl("span", { text: tag })));
    const openButton = createEl("button", {
      className: "primary-button model-open",
      text: copy(language, "Создать выкройку", "Create pattern"),
      attrs: { type: "button" },
    });
    openButton.addEventListener("click", () => onSelect(module.id));
    content.append(
      createEl("h3", { text: resolveText(module.schema?.name || module.name) }),
      createEl("p", { text: resolveText(module.description) }),
      tags,
      openButton,
    );
    card.append(visual, content);
    grid.appendChild(card);
  });
  catalog.append(catalogHead, grid);

  const library = LibraryHub({
    language,
    modules,
    builtInTemplates,
    userTemplates,
    staticPatterns,
    staticLoading,
    onOpenTemplate,
    onExportTemplate,
    onDeleteTemplate,
    onImportTemplate,
    onImportSvg,
    onOpenStatic,
    onDeleteStatic,
  });

  const trust = createEl("section", { className: "trust-strip" });
  const trustText = createEl("div");
  trustText.append(
    createEl("strong", { text: copy(language, "Честная точность", "Honest accuracy") }),
    createEl("span", {
      text: copy(
        language,
        "Приложение проверяет математику и сопряжение швов, но первая версия из новой ткани всегда считается пробным образцом.",
        "The app checks geometry and matching seams, but the first make in a new fabric is always treated as a toile.",
      ),
    }),
  );
  trust.append(createEl("div", { className: "trust-icon", text: "✓" }), trustText);

  const footer = createEl("footer", { className: "app-footer" });
  footer.append(
    createEl("span", { text: "ЛЕКАЛО Pattern Studio • 1.3" }),
    createEl("span", { text: copy(language, "Открытая архитектура • локальные данные", "Open architecture • local data") }),
  );

  page.append(header, hero, catalog, library, trust, footer);
  return page;
}
