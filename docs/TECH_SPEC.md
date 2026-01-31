# Technical Specification

## Overview
This app is a static, offline-capable, ES-module based pattern generator. It runs by opening `/index.html` directly and does not require a backend or build step.

## Architecture
- `index.html` boots `/assets/js/main.js`.
- `assets/js/main.js` initializes theme, registers pattern modules, and routes between `Home` and `Editor`.
- Core libraries in `/src/core` are framework-agnostic and do not reference specific modules.

## Core subsystems
- Geometry: `Point`, `Path`, cubic Beziers, and a simple offset helper for seam allowance.
- Pattern registry: `PatternModule` and `registry` for discovery.
- Validation: schema validation for measurement inputs.
- Export: SVG and PDF tiling (A4/A3) with page labels, alignment marks, and calibration mark.
- UI: dynamic form rendering, preview, and export actions.
  - Preview supports CAD-like labels that can stay screen-sized while geometry scales.

## Offline strategy
A small service worker (`/sw.js`) caches the app shell on first load for offline use.

## Storage
Measurement profiles and theme preference are stored in `localStorage`.

## Print scale & PDF tiling
- **True-scale conversion** uses: `inches = mm / 25.4`, `pt = inches * 72`.
- PDF page sizes supported: **A4** (210×297mm) and **A3** (297×420mm).
- Content area per page is page size minus margin (default 10mm).
- Tiling uses row/column math: `cols = ceil(widthMm / contentWidthMm)`, `rows = ceil(heightMm / contentHeightMm)`.
- Page IDs are labeled as `R{row}C{col}` for assembly.
- The first page includes **50mm + 100mm calibration marks** and print instructions.
- Alignment marks include corner and midpoint crosses to aid tile assembly.

## SVG export scaling
- `svgExport` computes the `viewBox` from geometry bounds plus margins.
- `preserveAspectRatio` is fixed to `xMinYMin meet` to make resizing deterministic.
- The SVG `width`/`height` are specified in millimeters for true-scale printing.

## Preview labels
- Geometry is rendered in SVG and scaled via the preview zoom/pan system.
- When **Scale labels** is off, labels render in an HTML overlay positioned using `getScreenCTM`.
- When **Scale labels** is on, labels remain inside SVG and scale with geometry.

## Module registry
- `/src/patterns/index.js` exports an array of modules that should be registered at boot.
- `/assets/js/main.js` loops through the registry and calls `registerModule` for each module.
- The `Home` screen renders modules from the registry, and the `Editor` builds forms from each module's schema.

## Adding a new module
1. Create a new folder in `/src/patterns/<module_id>/`.
2. Add `schema.js` with measurement fields, defaults, and any options.
3. Add `draft.js` that returns a `DraftResult` (paths, annotations, meta).
4. Add `module.js` that instantiates `PatternModule` with id/name/category/version/schema/draft.
5. Export the module in `/src/patterns/index.js`.
6. Add fixtures in `/tests/fixtures/` for contract tests.
7. Run the tests to confirm `module_contract.test.js` passes.

## Extension hooks
`/src/core/extensions/assistantHooks.js` defines no-op hook points for future AI assistance integrations.
