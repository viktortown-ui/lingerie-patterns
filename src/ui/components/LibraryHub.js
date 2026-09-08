import { createEl } from "../../core/utils/dom.js";
import { resolveText } from "../i18n/i18n.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function moduleName(modules, moduleId) {
  const module = modules.find((item) => item.id === moduleId);
  return module ? resolveText(module.schema?.name || module.name) : moduleId;
}

function badge(text, variant = "") {
  return createEl("span", { className: `library-badge${variant ? ` ${variant}` : ""}`, text });
}

function presetCard({ template, modules, language, personal, onOpen, onExport, onDelete }) {
  const card = createEl("article", { className: "preset-card" });
  const top = createEl("div", { className: "preset-card-top" });
  const glyph = template.moduleId.includes("thong") ? "V" : "◇";
  top.append(
    createEl("span", { className: "preset-glyph", text: glyph }),
    badge(personal ? copy(language, "Мой", "Mine") : copy(language, "Встроенный", "Built in"), personal ? "is-personal" : "is-built-in"),
  );
  const content = createEl("div", { className: "preset-card-content" });
  content.append(
    createEl("h3", { text: resolveText(template.name) }),
    createEl("p", { className: "preset-module-name", text: moduleName(modules, template.moduleId) }),
    createEl("p", { text: resolveText(template.description || "") }),
  );
  const actions = createEl("div", { className: "preset-card-actions" });
  const open = createEl("button", {
    className: personal ? "secondary-button compact-button" : "primary-button compact-button",
    text: copy(language, "Открыть фасон", "Open style"),
    attrs: { type: "button" },
  });
  open.addEventListener("click", () => onOpen(template));
  actions.appendChild(open);
  if (personal) {
    const exportButton = createEl("button", {
      className: "library-icon-button",
      text: copy(language, "Скачать", "Export"),
      attrs: { type: "button", title: copy(language, "Скачать файл шаблона", "Download template file") },
    });
    exportButton.addEventListener("click", () => onExport(template));
    const removeButton = createEl("button", {
      className: "library-icon-button is-danger",
      text: copy(language, "Удалить", "Delete"),
      attrs: { type: "button", title: copy(language, "Удалить шаблон", "Delete template") },
    });
    removeButton.addEventListener("click", () => {
      if (window.confirm(copy(language, "Удалить этот шаблон фасона?", "Delete this style template?"))) onDelete(template.id);
    });
    actions.append(exportButton, removeButton);
  }
  card.append(top, content, actions);
  return card;
}

function staticCard({ pattern, language, onOpen, onDelete }) {
  const card = createEl("article", { className: "static-library-card" });
  const art = createEl("div", { className: "static-library-art" });
  art.append(
    createEl("span", { className: "static-file-mark", text: "SVG" }),
    createEl("span", {
      className: "static-entity-count",
      text: copy(
        language,
        `${pattern.statistics?.entityCount ?? 0} контуров`,
        `${pattern.statistics?.entityCount ?? 0} entities`,
      ),
    }),
  );
  const content = createEl("div", { className: "static-library-content" });
  content.append(
    badge(copy(language, "Личное • не проверено", "Personal • unverified"), "is-warning"),
    createEl("h3", { text: pattern.name }),
    createEl("p", { text: pattern.description || pattern.source?.fileName || "SVG" }),
  );
  const actions = createEl("div", { className: "preset-card-actions" });
  const open = createEl("button", {
    className: "secondary-button compact-button",
    text: copy(language, "Посмотреть", "View"),
    attrs: { type: "button" },
  });
  open.addEventListener("click", () => onOpen(pattern));
  const remove = createEl("button", {
    className: "library-icon-button is-danger",
    text: copy(language, "Удалить", "Delete"),
    attrs: { type: "button" },
  });
  remove.addEventListener("click", () => {
    if (window.confirm(copy(language, "Удалить это SVG-лекало?", "Delete this SVG pattern?"))) onDelete(pattern.id);
  });
  actions.append(open, remove);
  card.append(art, content, actions);
  return card;
}

function fileAction({ text, accept, onFile }) {
  const label = createEl("label", { className: "secondary-button library-file-button", text });
  const input = createEl("input", { attrs: { type: "file", accept } });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      await onFile(file);
    } finally {
      input.value = "";
      input.disabled = false;
    }
  });
  label.appendChild(input);
  return label;
}

