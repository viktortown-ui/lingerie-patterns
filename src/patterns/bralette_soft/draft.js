import { draftSoftBralette } from "../shared/upperBodyDraft.js";

export function draftBralette(measurements, options = {}) {
  return draftSoftBralette(measurements, options, {
    moduleId: "bralette_soft",
    version: "0.3.0",
    title: { ru: "Мягкий бралетт без каркасов", en: "Wireless soft bralette" },
  });
}
