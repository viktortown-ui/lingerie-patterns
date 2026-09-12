import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftThong } from "./draft.js";

const module = new PatternModule({
  id: "panties_thong_basic",
  name: schema.name,
  category: "module.panties_thong_basic.category",
  version: "1.0.0",
  description: {
    ru: "Стринги или танга с регулируемой высотой, линией ноги и шириной узкой части.",
    en: "Thong or tanga with adjustable rise, leg line, and narrow-back width.",
  },
  status: "ready-for-toile",
  fitRisk: {
    level: "moderate",
    reason: {
      ru: "Эластичность даёт небольшой допуск, но положение ластовицы, дуга сидения и узкая спинка должны быть проверены пробным образцом.",
      en: "Stretch allows limited tolerance, but gusset position, crotch arc, and the narrow back must be checked with a toile.",
    },
  },
  tags: ["7 мерок", "ткань и резинка", "точная печать"],
  schema,
  draft: draftThong,
});

export default module;
