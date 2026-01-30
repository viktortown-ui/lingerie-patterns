export const schema = {
  id: "test_rectangle",
  name: "Test Rectangle",
  unit: "cm",
  fields: [
    {
      key: "width_cm",
      label: "Width",
      description: "Rectangle width.",
      min: 5,
      max: 80,
      step: 0.5,
    },
    {
      key: "height_cm",
      label: "Height",
      description: "Rectangle height.",
      min: 5,
      max: 120,
      step: 0.5,
    },
    {
      key: "seam_allowance_cm",
      label: "Seam allowance",
      description: "Additional margin added around the panel.",
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
