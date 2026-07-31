// ── Characters page: search, detail modal, actions ────────────
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { fetchMood, happinessColor, moodToEmoji, moodToLabel, } from "../alpine/mood-panel";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { fetchPartial, filterCards, } from "./shared";

const log = rootLog.child({ module: "characters-page", },);

globalThis.filterCharacters = function() {
  const query = document.querySelector<HTMLInputElement>("#character-search",)?.value ?? "";
  filterCards({
    containerId: "#character-grid",
    cardSelector: ".character-card",
    nameSelector: ".name",
    descSelector: ".description",
    query,
    emptyIcon: "👤",
    emptyTitle: "No characters match your search",
  },);
};

globalThis.selectCharacterCard = async function(id: string,) {
  let modal = document.querySelector<HTMLElement>("#character-detail-modal",);

  if (!modal) {
    const container = document.querySelector("#modal-container",);
    if (!container) { return; }
    const html = await fetchPartial("/partials/characters/detail-modal",);
    if (!html) { return; }
    container.innerHTML = html;
    // Initialize Alpine on dynamically loaded modal
    if (globalThis.Alpine) {
      globalThis.Alpine.initTree(container as HTMLElement,);
    }
    modal = document.querySelector<HTMLElement>("#character-detail-modal",);
  }
  if (!modal) { return; }

  const resp = await feFetch(`/api/actors/${id}`,);
  if (!resp.ok) {
    log.error("Failed to fetch actor", undefined, { status: resp.status, id, },);
    return;
  }
  const char = await resp.json();

  try {
    modal.querySelector("[data-field='name']",)!.textContent = char.display_name || char.name || "";
    modal.querySelector("[data-field='description']",)!.textContent = char.description || "No description";
    modal.querySelector("[data-field='system-prompt']",)!.textContent = char.system_prompt || "No system prompt";
    modal.querySelector("[data-field='avatar']",)!.innerHTML = char.avatar_asset_id
      ? `<img src="/api/assets/${char.avatar_asset_id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
      : "<span>👤</span>";
    modal.querySelector("[data-action='start-chat']",)?.setAttribute("data-id", id,);
    modal.querySelector("[data-action='edit-char']",)?.setAttribute("data-id", id,);
    modal.querySelector("[data-action='delete-char']",)?.setAttribute("data-id", id,);
    modal.classList.add("open",);

    // Load mood data for this character
    const moodSection = modal.querySelector<HTMLElement>("[data-field='mood-section']",);
    if (moodSection) {
      const mood = await fetchMood(id,);
      if (mood) {
        moodSection.style.display = "block";
        const emojiEl = modal.querySelector<HTMLElement>("[data-field='mood-emoji']",);
        const labelEl = modal.querySelector<HTMLElement>("[data-field='mood-label']",);
        const barEl = modal.querySelector<HTMLElement>("[data-field='mood-bar']",);
        const happinessEl = modal.querySelector<HTMLElement>("[data-field='mood-happiness']",);
        if (emojiEl) { emojiEl.textContent = moodToEmoji(mood.currentMood,); }
        if (labelEl) { labelEl.textContent = moodToLabel(mood.currentMood,); }
        if (barEl) {
          barEl.style.width = `${mood.happiness}%`;
          barEl.style.backgroundColor = happinessColor(mood.happiness,);
        }
        if (happinessEl) { happinessEl.textContent = `${mood.happiness}%`; }
      }
    }
  } catch {
    /* ignore */
  }
};

globalThis.startChatFromChar = async function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (!id) { return; }
  try {
    const res = await feFetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ name: "Chat", type: "direct", mode: "direct", participantIds: [id,], },),
    },);
    if (res.ok) {
      const data = await res.json();
      location.assign(`/views/chat?chatid=${encodeURIComponent(data.id,)}`,);
    }
  } catch {
    /* ignore */
  }
};

globalThis.editCharacter = function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (id) { location.assign(`/character/${id}/edit`,); }
};

globalThis.deleteCharacter = async function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (!id || !confirm("Delete this character?",)) { return; }
  try {
    const res = await feFetch(`/api/actors/${id}`, {
      method: "DELETE",
    },);
    if (res.ok) {
      document.querySelector("#character-detail-modal",)?.classList.remove("open",);
      showToast("success", "Character deleted",);
      const grid = document.querySelector("#character-grid",);
      if (grid) {
        htmx.trigger(grid, "load",);
      }
    }
  } catch {
    /* ignore */
  }
};

globalThis.exportCharacter = function(btn: HTMLElement,) {
  const modal = btn.closest(".modal",);
  if (!modal) {
    log.error("No modal found",);
    return;
  }

  const format = (
    modal.querySelector('input[name="export-format"]:checked',) as HTMLInputElement | null
  )?.value;
  const characterId = (modal as HTMLElement).dataset.characterId;

  if (!characterId) {
    log.error("No character ID found",);
    return;
  }

  // Trigger download — backend uses /api/actors/:actorId/export
  globalThis.location.assign(`/api/actors/${characterId}/export?format=${format}`,);
  closeModal(btn,);
};

// ── Emotion Avatar Generation ────────────────────────────────────────

/** Active polling interval for emotion avatar generation */
let emotionAvatarPollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Generate emotion avatars for a character.
 * Triggers batch generation via API and polls for progress.
 */
(globalThis as any).generateEmotionAvatars = async function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (!id) {
    log.error("No character ID found for emotion avatar generation",);
    return;
  }

  const progressEl = document.querySelector<HTMLElement>("#emotion-avatar-progress",);
  const statusEl = document.querySelector<HTMLElement>("#emotion-avatar-status",);
  const resultsEl = document.querySelector<HTMLElement>("#emotion-avatar-results",);

  if (!progressEl || !statusEl || !resultsEl) {
    log.error("Progress elements not found",);
    return;
  }

  // Show progress, disable button
  progressEl.style.display = "block";
  btn.setAttribute("disabled", "true",);
  statusEl.textContent = "Starting generation...";
  resultsEl.replaceChildren();

  try {
    // Start batch generation
    const res = await feFetch(`/api/actors/${id}/emotion-avatars`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({
        // Use default emotions (all) — no baseAvatarId override means use character's primary avatar
        // Template expansion config is applied server-side
      },),
    },);

    if (!res.ok) {
      let errorMessage = "Failed to start generation";
      try {
        const errBody = await res.json();
        errorMessage = errBody.message || errorMessage;
      } catch {
        // Use default error message
      }
      statusEl.textContent = `Error: ${errorMessage}`;
      btn.removeAttribute("disabled",);
      return;
    }

    const { jobId, } = await res.json();
    statusEl.textContent = "Generating...";

    // Start polling for job status
    startEmotionAvatarPolling(id, jobId, statusEl, resultsEl, btn,);
  } catch (error) {
    log.error("Failed to start emotion avatar generation", error instanceof Error ? error : undefined,);
    statusEl.textContent = "Error: Failed to start generation";
    btn.removeAttribute("disabled",);
  }
};

/**
 * Poll job status until completion.
 */
function startEmotionAvatarPolling(
  actorId: string,
  jobId: string,
  statusEl: HTMLElement,
  resultsEl: HTMLElement,
  btn: HTMLElement,
) {
  // Clear any existing poll
  if (emotionAvatarPollInterval) {
    clearInterval(emotionAvatarPollInterval,);
  }

  emotionAvatarPollInterval = setInterval(async () => {
    try {
      const res = await feFetch(`/api/actors/${actorId}/emotion-avatars/jobs/${jobId}`,);
      if (!res.ok) {
        statusEl.textContent = "Error: Failed to check status";
        clearInterval(emotionAvatarPollInterval!,);
        btn.removeAttribute("disabled",);
        return;
      }

      const job = await res.json();

      // Update status display
      let completed = 0;
      let failed = 0;
      const total = job.results.length;
      const resultHtml: string[] = [];

      for (const r of job.results) {
        if (r.status === "completed") { completed++; }
        if (r.status === "failed") { failed++; }

        let icon: string;
        if (r.status === "completed") {
          icon = "✅";
        } else if (r.status === "failed") {
          icon = "❌";
        } else {
          icon = "⏳";
        }
        const label = r.emotion.charAt(0,).toUpperCase() + r.emotion.slice(1,);
        const errorSuffix = r.error ? ` — ${r.error}` : "";
        resultHtml.push(`<div>${icon} ${label}${errorSuffix}</div>`,);
      }

      statusEl.textContent = `Generating... ${completed}/${total} completed`;
      if (failed > 0) {
        statusEl.textContent += ` (${failed} failed)`;
      }

      // Update results list
      resultsEl.replaceChildren();
      resultsEl.innerHTML = resultHtml.join("",);

      // Check if job is done
      const doneStatuses = ["completed", "failed", "cancelled",];
      if (doneStatuses.includes(job.status,)) {
        clearInterval(emotionAvatarPollInterval!,);
        emotionAvatarPollInterval = null;
        if (job.status === "completed") {
          statusEl.textContent = `Done! ${completed} avatars generated`;
        } else if (job.status === "cancelled") {
          statusEl.textContent = "Generation cancelled";
        } else {
          statusEl.textContent = `Failed: ${job.error || "Unknown error"}`;
        }
        btn.removeAttribute("disabled",);
      }
    } catch (error) {
      log.error("Failed to poll emotion avatar job status", error instanceof Error ? error : undefined,);
      statusEl.textContent = "Error: Lost connection to server";
      clearInterval(emotionAvatarPollInterval!,);
      emotionAvatarPollInterval = null;
      btn.removeAttribute("disabled",);
    }
  }, 2000,); // Poll every 2 seconds
}
