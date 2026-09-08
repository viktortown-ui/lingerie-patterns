const choice = (ru, en, value) => ({ label: { ru, en }, value });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function calculateBraletteBandGeometry(values = {}) {
  const bust = Number(values.bust);
  const underbust = Number(values.underbust);
  const bustPointDistance = Number(values.bustPointDistance);
  const workingStretchX = Number(values.workingStretchX);
  if (![bust, underbust, bustPointDistance, workingStretchX].every(Number.isFinite)) return null;
  const scaleX = 1 / (1 + clamp(workingStretchX, 0, 200) / 100);
  const bustDifference = bust - underbust;
  const cupWidth = clamp((bustDifference * 0.45 + bustPointDistance * 0.38) * scaleX, 7.5, 17);
  const bridgeWidth = clamp(bustPointDistance - cupWidth * 1.18, 1.5, 5);
  const targetBandLength = underbust * scaleX;
  const closureExtension = values.closure === "hooks" ? 3 : 0;
  const frontBandWidth = cupWidth * 2 + bridgeWidth;
  const requiredWingWidth = (targetBandLength - frontBandWidth + closureExtension) / 2;
  return {
    scaleX,
    cupWidth,
    bridgeWidth,
    targetBandLength,
    closureExtension,
    frontBandWidth,
    requiredWingWidth,
  };
}

export const upperBodySections = [
  {
    id: "measurements",
    step: 1,
    title: { ru: "Мерки верха", en: "Upper-body measurements" },
    short: { ru: "11 мерок", en: "11 measurements" },
    description: {
      ru: "Снимайте мерки поверх тонкого белья. Горизонтали держите параллельно полу, а длины измеряйте от основания шеи.",
      en: "Measure over light underwear. Keep circumferences level and take vertical lengths from the neck base.",
    },
  },
  {
    id: "fabric",
    step: 2,
    title: { ru: "Материал", en: "Material" },
    short: { ru: "Растяжимость", en: "Stretch" },
    description: {
      ru: "Укажите комфортное рабочее растяжение и восстановление полотна. Эти значения меняют ширину лекал.",
      en: "Enter the fabric's comfortable working stretch and recovery. These values change the drafted width.",
    },
  },
  {
    id: "style",
    step: 3,
    title: { ru: "Форма и посадка", en: "Shape & fit" },
    short: { ru: "Фасон", en: "Style" },
    description: {
      ru: "Выберите покрытие и силу прилегания. Это управляемые параметры, а не скрытые формулы.",
      en: "Choose coverage and fit. These are explicit drafting parameters rather than hidden formulas.",
    },
  },
  {
    id: "construction",
    step: 4,
    title: { ru: "Пошив", en: "Construction" },
    short: { ru: "Обработка", en: "Finishing" },
    description: {
      ru: "Настройте резинку, подкладку и технологический припуск. Перед основной тканью выполните пробный образец.",
      en: "Set elastic, lining, and seam allowance. Make a toile before using the final fabric.",
    },
  },
];

