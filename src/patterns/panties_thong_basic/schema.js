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

const thongOptions = [
  {
    key: "thongShape",
    section: "style",
    display: "cards",
    label: { ru: "Форма спинки", en: "Back shape" },
    choices: [
      { label: { ru: "Танга", en: "Tanga" }, value: "tanga" },
      { label: { ru: "Стринги", en: "Thong" }, value: "thong" },
    ],
    default: "thong",
  },
  {
    key: "thongWidthCm",
    section: "construction",
    display: "segments",
    label: { ru: "Ширина спинки у ластовицы", en: "Back width at gusset" },
    description: {
      ru: "Готовая ширина узкой части. Для первой примерки начните с 2,5–3 см.",
      en: "Finished width of the narrow section. Start around 2.5–3 cm for the first toile.",
    },
    choices: [
      { label: { ru: "1,5 см", en: "1.5 cm" }, value: 1.5 },
      { label: { ru: "2 см", en: "2 cm" }, value: 2 },
      { label: { ru: "2,5 см", en: "2.5 cm" }, value: 2.5 },
      { label: { ru: "3 см", en: "3 cm" }, value: 3 },
      { label: { ru: "3,5 см", en: "3.5 cm" }, value: 3.5 },
    ],
    default: 2.5,
  },
];

const construction = [...constructionOptions];
construction.splice(3, 0, thongOptions[1]);
const options = [...fabricOptions, ...styleOptions, thongOptions[0], ...construction];

export const schema = {
  id: "panties_thong_basic",
  name: { ru: "Стринги и танга по меркам", en: "Custom thong & tanga" },
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
