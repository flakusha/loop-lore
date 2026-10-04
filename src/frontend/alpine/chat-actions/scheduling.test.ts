import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { toDate, } from "../../../utils/date";
import { localInputToIso, schedulingActions, } from "./scheduling";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

// ── Mock ../htmx (must precede importing the actions) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

interface Host {
  activeChat: string | null;
  toasts: Toast[];
  _scheduleOpen: boolean;
  _scheduleAt: string;
  _scheduling: boolean;
  _scheduled: { id: string }[];
  _reminderFor: string | null;
  _reminders: { id: string }[];
  $dispatch?: (event: string, detail?: unknown,) => void;
  toggleSchedulePicker?: () => void;
  closeSchedulePicker?: () => void;
  scheduleDraft?: () => Promise<void>;
  loadScheduled?: () => Promise<void>;
  cancelScheduled?: (id: string,) => Promise<void>;
  openReminderPicker?: (id: string,) => void;
  closeReminderPicker?: () => void;
  armReminder?: (minutes: number,) => Promise<void>;
  loadReminders?: () => Promise<void>;
  cancelReminder?: (id: string,) => Promise<void>;
}

function buildHost(overrides?: Partial<Host>,): Host {
  const host: Host = {
    activeChat: "chat-1",
    toasts: [],
    _scheduleOpen: false,
    _scheduleAt: "",
    _scheduling: false,
    _scheduled: [],
    _reminderFor: null,
    _reminders: [],
    ...schedulingActions,
    ...overrides,
  } as Host;

  host.$dispatch = (event, detail,) => {
    if (event === "show-toast") { host.toasts.push(detail as Toast,); }
  };

  return host;
}

/** Composer textarea the schedule action reads the draft from. */
function withDraft(value: string,): void {
  const el = { value, };
  const stub = {
    querySelector: (sel: string,): unknown => (sel === "[data-testid=message-input]" ? el : null),
  };

  Object.defineProperty(globalThis, "document", { value: stub, configurable: true, writable: true, },);
}

function clearDocument(): void {
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true, writable: true, },);
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  clearDocument();
},);

describeOrSkip("localInputToIso", () => {
  test("a datetime-local value round-trips to the same local wall time", () => {
    const iso = localInputToIso("2026-10-03T14:30",);
    expect(iso,).not.toBeNull();
    // The picker sends local wall time; the stored value is an instant. The
    // round-trip is the contract, so this holds in any timezone.
    expect(toDate(iso!,).getHours(),).toBe(14,);
  });

  test("returns null for an empty value rather than guessing now", () => {
    expect(localInputToIso("",),).toBeNull();
  });

  test("returns null for an unparseable value", () => {
    expect(localInputToIso("tomorrow-ish",),).toBeNull();
  });
},);

