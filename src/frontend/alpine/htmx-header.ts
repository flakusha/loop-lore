export function normalizeHeaderSlot() {
  const all = Array.from(document.querySelectorAll<HTMLElement>("#header-slot"));
  const appRoot = document.querySelector("#app-root");
  if (!appRoot || all.length < 2) return;

  for (const h of all) {
    if (h.children.length === 0) h.remove();
  }

  const remaining = document.querySelectorAll<HTMLElement>("#header-slot");
  if (remaining.length <= 1) {
    const h = remaining[0];
    if (h && appRoot.contains(h)) {
      appRoot.parentElement?.insertBefore(h, appRoot);
    }
    return;
  }

  let newest: HTMLElement | null = null;
  for (const h of remaining) {
    if (appRoot.contains(h) && (!newest || h.children.length > newest.children.length)) {
      newest = h;
    }
  }

  if (!newest) {
    newest = remaining[0];
    for (const h of remaining) {
      if (h.children.length > newest.children.length) {
        newest = h;
      }
    }
  }

  for (const h of remaining) {
    if (h !== newest) h.remove();
  }
  if (newest && appRoot.contains(newest)) {
    appRoot.parentElement?.insertBefore(newest, appRoot);
  }
}
