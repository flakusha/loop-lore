// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import {
  actorAvailability,
  parseRestrictions,
} from "./actor-availability";
import type { CharacterAvailability, } from "./actor-availability";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
interface Call {
  url: string;
  opts?: RequestInit;
}

let fetchCalls: Call[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts,);
    },
  }),);
}

const ROW: CharacterAvailability = {
  id: "avail-1",
  actor_id: "actor-1",
  status: "limited",
  usage_policy: "personal",
  activity_restrictions: '["trading","combat"]',
  content_policy: "strict",
  nsfw_policy: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-02",
};

function resetState(): void {
  actorAvailability._availActorId = null;
  actorAvailability.availability = null;
  actorAvailability.availabilityForm = {
    status: "available",
    usage_policy: "",
    activity_restrictions: "",
    content_policy: "",
    nsfw_policy: "",
  };

  actorAvailability.availabilityLoading = false;
  actorAvailability.availabilitySaving = false;
  actorAvailability.availabilityError = "";
  actorAvailability.availabilityDirty = false;
  fetchCalls = [];
  fetchHandler = null;
}

describeOrSkip("parseRestrictions", () => {
  test("splits, trims and drops empties", () => {
    expect(parseRestrictions(" trading , combat ,,  ",),).toEqual(["trading", "combat",],);
  });

  test("returns an empty array for blank input", () => {
    expect(parseRestrictions("",),).toEqual([],);
  });
},);

describeOrSkip("actorAvailability.loadAvailability", () => {
  afterEach(resetState,);

  test("GETs the record and hydrates the form", async () => {
    fetchHandler = () => Response.json(ROW,);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));

    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/actor-1/availability",);
    expect(actorAvailability.availability,).toEqual(ROW,);
    expect(actorAvailability.availabilityForm.status,).toBe("limited",);
    expect(actorAvailability.availabilityForm.activity_restrictions,).toBe("trading, combat",);
    expect(actorAvailability.availabilityForm.usage_policy,).toBe("personal",);
    expect(actorAvailability.availabilityLoading,).toBe(false,);
  });

  test("treats 404 as the empty state", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));

    expect(actorAvailability.availability,).toBeNull();
    expect(actorAvailability.availabilityError,).toBe("",);
  });

  test("surfaces an error on failure", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));

    expect(actorAvailability.availabilityError,).toBe("status.availabilityLoadFailed",);
    expect(actorAvailability.availability,).toBeNull();
  });
},);

describeOrSkip("actorAvailability.save", () => {
  afterEach(resetState,);

  test("POSTs the form fields as the upsert body", async () => {
    fetchHandler = () => Response.json({ id: "avail-1", },);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));
    actorAvailability.availabilityForm = {
      status: "unavailable",
      usage_policy: "",
      activity_restrictions: "dueling, mining",
      content_policy: "strict",
      nsfw_policy: "allowed",
    };

    fetchCalls = [];

    await actorAvailability.save();

    expect(fetchCalls[0]?.url,).toBe("/api/v1/actors/actor-1/availability",);
    expect(fetchCalls[0]?.opts?.method,).toBe("POST",);
    const body = JSON.parse(String(fetchCalls[0]?.opts?.body,),) as Record<string, unknown>;
    expect(body,).toEqual({
      status: "unavailable",
      usage_policy: null,
      activity_restrictions: ["dueling", "mining",],
      content_policy: "strict",
      nsfw_policy: "allowed",
    },);

    expect(actorAvailability.availabilityError,).toBe("",);
    expect(actorAvailability.availabilityDirty,).toBe(false,);
  });

  test("surfaces the endpoint message on failure", async () => {
    fetchHandler = () => Response.json({ message: "nope", }, { status: 400, },);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));
    fetchCalls = [];

    await actorAvailability.save();

    expect(actorAvailability.availabilityError,).toBe("nope",);
    expect(actorAvailability.availabilitySaving,).toBe(false,);
  });
},);

describeOrSkip("actorAvailability.remove and cancelEdit", () => {
  afterEach(resetState,);

  test("DELETEs and clears the record", async () => {
    fetchHandler = () => Response.json({ ok: true, },);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));
    fetchCalls = [];

    await actorAvailability.remove();

    expect(fetchCalls[0]?.opts?.method,).toBe("DELETE",);
    expect(actorAvailability.availability,).toBeNull();
    expect(actorAvailability.availabilityDirty,).toBe(false,);
  });

  test("cancelEdit restores the stored record into the form", async () => {
    fetchHandler = () => Response.json(ROW,);
    actorAvailability.setActorId("actor-1",);
    await new Promise((r,) => setTimeout(r, 0,));
    actorAvailability.availabilityForm.status = "retired";
    actorAvailability.availabilityDirty = true;

    actorAvailability.cancelEdit();

    expect(actorAvailability.availabilityForm.status,).toBe("limited",);
    expect(actorAvailability.availabilityForm.activity_restrictions,).toBe("trading, combat",);
    expect(actorAvailability.availabilityDirty,).toBe(false,);
  });

  test("describeStatus resolves i18n keys and passes unknown codes through", () => {
    expect(actorAvailability.describeStatus("available",),).toBe("availability.statusAvailable",);
    expect(actorAvailability.describeStatus("mystery",),).toBe("mystery",);
  });
},);
