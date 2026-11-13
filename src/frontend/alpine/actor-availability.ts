// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character availability panel state plugin.
// Drives `/api/v1/actors/:actorId/availability` (GET / POST / DELETE — the
// shipped character-availability routes). Pairs with
// `src/components/character/availability-panel.html`. Mirrors the
// actor-licensing plugin shape (setActorId / load / save / remove).
import { autoResize as autoResizeImpl, } from "./auto-resize";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-availability", },);

/** Status values surfaced in the editor dropdown (backend default: available). */
export const AVAILABILITY_STATUS_OPTIONS = [
  "available",
  "limited",
  "unavailable",
  "retired",
] as const;

/** Human label for an availability status code (i18n key per status). */
const STATUS_KEYS: Record<string, string> = {
  available: "availability.statusAvailable",
  limited: "availability.statusLimited",
  unavailable: "availability.statusUnavailable",
  retired: "availability.statusRetired",
};

/** Availability row returned by the GET endpoint (matches `character_availability`). */
export interface CharacterAvailability {
  id: string;
  actor_id: string;
  status: string;
  usage_policy: string | null;
  /** JSON-encoded string array as stored in the DB column. */
  activity_restrictions: string | null;
  content_policy: string | null;
  nsfw_policy: string | null;
  created_at: string;
  updated_at: string;
}

/** State plugin for the character-availability panel. */
export interface ActorAvailabilityState {
  _availActorId: string | null;
  availability: CharacterAvailability | null;
  availabilityForm: {
    status: string;
    usage_policy: string;
    /** Comma-separated edit view of the stored JSON array. */
    activity_restrictions: string;
    content_policy: string;
    nsfw_policy: string;
  };
  availabilityLoading: boolean;
  availabilitySaving: boolean;
  availabilityError: string;
  availabilityDirty: boolean;
  statusOptions: readonly string[];
  /** Bind the panel to a specific actor; clears any prior availability data. */
  setActorId(actorId: string,): void;
  /** Fetch the current availability record (200 → populates; 404 → null). */
  loadAvailability(): Promise<void>;
  /** Mark the form as dirty so the edit form stays open. */
  markDirty(): void;
  /** POST the current `availabilityForm` to the upsert endpoint. */
  save(): Promise<void>;
  /** DELETE the availability record and clear `availability`. */
  remove(): Promise<void>;
  /** Resolve a human label for an availability status code. */
  describeStatus(code: string,): string;
  /** Decode the bound record's stored restrictions JSON array. */
  storedRestrictions(): string[];
  /** Reset the edit form back to the stored record (or the empty form). */
  cancelEdit(): void;
  /** Resize a textarea to fit its content. */
  autoResize(el: HTMLTextAreaElement,): void;
}

const EMPTY_FORM: ActorAvailabilityState["availabilityForm"] = {
  status: "available",
  usage_policy: "",
  activity_restrictions: "",
  content_policy: "",
  nsfw_policy: "",
};

/** Parse the comma-separated edit input into the stored string-array form. */
export function parseRestrictions(input: string,): string[] {
  return input
    .split(",",)
    .map((part,) => part.trim())
    .filter((part,) => part.length > 0);
}

