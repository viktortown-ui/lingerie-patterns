const modules = new Map();

export function registerModule(module) {
  if (!module?.id) {
    throw new Error("Pattern module missing id");
  }
  modules.set(module.id, module);
}

export function getModules() {
  return Array.from(modules.values());
}

export function getModule(id) {
  return modules.get(id);
}
