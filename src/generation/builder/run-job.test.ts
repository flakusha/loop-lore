// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeEach, describe, expect, test, } from "bun:test";
import type { ImageEditRequest, } from "../../image-edit/types";
import type { ChainStep, } from "./chain-types";
import { startChainRun, } from "./run-job";
import { clearRunJobs, listRunJobs, } from "./run-job-store";

const STEPS: ChainStep[] = [
  { id: "s1", templateId: "txt2img", params: { steps: 20, }, },
  { id: "s2", templateId: "upscale", params: { factor: 2, }, },
];

const AUTH = { userId: "user-1", userRole: null, };

/** Poll until the predicate holds or the deadline passes. */
async function until(check: () => boolean, timeoutMs = 2_000,): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) { return true; }
    await new Promise((resolve,) => setTimeout(resolve, 5,));
  }

  return check();
}

describe("startChainRun", () => {
  beforeEach(() => {
    clearRunJobs();
  },);

  test("runs every step in order and completes", async () => {
    const seen: ImageEditRequest[] = [];
    const job = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: STEPS,
      auth: AUTH,
      executeStep: async (body,) => {
        seen.push(body,);
        return Response.json({ data: [{ filename: `${body.template_id}.png`, },], },);
      },
    },);

    expect(["pending", "running",],).toContain(job.status,);

    const done = await until(() => job.status === "completed");
    expect(done,).toBe(true,);
    expect(job.completedSteps,).toBe(2,);
    expect(job.totalSteps,).toBe(2,);
    expect(job.completedAt,).not.toBeNull();
    expect(job.error,).toBeNull();
    expect(job.results,).toHaveLength(2,);
    expect(seen.map((body,) => body.template_id),).toEqual(["txt2img", "upscale",],);
    expect(seen[0]!.backend,).toBe("comfyui",);
    expect(seen[0]!.params,).toEqual({ steps: 20, },);
  });

  test("threads chat/message linkage into every step", async () => {
    let seen: ImageEditRequest | null = null;
    const job = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: [STEPS[0]!,],
      auth: AUTH,
      linkage: { chatId: "chat-9", messageId: "msg-3", },
      executeStep: async (body,) => {
        seen = body;
        return Response.json({ data: [], },);
      },
    },);

    await until(() => job.status === "completed");
    expect(seen!.chatId,).toBe("chat-9",);
    expect(seen!.messageId,).toBe("msg-3",);
  });

  test("fails the job on the first non-ok step response", async () => {
    let calls = 0;
    const job = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: STEPS,
      auth: AUTH,
      executeStep: async () => {
        calls += 1;
        return Response.json({ error: "Unknown template: nope", }, { status: 404, },);
      },
    },);

    const done = await until(() => job.status === "failed");
    expect(done,).toBe(true,);
    expect(calls,).toBe(1,);
    expect(job.error,).toContain("Unknown template: nope",);
    expect(job.completedSteps,).toBe(0,);
    expect(job.completedAt,).not.toBeNull();
  });

  test("maps a non-JSON error body onto the status line", async () => {
    const job = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: [STEPS[0]!,],
      auth: AUTH,
      executeStep: async () => new Response("not json", { status: 502, },),
    },);

    const done = await until(() => job.status === "failed");
    expect(done,).toBe(true,);
    expect(job.error,).toContain("502",);
  });

  test("a throwing runner fails the job instead of dangling", async () => {
    const job = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: [STEPS[0]!,],
      auth: AUTH,
      executeStep: async () => {
        throw new Error("provider exploded",);
      },
    },);

    const done = await until(() => job.status === "failed");
    expect(done,).toBe(true,);
    expect(job.error,).toContain("provider exploded",);
    expect(job.completedAt,).not.toBeNull();
  });

  test("jobs are listed per owner only", async () => {
    const first = startChainRun({
      ownerId: "user-1",
      chainId: "chain-1",
      steps: [STEPS[0]!,],
      auth: AUTH,
      executeStep: async () => Response.json({ data: [], },),
    },);

    await until(() => first.status === "completed");

    expect(listRunJobs("user-1",).some((job,) => job.id === first.id),).toBe(true,);
    expect(listRunJobs("user-2",).some((job,) => job.id === first.id),).toBe(false,);
  });
});
