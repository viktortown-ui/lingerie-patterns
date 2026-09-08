import {
  choice,
  optionDefaults,
  upperBodyDefaults,
  upperBodyFields,
  upperBodySections,
  upperFabricOptions,
  upperSeamAllowanceOption,
  validateUpperBody,
} from "../shared/upperBodySchema.js";

const styleOptions = [
  {
    key: "cupCoverage",
    section: "style",
    display: "cards",
    label: { ru: "Покрытие чашки", en: "Cup coverage" },
    description: { ru: "Меняет высоту мягкой чашки без каркаса.", en: "Changes the height of the wireless soft cup." },
    choices: [choice("Низкое", "Low", "low"), choice("Среднее", "Medium", "medium"), choice("Закрытое", "Full", "full")],
    default: "medium",
  },
  {
    key: "bandHeightCm",
    section: "style",
    display: "segments",
    label: { ru: "Высота пояса", en: "Underband height" },
    choices: [choice("4 см", "4 cm", 4), choice("6 см", "6 cm", 6), choice("8 см", "8 cm", 8)],
    default: 6,
  },
  {
    key: "strapWidthCm",
    section: "style",
    display: "segments",
    label: { ru: "Ширина бретели", en: "Strap width" },
    choices: [choice("1 см", "1 cm", 1), choice("1,5 см", "1.5 cm", 1.5), choice("2 см", "2 cm", 2)],
    default: 1.5,
  },
  {
    key: "closure",
    section: "construction",
    display: "cards",
    label: { ru: "Застёжка", en: "Closure" },
    choices: [choice("Без застёжки", "Pullover", "pullover"), choice("Крючки на спинке", "Back hooks", "hooks")],
    default: "pullover",
  },
  {
    key: "cupLining",
    section: "construction",
    display: "cards",
    label: { ru: "Подкладка чашек", en: "Cup lining" },
    choices: [choice("Да", "Yes", true), choice("Нет", "No", false)],
    default: true,
  },
];

const options = [...upperFabricOptions, ...styleOptions, upperSeamAllowanceOption];

export const schema = {
  id: "bralette_soft",
  name: { ru: "Мягкий бралетт без каркасов", en: "Wireless soft bralette" },
  bodyRegion: "upper",
  unit: "cm",
  sections: upperBodySections,
  fields: upperBodyFields,
  defaults: upperBodyDefaults,
  options,
  optionDefaults: optionDefaults(options),
  validate: validateUpperBody,
};
