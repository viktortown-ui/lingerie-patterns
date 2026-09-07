import { draftLowerUnderwear } from "../shared/underwearDraft.js";

export function draftPanties(measurements, options = {}, adjustments = {}) {
  return draftLowerUnderwear(measurements, options, adjustments, {
    moduleId: "panties_basic",
    version: "1.0.0",
    title: { ru: "Трусики по индивидуальным меркам", en: "Custom-fit panties" },
  });
}
