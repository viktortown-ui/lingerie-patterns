# Changelog

## 1.4.0 — 2026-09-13

- Reworked the catalogue around fit risk: toile-ready lower-body bases are separated from the high-risk experimental bralette and crop-top lab.
- Removed misleading inputs from upper-body models. The bralette now asks for the four measurements used by its geometry; the crop top asks for eight. Legacy `0.2.0` drafts remain readable by the new `0.3.0` modules.
- Unified version compatibility for local drafts, profiles, projects, and style templates. Incompatible saved drafts are preserved unchanged when opened; compatible legacy data migrates only after an explicit edit or template application.
- Added a guided first-and-repeat measurement check with the first value hidden until repeat entry, self/helper provenance, range-aware per-field tolerances, automatic invalidation after edits, local draft/profile/project persistence, and a physical-export gate.
- Added honest per-model fit-risk metadata and explanations in Russian and English. No model is labelled low-risk or guaranteed to fit.
- Added an acknowledgement dialog for every experimental SVG, PDF, DXF, and graded-DXF package.
- Permanently marked experimental physical files as `TOILE ONLY / FIT NOT VERIFIED / NOT FOR PRODUCTION`: visible and machine-readable SVG metadata, warnings on every PDF sheet, DXF comments/XDATA/TEXT, qualified filenames, and ZIP manifest fields.
- Kept size-set provenance honest: repeat verification applies only to the entered base profile, derived sizes never inherit it, and one experimental variant raises the safety status of the complete ZIP.
- Treated imported JSON as untrusted: project/profile imports reset repeat verification, future container/module versions fail closed, and incompatible local drafts are preserved rather than overwritten during screen initialization.
- Corrected the bralette strap-elastic estimate so it no longer pretends to derive from an unrelated body measurement.
- Extended the shared RU/EN help with measurement-repeat, fit-risk, experimental-export, and upper-model A/B/C limitations.
- Enforced the `1.4.0` / Service Worker `v23` release pair, added Windows package smoke to pull-request CI, and made tagged Windows builds attach ZIP and SHA-256 assets to GitHub Releases.

## 1.3.1 — 2026-09-08

- Added a searchable bilingual in-app Help Center with contextual entry points on the home, editor, static-pattern, and library screens.
- Documented the complete local workflow for measurements, A/B/C fit controls, projects, legal pattern/template additions, SVG scale validation, PDF/DXF export, size sets, privacy, and physical-toile limits.
- Kept the help experience responsive as a two-column dialog on desktop/tablet and a full-screen sheet on phones, without rerendering or resetting the active editor history.
- Made cross-platform feature parity an enforced release rule: Windows packages mirror the shared web frontend byte-for-byte, and every JavaScript module reachable from the public entry point must be present in the offline cache.
- Expanded the Windows rendered-UI smoke test to open the packaged Help Center and verify all nine navigation entries plus visible article content; tagged Windows builds now run the smoke test and publish both ZIP and SHA-256 artifacts.
- Synchronized application and Windows metadata at `1.3.1`, advanced the offline cache to Service Worker `v22`, and corrected stale guidance about A/B/C controls, device-local data, and XXS–4XL rule-based size sets.

## 1.3.0 — 2026-09-07

- Added a real Windows desktop host (`LEKALO.exe`) based on .NET Framework 4.8 and Evergreen WebView2: no CMD window, local HTTP server, browser tab, Node.js, or Python is involved at runtime.
- Added a reproducible portable-package builder with a pinned WebView2 SDK hash, an isolated rendered-UI smoke test, CI checks, and a tag/manual GitHub Actions artifact workflow.
- Prepared the same codebase for the existing GitHub Pages site, installable phone/tablet PWA, and public beta testing without creating a duplicate repository.
- Added explicit privacy and security policies, including the temporary shared-origin limitation of the GitHub Pages beta and the unsigned-preview SmartScreen boundary.
- Added a restrictive browser Content Security Policy and advanced the offline cache to Service Worker `v21` for the public release.
- Removed the hidden rectangle fixture from the production module registry and offline runtime graph; it remains available only to direct export tests.
- Added five built-in underwear style presets plus a local **My library** workflow for saving, opening, exporting, importing, and deleting personal style templates.
- Kept style templates privacy-safe by design: they contain module/version references, options, and bounded adjustments, but never body measurements.
- Added strict template schema, module-version, option, adjustment, provenance, license, size, and local-storage validation; incompatible or malformed files are rejected before application.
- Added a local static-SVG import path that never inserts source markup into the page, rejects active/referenced/unsupported content, and retains only normalized inert line geometry with a source hash.
- Marked imported SVG patterns as personal, static, and unverified. They do not gain measurements, formulas, editing, grading, fit validation, or production qualification; an unrecognized scale requires calibration before cutting.
- Added bounded IndexedDB storage with a session-only fallback and safe normalized-SVG download for imported personal patterns.
- Hardened personal libraries with a separate lossless template quarantine, cross-tab refresh, retryable IndexedDB lifecycle, static-screen reload restoration, and normalized SVG export/import round-trip.
- Added a four-second network deadline to Service Worker `v19` so offline navigation cannot hang behind a stalled connection.
- Changed the SVG library to metadata-only listing with on-demand geometry loading, a 16 MB total cap, strict format/geometry allowlists, and transaction-complete success semantics.
- Rejected subnormal, overflowing, or physically impossible calibration values and preserved hashes over the exact original file bytes, including a UTF-8 BOM.
- Prevented async save dialogs from closing or submitting twice and added localized accessible descriptions for dialogs and static previews.
- Expanded the offline cache to include the complete template-library and static-SVG module graph.
- Hardened pattern-module registration and saved-project compatibility with strict IDs, semantic versions, unique schema keys, immutable metadata, and exact module-version matching.

