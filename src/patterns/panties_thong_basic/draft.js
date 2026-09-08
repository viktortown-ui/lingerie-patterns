import { draftLowerUnderwear } from "../shared/underwearDraft.js";

export function draftThong(measurements, options = {}, adjustments = {}) {
  return draftLowerUnderwear(measurements, options, adjustments, {
    isThong: true,
    moduleId: "panties_thong_basic",
    version: "1.0.0",
    title: { ru: "Стринги и танга по индивидуальным меркам", en: "Custom-fit thong & tanga" },
  });
}
