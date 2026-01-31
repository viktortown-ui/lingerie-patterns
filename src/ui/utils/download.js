const IOS_REGEX = /iPad|iPhone|iPod/;

const isIOS = () => {
  const ua = navigator.userAgent || "";
  const isAppleTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return IOS_REGEX.test(ua) || isAppleTouchMac;
};

const isWebKit = () => /AppleWebKit/i.test(navigator.userAgent || "");

const scheduleRevoke = (url) => {
  const revoke = () => URL.revokeObjectURL(url);
  window.setTimeout(revoke, 45000);
  window.addEventListener("pagehide", revoke, { once: true });
};

const tryOpen = (url) => {
  try {
    const opened = window.open(url, "_blank", "noopener");
    return Boolean(opened);
  } catch {
    return false;
  }
};

const openDataUrl = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const opened = typeof reader.result === "string" ? tryOpen(reader.result) : false;
      resolve(opened);
    };
    reader.onerror = () => resolve(false);
    reader.readAsDataURL(blob);
  });

export async function downloadBlob({ blob, filename, mimeType, onFallbackMessage }) {
  if (!blob) return;
  const payload = mimeType && blob.type !== mimeType ? new Blob([blob], { type: mimeType }) : blob;
  const url = URL.createObjectURL(payload);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  const needsFallback = isIOS() && isWebKit();
  if (needsFallback) {
    const opened = tryOpen(url);
    if (!opened) {
      const dataOpened = await openDataUrl(payload);
      if (!dataOpened && onFallbackMessage) {
        onFallbackMessage();
      }
    }
  }

  scheduleRevoke(url);
}
