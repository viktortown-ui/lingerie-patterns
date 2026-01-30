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
