import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftPanties } from "./draft.js";

const module = new PatternModule({
  id: "panties_basic",
  name: "Panties Basic",
  category: "Bottoms",
  version: "0.1.0",
  schema,
  draft: draftPanties,
});

export default module;
