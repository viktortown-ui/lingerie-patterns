export const schema = {
  id: "panties_basic",
  name: "Panties Basic",
  unit: "cm",
  fields: [
    {
      key: "waist",
      label: "Waist circumference",
      description: "Measure around the natural waist.",
      min: 50,
      max: 120,
      step: 0.5,
    },
    {
      key: "hip",
      label: "Hip circumference",
      description: "Measure around the fullest part of the hips.",
      min: 70,
      max: 140,
      step: 0.5,
    },
    {
      key: "rise",
      label: "Rise",
      description: "Vertical distance from waist to crotch (front).",
      min: 18,
      max: 35,
      step: 0.5,
    },
    {
      key: "legOpening",
      label: "Leg opening",
      description: "Circumference around the leg opening.",
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
      key: "style",
      label: "Style",
      description: "Base style for the panty leg curve.",
      choices: [
        { label: "Classic", value: "classic" },
      ],
      default: "classic",
    },
    {
      key: "seamAllowance",
      label: "Seam allowance",
      description: "Add a default seam allowance around the panel.",
      choices: [
        { label: "Off", value: "off" },
        { label: "On", value: "on" },
      ],
      default: "off",
    },
  ],
  optionDefaults: {
    style: "classic",
    seamAllowance: "off",
  },
};
