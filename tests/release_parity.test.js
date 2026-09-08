import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APP_VERSION } from "../src/core/app/version.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), "utf8");
const slash = (value) => value.split(path.sep).join("/");

function importedModules(entryPath) {
  const visited = new Set();
  const queue = [entryPath];
  const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu;

  while (queue.length) {
    const relativePath = slash(queue.shift());
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const source = read(relativePath);
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const resolved = slash(path.normalize(path.join(path.dirname(relativePath), specifier)));
      queue.push(resolved);
    }
  }
  return visited;
}

function offlineCorePaths() {
  const source = read("sw.js");
  const coreBody = source.match(/const CORE = \[([\s\S]*?)\n\];/u)?.[1] || "";
  return new Set([...coreBody.matchAll(/["']\.\/([^"']+)["']/gu)].map((match) => match[1]));
}

test("all JavaScript reachable from the public entry point is available offline", () => {
  const runtimeModules = importedModules("assets/js/main.js");
  const offline = offlineCorePaths();
  const missing = [...runtimeModules].filter((relativePath) => !offline.has(relativePath));
  assert.deepEqual(missing, [], `Missing Service Worker CORE files: ${missing.join(", ")}`);
  for (const required of [
    "src/ui/components/HelpCenter.js",
    "src/ui/components/HelpButton.js",
    "src/ui/help/helpContent.js",
  ]) {
    assert.ok(runtimeModules.has(required), `${required} is not connected to the public app`);
    assert.ok(offline.has(required), `${required} is not available offline`);
  }
});

test("Windows packaging mirrors the shared frontend instead of a fork", () => {
  const build = read("desktop/Build-Desktop.ps1");
  assert.match(build, /foreach \(\$directory in @\('assets', 'src'\)\)/u);
  assert.match(build, /foreach \(\$file in @\('index\.html', 'manifest\.webmanifest', 'sw\.js'\)\)/u);
  assert.match(build, /Assert-FrontendMirror/u);
});

test("every user-facing screen exposes the shared help component", () => {
  const screens = {
    Home: read("src/ui/screens/Home.js"),
    Editor: read("src/ui/screens/Editor.js"),
    StaticPattern: read("src/ui/screens/StaticPattern.js"),
  };
  for (const [name, source] of Object.entries(screens)) {
    assert.match(source, /HelpButton/u, `${name} does not import HelpButton`);
    assert.match(source, /onOpenHelp/u, `${name} does not expose contextual help`);
  }
});

test("release version is synchronized across web metadata and Windows binary metadata", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(APP_VERSION, packageJson.version);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/u);

  const desktop = read("desktop/LekaloDesktop.cs");
  const manifest = read("desktop/app.manifest");
  const windowsVersion = `${APP_VERSION}.0`;
  assert.match(desktop, new RegExp(`AssemblyVersion\\("${windowsVersion.replaceAll(".", "\\.")}"\\)`));
  assert.match(desktop, new RegExp(`AssemblyFileVersion\\("${windowsVersion.replaceAll(".", "\\.")}"\\)`));
  assert.match(desktop, new RegExp(`AssemblyInformationalVersion\\("${APP_VERSION.replaceAll(".", "\\.")}"\\)`));
  assert.match(manifest, new RegExp(`assemblyIdentity\\s+version="${windowsVersion.replaceAll(".", "\\.")}"`));
});
