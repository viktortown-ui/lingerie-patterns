import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftThong } from "./draft.js";

const module = new PatternModule({
  id: "panties_thong_basic",
  name: "module.panties_thong_basic.name",
  category: "module.panties_thong_basic.category",
  version: "0.2.0",
  schema,
  draft: draftThong,
});

export default module;
