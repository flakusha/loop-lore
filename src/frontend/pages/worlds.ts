// ── Worlds page: search, create ──────────────────────────────
import { log as rootLog } from "../alpine/logger";

const pageLog = rootLog.child({ module: "worlds" });

(globalThis as any).filterWorlds = function () {
  const query = (document.querySelector<HTMLInputElement>("#world-search")?.value ?? "").toLowerCase().trim();
  const cards = document.querySelectorAll("#world-list .world-card");
  let visible = 0;
  for (const card of cards) {
    const name = (card.querySelector(".world-name")?.textContent ?? "").toLowerCase();
    const desc = (card.querySelector(".world-description")?.textContent ?? "").toLowerCase();
    const match = !query || name.includes(query) || desc.includes(query);
    (card as HTMLElement).style.display = match ? "" : "none";
    if (match) visible++;
  }
  if (visible === 0 && cards.length > 0) {
    const list = document.querySelector("#world-list");
    if (list) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.padding = "var(--space-12)";
      empty.innerHTML = `<div class="icon">🌍</div><div class="title">No worlds match your search</div>`;
      if (!list.querySelector(".empty-state")) list.append(empty);
    }
  }
};

(globalThis as any).createWorld = async function (event: Event) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const data: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  pageLog.debug("createWorld", { data });
  try {
    const res = await apiFetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    pageLog.debug("createWorld response", { status: res.status });
    if (res.ok) {
      const data = await res.json();
      document.querySelector("#create-world-modal")?.classList.remove("open");
      showToast("success", "World created");
      location.assign(`/worlds/${data.id}/edit`);
    } else {
      const err = await res.json();
      showToast("error", err.error || "Failed to create world");
    }
  } catch {
    showToast("error", "Network error");
  }
};
