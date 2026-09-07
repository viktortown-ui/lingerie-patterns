import { createEl } from "../../core/utils/dom.js";
import {
  resolveStaticViewport,
  serializeStaticPatternSvg,
  staticSegmentsToPathData,
} from "../../core/import/staticPatternSvg.js";
import { downloadBlob } from "../utils/download.js";
import { toggleTheme } from "../styles/theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const copy = (language, ru, en) => (language === "ru" ? ru : en);

function safeFilename(value) {
  return String(value || "static-pattern")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "static-pattern";
}

function languageControl(language, onLanguageToggle) {
  const group = createEl("div", { className: "language-control" });
  [["ru", "RU"], ["en", "EN"]].forEach(([value, label]) => {
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

export function isConfirmedCalibration(calibration) {
  const scale = calibration?.millimetersPerUnit;
  return Boolean(calibration)
    && calibration.requiresCalibration === false
    && calibration.status !== "unknown"
    && calibration.known !== false
    && typeof scale === "number"
    && Number.isFinite(scale)
    && scale >= 1e-6
    && scale <= 1e6;
}

export function calibrationText(calibration, language) {
  if (!isConfirmedCalibration(calibration)) {
    return copy(language, "Масштаб не подтверждён", "Scale is not confirmed");
  }
  const scale = calibration.millimetersPerUnit;
  return copy(language, `Масштаб распознан: ${scale} мм/ед.`, `Scale detected: ${scale} mm/unit`);
}

export function staticPreviewAriaLabel(language) {
  return copy(language, "Предпросмотр импортированного статического лекала", "Imported static pattern preview");
}

function makePreview(geometry, language) {
  const viewport = resolveStaticViewport(geometry);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    staticPreviewAriaLabel(language),
  );
  geometry.entities.forEach((entity) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", staticSegmentsToPathData(entity.segments));
    path.setAttribute("class", "static-pattern-path");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(path);
  });
  return svg;
}

export function StaticPattern({ pattern, language, onBack, onDelete, onNotice = () => {}, onThemeToggle, onLanguageToggle }) {
  const page = createEl("div", { className: "static-pattern-page" });
  const header = createEl("header", { className: "app-header static-pattern-header" });
  const back = createEl("button", {
    className: "back-button",
    text: copy(language, "← Библиотека", "← Library"),
    attrs: { type: "button" },
  });
  back.addEventListener("click", onBack);
  const title = createEl("div", { className: "studio-title" });
  title.append(
    createEl("span", { className: "eyebrow", text: copy(language, "ЛИЧНОЕ SVG-ЛЕКАЛО", "PERSONAL SVG PATTERN") }),
    createEl("h1", { text: pattern.name }),
  );
  const theme = createEl("button", {
    className: "icon-button",
    text: copy(language, "Сменить тему", "Toggle theme"),
    attrs: { type: "button" },
  });
  theme.addEventListener("click", () => onThemeToggle(toggleTheme()));
  const headerActions = createEl("div", { className: "header-actions" });
  headerActions.append(languageControl(language, onLanguageToggle), theme);
  header.append(back, title, headerActions);

  const main = createEl("main", { className: "static-pattern-layout" });
  const previewCard = createEl("section", { className: "static-pattern-preview surface-card" });
  const previewHeading = createEl("div", { className: "static-pattern-preview-heading" });
  previewHeading.append(
    createEl("div", {
      className: "status-badge static-status-badge",
      text: copy(language, "Личное • не проверено", "Personal • unverified"),
    }),
    createEl("span", {
      className: "muted",
      text: copy(language, "Отрисовано из безопасной нормализованной геометрии", "Rendered from safe normalized geometry"),
    }),
  );
  const canvas = createEl("div", { className: "static-pattern-canvas" });
  canvas.appendChild(makePreview(pattern.geometry, language));
  previewCard.append(previewHeading, canvas);

  const info = createEl("aside", { className: "static-pattern-info surface-card" });
  info.append(
    createEl("span", { className: "eyebrow", text: copy(language, "СОСТОЯНИЕ", "STATUS") }),
    createEl("h2", { text: copy(language, "Статическое лекало", "Static pattern") }),
    createEl("p", {
      text: copy(
        language,
        "Контуры можно безопасно открыть и скачать, но они не пересчитываются по меркам. Градация и производственный статус отключены.",
        "The contours can be opened and downloaded safely, but they do not adapt to measurements. Grading and production status are disabled.",
      ),
    }),
  );
  const facts = createEl("dl", { className: "static-pattern-facts" });
  const addFact = (term, value) => {
    facts.append(createEl("dt", { text: term }), createEl("dd", { text: value || "—" }));
  };
  addFact(copy(language, "Исходный файл", "Source file"), pattern.source?.fileName);
  addFact(copy(language, "Контуры", "Entities"), String(pattern.geometry?.statistics?.entityCount ?? pattern.geometry?.entities?.length ?? 0));
  addFact(copy(language, "Масштаб", "Scale"), calibrationText(pattern.geometry?.calibration || pattern.calibration, language));
  addFact(copy(language, "Лицензия", "License"), pattern.provenance?.license);
  addFact(copy(language, "Автор", "Author"), pattern.provenance?.author);
  info.appendChild(facts);

  const warning = createEl("div", { className: "static-pattern-warning" });
  warning.append(
    createEl("strong", { text: copy(language, "Перед раскроем", "Before cutting") }),
    createEl("span", {
      text: copy(
        language,
        "Проверьте известный контрольный отрезок и распечатайте пробную страницу при 100%. Импорт не подтверждает посадку и права на распространение.",
        "Check a known calibration length and print a test page at 100%. Import does not validate fit or redistribution rights.",
      ),
    }),
  );
  info.appendChild(warning);

  const actions = createEl("div", { className: "static-pattern-actions" });
  const download = createEl("button", {
    className: "primary-button",
    text: copy(language, "Скачать безопасную SVG-копию", "Download safe SVG copy"),
    attrs: { type: "button" },
  });
  download.addEventListener("click", async () => {
    download.disabled = true;
    try {
      const svg = serializeStaticPatternSvg(pattern.geometry, { title: pattern.name });
      await downloadBlob({
        blob: new Blob([svg], { type: "image/svg+xml" }),
        filename: `${safeFilename(pattern.name)}-normalized.svg`,
        mimeType: "image/svg+xml",
      });
    } catch (error) {
      onNotice(error?.message || copy(language, "Не удалось скачать SVG-копию.", "Could not download the SVG copy."), 6000);
    } finally {
      download.disabled = false;
    }
  });
  const remove = createEl("button", {
    className: "secondary-button danger-button",
    text: copy(language, "Удалить из библиотеки", "Remove from library"),
    attrs: { type: "button" },
  });
  remove.addEventListener("click", async () => {
    const confirmed = window.confirm(copy(language, "Удалить это личное лекало?", "Remove this personal pattern?"));
    if (confirmed) await onDelete(pattern.id);
  });
  actions.append(download, remove);
  info.appendChild(actions);

  main.append(previewCard, info);
  page.append(header, main);
  return page;
}
