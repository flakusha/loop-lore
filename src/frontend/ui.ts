/**
 * Vanilla UI helpers — replaces Alpine for sidebar, toast, theme on non-chat pages.
 * Chat page still uses Alpine for its complex state.
 */

// ── Sidebar ──────────────────────────────────────────────────

export function toggleSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("#layout-sidebar",);
  const backdrop = document.querySelector<HTMLElement>("#sidebar-backdrop",);
  const isOpen = sidebar?.classList.contains("open",) ?? false;
  sidebar?.classList.toggle("open",);
  if (backdrop) {
    backdrop.style.display = isOpen ? "none" : "block";
    backdrop.classList.toggle("open",);
  }
  document.body.classList.toggle("sidebar-open",);
  if (globalThis.Alpine) {
    Alpine.store("sidebar",).open = !isOpen;
  }
}

export function closeSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("#layout-sidebar",);
  const backdrop = document.querySelector<HTMLElement>("#sidebar-backdrop",);
  sidebar?.classList.remove("open",);
  if (backdrop) {
    backdrop.style.display = "none";
    backdrop.classList.remove("open",);
  }
  document.body.classList.remove("sidebar-open",);
  if (globalThis.Alpine) {
    Alpine.store("sidebar",).open = false;
  }
}

// ── Toast notifications ──────────────────────────────────────

const ICONS: Record<string, string> = {
  success: "✓",
  error: "✗",
  info: "ℹ",
  warning: "⚠",
};

export function showToast(type: string, message: string,): void {
  const container = document.querySelector("#toast-container",);
  if (!container) { return; }
  const icon = ICONS[type] || "ℹ";
  const toast = document.createElement("div",);
  toast.className = `toast ${type}`;
  toast.setAttribute("role", "status",);

  const iconEl = document.createElement("span",);
  iconEl.className = "icon";
  iconEl.textContent = icon;

  const msgEl = document.createElement("span",);
  msgEl.className = "message";
  msgEl.textContent = message;

  const close = document.createElement("button",);
  close.className = "close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification",);
  close.innerHTML = "&times;";

  const dismiss = (): void => {
    if (toast.parentNode) { toast.remove(); }
  };
  close.addEventListener("click", dismiss,);

  toast.append(iconEl, msgEl, close,);
  container.append(toast,);

  const timer = setTimeout(dismiss, 5000,);
  // Cancel auto-dismiss if the user hovers — keeps it readable.
  toast.addEventListener("mouseenter", () => clearTimeout(timer,),);
}

// Guard against double registration — ui.ts is bundled into both
// app.js and pages.js. Module-level flags don't work across bundles,
// so we use a DOM property on document (shared across bundles).
const LISTENER_KEY = "__toastListenerRegistered";
if (!(document as any)[LISTENER_KEY]) {
  (document as any)[LISTENER_KEY] = true;
  document.addEventListener(
    "show-toast",
    (e: CustomEvent<{ type?: string; message: string; icon?: string }>,) => {
      showToast(e.detail.type || "info", e.detail.message,);
    },
  );
}

// ── Modal helpers ──────────────────────────────────────────────

export function openModal(id: string,): void {
  document.querySelector(`#${CSS.escape(id,)}`,)?.classList.add("open",);
}

export function closeModal(el: Element,): void {
  el.closest(".modal-overlay",)?.classList.remove("open",);
}

export function closeModalOnBackdrop(event: Event,): void {
  if (event.target === event.currentTarget) {
    (event.currentTarget as HTMLElement).classList.remove("open",);
  }
}

// ── Theme ────────────────────────────────────────────────────

export function applyTheme(themeId: string,): void {
  const themes: { id: string; file: string }[] = globalThis.__THEMES ?? [];
  if (!themeId || themes.every((t,) => t.id !== themeId)) { return; }
  for (const t of themes) {
    const link = document.querySelector<HTMLLinkElement>(`#theme-${t.id}`,);
    if (link) { link.disabled = t.id !== themeId; }
  }
  document.body.classList.toggle("theme-no-icons", themeId === "no-icons",);
  localStorage.setItem("theme-preference", themeId,);
}

export function getTheme(): string {
  return localStorage.getItem("theme-preference",) || "default";
}

// ── Locale ──────────────────────────────────────────────────

export async function loadLocale(locale: string,): Promise<void> {
  try {
    const res = await fetch(`/locales/${locale}.json`,);
    if (res.ok) {
      const strings = await res.json();
      globalThis.__localeStrings = strings;
    }
  } catch {
    // keys display as-is
  }
}

export function setLocale(localeId: string,): void {
  localStorage.setItem("locale", localeId,);
  globalThis.currentLocale = localeId;
  loadLocale(localeId,);
}

// ── Avatar image fallback ──────────────────────────────────────
document.addEventListener(
  "error",
  (e: Event,) => {
    const img = e.target as HTMLImageElement;
    if (img?.dataset?.avatar === "user") { img.style.display = "none"; }
  },
  { capture: true, },
);

// Reveal helpers globally for onclick="" usage
globalThis.toggleSidebar = toggleSidebar;
globalThis.closeSidebar = closeSidebar;
globalThis.showToast = showToast;
globalThis.applyTheme = applyTheme;
globalThis.setLocale = setLocale;
globalThis.openModal = openModal;
globalThis.closeModal = closeModal;
globalThis.closeModalOnBackdrop = closeModalOnBackdrop;
