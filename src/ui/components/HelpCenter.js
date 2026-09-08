import { createEl } from "../../core/utils/dom.js";
import {
  getHelpTopics,
  isHelpTopicId,
  searchHelpTopics,
} from "../help/helpContent.js";

const copy = (language, ru, en) => (language === "ru" ? ru : en);

function appendArticle(article, topic, language) {
  article.replaceChildren();
  article.setAttribute("aria-labelledby", `help-article-title-${topic.id}`);
  article.append(
    createEl("span", {
      className: "eyebrow",
      text: copy(language, "СПРАВКА ЛЕКАЛО", "LEKALO HELP"),
    }),
    createEl("h2", {
      text: topic.title,
      attrs: { id: `help-article-title-${topic.id}` },
    }),
    createEl("p", { className: "help-article-summary", text: topic.summary }),
    createEl("p", { className: "help-article-intro", text: topic.intro }),
  );

  const stepsTitle = createEl("h3", { text: copy(language, "По шагам", "Step by step") });
  const steps = createEl("ol", { className: "help-steps" });
  topic.steps.forEach((step) => steps.appendChild(createEl("li", { text: step })));
  article.append(stepsTitle, steps);

  const detailsTitle = createEl("h3", { text: copy(language, "Важно понимать", "Good to know") });
  const details = createEl("ul", { className: "help-points" });
  topic.bullets.forEach((item) => details.appendChild(createEl("li", { text: item })));
  article.append(detailsTitle, details);

  const warning = createEl("aside", { className: "help-warning" });
  warning.append(
    createEl("strong", { text: topic.warningTitle }),
    createEl("span", { text: topic.warning }),
  );
  article.appendChild(warning);
}