export const upperBodyFields = [
  {
    key: "bust",
    code: "OG",
    section: "measurements",
    label: { ru: "Обхват груди", en: "Full bust circumference" },
    description: {
      ru: "Горизонтально через наиболее выступающие точки груди и лопатки.",
      en: "Level around the fullest bust points and shoulder blades.",
    },
    min: 68,
    max: 160,
    step: 0.5,
  },
  {
    key: "underbust",
    code: "OPG",
    section: "measurements",
    label: { ru: "Обхват под грудью", en: "Underbust circumference" },
    description: {
      ru: "Плотно под основанием груди, на спокойном выдохе, без перетягивания.",
      en: "Snugly under the bust on a relaxed exhale without overtightening.",
    },
    min: 58,
    max: 140,
    step: 0.5,
  },
  {
    key: "waist",
    code: "OT",
    section: "measurements",
    label: { ru: "Обхват талии", en: "Waist circumference" },
    description: {
      ru: "По зафиксированной линии талии, без прибавок и утяжки.",
      en: "Around the fixed waistline without ease or tightening.",
    },
    min: 48,
    max: 150,
    step: 0.5,
  },
  {
    key: "highBust",
    code: "OG1",
    section: "measurements",
    label: { ru: "Обхват над грудью", en: "High bust circumference" },
    description: {
      ru: "Через подмышечные впадины над объёмом груди, лента горизонтальна.",
      en: "Above the bust through the underarm level, keeping the tape horizontal.",
    },
    min: 66,
    max: 154,
    step: 0.5,
  },
  {
    key: "frontWidth",
    code: "SHG",
    section: "measurements",
    label: { ru: "Ширина груди", en: "Front chest width" },
    description: {
      ru: "Между передними углами подмышечных впадин, не включая объём груди.",
      en: "Between the front underarm creases, excluding the bust projection.",
    },
    min: 26,
    max: 52,
    step: 0.5,
  },
  {
    key: "backWidth",
    code: "SHS",
    section: "measurements",
    label: { ru: "Ширина спины", en: "Back width" },
    description: {
      ru: "Горизонтально между задними углами подмышечных впадин.",
      en: "Horizontally between the rear underarm creases.",
    },
    min: 28,
    max: 54,
    step: 0.5,
  },
  {
    key: "shoulderLength",
    code: "DP",
    section: "measurements",
    label: { ru: "Длина плеча", en: "Shoulder length" },
    description: {
      ru: "От основания шеи до плечевой точки по естественному наклону.",
      en: "From the neck base to the shoulder point along the natural slope.",
    },
    min: 8,
    max: 20,
    step: 0.5,
  },
  {
    key: "frontWaistLength",
    code: "DTP",
    section: "measurements",
    label: { ru: "Длина переда до талии", en: "Front length to waist" },
    description: {
      ru: "От основания шеи через выступающую точку груди до линии талии.",
      en: "From the neck base over the bust point to the waistline.",
    },
    min: 34,
    max: 65,
    step: 0.5,
  },
  {
    key: "backWaistLength",
    code: "DTS",
    section: "measurements",
    label: { ru: "Длина спины до талии", en: "Back length to waist" },
    description: {
      ru: "От седьмого шейного позвонка вертикально до линии талии.",
      en: "From the seventh cervical vertebra vertically to the waistline.",
    },
    min: 32,
    max: 58,
    step: 0.5,
  },
  {
    key: "bustHeight",
    code: "VG",
    section: "measurements",
    label: { ru: "Высота груди", en: "Bust height" },
    description: {
      ru: "От основания шеи до выступающей точки груди.",
      en: "From the neck base to the bust point.",
    },
    min: 18,
    max: 40,
    step: 0.5,
  },
  {
    key: "bustPointDistance",
    code: "CG",
    section: "measurements",
    label: { ru: "Расстояние между центрами груди", en: "Bust point distance" },
    description: {
      ru: "Между выступающими точками груди по горизонтали.",
      en: "Horizontally between the two bust points.",
    },
    min: 12,
    max: 32,
    step: 0.5,
  },
];

export const upperBodyDefaults = {
  bust: 92,
  underbust: 78,
  waist: 72,
  highBust: 88,
  frontWidth: 35,
  backWidth: 36,
  shoulderLength: 12.5,
  frontWaistLength: 45,
  backWaistLength: 41,
  bustHeight: 27,
  bustPointDistance: 19,
};

export const upperFabricOptions = [
  {
    key: "fabricMaxStretch",
    section: "fabric",
    display: "segments",
    label: { ru: "Максимальная растяжимость поперёк", en: "Maximum crosswise stretch" },
    description: {
      ru: "Предел полотна без повреждения. Из 10 до 15 см = 50%.",
      en: "The fabric limit without damage. From 10 to 15 cm = 50%.",
    },
    choices: [choice("20%", "20%", 20), choice("30%", "30%", 30), choice("50%", "50%", 50), choice("80%", "80%", 80)],
    default: 50,
  },
  {
    key: "workingStretchX",
    section: "fabric",
    display: "segments",
    label: { ru: "Рабочее растяжение поперёк", en: "Working crosswise stretch" },
    description: {
      ru: "Комфортное постоянное растяжение изделия, а не максимум материала.",
      en: "Comfortable sustained garment stretch rather than the material maximum.",
    },
    choices: [choice("5%", "5%", 5), choice("10%", "10%", 10), choice("15%", "15%", 15), choice("20%", "20%", 20), choice("25%", "25%", 25), choice("30%", "30%", 30)],
    default: 15,
  },
  {
    key: "workingStretchY",
    section: "fabric",
    display: "segments",
    label: { ru: "Рабочее растяжение вдоль", en: "Working lengthwise stretch" },
    choices: [choice("0%", "0%", 0), choice("5%", "5%", 5), choice("10%", "10%", 10), choice("15%", "15%", 15)],
    default: 5,
  },
  {
    key: "recovery",
    section: "fabric",
    display: "cards",
    label: { ru: "Восстановление формы", en: "Fabric recovery" },
    description: {
      ru: "После растяжения образец должен возвращаться к исходному размеру.",
      en: "The swatch should return to its original size after stretching.",
    },
    choices: [
      choice("Отличное", "Excellent", "strong"),
      choice("Хорошее", "Good", "good"),
      choice("Слабое", "Weak", "weak"),
    ],
    default: "good",
  },
  {
    key: "elasticWorkingStretch",
    section: "fabric",
    display: "segments",
    label: { ru: "Рабочее растяжение резинки", en: "Elastic working stretch" },
    choices: [choice("10%", "10%", 10), choice("15%", "15%", 15), choice("20%", "20%", 20), choice("25%", "25%", 25)],
    default: 15,
  },
  {
    key: "elasticMaxStretch",
    section: "fabric",
    display: "segments",
    label: { ru: "Максимум растяжимости резинки", en: "Elastic maximum stretch" },
    choices: [choice("40%", "40%", 40), choice("60%", "60%", 60), choice("80%", "80%", 80), choice("100%", "100%", 100)],
    default: 80,
  },
];

