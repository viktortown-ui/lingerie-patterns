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
- Export: SVG and PDF A4 tiling with page labels and calibration mark.
- UI: dynamic form rendering, preview, and export actions.

## Offline strategy
A small service worker (`/sw.js`) caches the app shell on first load for offline use.

## Storage
Measurement profiles and theme preference are stored in `localStorage`.

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
