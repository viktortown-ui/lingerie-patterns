import assert from "node:assert/strict";
import test from "node:test";

const downloadUrl = new URL("../src/ui/utils/download.js", import.meta.url);

test("object URL cleanup removes pagehide listener after the timer", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousUrl = Object.getOwnPropertyDescriptor(globalThis, "URL");
  let timerCallback = null;
  let pagehideCallback = null;
  let addCount = 0;
  let removeCount = 0;
  let revokeCount = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(callback) { timerCallback = callback; return 7; },
      clearTimeout() {},
      addEventListener(type, callback) { if (type === "pagehide") { addCount += 1; pagehideCallback = callback; } },
      removeEventListener(type, callback) { if (type === "pagehide" && callback === pagehideCallback) removeCount += 1; },
    },
  });
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: { revokeObjectURL() { revokeCount += 1; } },
  });
  try {
    const { scheduleRevoke } = await import(`${downloadUrl.href}?cleanup=${Date.now()}`);
    scheduleRevoke("blob:test", 5);
    assert.equal(addCount, 1);
    timerCallback();
    assert.equal(removeCount, 1);
    assert.equal(revokeCount, 1);
    pagehideCallback();
    assert.equal(revokeCount, 1, "cleanup must be idempotent");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousUrl) Object.defineProperty(globalThis, "URL", previousUrl);
    else delete globalThis.URL;
  }
});
