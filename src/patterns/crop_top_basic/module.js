import { PatternModule } from "../../core/pattern/PatternModule.js";
import { draftCropTop } from "./draft.js";
import { schema } from "./schema.js";

export default new PatternModule({
  id: "crop_top_basic",
  name: schema.name,
  category: "module.crop_top_basic.category",
  version: "0.3.0",
  compatibleDraftVersions: ["0.2.0"],
  description: {
    ru: "Экспериментальная цельнокроеная основа без рукавов: четыре горловины, три длины и три степени прилегания.",
    en: "Experimental sleeveless base with four necklines, three lengths, and three fit levels.",
  },
  status: "experimental",
  fitRisk: {
    level: "high",
    reason: {
      ru: "Прилегающая экспериментальная основа чувствительна к ширинам, балансу и свойствам ткани; перед основной тканью нужен пробный образец.",
      en: "This close-fitting experimental base is sensitive to widths, balance, and fabric behaviour; make a toile before using final fabric.",
    },
  },
  tags: ["8 мерок", "эластичный трикотаж", "без рукавов"],
  schema,
  draft: draftCropTop,
});
