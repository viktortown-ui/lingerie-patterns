import { PatternModule } from "../../core/pattern/PatternModule.js";
import { draftBralette } from "./draft.js";
import { schema } from "./schema.js";

export default new PatternModule({
  id: "bralette_soft",
  name: schema.name,
  category: "module.bralette_soft.category",
  version: "0.2.0",
  description: {
    ru: "Экспериментальная мягкая чашка, пояс и боковая часть без каркасов — только с обязательной примеркой макета.",
    en: "Experimental wireless soft cup, underband, and wing with a required toile fitting.",
  },
  status: "experimental",
  tags: ["11 мерок", "без каркасов", "мягкая чашка"],
  schema,
  draft: draftBralette,
});
