export const schema = {
  id: "panties_thong_basic",
  name: { en: "Panties Thong Basic", ru: "Базовые стринги" },
  unit: "cm",
  fields: [
    {
      key: "waist",
      code: "W",
      label: { en: "Waist circumference", ru: "Обхват талии" },
      description: {
        en: "Measure around the natural waist.",
        ru: "Измерьте окружность по линии талии.",
      },
      min: 50,
      max: 120,
      step: 0.5,
    },
    {
      key: "hip",
      code: "H",
      label: { en: "Hip circumference", ru: "Обхват бёдер" },
      description: {
        en: "Measure around the fullest part of the hips.",
        ru: "Измерьте окружность по самой выступающей части бёдер.",
      },
      min: 70,
      max: 140,
      step: 0.5,
    },
    {
      key: "rise",
      code: "D",
      label: { en: "Rise", ru: "Высота сидения" },
      description: {
        en: "Vertical distance from waist to crotch (front).",
        ru: "Вертикальное расстояние от талии до паховой точки спереди.",
      },
      min: 18,
      max: 35,
      step: 0.5,
    },
    {
      key: "legOpening",
      code: "L",
      label: { en: "Leg opening", ru: "Обхват по вырезу ноги" },
      description: {
        en: "Circumference around the leg opening.",
        ru: "Окружность по линии выреза ноги.",
      },
      min: 40,
      max: 80,
      step: 0.5,
    },
  ],
  defaults: {
    waist: 70,
    hip: 95,
    rise: 23,
    legOpening: 55,
  },
  options: [
    {
      key: "thongWidth",
      label: { en: "Thong width (cm)", ru: "Ширина стрингов (см)" },
      description: {
        en: "Controls the narrow width of the thong at the crotch.",
        ru: "Управляет узкой шириной стрингов в области ластовицы.",
      },
      choices: [
        { label: { en: "2cm", ru: "2см" }, value: 2 },
        { label: { en: "3cm", ru: "3см" }, value: 3 },
        { label: { en: "4cm", ru: "4см" }, value: 4 },
        { label: { en: "5cm", ru: "5см" }, value: 5 },
      ],
      default: 3,
    },
    {
      key: "seamAllowance",
      label: { en: "Seam allowance", ru: "Припуск на шов" },
      description: {
        en: "Add a default seam allowance around the panel.",
        ru: "Добавить припуск на шов вокруг детали.",
      },
      choices: [
        { label: { en: "0mm", ru: "0мм" }, value: 0 },
        { label: { en: "6mm", ru: "6мм" }, value: 6 },
        { label: { en: "8mm", ru: "8мм" }, value: 8 },
        { label: { en: "10mm", ru: "10мм" }, value: 10 },
      ],
      default: 6,
    },
  ],
  optionDefaults: {
    thongWidth: 3,
    seamAllowance: 6,
  },
};
