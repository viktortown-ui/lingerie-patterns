# Plan

## Phase 1 — Audit summary

### Export + preview scaling (current state)
- **`src/core/export/svgExport.js`**
  - `viewBox` is derived from geometry bounds + margins and width/height are output in **mm**. This is good for print scale, but `preserveAspectRatio` is not fixed, so rendering can vary between environments.
  - Labels are rendered inside SVG. In preview mode this causes labels to scale with zoom, making them unreadable at high zoom levels.
- **`src/ui/components/Preview.js`**
  - Preview removes SVG `width/height` and uses pixel scaling. The zoom logic scales the entire SVG, including `text`.
  - The label toggle currently shows/hides labels rather than controlling scalable vs fixed labels.
- **`src/core/export/pdfExport.js`**
  - PDF tiling uses true unit conversion and adds alignment marks + a 50mm calibration mark. It does not include a larger control mark and has limited alignment crosses.

### Issues by file
- `src/core/export/svgExport.js`
  - Missing fixed `preserveAspectRatio`.
  - Preview labels are tied to SVG scale (not CAD-like).
- `src/ui/components/Preview.js`
  - Zoom applies to all SVG contents, including text labels.
  - Label toggle is not persisted and does not support non-scaling labels.
- `src/core/export/pdfExport.js`
  - Calibration mark only 50mm; alignment marks could be clearer for tile assembly.
- `assets/css/app.css`
  - Safe-area padding is limited to top/bottom; side insets are not handled.

## Phase 1 — Refactor plan (minimal changes)
1. **SVG export hardening**
   - Fix `preserveAspectRatio` to a deterministic value and document it.
   - Add a 100mm calibration square/mark.
2. **Preview label architecture**
   - Introduce HTML overlay labels in preview and position them with `getScreenCTM`.
   - Add a **Scale labels** toggle persisted in `localStorage`.
3. **PDF export hardening**
   - Add clearer tile alignment marks (midpoint crosses) and a 100mm calibration square.
   - Update print instructions in docs.
4. **Module API polish**
   - Document `panels` for multi-piece drafts and clarify cut/seam naming.
   - Add extension hooks file for future assistant integration.
5. **Mobile UX**
   - Add safe-area left/right padding in the base layout/topbar.

## File list
- /index.html
- /assets/css/app.css
- /assets/js/main.js
- /src/core/geometry/Point.js
- /src/core/geometry/Path.js
- /src/core/geometry/Bezier.js
- /src/core/geometry/Offset.js
- /src/core/geometry/Units.js
- /src/core/pattern/PatternModule.js
- /src/core/pattern/registry.js
- /src/core/pattern/annotations.js
- /src/core/export/svgExport.js
- /src/core/export/pdfExport.js
- /src/core/validate/validate.js
- /src/core/validate/constraints.js
- /src/core/utils/dom.js
- /src/core/utils/math.js
- /src/core/utils/id.js
- /src/patterns/panties_basic/module.js
- /src/patterns/panties_basic/draft.js
- /src/patterns/panties_basic/schema.js
- /src/patterns/panties_basic/README.md
- /src/ui/screens/Home.js
- /src/ui/screens/Editor.js
- /src/ui/components/Form.js
- /src/ui/components/Preview.js
- /src/ui/components/Toast.js
- /src/ui/state/store.js
- /src/ui/styles/theme.js
- /tests/fixtures/*.json
- /tests/geometry.test.js
- /tests/module.test.js
- /tests/export.test.js
- /docs/TECH_SPEC.md
- /docs/MODULE_API.md
- /docs/USER_GUIDE.md
- /sw.js
