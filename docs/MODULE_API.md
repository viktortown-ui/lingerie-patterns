# Module API

Pattern modules are ES modules that export an object conforming to the `PatternModule` interface and are registered via `registerModule`.

## Required fields
- `id` (string)
- `name` (string)
- `category` (string)
- `version` (string)
- `schema` (object)
- `draft(measurements, options)` (function)

## Schema shape
```
{
  id: string,
  name: string,
  unit: "cm" | "mm" | "in",
  fields: [
    {
      key: string,
      label: string,
      description: string,
      min: number,
      max: number,
      step?: number
    }
  ],
  defaults: Record<string, number>,
  options?: [
    {
      key: string,
      label: string,
      description: string,
      choices: { label: string, value: string }[],
      default: string
    }
  ],
  optionDefaults?: Record<string, string>
}
```

## DraftResult shape
```
{
  paths?: Record<string, Path>,
  panels?: Array<{
    id: string,
    name?: string,
    paths: Record<string, Path>
  }>,
  annotations: Array<
    { type: "grainline", start: Point, end: Point } |
    { type: "notch", point: Point, label?: string } |
    { type: "label", point: Point, text: string }
  >,
  meta: {
    unit: "cm" | "mm" | "in",
    title: string,
    moduleId: string,
    moduleVersion: string,
    seamAllowanceApplied: boolean
  }
}
```

## Panels and path naming conventions
- Prefer returning `panels` for multi-piece patterns (front/back/gusset). `paths` remains supported for legacy modules.
- Each panel exposes its own `paths` map so exports can target per-piece styling.
- Use `*_cut` or `*_seam` suffixes to distinguish cut vs seam paths, or include `cut`/`seam` in the path key.
- Example panel path keys:
  - `front_cut`, `front_seam`
  - `gusset_cut`, `gusset_seam`

## Registration
```
import { registerModule } from "../core/pattern/registry.js";
import pantiesModule from "../patterns/panties_basic/module.js";

registerModule(pantiesModule);
```
