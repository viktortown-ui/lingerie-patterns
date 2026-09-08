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

const fabricOptions = upperFabricOptions.filter((option) => !option.key.startsWith("elastic"));
const styleOptions = [
  {
    key: "neckline",
    section: "style",
    display: "cards",
    label: { ru: "Горловина", en: "Neckline" },
    choices: [choice("Под горло", "Crew", "crew"), choice("Круглая", "Round", "round"), choice("Глубокая", "Scoop", "scoop"), choice("V-образная", "V-neck", "v")],
    default: "round",
  },
  {
    key: "topLength",
    section: "style",
    display: "segments",
    label: { ru: "Длина", en: "Length" },
    choices: [choice("Короткий", "Short", "short"), choice("Кроп", "Crop", "crop"), choice("До талии", "Waist", "waist")],
    default: "crop",
  },
  {
    key: "fit",
    section: "style",
    display: "cards",
    label: { ru: "Прилегание", en: "Fit" },
    choices: [choice("Плотное", "Snug", "snug"), choice("По фигуре", "Close", "close"), choice("Свободнее", "Easy", "easy")],
    default: "close",
  },
  {
    key: "hemFinish",
    section: "construction",
    display: "cards",
    label: { ru: "Обработка низа", en: "Hem finish" },
    choices: [choice("Подгибка", "Turned hem", "turn"), choice("Притачной пояс", "Hem band", "band")],
    default: "turn",
  },
];

const options = [...fabricOptions, ...styleOptions, upperSeamAllowanceOption];

export const schema = {
  id: "crop_top_basic",
  name: { ru: "Базовый эластичный топ", en: "Basic stretch crop top" },
  bodyRegion: "upper",
  unit: "cm",
  sections: upperBodySections,
  fields: upperBodyFields,
  defaults: upperBodyDefaults,
  options,
  optionDefaults: optionDefaults(options),
  validate: validateUpperBody,
};
