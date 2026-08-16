// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export function initDropZone(dropZoneId: string, inputId: string,): void {
  if (typeof document === "undefined") { return; }

  const zone = document.querySelector<HTMLElement>(`#${CSS.escape(dropZoneId,)}`,);
  if (!zone) { return; }

  const input = document.querySelector<HTMLInputElement>(`#${CSS.escape(inputId,)}`,);
  zone.addEventListener("dragover", (e,) => {
    e.preventDefault();
    zone.classList.add("drag-over",);
  },);

  zone.addEventListener("dragleave", (e,) => {
    e.preventDefault();
    zone.classList.remove("drag-over",);
  },);

  zone.addEventListener("drop", (e,) => {
    e.preventDefault();
    zone.classList.remove("drag-over",);
    const file = e.dataTransfer?.files[0];
    if (file && input) {
      const textEl = zone.querySelector(".text",);
      if (textEl) { textEl.textContent = file.name; }
      input.files = e.dataTransfer.files;
    }
  },);

  if (input) {
    input.addEventListener("change", () => {
      const textEl = zone.querySelector(".text",);
      if (textEl) { textEl.textContent = input.files?.[0]?.name || "Drag & drop files here"; }
    },);
  }
}

// Auto-init when the DOM has a dropzone
const gDrop = globalThis as Record<string, unknown>;
gDrop.initDropZone = initDropZone;

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector("#upload-dropzone",)) {
    initDropZone("upload-dropzone", "upload-file-input",);
  }
},);
