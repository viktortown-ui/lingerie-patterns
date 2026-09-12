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

const measurementKeys = new Set([
  "bust",
  "waist",
  "highBust",
  "frontWidth",
  "backWidth",
  "shoulderLength",
  "frontWaistLength",
  "backWaistLength",
]);
const fields = upperBodyFields.filter((field) => measurementKeys.has(field.key));
const defaults = Object.fromEntries(fields.map((field) => [field.key, upperBodyDefaults[field.key]]));
const sections = upperBodySections.map((section) => section.id === "measurements"
  ? {
      ...section,
      short: { ru: "8 рабочих мерок", en: "8 working measurements" },
      description: {
        ru: "Поля ограничены восемью мерками, которые действительно меняют ширину, баланс, плечо, горловину или длину топа.",
        en: "The form is limited to the eight measurements that actually change the top's width, balance, shoulder, neckline, or length.",
      },
    }
  : section);

export const schema = {
  id: "crop_top_basic",
  name: { ru: "Базовый эластичный топ", en: "Basic stretch crop top" },
  bodyRegion: "upper",
  unit: "cm",
  sections,
  fields,
  defaults,
  options,
  optionDefaults: optionDefaults(options),
  validate: validateUpperBody,
};
