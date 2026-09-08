import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function createHarness({ fetchImpl, cached = {}, putDelayMs = 0, networkTimeoutMs } = {}) {
  const listeners = new Map();
  const entries = new Map(Object.entries(cached));
  let putCompleted = false;
  const key = (request) => typeof request === "string" ? request : request.url;
  const cache = {
    async add() {},
    async match(request) { return entries.get(key(request)); },
    async put(request, response) {
      if (putDelayMs) await new Promise((resolve) => setTimeout(resolve, putDelayMs));
      entries.set(key(request), response);
      putCompleted = true;
    },
  };
  const context = {
    URL,
    Request,
    Response,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    caches: {
      async open() { return cache; },
      async keys() { return []; },
      async delete() { return true; },
    },
    fetch: fetchImpl || (async () => { throw new TypeError("offline"); }),
    self: {
      location: { origin: "https://example.test" },
      __LEKALO_QA_NETWORK_TIMEOUT_MS: networkTimeoutMs,
      addEventListener(type, listener) { listeners.set(type, listener); },
      async skipWaiting() {},
      clients: { async claim() {} },
    },
  };
  vm.runInNewContext(source, context, { filename: "sw.js" });

  return {
    async fetch(request) {
      let responsePromise = null;
      listeners.get("fetch")({
        request,
        respondWith(value) { responsePromise = Promise.resolve(value); },
      });
      return responsePromise ? responsePromise : null;
    },
    get putCompleted() { return putCompleted; },
  };
}

function request(path, { mode = "cors", destination = "" } = {}) {
  return { method: "GET", url: `https://example.test/${path}`, mode, destination };
}

test("offline code requests never receive the HTML app shell", async () => {
  const shell = new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
  const harness = createHarness({ cached: { "./": shell, "./index.html": shell } });
  const response = await harness.fetch(request("missing.js", { destination: "script" }));
  assert.equal(response.type, "error");
  assert.notEqual(response.headers.get("Content-Type"), "text/html");
});

test("offline code requests use only their exact cached asset", async () => {
  const script = new Response("export const ok = true;", { headers: { "Content-Type": "text/javascript" } });
  const harness = createHarness({
    cached: {
      "./": new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }),
      "https://example.test/app.js": script,
    },
  });
  const response = await harness.fetch(request("app.js", { destination: "script" }));
  assert.equal(await response.text(), "export const ok = true;");
  assert.equal(response.headers.get("Content-Type"), "text/javascript");
});

test("a cached navigation shell replaces an upstream 5xx response", async () => {
  const harness = createHarness({
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    cached: { "./": new Response("<!doctype html><title>offline</title>", { headers: { "Content-Type": "text/html" } }) },
  });
  const response = await harness.fetch(request("route", { mode: "navigate", destination: "document" }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /offline/);
});

test("successful network caching remains inside the fetch lifetime", async () => {
  const harness = createHarness({
    fetchImpl: async () => new Response("body", { status: 200 }),
    putDelayMs: 20,
  });
  const response = await harness.fetch(request("app.js", { destination: "script" }));
  assert.equal(await response.text(), "body");
  assert.equal(harness.putCompleted, true);
});

test("a stalled navigation is aborted and falls back to the offline shell", async () => {
  const harness = createHarness({
    networkTimeoutMs: 15,
    fetchImpl: async (_request, { signal } = {}) => new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
    cached: {
      "./": new Response("<!doctype html><title>offline</title>", { headers: { "Content-Type": "text/html" } }),
    },
  });
  const response = await harness.fetch(request("route", { mode: "navigate", destination: "document" }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /offline/);
});
