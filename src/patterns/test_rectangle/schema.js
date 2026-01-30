export const schema = {
  id: "test_rectangle",
  name: "Test Rectangle",
  unit: "cm",
  fields: [
    {
      key: "width_cm",
      label: { en: "Width", ru: "Ширина" },
      description: { en: "Rectangle width.", ru: "Ширина прямоугольника." },
      min: 5,
      max: 80,
      step: 0.5,
    },
    {
      key: "height_cm",
      label: { en: "Height", ru: "Высота" },
      description: { en: "Rectangle height.", ru: "Высота прямоугольника." },
      min: 5,
      max: 120,
      step: 0.5,
    },
    {
      key: "seam_allowance_cm",
      label: { en: "Seam allowance", ru: "Припуск на шов" },
      description: {
        en: "Additional margin added around the panel.",
        ru: "Дополнительный припуск по периметру детали.",
      },
      min: 0,
      max: 2,
      step: 0.1,
    },
  ],
  defaults: {
    width_cm: 20,
    height_cm: 30,
    seam_allowance_cm: 0,
  },
};
