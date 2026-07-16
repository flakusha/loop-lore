/**
 * Sidebar Swipe Gesture
 *
 * Swipe right from left 40px edge → open sidebar
 * Swipe left when open → close sidebar
 * Backdrop dismiss and Escape key handled in htmx.ts/ui.ts
 */

let touchStartX = 0;
let touchStartY = 0;
let isTracking = false;

document.addEventListener(
  "touchstart",
  (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isTracking = true;
  },
  { passive: true },
);

document.addEventListener(
  "touchmove",
  (e: TouchEvent) => {
    if (!isTracking) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (Math.abs(dx) < Math.abs(dy)) {
      isTracking = false;
      return;
    }

    const sidebar = document.querySelector<HTMLElement>("#layout-sidebar");
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains("open");

    if (dx > 60 && touchStartX < 40 && !isOpen) {
      globalThis.toggleSidebar();
      isTracking = false;
    }

    if (dx < -60 && isOpen) {
      globalThis.closeSidebar();
      isTracking = false;
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  () => {
    isTracking = false;
  },
  { passive: true },
);