## 1.2.0 — 2026-09-07

- Added dedicated phone, tablet/split-screen, wide-tablet, and desktop layouts with safe-area and dynamic-viewport support.
- Added a one-thumb mobile section bar, a horizontally scrollable preview toolbar, and 44 px minimum coarse-pointer targets.
- Added bounded undo/redo history for measurements, options, and named pattern adjustments.
- Hardened tablet headers and long-column flow, 320 px preview space, number/label layout, keyboard focus, touch scroll chaining, file-control focus, immediate route scroll, landscape behavior, and offline PWA metadata.
- Kept reset actions atomic in history and added accessible names for compact mobile step, zoom, and calibration controls.
- Removed rare allowance hooks and micro-loops inside positive curved allowances without changing stitch or zero-allowance fold lines; added exact and randomized geometry/export regressions.
- Bounded profile/project JSON imports to 2 MB and 250 merged profiles, with clear Russian/English errors; profile changes from another tab now refresh immediately without rebuilding the active form.
- Fixed the local origin at `127.0.0.1:57021`; hardened Host/path/request handling and exact offline asset fallbacks so missing code can never receive HTML.
- Fixed false launcher failures when the same project is reached through a Windows junction or another path: a verified live server is now adopted safely, concurrent clicks are serialized, transient health reads are retried, and exact failures are logged.
- Added a repeatable responsive QA matrix and an evidence-grounded Android/RuStore readiness specification; no store account, signing key, APK, or publication was created.

## 1.1.0 — 2026-09-07

- Added bounded A1/A2/B1/B2/C1 named line controls with draggable handles for both lower-underwear modules.
- Added fullscreen preview, true fit-to-window zoom, resilient resizing, and responsive label/number layout.
- Added transparent XS–XL measurement-rule redrafting, individual DXF files, and an audited ZIP manifest; this is explicitly not industrial point grading.
- Added deterministic ASCII DXF R12 in millimetres with CUT, SEAM, NOTCH, GRAIN, and TEXT layers, strict internal round-trip checks, and independent `ezdxf` acceptance testing.
- Added experimental wireless soft-bralette and sleeveless stretch-top bases with eleven upper-body measurements.
- Isolated unsaved drafts and selected profiles per model; hardened imports, legacy migrations, option types, blocked storage, stale output, downloads, and preview lifecycle cleanup.
- Cached the complete ES-module graph so the installed web app survives an offline reload after its first successful load.
- Kept honest validation gates: lower-underwear bases are ready for a toile; upper-body bases require additional construction and fitting validation; no export is claimed as AAMA/ASTM-certified or factory-qualified.

## 1.0.0 — 2026-09-07

- Rebuilt the lower-underwear drafting model around seven body measurements.
- Added independent horizontal/vertical fabric stretch and elastic checks.
- Added panties, thong/tanga, rise, leg, coverage, gusset, lining, finish, and allowance options.
- Introduced semantic stitch/cut lines, edge-specific allowances, stretch arrows, notches, and bilingual piece data.
- Added seam checks, material estimates, sewing sequence, profiles, backup/import, and project files.
- Rebuilt SVG and tiled PDF export for true-size output and calibration.
- Added Russian-first desktop workflow, responsive UI, PWA metadata, and one-click Windows launch/stop/diagnostics.
- Added MIT licensing, method documentation, and an explicit ready-for-toile validation status.