export function LibraryHub({
  language,
  modules,
  builtInTemplates = [],
  userTemplates = [],
  staticPatterns = [],
  staticLoading = false,
  onOpenTemplate,
  onExportTemplate,
  onDeleteTemplate,
  onImportTemplate,
  onImportSvg,
  onOpenStatic,
  onDeleteStatic,
  onOpenHelp = () => {},
}) {
  const section = createEl("section", { className: "library-hub" });
  const headingRow = createEl("div", { className: "library-heading-row" });
  const heading = createEl("div", { className: "section-heading" });
  heading.append(
    createEl("div", { className: "eyebrow", text: copy(language, "БИБЛИОТЕКА ФАСОНОВ", "STYLE LIBRARY") }),
    createEl("h2", { text: copy(language, "Одна основа — много моделей", "One base, many styles") }),
    createEl("p", {
      text: copy(
        language,
        "Шаблон меняет фасон и обработку, но не содержит личных мерок. Свой вариант можно сохранить внутри редактора.",
        "A template changes style and construction but never contains personal measurements. Save your own variant inside the editor.",
      ),
    }),
  );
  const importActions = createEl("div", { className: "library-import-actions" });
  importActions.append(
    (() => {
      const help = createEl("button", {
        className: "secondary-button library-help-action",
        text: copy(language, "Как добавлять?", "How to add?"),
        attrs: { type: "button" },
      });
      help.addEventListener("click", () => onOpenHelp("add-patterns"));
      return help;
    })(),
    fileAction({
      text: copy(language, "Импорт шаблона", "Import template"),
      accept: "application/json,.json,.lekalo-template.json",
      onFile: onImportTemplate,
    }),
    fileAction({
      text: copy(language, "+ Добавить SVG", "+ Add SVG"),
      accept: "image/svg+xml,.svg",
      onFile: onImportSvg,
    }),
  );
  headingRow.append(heading, importActions);

  const builtInTitle = createEl("div", { className: "library-subheading" });
  builtInTitle.append(
    createEl("h3", { text: copy(language, "Готовые фасоны белья", "Ready-made underwear styles") }),
    createEl("span", { text: copy(language, `${builtInTemplates.length} готовых наборов настроек`, `${builtInTemplates.length} ready-made setting packs`) }),
  );
  const builtInGrid = createEl("div", { className: "preset-grid" });
  builtInTemplates.forEach((template) => builtInGrid.appendChild(presetCard({
    template,
    modules,
    language,
    personal: false,
    onOpen: onOpenTemplate,
  })));

  const personalTitle = createEl("div", { className: "library-subheading personal-library-heading" });
  personalTitle.append(
    createEl("h3", { text: copy(language, "Моя библиотека", "My library") }),
    createEl("span", {
      text: copy(language, "Хранится только на этом устройстве", "Stored on this device only"),
    }),
  );
  const personalGrid = createEl("div", { className: "personal-library-grid" });
  userTemplates.forEach((template) => personalGrid.appendChild(presetCard({
    template,
    modules,
    language,
    personal: true,
    onOpen: onOpenTemplate,
    onExport: onExportTemplate,
    onDelete: onDeleteTemplate,
  })));
  staticPatterns.forEach((pattern) => personalGrid.appendChild(staticCard({
    pattern,
    language,
    onOpen: onOpenStatic,
    onDelete: onDeleteStatic,
  })));
  if (!userTemplates.length && !staticPatterns.length) {
    personalGrid.appendChild(createEl("div", {
      className: "library-empty",
      text: staticLoading
        ? copy(language, "Загружаем личную библиотеку…", "Loading your personal library…")
        : copy(
            language,
            "Здесь появятся ваши варианты фасона и безопасно импортированные SVG. Начните с готовой основы выше.",
            "Your style variants and safely imported SVG files will appear here. Start with a base above.",
          ),
    }));
  }
  const privacy = createEl("div", { className: "library-privacy" });
  privacy.append(
    createEl("span", { text: "⌂" }),
    createEl("p", {
      text: copy(
        language,
        "Файлы не отправляются в интернет. SVG разбирается локально, исходная разметка отбрасывается, а неподдерживаемые элементы блокируют импорт.",
        "Files are not uploaded. SVG is parsed locally, original markup is discarded, and unsupported elements block the import.",
      ),
    }),
  );

  section.append(headingRow, builtInTitle, builtInGrid, personalTitle, personalGrid, privacy);
  return section;
}
