import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftPanties } from "./draft.js";

const module = new PatternModule({
  id: "panties_basic",
  name: schema.name,
  category: "module.panties_basic.category",
  version: "1.0.0",
  description: {
    ru: "Классика, высокая и низкая посадка, три линии ноги и три варианта покрытия.",
    en: "High, mid, and low rise with three leg lines and three coverage options.",
  },
  status: "ready-for-toile",
  tags: ["7 мерок", "растяжимость", "A4 / A3 / Letter"],
  schema,
  draft: draftPanties,
});

export default module;
