# Plan

1. Establish the required folder structure and base HTML/CSS/JS entrypoints.
2. Implement core modules (geometry, pattern registry, validation, export) with minimal, testable logic.
3. Build UI screens/components/state that render schemas dynamically and provide preview/export.
4. Implement the `panties_basic` pattern module with drafting + schema + README.
5. Add docs (TECH_SPEC, MODULE_API, USER_GUIDE) and tests/fixtures.

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
