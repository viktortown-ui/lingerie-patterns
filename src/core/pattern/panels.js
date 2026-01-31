export function collectPaths(draft) {
  if (!draft) return [];
  if (Array.isArray(draft.panels) && draft.panels.length) {
    const entries = [];
    draft.panels.forEach((panel) => {
      const panelId = panel.id || panel.name || "panel";
      const paths = panel.paths || {};
      Object.entries(paths).forEach(([name, path]) => {
        entries.push({
          name: panelId ? `${panelId}.${name}` : name,
          path,
          panelId,
          pathName: name,
        });
      });
    });
    return entries;
  }
  return Object.entries(draft.paths || {}).map(([name, path]) => ({
    name,
    path,
    panelId: null,
    pathName: name,
  }));
}

export function hasSeamPaths(pathEntries) {
  return pathEntries.some((entry) => (entry.pathName || entry.name).toLowerCase().includes("seam"));
}