export function HelpCenter({ language = "ru" } = {}) {
  const dialog = createEl("dialog", {
    className: "help-dialog",
    attrs: {
      "aria-modal": "true",
      "aria-labelledby": "help-dialog-title",
    },
  });

  let activeLanguage = language === "en" ? "en" : "ru";
  let activeTopicId = "quick-start";
  let returnFocus = null;

  const close = () => {
    if (dialog.open) dialog.close();
  };

  const render = () => {
    const shell = createEl("div", { className: "help-dialog-shell" });
    const header = createEl("header", { className: "help-dialog-header" });
    const heading = createEl("div", { className: "help-dialog-heading" });
    heading.append(
      createEl("span", {
        className: "eyebrow",
        text: copy(activeLanguage, "ВСЁ В ОДНОМ МЕСТЕ", "EVERYTHING IN ONE PLACE"),
      }),
      createEl("h1", {
        text: copy(activeLanguage, "Как работать в ЛЕКАЛО", "How to use LEKALO"),
        attrs: { id: "help-dialog-title" },
      }),
      createEl("p", {
        text: copy(
          activeLanguage,
          "Найдите короткий ответ или выберите нужный раздел.",
          "Search for a short answer or choose a topic.",
        ),
      }),
    );
    const closeButton = createEl("button", {
      className: "help-close-button",
      text: "×",
      attrs: {
        type: "button",
        title: copy(activeLanguage, "Закрыть справку", "Close help"),
        "aria-label": copy(activeLanguage, "Закрыть справку", "Close help"),
      },
    });
    closeButton.addEventListener("click", close);
    header.append(heading, closeButton);

    const body = createEl("div", { className: "help-dialog-body" });
    const sidebar = createEl("aside", { className: "help-sidebar" });
    const searchLabel = createEl("label", {
      className: "help-search-label",
      attrs: { for: "help-search" },
    });
    searchLabel.appendChild(createEl("span", {
      text: copy(activeLanguage, "Поиск по справке", "Search help"),
    }));
    const search = createEl("input", {
      className: "help-search",
      attrs: {
        id: "help-search",
        type: "search",
        autocomplete: "off",
        placeholder: copy(activeLanguage, "Например: SVG, печать, мерки", "For example: SVG, print, measurements"),
        "aria-label": copy(activeLanguage, "Поиск по справке", "Search help"),
        "aria-controls": "help-topic-navigation",
      },
    });
    searchLabel.appendChild(search);
    const status = createEl("div", {
      className: "help-search-status",
      attrs: { role: "status", "aria-live": "polite" },
    });
    const navigation = createEl("nav", {
      className: "help-topic-navigation",
      attrs: {
        id: "help-topic-navigation",
        "aria-label": copy(activeLanguage, "Разделы справки", "Help topics"),
      },
    });
    sidebar.append(searchLabel, status, navigation);

    const content = createEl("main", { className: "help-content" });
    const article = createEl("article", {
      className: "help-article",
      attrs: { id: "help-article", tabindex: "-1" },
    });
    const empty = createEl("div", { className: "help-empty", attrs: { hidden: "" } });
    empty.append(
      createEl("strong", { text: copy(activeLanguage, "Ничего не найдено", "Nothing found") }),
      createEl("span", {
        text: copy(
          activeLanguage,
          "Попробуйте одно слово: «мерки», «SVG», «печать» или «размер».",
          "Try one word such as measurements, SVG, print, or size.",
        ),
      }),
    );
    content.append(article, empty);
    body.append(sidebar, content);

    const footer = createEl("footer", { className: "help-dialog-footer" });
    footer.append(
      createEl("span", {
        text: copy(
          activeLanguage,
          "Справка входит в приложение и доступна офлайн после первого запуска.",
          "Help is bundled with the app and remains available offline after first launch.",
        ),
      }),
      createEl("kbd", { text: "Esc" }),
    );

    const selectTopic = (topicId, { moveFocus = false } = {}) => {
      activeTopicId = topicId;
      const topic = getHelpTopics(activeLanguage).find((item) => item.id === activeTopicId);
      if (!topic) return;
      [...navigation.querySelectorAll("button")].forEach((button) => {
        const selected = button.dataset.topicId === activeTopicId;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-current", selected ? "page" : "false");
      });
      appendArticle(article, topic, activeLanguage);
      if (moveFocus) article.focus({ preventScroll: true });
      content.scrollTo({ top: 0, behavior: "auto" });
    };

    const updateResults = () => {
      const matches = searchHelpTopics(search.value, activeLanguage);
      navigation.replaceChildren();
      matches.forEach((topic, index) => {
        const button = createEl("button", {
          className: "help-topic-button",
          attrs: {
            type: "button",
            "data-topic-id": topic.id,
            "aria-controls": "help-article",
          },
        });
        button.append(
          createEl("span", { className: "help-topic-number", text: String(index + 1).padStart(2, "0") }),
          createEl("span", { className: "help-topic-copy" }),
        );
        button.lastElementChild.append(
          createEl("strong", { text: topic.title }),
          createEl("span", { text: topic.summary }),
        );
        button.addEventListener("click", () => selectTopic(topic.id, { moveFocus: true }));
        navigation.appendChild(button);
      });

      const hasMatches = matches.length > 0;
      empty.hidden = hasMatches;
      article.hidden = !hasMatches;
      status.textContent = search.value.trim()
        ? copy(activeLanguage, `Найдено разделов: ${matches.length}`, `${matches.length} topics found`)
        : copy(activeLanguage, `Разделов: ${matches.length}`, `${matches.length} topics`);
      if (!hasMatches) return;
      if (!matches.some((topic) => topic.id === activeTopicId)) activeTopicId = matches[0].id;
      selectTopic(activeTopicId);
    };

    search.addEventListener("input", updateResults);
    shell.append(header, body, footer);
    dialog.replaceChildren(shell);
    updateResults();
    const revealActiveTopic = () => {
      const selected = [...navigation.querySelectorAll("button")]
        .find((button) => button.dataset.topicId === activeTopicId);
      selected?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "auto" });
    };
    return { closeButton, search, revealActiveTopic };
  };

  const open = (topicId = "quick-start", nextLanguage = activeLanguage) => {
    activeLanguage = nextLanguage === "en" ? "en" : "ru";
    activeTopicId = isHelpTopicId(topicId) ? topicId : "quick-start";
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = render();
    if (!dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => {
      controls.revealActiveTopic();
      controls.closeButton.focus({ preventScroll: true });
    });
  };

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }, true);
  dialog.addEventListener("close", () => {
    const fallback = document.querySelector(`[data-help-topic="${activeTopicId}"]`)
      || document.querySelector("[data-help-topic]");
    const target = returnFocus?.isConnected ? returnFocus : fallback;
    target?.focus?.({ preventScroll: true });
    returnFocus = null;
  });

  return {
    el: dialog,
    open,
    close,
    get isOpen() { return dialog.open; },
  };
}
