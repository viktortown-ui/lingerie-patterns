import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HELP_CONTENT_VERSION,
  HELP_TOPIC_IDS,
  getHelpTopics,
  isHelpTopicId,
  searchHelpTopics,
} from "../src/ui/help/helpContent.js";

test("help content has a stable complete bilingual topic contract", () => {
  assert.equal(HELP_CONTENT_VERSION, 1);
  assert.equal(new Set(HELP_TOPIC_IDS).size, HELP_TOPIC_IDS.length);
  assert.deepEqual(
    HELP_TOPIC_IDS,
    [
      "quick-start",
      "measurements",
      "style-controls",
      "saving",
      "add-patterns",
      "svg-import",
      "export-print",
      "size-set",
      "fit-privacy",
    ],
  );

  for (const language of ["ru", "en"]) {
    const topics = getHelpTopics(language);
    assert.deepEqual(topics.map((topic) => topic.id), HELP_TOPIC_IDS);
    topics.forEach((topic) => {
      assert.ok(topic.title.trim().length >= 4, `${language}/${topic.id} needs a title`);
      assert.ok(topic.summary.trim().length >= 12, `${language}/${topic.id} needs a summary`);
      assert.ok(topic.intro.trim().length >= 20, `${language}/${topic.id} needs an introduction`);
      assert.ok(topic.steps.length >= 4, `${language}/${topic.id} needs actionable steps`);
      assert.ok(topic.steps.every((step) => step.trim().length >= 12));
      assert.ok(topic.bullets.length >= 2, `${language}/${topic.id} needs practical details`);
      assert.ok(topic.warningTitle.trim());
      assert.ok(topic.warning.trim().length >= 20);
    });
  }
});

test("help search finds practical Russian and English questions", () => {
  assert.deepEqual(searchHelpTopics("как добавить выкройку", "ru").map(({ id }) => id), ["add-patterns"]);
  assert.equal(searchHelpTopics("масштаб SVG", "ru")[0]?.id, "svg-import");
  assert.ok(searchHelpTopics("печать 100", "ru").some(({ id }) => id === "export-print"));
  assert.ok(searchHelpTopics("measurements", "en").some(({ id }) => id === "measurements"));
  assert.ok(searchHelpTopics("A/B/C", "en").some(({ id }) => id === "style-controls"));
  assert.equal(searchHelpTopics("несуществующийзапрос", "ru").length, 0);
});

test("help topic ids reject unknown contextual routes", () => {
  HELP_TOPIC_IDS.forEach((id) => assert.equal(isHelpTopicId(id), true));
  for (const id of ["", null, "../quick-start", "unknown"]) assert.equal(isHelpTopicId(id), false);
});

test("help UI preserves its mobile and keyboard accessibility contract", () => {
  const component = readFileSync(new URL("../src/ui/components/HelpCenter.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../assets/css/app.css", import.meta.url), "utf8");
  assert.match(component, /"aria-label": copy\(activeLanguage, "Поиск по справке", "Search help"\)/u);
  assert.match(component, /tabindex: "-1"/u);
  assert.match(component, /scrollIntoView\?\.\(\{ block: "nearest", inline: "center", behavior: "auto" \}\)/u);
  assert.match(component, /if \(event\.key !== "Escape"\) return;/u);
  assert.match(styles, /\.help-article:focus-visible\s*\{[^}]*outline:/su);
  assert.doesNotMatch(styles, /\.help-article\s*\{[^}]*outline:\s*0/su);
});
