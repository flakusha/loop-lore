/**
 * Vendor bundle — htmx, Alpine.js, morph plugin, htmx extensions.
 * Bundled by bun build --target browser into dist/public/vendor.js.
 * Loaded before app.ts so Alpine stores and htmx event handlers are ready.
 */
import morph from "@alpinejs/morph";
import Alpine from "alpinejs";
import htmx from "htmx.org";
import { createRequire } from "module";

const g = globalThis as Record<string, unknown>;
g.htmx = htmx;
g.Alpine = Alpine;
Alpine.plugin(morph);

// htmx extensions reference `htmx` as a free variable.
// Bun's require() inlines them in the same module scope where `htmx` is defined.
createRequire("htmx.org/dist/ext/alpine-morph.js");
createRequire("htmx.org/dist/ext/response-targets.js");
createRequire("htmx-ext-sse/sse.js");

// Initialize Alpine stores immediately (before Alpine starts auto-initialization)
Alpine.store("sidebar", { open: false });
Alpine.store("chat", { currentChat: null });
Alpine.store("ui", {
  showChatList: false,
  showGallery: false,
  showCharacterInfo: false,
  showUploadModal: false,
  showImportForm: false,
  showCreateForm: false,
  showEditModal: false,
  showPreviewModal: false,
  showChatSettings: false,
  showRenameModal: false,
  hasActiveChat: false,
});

// Auto-start after all deferred scripts have loaded
document.addEventListener("DOMContentLoaded", () => Alpine.start());
