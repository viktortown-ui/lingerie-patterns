import { PatternModule } from "../../core/pattern/PatternModule.js";
import { schema } from "./schema.js";
import { draftRectangle } from "./draft.js";

const module = new PatternModule({
  id: "test_rectangle",
  name: "Test Rectangle",
  category: "Test",
  version: "0.1.0",
  schema,
  draft: draftRectangle,
});

export default module;
