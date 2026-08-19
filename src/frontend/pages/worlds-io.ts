// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── World import/export — separate module so pages/worlds.ts stays < 250 lines ──
import { jsonBody, safeJsonParse, } from "../alpine/json";
import { eventTarget, } from "../dom";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";

// Import a WorldBundle (.world.json) — POST the parsed JSON to /api/import/world
globalThis.importWorld = async function(event: Event,) {
  event.preventDefault();
  const form = eventTarget<HTMLFormElement>(event,);
  const input = form?.querySelector<HTMLInputElement>("#world-import-file-input",);
  const file = input?.files?.[0];
  if (!form || !file) {
    showToast("error", "Select a .world.json file to import",);
    return;
  }
  const parsed = safeJsonParse(await file.text(),);
  if (!parsed.ok) {
    showToast("error", "Invalid JSON: not a valid world bundle",);
    return;
  }
  const bundle = parsed.value;
  if (typeof bundle !== "object" || bundle === null || !("world" in (bundle as Record<string, unknown>))) {
    showToast("error", "Invalid world bundle: missing `world` object",);
    return;
  }
  try {
    const res = await feFetch("/api/import/world", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(bundle as Record<string, unknown>,),
    },);
    if (res.ok) {
      const data = (await res.json()) as { id: string; imported: Record<string, number> };
      document.querySelector("#import-world-modal",)?.classList.remove("open",);
      let totalImported = 0;
      const counts = data.imported ?? {};
      for (const key of Object.keys(counts,)) {
        totalImported += typeof counts[key] === "number" ? counts[key] : 0;
      }
      showToast("success", `Imported world (${totalImported} records)`,);
      const list = document.querySelector("#world-list",);
      if (list) { htmx.trigger(list, "load",); }
    } else {
      const err = await res.json();
      showToast("error", err.message || err.error || "Failed to import world",);
    }
  } catch {
    showToast("error", "Network error",);
  }
};

// Export a world as a .world.json bundle — backend GET /api/worlds/:id/export
globalThis.exportWorld = function(worldId: string,) {
  globalThis.location.assign(`/api/worlds/${encodeURIComponent(worldId,)}/export`,);
};
