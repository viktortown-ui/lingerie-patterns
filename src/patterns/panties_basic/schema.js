import {
  constructionOptions,
  fabricOptions,
  lowerBodyDefaults,
  lowerBodyAdjustmentDefaults,
  lowerBodyAdjustments,
  lowerBodyFields,
  lowerBodySections,
  optionDefaults,
  styleOptions,
  validateLowerBody,
} from "../shared/lowerBodySchema.js";

const backCoverage = {
  key: "backCoverage",
  section: "style",
  display: "cards",
  label: { ru: "Покрытие ягодиц", en: "Back coverage" },
  description: {
    ru: "Полное — спокойная посадка; cheeky открывает нижнюю часть ягодиц.",
    en: "Full gives conservative coverage; cheeky reveals more of the lower seat.",
  },
  choices: [
    { label: { ru: "Полное", en: "Full" }, value: "full" },
    { label: { ru: "Классика", en: "Classic" }, value: "classic" },
    { label: { ru: "Cheeky", en: "Cheeky" }, value: "cheeky" },
  ],
  default: "classic",
};

const options = [...fabricOptions, ...styleOptions, backCoverage, ...constructionOptions];

export const schema = {
  id: "panties_basic",
  name: { ru: "Трусики по индивидуальным меркам", en: "Custom-fit panties" },
  bodyRegion: "lower",
  unit: "cm",
  sections: lowerBodySections,
  fields: lowerBodyFields,
  defaults: lowerBodyDefaults,
  options,
  optionDefaults: optionDefaults(options),
  adjustments: lowerBodyAdjustments,
  adjustmentDefaults: lowerBodyAdjustmentDefaults,
  validate: validateLowerBody,
};
