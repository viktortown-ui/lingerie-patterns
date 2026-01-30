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
  options: [
    {
      key: string,
      label: string,
      description: string,
      choices: { label: string, value: string }[],
      default: string
    }
  ],
  optionDefaults: Record<string, string>
}
```

## DraftResult shape
```
{
  paths: Record<string, Path>,
  annotations: Array<
    { type: "grainline", start: Point, end: Point } |
    { type: "notch", point: Point, label?: string } |
    { type: "label", point: Point, text: string }
  >,
  meta: {
    unit: "cm" | "mm" | "in",
    title: string,
    seamAllowanceApplied: boolean
  }
}
```

## Registration
```
import { registerModule } from "../core/pattern/registry.js";
import pantiesModule from "../patterns/panties_basic/module.js";

registerModule(pantiesModule);
```