describeOrSkip("schedule picker", () => {
  test("toggles open and closed", () => {
    const h = buildHost();
    h.toggleSchedulePicker!();
    expect(h._scheduleOpen,).toBe(true,);
    h.toggleSchedulePicker!();
    expect(h._scheduleOpen,).toBe(false,);
    h.toggleSchedulePicker!();
    h.closeSchedulePicker!();
    expect(h._scheduleOpen,).toBe(false,);
  });

  test("warns instead of scheduling when no chat is active", async () => {
    const h = buildHost({ activeChat: null, },);
    h._scheduleAt = "2026-10-03T14:30";

    await h.scheduleDraft!();

    expect(h.toasts[0]?.type,).toBe("warning",);
    expect(calls.length,).toBe(0,);
  });

  test("warns when no time was picked, without reading the draft", async () => {
    const h = buildHost({ _scheduleAt: "", },);

    await h.scheduleDraft!();

    expect(h.toasts[0]?.type,).toBe("warning",);
    expect(calls.length,).toBe(0,);
  });

  test("warns when the draft is empty", async () => {
    withDraft("   ",);
    const h = buildHost({ _scheduleAt: "2026-10-03T14:30", },);

    await h.scheduleDraft!();

    expect(h.toasts[0]?.type,).toBe("warning",);
    expect(calls.length,).toBe(0,);
  });

  test("a second click while one is in flight is ignored", async () => {
    const h = buildHost({ _scheduleAt: "2026-10-03T14:30", _scheduling: true, },);
    withDraft("hello",);

    await h.scheduleDraft!();

    expect(calls.length,).toBe(0,);
  });

  test("posts the draft, closes the picker, and reloads the list", async () => {
    withDraft("  ship it  ",);
    handler = async (_url, opts,) => {
      if (opts?.method === "POST") {
        return Response.json({ data: { id: "s1", }, }, { status: 201, },);
      }

      return Response.json({ data: [{ id: "s1", },], },);
    };

    const h = buildHost({ _scheduleAt: "2026-10-03T14:30", _scheduleOpen: true, },);

    await h.scheduleDraft!();

    const post = calls.find((c,) => c.opts.method === "POST");
    expect(post?.url,).toBe("/api/v1/chats/chat-1/scheduled",);
    const body = String(post?.opts.body,);
    // Trimmed body; sendAt normalized to an instant, not the raw local string.
    expect(body,).toContain("ship it",);
    expect(body,).not.toContain('2026-10-03T14:30"',);
    expect(h._scheduleOpen,).toBe(false,);
    expect(h._scheduleAt,).toBe("",);
    expect(h.toasts[0]?.type,).toBe("success",);
    expect(h._scheduled,).toEqual([{ id: "s1", },],);
    expect(h._scheduling,).toBe(false,);
  });

  test("a rejected park reports failure and re-enables the button", async () => {
    withDraft("hello",);
    handler = async () => Response.json({ error: "nope", }, { status: 400, },);
    const h = buildHost({ _scheduleAt: "2026-10-03T14:30", },);

    await h.scheduleDraft!();

    expect(h.toasts[0]?.type,).toBe("error",);
    expect(h._scheduling,).toBe(false,);
  });

  test("a network throw still clears the in-flight guard", async () => {
    withDraft("hello",);
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost({ _scheduleAt: "2026-10-03T14:30", },);

    await h.scheduleDraft!();

    expect(h.toasts[0]?.type,).toBe("error",);
    expect(h._scheduling,).toBe(false,);
  });
},);

describeOrSkip("scheduled list + cancel", () => {
  test("load is a no-op without an active chat", async () => {
    const h = buildHost({ activeChat: null, },);
    await h.loadScheduled!();
    expect(calls.length,).toBe(0,);
  });

  test("a non-ok load leaves the previous list alone", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const h = buildHost({ _scheduled: [{ id: "keep", },], },);
    await h.loadScheduled!();
    expect(h._scheduled,).toEqual([{ id: "keep", },],);
  });

  test("a throwing load is swallowed, not surfaced", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost();
    await h.loadScheduled!();
    expect(h._scheduled,).toEqual([],);
  });

  test("cancel is a no-op without an active chat", async () => {
    const h = buildHost({ activeChat: null, },);
    await h.cancelScheduled!("s1",);
    expect(calls.length,).toBe(0,);
  });

  test("a successful cancel refreshes the list", async () => {
    handler = async (_url, opts,) => {
      if (opts?.method === "DELETE") { return Response.json({ ok: true, },); }
      return Response.json({ data: [], },);
    };

    const h = buildHost({ _scheduled: [{ id: "s1", },], },);

    await h.cancelScheduled!("s1",);

    expect(calls[0]?.url,).toBe("/api/v1/chats/chat-1/scheduled/s1",);
    expect(calls[0]?.opts.method,).toBe("DELETE",);
    expect(h._scheduled,).toEqual([],);
  });

  test("a failed cancel leaves the row listed", async () => {
    handler = async () => Response.json({}, { status: 404, },);
    const h = buildHost({ _scheduled: [{ id: "s1", },], },);

    await h.cancelScheduled!("s1",);

    // No reload: the delete was rejected, so the list must not be re-read.
    expect(calls.length,).toBe(1,);
  });

  test("a throwing cancel is swallowed", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost();
    await h.cancelScheduled!("s1",);
    expect(calls.length,).toBe(1,);
  });
},);

