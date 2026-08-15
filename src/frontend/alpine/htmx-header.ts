export function normalizeHeaderSlot() {
  const all = Array.from(document.querySelectorAll<HTMLElement>("#header-slot",),);
  const appRoot = document.querySelector<HTMLElement>("#app-root",);
  if (!appRoot || all.length < 2) { return; }

  for (const h of all) {
    if (h.children.length === 0) { h.remove(); }
  }

  const remaining = Array.from(document.querySelectorAll<HTMLElement>("#header-slot",),);
  if (remaining.length <= 1) {
    const h = remaining[0];
    if (h && appRoot.contains(h,)) {
      appRoot.parentElement?.insertBefore(h, appRoot,);
    }
    return;
  }

  const newest = selectNewestSlot(remaining, appRoot,);
  for (const h of remaining) {
    if (h !== newest) { h.remove(); }
  }
  if (newest && appRoot.contains(newest,)) {
    appRoot.parentElement?.insertBefore(newest, appRoot,);
  }
}

/** Pick the header slot with the most content, preferring in-app ones. */
function selectNewestSlot(slots: HTMLElement[], appRoot: HTMLElement,): HTMLElement | null {
  let newest: HTMLElement | null = null;
  for (const h of slots) {
    if (appRoot.contains(h,) && (!newest || h.children.length > newest.children.length)) {
      newest = h;
    }
  }
  if (newest) { return newest; }

  newest = slots[0] ?? null;
  for (const h of slots) {
    if (newest && h.children.length > newest.children.length) {
      newest = h;
    }
  }
  return newest;
}
