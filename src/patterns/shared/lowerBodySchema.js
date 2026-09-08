export const lowerBodySections = [
  {
    id: "measurements",
    step: 1,
    title: { ru: "Мерки", en: "Measurements" },
    short: { ru: "7 мерок", en: "7 measurements" },
    description: {
      ru: "Все вертикальные мерки снимайте от одной и той же линии талии. Лента прилегает, но не врезается.",
      en: "Take every vertical measurement from the same fixed waistline. Keep the tape snug, not tight.",
    },
  },
  {
    id: "fabric",
    step: 2,
    title: { ru: "Ткань и резинка", en: "Fabric & elastic" },
    short: { ru: "Растяжимость", en: "Stretch" },
    description: {
      ru: "Растяжимость влияет на размер лекал. Используйте рабочее растяжение, а не предел ткани.",
      en: "Stretch changes the drafted size. Use comfortable working stretch, not the fabric maximum.",
    },
  },
  {
    id: "style",
    step: 3,
    title: { ru: "Фасон", en: "Style" },
    short: { ru: "Посадка", en: "Shape" },
    description: {
      ru: "Настройте высоту, линию ноги и покрытие. Чертёж пересчитывается сразу.",
      en: "Set rise, leg line, and coverage. The draft updates instantly.",
    },
  },
  {
    id: "construction",
    step: 4,
    title: { ru: "Пошив", en: "Construction" },
    short: { ru: "Припуски", en: "Finishing" },
    description: {
      ru: "Выберите обработку краёв, ластовицу и общий припуск соединительных швов.",
      en: "Choose edge finishing, gusset settings, and the joining seam allowance.",
    },
  },
];

export const lowerBodyFields = [
  {
    key: "waist",
    code: "OT",
    section: "measurements",
    label: { ru: "Обхват талии", en: "Waist circumference" },
    description: {
      ru: "По зафиксированной линии талии, строго горизонтально.",
      en: "Around the fixed waistline, parallel to the floor.",
    },
    min: 48,
    max: 150,
    step: 0.5,
  },
  {
    key: "highHip",
    code: "OB1",
    section: "measurements",
    label: { ru: "Верхний обхват таза", en: "High hip circumference" },
    description: {
      ru: "Обычно на 8–12 см ниже талии, по верхним косточкам таза.",
      en: "Usually 8–12 cm below the waist, around the upper hip bones.",
    },
    min: 58,
    max: 170,
    step: 0.5,
  },
  {
    key: "seat",
    code: "OB",
    section: "measurements",
    label: { ru: "Обхват ягодиц", en: "Seat circumference" },
    description: {
      ru: "Через самые выступающие точки ягодиц, не затягивая ленту.",
      en: "Around the fullest part of the seat without tightening the tape.",
    },
    min: 68,
    max: 180,
    step: 0.5,
  },
  {
    key: "waistToHighHip",
    code: "VT1",
    section: "measurements",
    label: { ru: "Талия → верх таза", en: "Waist to high hip" },
    description: {
      ru: "Вертикально сбоку от талии до линии верхнего обхвата таза.",
      en: "Vertically at the side from waist to the high-hip line.",
    },
    min: 5,
    max: 20,
    step: 0.5,
  },
  {
    key: "waistToSeat",
    code: "VT",
    section: "measurements",
    label: { ru: "Талия → линия ягодиц", en: "Waist to seat" },
    description: {
      ru: "Вертикально сбоку до уровня максимального обхвата ягодиц.",
      en: "Vertically at the side to the fullest seat level.",
    },
    min: 12,
    max: 35,
    step: 0.5,
  },
  {
    key: "crossSeam",
    code: "DS",
    section: "measurements",
    label: { ru: "Полная дуга сидения", en: "Full crotch arc" },
    description: {
      ru: "От талии спереди через промежность до талии сзади. Лента проходит рядом с телом.",
      en: "From front waist through the crotch to back waist, following the body.",
    },
    min: 50,
    max: 110,
    step: 0.5,
  },
  {
    key: "crossSeamFront",
    code: "DSP",
    section: "measurements",
    label: { ru: "Передняя дуга сидения", en: "Front crotch arc" },
    description: {
      ru: "От талии спереди до середины промежности по той же траектории.",
      en: "From front waist to the crotch midpoint along the same route.",
    },
    min: 22,
    max: 55,
    step: 0.5,
  },
];

export const lowerBodyDefaults = {
  waist: 72,
  highHip: 88,
  seat: 98,
  waistToHighHip: 10,
  waistToSeat: 20,
  crossSeam: 72,
  crossSeamFront: 34,
};

