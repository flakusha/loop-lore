// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat list page — loads world names for the filter dropdown.
 * Extracted from src/views/chat-list.html inline script.
 */
import { feFetch, } from "./fe-fetch";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await feFetch("/api/worlds?pageSize=200",);
    if (!res.ok) { return; }
    const body = await res.json();
    const worlds = body.data ?? [];
    const sel = document.querySelector("#chat-world-filter",);
    if (!sel?.tagName || !Array.isArray(worlds,)) { return; }
    for (const w of worlds) {
      const o = document.createElement("option",);
      o.value = w.id;
      o.textContent = w.name;
      sel.append(o,);
    }
  } catch { /* ignore */ }
},);
