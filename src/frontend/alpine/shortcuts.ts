/**
 * Keyboard Shortcuts
 *
 * Ctrl+B   — toggle sidebar
 * Ctrl+N   — new chat
 * Ctrl+L   — focus message input
 * Ctrl+K   — focus search (gallery/characters/worlds)
 * Escape   — close sidebar / close modals
 */

document.addEventListener("keydown", (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

  // Ctrl+B — toggle sidebar (works everywhere)
  if (e.ctrlKey && e.key === "b") {
    e.preventDefault();
    globalThis.toggleSidebar();
    return;
  }

  // Skip remaining shortcuts when typing in an input
  if (isInput) return;

  // Ctrl+N — new chat
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    const link = document.querySelector<HTMLAnchorElement>('[href="/views/new-chat"]');
    if (link) {
      link.click();
    } else {
      location.assign("/views/new-chat");
    }
    return;
  }

  // Ctrl+L — focus message input
  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    const input = document.querySelector<HTMLTextAreaElement>("#message-input, .input-row textarea");
    input?.focus();
    return;
  }

  // Ctrl+K — focus search
  if (e.ctrlKey && e.key === "k") {
    e.preventDefault();
    const search = document.querySelector<HTMLInputElement>('.list-search, [type="search"]');
    search?.focus();
    return;
  }
});