export const actorAvailability: ActorAvailabilityState = {
  _availActorId: null,
  availability: null,
  availabilityForm: { ...EMPTY_FORM, },
  availabilityLoading: false,
  availabilitySaving: false,
  availabilityError: "",
  availabilityDirty: false,
  statusOptions: AVAILABILITY_STATUS_OPTIONS,

  setActorId(actorId: string,) {
    if (this._availActorId === actorId) { return; }
    this._availActorId = actorId;
    this.availability = null;
    this.availabilityForm = { ...EMPTY_FORM, };
    this.availabilityError = "";
    this.availabilityDirty = false;
    void this.loadAvailability();
  },

  async loadAvailability() {
    const actorId = this._availActorId;
    if (!actorId) { return; }
    this.availabilityLoading = true;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/availability`,);
      if (res.status === 404) {
        this.availability = null;
        return;
      }

      if (!res.ok) {
        this.availabilityError = t("status.availabilityLoadFailed",);
        return;
      }

      const row = (await res.json()) as CharacterAvailability;
      this.availability = row;
      this.availabilityForm = {
        status: row.status,
        usage_policy: row.usage_policy ?? "",
        activity_restrictions: parseStoredRestrictions(row.activity_restrictions,).join(", ",),
        content_policy: row.content_policy ?? "",
        nsfw_policy: row.nsfw_policy ?? "",
      };

      this.availabilityDirty = false;
    } catch (error) {
      // feFetch throws for non-2xx; a 404 is the documented "not set yet" empty state.
      if ((error as { status?: number } | null)?.status === 404) {
        this.availability = null;
        return;
      }

      log.error("Failed to load availability", error instanceof Error ? error : undefined, {},);
      this.availabilityError = t("status.availabilityLoadFailed",);
    } finally {
      this.availabilityLoading = false;
    }
  },

  markDirty() {
    this.availabilityDirty = true;
  },

  async save() {
    const actorId = this._availActorId;
    if (!actorId || this.availabilitySaving) { return; }
    this.availabilitySaving = true;
    this.availabilityError = "";
    try {
      const form = this.availabilityForm;
      const body = {
        status: form.status,
        usage_policy: form.usage_policy || null,
        activity_restrictions: parseRestrictions(form.activity_restrictions,),
        content_policy: form.content_policy || null,
        nsfw_policy: form.nsfw_policy || null,
      };

      const res = await apiFetch(`/api/v1/actors/${actorId}/availability`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}) as Record<string, unknown>) as {
          message?: string;
        };

        this.availabilityError = errBody.message ?? t("status.availabilitySaveFailed",);
        return;
      }

      this.availabilityDirty = false;
      await this.loadAvailability();
    } catch (error) {
      log.error("Failed to save availability", error instanceof Error ? error : undefined, {},);
      this.availabilityError = t("status.availabilitySaveFailed",);
    } finally {
      this.availabilitySaving = false;
    }
  },

  async remove() {
    const actorId = this._availActorId;
    if (!actorId || this.availabilitySaving) { return; }
    this.availabilitySaving = true;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/availability`, { method: "DELETE", },);
      if (!res.ok) {
        this.availabilityError = t("status.availabilityDeleteFailed",);
        return;
      }

      this.availability = null;
      this.availabilityForm = { ...EMPTY_FORM, };
      this.availabilityDirty = false;
    } catch (error) {
      log.error("Failed to delete availability", error instanceof Error ? error : undefined, {},);
      this.availabilityError = t("status.availabilityDeleteFailed",);
    } finally {
      this.availabilitySaving = false;
    }
  },

  autoResize(el: HTMLTextAreaElement,) {
    autoResizeImpl(el,);
  },

  describeStatus(code: string,) {
    const key = STATUS_KEYS[code];
    return key ? t(key,) : code;
  },

  storedRestrictions(): string[] {
    return parseStoredRestrictions(this.availability?.activity_restrictions ?? null,);
  },

  cancelEdit() {
    const row = this.availability;
    this.availabilityForm = row
      ? {
        status: row.status,
        usage_policy: row.usage_policy ?? "",
        activity_restrictions: parseStoredRestrictions(row.activity_restrictions,).join(", ",),
        content_policy: row.content_policy ?? "",
        nsfw_policy: row.nsfw_policy ?? "",
      }
      : { ...EMPTY_FORM, };

    this.availabilityDirty = false;
  },
};

/** Decode the stored JSON array column; tolerates null and malformed JSON. */
function parseStoredRestrictions(stored: string | null,): string[] {
  if (!stored) { return []; }
  const parsed = jsonParseOr<unknown>(stored, null,);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter((v,): v is string => typeof v === "string");
}

/**
 * Build the Alpine scope for the availability panel partial.
 * @param actorId
 * @returns the availability panel state bound to the actor.
 */
export function actorAvailabilityFactory(actorId: string,): ActorAvailabilityState {
  const raw = Object.create(actorAvailability,) as ActorAvailabilityState;
  // Wrap in Alpine's reactive proxy BEFORE setActorId fires the async load,
  // mirroring the actor-licensing factory (BUG-93b85cd).
  const alpine = (globalThis as { Alpine?: { reactive?: <T,>(value: T,) => T } }).Alpine;
  const state = alpine?.reactive ? alpine.reactive(raw,) : raw;
  state._availActorId = null;
  state.availability = null;
  state.availabilityForm = { ...EMPTY_FORM, };
  state.availabilityLoading = false;
  state.availabilitySaving = false;
  state.availabilityError = "";
  state.availabilityDirty = false;
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorAvailabilityFactory = actorAvailabilityFactory;
