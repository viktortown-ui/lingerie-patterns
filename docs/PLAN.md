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

## Phase 1.5 — Seam allowance smoothing + thong model
- [ ] Replace seam allowance offset with mitered polyline offsets + miter limit fallback.
- [ ] Add a preview toggle to highlight seam allowance styling.
- [ ] Add the **Panties Thong Basic** module with thong width option.

## Phase 2 — Reliability + UX upgrades

### A) Harden mobile download (SVG + PDF)
- [ ] Create reusable `downloadBlob` helper with delayed revocation.
- [ ] Add iOS Safari / WKWebView fallback (open in new tab or data URL).
- [ ] Replace Editor download logic for SVG + PDF with helper.
- [ ] Show inline message if popup is blocked.

**Acceptance criteria**
- Android Chrome saves `.pdf` from **Download PDF**.
- Desktop Chrome/Edge saves `.pdf` and `.svg`.
- iOS Safari reliably opens PDF (download if supported).
- No more "revoke too fast" failures.

### B) Paper / export UX clarification
- [ ] Rename paper options to **A4 tiled (print at home)** and **A3 tiled (fewer pages)**.
- [ ] Add help text for printing at 100% and verifying 100mm square.
- [ ] Add screen tracing tip referencing calibration.
- [ ] Update `docs/USER_GUIDE.md` with the same wording.

**Acceptance criteria**
- Export selector shows clarified labels.
- Help text is visible under the paper selector.
- User guide reflects the updated labels and tips.

### C) Screen calibration mode
- [ ] Add **Calibrate screen** button in preview toolbar.
- [ ] Show 100mm calibration overlay with adjustable scale.
- [ ] Persist scale multiplier to `localStorage` (`lingerie-screen-calibration`).
- [ ] Apply multiplier only to preview rendering (exports unchanged).

**Acceptance criteria**
- Overlay matches a ruler after tuning.
- Stored scale persists across reloads.
- Fit/reset/zoom behavior still works.

### D) Seam allowance options (explicit mm)
- [ ] Replace seam allowance option with numeric mm values (0/6/8/10).
- [ ] Convert mm → cm in drafting and store applied value in `meta`.
- [ ] Ensure seam line is dashed and legend appears when enabled.
- [ ] Add tests for seam dashed paths + legend text.
- [ ] Add PDF ASCII-only test.

**Acceptance criteria**
- UI summary reads “Seam allowance: 6mm”.
- Export shows cut (solid) + seam (dashed) lines when enabled.
- PDF streams contain only ASCII.

### E) Commercial PDF export polish
- [ ] Add cut + glue/overlap trim system for tiled PDFs.
- [ ] Add stronger registration marks (crosses + diamonds) at corners/edges.
- [ ] Add per-tile header/footer with pattern title, tile ID, page count, and paper size.
- [ ] Add an Assembly Map box that shows all tile IDs.
- [ ] Add title blocks per piece in SVG + PDF (name, cut qty, material, module version, seam allowance).
- [ ] Ensure annotations export notch/grainline/foldline/control points consistently and edge labels are supported.

**Acceptance criteria**
- Tiles show a thin cut line, a highlighted glue line labeled “GLUE LINE”, and a visible Assembly Map.
- Each tile includes a header/footer with the required metadata and page numbering.
- Title blocks never overlap geometry and include seam allowance text.
- PDF output remains ASCII-only English.

### Mobile QA checklist
- [ ] Android Chrome: export PDF download saves file.
- [ ] iOS Safari: export PDF opens reliably, fallback hint appears if blocked.
- [ ] Desktop Chrome/Edge: SVG/PDF download works and preview zoom/labels unaffected.