export const upperSeamAllowanceOption = {
  key: "seamAllowance",
  section: "construction",
  display: "segments",
  label: { ru: "Технологический припуск", en: "Construction seam allowance" },
  description: {
    ru: "Добавляется к деталям по контуру. Подберите ширину под строчку или оверлок.",
    en: "Added around each piece. Match it to the selected stitch or overlock width.",
  },
  choices: [choice("0 мм", "0 mm", 0), choice("6 мм", "6 mm", 6), choice("8 мм", "8 mm", 8), choice("10 мм", "10 mm", 10)],
  default: 6,
};

export function validateUpperBody(values) {
  const errors = {};
  const add = (key, ru, en) => {
    errors[key] = [...(errors[key] || []), { ru, en }];
  };
  const bust = Number(values.bust);
  const underbust = Number(values.underbust);
  const highBust = Number(values.highBust);
  const frontWaistLength = Number(values.frontWaistLength);
  const bustHeight = Number(values.bustHeight);
  const bustPointDistance = Number(values.bustPointDistance);
  const fabricMaxStretch = Number(values.fabricMaxStretch);
  const workingStretchX = Number(values.workingStretchX);
  const elasticMaxStretch = Number(values.elasticMaxStretch);
  const elasticWorkingStretch = Number(values.elasticWorkingStretch);

  if (Number.isFinite(bust) && Number.isFinite(underbust) && bust < underbust + 4) {
    add("bust", "Обхват груди должен быть минимум на 4 см больше обхвата под грудью.", "Full bust must be at least 4 cm greater than underbust.");
  }
  if (Number.isFinite(bust) && Number.isFinite(highBust) && bust < highBust + 1) {
    add("highBust", "Обхват над грудью должен быть меньше полного обхвата груди.", "High bust must be smaller than full bust.");
  }
  if (Number.isFinite(frontWaistLength) && Number.isFinite(bustHeight) && frontWaistLength < bustHeight + 7) {
    add("frontWaistLength", "Длина переда должна проходить ниже точки груди минимум на 7 см.", "Front waist length must extend at least 7 cm below the bust point.");
  }
  if (Number.isFinite(bust) && Number.isFinite(bustPointDistance) && bustPointDistance >= bust * 0.5) {
    add("bustPointDistance", "Проверьте расстояние между центрами груди: оно не может равняться половине обхвата груди.", "Recheck bust point distance; it cannot equal half the full bust circumference.");
  }
  if (Number.isFinite(fabricMaxStretch) && Number.isFinite(workingStretchX) && workingStretchX > fabricMaxStretch) {
    add("workingStretchX", "Рабочее растяжение не может быть больше предела полотна.", "Working stretch cannot exceed the fabric maximum.");
  }
  if (Number.isFinite(elasticMaxStretch) && Number.isFinite(elasticWorkingStretch) && elasticWorkingStretch > elasticMaxStretch) {
    add("elasticWorkingStretch", "Рабочее растяжение резинки не может быть больше её предела.", "Elastic working stretch cannot exceed its maximum.");
  }
  if (Object.prototype.hasOwnProperty.call(values, "cupCoverage")) {
    const band = calculateBraletteBandGeometry(values);
    if (band && band.requiredWingWidth < 8) {
      add(
        "underbust",
        "Эта комбинация мерок не оставляет минимум 8 см на боковую часть пояса. Перепроверьте обхваты груди и под грудью, расстояние между центрами груди и рабочее растяжение.",
        "These proportions leave less than 8 cm for the side wing. Recheck full bust, underbust, bust-point distance, and working stretch.",
      );
    }
  }
  return errors;
}

export function optionDefaults(options) {
  return Object.fromEntries(options.map((option) => [option.key, option.default]));
}

export { choice };
