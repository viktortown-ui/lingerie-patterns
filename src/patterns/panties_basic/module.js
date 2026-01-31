import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftPanties } from "./draft.js";

const module = new PatternModule({
  id: "panties_basic",
  name: "module.panties_basic.name",
  category: "module.panties_basic.category",
  version: "0.2.0",
  schema,
  draft: draftPanties,
});

export default module;