export const lowerBodyAdjustments = [
  {
    key: "frontWaistDepth",
    code: "A1",
    axis: "y",
    label: { ru: "Глубина талии переда", en: "Front waist depth" },
    description: {
      ru: "Поднять или опустить середину линии талии переда.",
      en: "Raise or lower the centre of the front waistline.",
    },
    min: -2,
    max: 2,
    step: 0.1,
    unit: "cm",
    default: 0,
  },
  {
    key: "frontLegCurve",
    code: "A2",
    axis: "y",
    label: { ru: "Кривая ноги переда", en: "Front leg curve" },
    description: {
      ru: "Точная настройка вогнутости линии ноги без изменения её концов.",
      en: "Fine-tune the front leg curve without moving its endpoints.",
    },
    min: -2.5,
    max: 2.5,
    step: 0.1,
    unit: "cm",
    default: 0,
  },
  {
    key: "backWaistDepth",
    code: "B1",
    axis: "y",
    label: { ru: "Глубина талии спинки", en: "Back waist depth" },
    description: {
      ru: "Поднять или опустить середину линии талии спинки.",
      en: "Raise or lower the centre of the back waistline.",
    },
    min: -2,
    max: 2,
    step: 0.1,
    unit: "cm",
    default: 0,
  },
  {
    key: "backLegCurve",
    code: "B2",
    axis: "y",
    label: { ru: "Кривая ноги спинки", en: "Back leg curve" },
    description: {
      ru: "Меняет покрытие по ягодицам, сохраняя боковой и ластовичный швы.",
      en: "Changes seat coverage while preserving the side and gusset seams.",
    },
    min: -3,
    max: 3,
    step: 0.1,
    unit: "cm",
    default: 0,
  },
  {
    key: "sideHeight",
    code: "C1",
    axis: "y",
    label: { ru: "Высота бокового шва", en: "Side-seam height" },
    description: {
      ru: "Одновременно меняет высоту одинаковых боковых швов переда и спинки.",
      en: "Adjusts the matched front and back side seams together.",
    },
    min: -2,
    max: 2,
    step: 0.1,
    unit: "cm",
    default: 0,
  },
];

export const lowerBodyAdjustmentDefaults = Object.fromEntries(
  lowerBodyAdjustments.map((adjustment) => [adjustment.key, adjustment.default]),
);

export function validateLowerBody(values) {
  const errors = {};
  const add = (key, ru, en) => {
    errors[key] = [...(errors[key] || []), { ru, en }];
  };
  const waistToHighHip = Number(values.waistToHighHip);
  const waistToSeat = Number(values.waistToSeat);
  const crossSeam = Number(values.crossSeam);
  const crossSeamFront = Number(values.crossSeamFront);
  const fabricMaxStretch = Number(values.fabricMaxStretch);
  const workingStretchX = Number(values.workingStretchX);
  const elasticMaxStretch = Number(values.elasticMaxStretch);
  const elasticWorkingStretch = Number(values.elasticWorkingStretch);
  if (Number.isFinite(waistToHighHip) && Number.isFinite(waistToSeat) && waistToSeat <= waistToHighHip) {
    add("waistToSeat", "Эта высота должна быть больше расстояния до верхней линии таза.", "This height must be greater than waist-to-high-hip.");
  }
  if (Number.isFinite(crossSeam) && Number.isFinite(crossSeamFront) && crossSeamFront >= crossSeam - 8) {
    add("crossSeamFront", "Передняя дуга должна быть заметно меньше полной дуги сидения.", "Front crotch arc must be clearly smaller than the full crotch arc.");
  }
  if (Number.isFinite(fabricMaxStretch) && Number.isFinite(workingStretchX) && workingStretchX > fabricMaxStretch) {
    add("workingStretchX", "Рабочее растяжение не может быть больше предела ткани.", "Working stretch cannot exceed the fabric maximum.");
  }
  if (Number.isFinite(elasticMaxStretch) && Number.isFinite(elasticWorkingStretch) && elasticWorkingStretch > elasticMaxStretch) {
    add("elasticWorkingStretch", "Рабочее растяжение резинки не может быть больше её предела.", "Elastic working stretch cannot exceed its maximum.");
  }
  return errors;
}

const choice = (ru, en, value) => ({ label: { ru, en }, value });

