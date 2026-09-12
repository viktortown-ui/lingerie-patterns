import { draftStretchCropTop } from "../shared/upperBodyDraft.js";

export function draftCropTop(measurements, options = {}) {
  return draftStretchCropTop(measurements, options, {
    moduleId: "crop_top_basic",
    version: "0.3.0",
    title: { ru: "Базовый эластичный топ", en: "Basic stretch crop top" },
  });
}
