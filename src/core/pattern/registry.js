import { PatternModule } from "./PatternModule.js";

const modules = new Map();

export function registerModule(module) {
  const safeModule = module instanceof PatternModule ? module : new PatternModule(module);
  if (modules.has(safeModule.id)) {
    throw new Error(`Pattern module id is already registered: ${safeModule.id}`);
  }
  modules.set(safeModule.id, safeModule);
  return safeModule;
}

export function getModules() {
  return Array.from(modules.values());
}

export function getModule(id) {
  return modules.get(id);
}