export const fabricOptions = [
  {
    key: "fabricMaxStretch",
    section: "fabric",
    display: "segments",
    label: { ru: "Максимальная растяжимость поперёк", en: "Maximum crosswise stretch" },
    description: {
      ru: "Насколько далеко образец можно растянуть без повреждения. Из 10 до 18 см = 80%.",
      en: "How far the swatch can stretch without damage. From 10 to 18 cm = 80%.",
    },
    choices: [choice("30%", "30%", 30), choice("50%", "50%", 50), choice("80%", "80%", 80), choice("120%", "120%", 120)],
    default: 80,
  },
  {
    key: "workingStretchX",
    section: "fabric",
    display: "segments",
    label: { ru: "Рабочее растяжение поперёк", en: "Working crosswise stretch" },
    description: {
      ru: "Комфортное постоянное растяжение в изделии. Для ткани с максимумом 80% начните с 25–30%.",
      en: "Comfortable sustained stretch in the garment. For 80% maximum stretch, start around 25–30%.",
    },
    choices: [choice("10%", "10%", 10), choice("15%", "15%", 15), choice("20%", "20%", 20), choice("25%", "25%", 25), choice("30%", "30%", 30), choice("35%", "35%", 35), choice("40%", "40%", 40)],
    default: 25,
  },
  {
    key: "workingStretchY",
    section: "fabric",
    display: "segments",
    label: { ru: "Рабочее растяжение вдоль", en: "Working lengthwise stretch" },
    description: {
      ru: "Обычно заметно меньше поперечного. Слишком большое значение может ухудшить комфорт.",
      en: "Usually much lower than crosswise stretch. Too much can reduce crotch comfort.",
    },
    choices: [choice("0%", "0%", 0), choice("5%", "5%", 5), choice("10%", "10%", 10), choice("15%", "15%", 15)],
    default: 5,
  },
  {
    key: "recovery",
    section: "fabric",
    display: "cards",
    label: { ru: "Восстановление ткани", en: "Fabric recovery" },
    description: {
      ru: "После растяжения образец должен быстро возвращаться к исходному размеру.",
      en: "After stretching, the swatch should quickly return to its original size.",
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
    description: {
      ru: "Насколько резинка растягивается при носке, а не её максимальный предел.",
      en: "How much the elastic stretches while worn, not its maximum limit.",
    },
    choices: [choice("10%", "10%", 10), choice("15%", "15%", 15), choice("20%", "20%", 20), choice("25%", "25%", 25)],
    default: 15,
  },
  {
    key: "elasticMaxStretch",
    section: "fabric",
    display: "segments",
    label: { ru: "Максимум растяжимости резинки", en: "Elastic maximum stretch" },
    description: {
      ru: "Используется, чтобы проверить: готовый пояс реально пройдёт через ягодицы.",
      en: "Used to check that the finished waistband can actually pass over the seat.",
    },
    choices: [choice("40%", "40%", 40), choice("60%", "60%", 60), choice("80%", "80%", 80), choice("100%", "100%", 100)],
    default: 80,
  },
];

export const styleOptions = [
  {
    key: "riseLevel",
    section: "style",
    display: "cards",
    label: { ru: "Высота посадки", en: "Rise" },
    choices: [choice("Высокая", "High", "high"), choice("Средняя", "Mid", "mid"), choice("Низкая", "Low", "low")],
    default: "mid",
  },
  {
    key: "legRise",
    section: "style",
    display: "cards",
    label: { ru: "Линия ноги", en: "Leg line" },
    choices: [choice("Закрытая", "Low cut", "low"), choice("Классическая", "Classic", "classic"), choice("Высокая", "High cut", "high")],
    default: "classic",
  },
];

export const constructionOptions = [
  {
    key: "waistFinish",
    section: "construction",
    display: "cards",
    label: { ru: "Обработка талии", en: "Waist finish" },
    choices: [choice("Окантовочная резинка", "Fold-over elastic", "foe"), choice("Бельевая резинка", "Picot elastic", "picot"), choice("Притачной пояс", "Elastic casing", "band")],
    default: "picot",
  },
  {
    key: "legFinish",
    section: "construction",
    display: "cards",
    label: { ru: "Обработка ноги", en: "Leg finish" },
    choices: [choice("Окантовочная резинка", "Fold-over elastic", "foe"), choice("Бельевая резинка", "Picot elastic", "picot"), choice("Трикотажная бейка", "Knit binding", "binding")],
    default: "picot",
  },
  {
    key: "gussetWidthCm",
    section: "construction",
    display: "segments",
    label: { ru: "Готовая ширина ластовицы", en: "Finished gusset width" },
    choices: [choice("5 см", "5 cm", 5), choice("5,5 см", "5.5 cm", 5.5), choice("6 см", "6 cm", 6), choice("6,5 см", "6.5 cm", 6.5), choice("7 см", "7 cm", 7)],
    default: 6,
  },
  {
    key: "gussetPosition",
    section: "construction",
    display: "segments",
    label: { ru: "Положение ластовицы", en: "Gusset position" },
    choices: [choice("Вперёд", "Forward", "front"), choice("По центру", "Centered", "center"), choice("Назад", "Backward", "back")],
    default: "center",
  },
  {
    key: "gussetLining",
    section: "construction",
    display: "segments",
    label: { ru: "Подкладка ластовицы", en: "Gusset lining" },
    choices: [choice("Добавить", "Include", true), choice("Не добавлять", "Omit", false)],
    default: true,
  },
  {
    key: "seamAllowance",
    section: "construction",
    display: "segments",
    label: { ru: "Припуск соединительных швов", en: "Joining seam allowance" },
    description: {
      ru: "Ширина должна соответствовать вашей строчке или оверлоку. Край под окантовочную резинку кроят без дополнительного припуска.",
      en: "Match your stitch or overlock width. Do not add extra allowance under fold-over elastic.",
    },
    choices: [choice("0 мм", "0 mm", 0), choice("6 мм", "6 mm", 6), choice("8 мм", "8 mm", 8), choice("10 мм", "10 mm", 10)],
    default: 6,
  },
];

export function optionDefaults(options) {
  return Object.fromEntries(options.map((option) => [option.key, option.default]));
}
