/**
 * Vanilla UI helpers — replaces Alpine for sidebar, toast, theme on non-chat pages.
 * Chat page still uses Alpine for its complex state.
 */

// ── Sidebar ──────────────────────────────────────────────────

export function toggleSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("#layout-sidebar");
  const backdrop = document.querySelector<HTMLElement>("#sidebar-backdrop");
  const isOpen = sidebar?.classList.contains("open") ?? false;
  sidebar?.classList.toggle("open");
  if (backdrop) {
    backdrop.style.display = isOpen ? "none" : "block";
    backdrop.classList.toggle("open");
  }
  document.body.classList.toggle("sidebar-open");
  if (globalThis.Alpine) {
    Alpine.store("sidebar").open = !isOpen;
  }
}

export function closeSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("#layout-sidebar");
  const backdrop = document.querySelector<HTMLElement>("#sidebar-backdrop");
  sidebar?.classList.remove("open");
  if (backdrop) {
    backdrop.style.display = "none";
    backdrop.classList.remove("open");
  }
  document.body.classList.remove("sidebar-open");
  if (globalThis.Alpine) {
    Alpine.store("sidebar").open = false;
  }
}

// ── Toast notifications ──────────────────────────────────────

const ICONS: Record<string, string> = {
  success: "✓",
  error: "✗",
  info: "ℹ",
  warning: "⚠",
};

export function showToast(type: string, message: string): void {
  const container = document.querySelector("#toast-container");
  if (!container) return;
  const icon = ICONS[type] || "ℹ";
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="icon">${icon}</span><span class="message">${message}</span>`;
  container.append(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 5000);
}

document.addEventListener(
  "show-toast",
  (e: CustomEvent<{ type?: string; message: string; icon?: string }>) => {
    showToast(e.detail.type || "info", e.detail.message);
  },
);

// ── Theme ────────────────────────────────────────────────────

export function applyTheme(themeId: string): void {
  const themes: Array<{ id: string; file: string }> = globalThis.__THEMES ?? [];
  if (!themeId || themes.every((t) => t.id !== themeId)) return;
  for (const t of themes) {
    const link = document.querySelector<HTMLLinkElement>(`#theme-${t.id}`);
    if (link) link.disabled = t.id !== themeId;
  }
  document.body.classList.toggle("theme-no-icons", themeId === "no-icons");
  localStorage.setItem("theme-preference", themeId);
}

export function getTheme(): string {
  return localStorage.getItem("theme-preference") || "default";
}

// ── Locale ──────────────────────────────────────────────────

export async function loadLocale(locale: string): Promise<void> {
  try {
    const res = await fetch(`/locales/${locale}.json`);
    if (res.ok) {
      const strings = await res.json();
      globalThis.__localeStrings = strings;
    }
  } catch {
    // keys display as-is
  }
}

export function setLocale(localeId: string): void {
  localStorage.setItem("locale", localeId);
  (globalThis as Record<string, unknown>).currentLocale = localeId;
  loadLocale(localeId);
}

// Reveal helpers globally for onclick="" usage
const g = globalThis as Record<string, unknown>;
g.toggleSidebar = toggleSidebar;
g.closeSidebar = closeSidebar;
g.showToast = showToast;
g.applyTheme = applyTheme;
g.setLocale = setLocale;
