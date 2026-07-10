# Deferred Concepts (Roadmap)

Research-derived concepts that are **planned but post-MVP**. Each links back to
its source research doc. Referenced by `docs/meta/roadmap.md`.

Per user direction: **tool calling is explicitly deferred** (later concern);
BYOK / BYOR / 3D world / cross-chat notifications are post-MVP tracking items.

---

## D.1 Tool / Function Calling — DEFERRED

Source: `docs/research/tool-calling-architecture.md` (567 lines).

Recommended architecture when picked up (do not implement yet):

- 3-layer tool architecture (OpenCode pattern): definition → registry → executor.
- Tool defs sourced from plugin registry; mapped to OpenAI `tools` array.
- `tool_calls` SSE delta accumulation; `role: "tool"` result loop; capped rounds.
- Gate on `ProviderCapabilities.tools`.

Roadmap entry: `roadmap.md` P2 Advanced AI → "Tool Use Framework" / "Function Calling".

---

## D.2 BYOK — Bring Your Own LLM / Image Gen

Source: `docs/research/local-remote-inference-uis.md` §10.2.

- User supplies own LLM endpoint + API key and/or own image-gen backend.
- **Admin cannot access** user API keys / endpoint address — encryption-at-rest
  with a user-held key (see `docs/frontend/encryption.md`).
- Admin **can ban usage** on policy breach (soft-disable integration) without
  reading the secret.
- Implies: per-user provider config (encrypted); server proxies requests, never
  logs keys. Maps onto llama-swap-style proxy but user-scoped.

---

## D.3 BYOR — Bring Your Own Resources

Source: `docs/research/local-remote-inference-uis.md` §10.3.

- User donates local machine resources (GPU/CPU) to help with response
  generation or tool calls for the instance.
- Distinct from BYOK: not credentials but **compute** — a peer worker node the
  server dispatches tasks to (cf. Spellcaster Antenna remote-box control).
- Implies: worker/queue tier accepting user-hosted runners, with trust +
  rate-limit boundaries. Lower priority than BYOK.

---

## D.4 3D World Support

Source: `docs/research/local-remote-inference-uis.md` §10.4.

- World map / location travel: navigate a spatial world, move characters
  between locations.
- Characters have **3D avatars** — JS browser 3D libs exist (Three.js,
  Babylon.js, R3F).
- **Storage + support TBC** — `assets` table gains a `model3d` kind (glTF/GLB);
  Web-only rendering surface (canvas/WebGL panel), not TUI.
- Highest complexity, lowest urgency.

---

## D.5 Cross-Chat Notifications & Autonomous Messages

Source: `docs/research/local-remote-inference-uis.md` §10.1.

- User receives notifications from chats they are NOT actively viewing.
- **Fun feature**: a character "misses" the user and sends a message
  spontaneously after a random time interval (autonomous generation, no user
  prompt). Extends Spellcaster Autonoma/Sceneshifter to text.
- Implies: a **notification bus** decoupled from the active chat socket, a
  per-user "unseen message" counter, and a scheduler that wakes idle characters.
- Note: SSE + replay-buffer streaming (§6.3, §8.3) is workable but client state
  gets complex across multiple chats — design the bus per-user, not per-chat.

---

## D.6 Dual Runtime (Bun + Deno) — OPTIONAL

Source: `docs/research/runtime-migration-bun-deno.md` (260 lines).

- Investigate Deno as alternative runtime: API inventory + counterparts,
  Kysely SQLite dialect adapter, permission model, dependency compat.
- Verdict in source: Bun remains primary; Deno support is optional future.
- No action this cycle.

---

## Disposition

- **Roadmap** — tracked here, not in v0.2 plan.
- Source research docs stay as inspiration; prune once each concept lands in
  spec/features.