describeOrSkip("reminder ladder", () => {
  test("opening the picker records the target message", () => {
    const h = buildHost();
    h.openReminderPicker!("msg-1",);
    expect(h._reminderFor,).toBe("msg-1",);
    h.closeReminderPicker!();
    expect(h._reminderFor,).toBeNull();
  });

  test("arming with no message open is a no-op, not a request for undefined", async () => {
    const h = buildHost();
    h._reminderFor = null;

    await h.armReminder!(10,);

    expect(calls.length,).toBe(0,);
  });

  test("arming posts a horizon and reloads the list", async () => {
    handler = async (_url, opts,) => {
      if (opts?.method === "POST") {
        return Response.json({ data: { id: "r1", }, }, { status: 201, },);
      }

      return Response.json({ data: [{ id: "r1", },], },);
    };

    const h = buildHost();
    h.openReminderPicker!("msg-1",);

    await h.armReminder!(60,);

    expect(calls[0]?.url,).toBe("/api/v1/reminders",);
    // The picker clears its target, so a second click cannot double-arm.
    expect(h._reminderFor,).toBeNull();
    expect(String(calls[0]?.opts.body,),).toContain("msg-1",);
    expect(h.toasts[0]?.type,).toBe("success",);
    expect(h._reminders,).toEqual([{ id: "r1", },],);
  });

  test("a rejected arm reports failure", async () => {
    handler = async () => Response.json({}, { status: 400, },);
    const h = buildHost();
    h.openReminderPicker!("msg-1",);

    await h.armReminder!(10,);

    expect(h.toasts[0]?.type,).toBe("error",);
  });

  test("a throwing arm is reported, not swallowed", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost();
    h.openReminderPicker!("msg-1",);

    await h.armReminder!(10,);

    expect(h.toasts[0]?.type,).toBe("error",);
  });

  test("load works without an active chat - reminders are user-scoped", async () => {
    handler = async () => Response.json({ data: [{ id: "r9", },], },);
    const h = buildHost({ activeChat: null, },);

    await h.loadReminders!();

    expect(calls[0]?.url,).toBe("/api/v1/reminders",);
    expect(h._reminders,).toEqual([{ id: "r9", },],);
  });

  test("a non-ok load leaves the previous list alone", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const h = buildHost({ _reminders: [{ id: "keep", },], },);
    await h.loadReminders!();
    expect(h._reminders,).toEqual([{ id: "keep", },],);
  });

  test("a throwing load is swallowed", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost();
    await h.loadReminders!();
    expect(h._reminders,).toEqual([],);
  });

  test("cancel works without an active chat - reminders are user-scoped", async () => {
    handler = async (_url, opts,) => {
      if (opts?.method === "DELETE") { return Response.json({ ok: true, },); }
      return Response.json({ data: [], },);
    };

    const h = buildHost({ activeChat: null, },);

    await h.cancelReminder!("r1",);

    expect(calls[0]?.url,).toBe("/api/v1/reminders/r1",);
    expect(h._reminders,).toEqual([],);
  });

  test("a successful cancel refreshes the list", async () => {
    handler = async (_url, opts,) => {
      if (opts?.method === "DELETE") { return Response.json({ ok: true, },); }
      return Response.json({ data: [], },);
    };

    const h = buildHost({ _reminders: [{ id: "r1", },], },);

    await h.cancelReminder!("r1",);

    expect(calls[0]?.url,).toBe("/api/v1/reminders/r1",);
    expect(h._reminders,).toEqual([],);
  });

  test("a failed cancel leaves the row listed", async () => {
    handler = async () => Response.json({}, { status: 404, },);
    const h = buildHost({ _reminders: [{ id: "r1", },], },);

    await h.cancelReminder!("r1",);

    expect(calls.length,).toBe(1,);
  });

  test("a throwing cancel is swallowed", async () => {
    handler = () => {
      throw new Error("offline",);
    };

    const h = buildHost();
    await h.cancelReminder!("r1",);
    expect(calls.length,).toBe(1,);
  });
},);
