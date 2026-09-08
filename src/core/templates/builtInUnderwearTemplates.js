import { TEMPLATE_FORMAT_VERSION, TEMPLATE_KIND } from "./templateModel.js";
import { APP_VERSION } from "../app/version.js";

const commonLicense = Object.freeze({
  spdx: "MIT",
  name: "MIT License",
  url: "https://opensource.org/license/mit/",
});

const commonProvenance = Object.freeze({
  kind: "built-in",
  author: "LEKALO contributors",
  source: "Original LEKALO preset assembled from the public module option schema.",
  sourceUrl: "https://github.com/viktortown-ui/lingerie-patterns",
  sourceVersion: APP_VERSION,
});

const neutralAdjustments = Object.freeze({
  frontWaistDepth: 0,
  frontLegCurve: 0,
  backWaistDepth: 0,
  backLegCurve: 0,
  sideHeight: 0,
});

const commonOptions = Object.freeze({
  fabricMaxStretch: 80,
  workingStretchX: 25,
  workingStretchY: 5,
  recovery: "good",
  elasticWorkingStretch: 15,
  elasticMaxStretch: 80,
  waistFinish: "picot",
  legFinish: "picot",
  gussetWidthCm: 6,
  gussetPosition: "center",
  gussetLining: true,
  seamAllowance: 6,
});

function template({ id, moduleId, name, description, options }) {
  return {
    kind: TEMPLATE_KIND,
    formatVersion: TEMPLATE_FORMAT_VERSION,
    id,
    version: "1.0.0",
    moduleId,
    moduleVersion: "1.0.0",
    name,
    description,
    status: "ready-for-toile",
    license: commonLicense,
    provenance: commonProvenance,
    options: { ...commonOptions, ...options },
    adjustments: neutralAdjustments,
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const BUILT_IN_UNDERWEAR_TEMPLATES = deepFreeze([
  template({
    id: "panties_basic.everyday-classic",
    moduleId: "panties_basic",
    name: { ru: "Повседневная классика", en: "Everyday classic" },
    description: {
      ru: "Средняя посадка, классическая линия ноги и классическое покрытие.",
      en: "Mid rise, classic leg line, and classic back coverage.",
    },
    options: { riseLevel: "mid", legRise: "classic", backCoverage: "classic" },
  }),
  template({
    id: "panties_basic.high-full",
    moduleId: "panties_basic",
    name: { ru: "Высокая закрытая посадка", en: "High full coverage" },
    description: {
      ru: "Высокая талия, закрытая линия ноги и полное покрытие ягодиц.",
      en: "High waist, low-cut leg line, and full back coverage.",
    },
    options: { riseLevel: "high", legRise: "low", backCoverage: "full" },
  }),
  template({
    id: "panties_basic.cheeky-high-leg",
    moduleId: "panties_basic",
    name: { ru: "Cheeky с высокой линией ноги", en: "High-leg cheeky" },
    description: {
      ru: "Средняя посадка, высокая линия ноги и открытая спинка cheeky.",
      en: "Mid rise, high leg line, and cheeky back coverage.",
    },
    options: { riseLevel: "mid", legRise: "high", backCoverage: "cheeky" },
  }),
  template({
    id: "panties_thong_basic.classic-thong",
    moduleId: "panties_thong_basic",
    name: { ru: "Классические стринги", en: "Classic thong" },
    description: {
      ru: "Средняя посадка и спинка стрингов шириной 2,5 см у ластовицы.",
      en: "Mid rise with a 2.5 cm thong back at the gusset.",
    },
    options: { riseLevel: "mid", legRise: "high", thongShape: "thong", thongWidthCm: 2.5 },
  }),
  template({
    id: "panties_thong_basic.comfort-tanga",
    moduleId: "panties_thong_basic",
    name: { ru: "Комфортная танга", en: "Comfort tanga" },
    description: {
      ru: "Средняя посадка и более широкая спинка танга 3 см у ластовицы.",
      en: "Mid rise with a wider 3 cm tanga back at the gusset.",
    },
    options: { riseLevel: "mid", legRise: "classic", thongShape: "tanga", thongWidthCm: 3 },
  }),
]);
