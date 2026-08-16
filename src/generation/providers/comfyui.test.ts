/**
 * Tests for the ComfyUI provider client (workflow submission, polling,
 * image download, node discovery).
 */
import { describe, expect, test, } from "bun:test";
import { Buffer, } from "node:buffer";
import { ComfyUIClient, } from "./comfyui";

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line unicorn/no-global-object-property-assignment
  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

function jsonResponse(body: unknown, status = 200,): Response {
  return Response.json(body, { status, },);
}

const workflow = {
  "3": { inputs: { seed: 1, }, class_type: "KSampler", _meta: { title: "Sampler", }, },
};

describe("ComfyUIClient", () => {
  describe("constructor", () => {
    test("strips trailing slashes from the base url", () => {
      const client = new ComfyUIClient({ baseUrl: "http://localhost:8188///", },);
      expect(client.baseUrl,).toBe("http://localhost:8188",);
    });

    test("applies default timeout and poll interval", () => {
      const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
      expect((client as unknown as { timeout: number }).timeout,).toBe(120_000,);
      expect((client as unknown as { pollIntervalMs: number }).pollIntervalMs,).toBe(500,);
    });

    test("throws for invalid urls", () => {
      expect(() => new ComfyUIClient({ baseUrl: "not-a-url", },)).toThrow(/Invalid ComfyUI URL/,);
      expect(() => new ComfyUIClient({ baseUrl: "https://remote-provider.example", },)).toThrow(/Invalid ComfyUI URL/,);
    });
  });

  describe("submitWorkflow", () => {
    test("posts the workflow and returns the prompt id", async () => {
      await withMockFetch(
        async (url, init,) => {
          expect(url,).toBe("http://localhost:8188/prompt",);
          expect(init.method,).toBe("POST",);
          expect(JSON.parse(init.body as string,),).toEqual({ prompt: workflow, },);
          return jsonResponse({ prompt_id: "abc-123", },);
        },
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188/", },);
          const result = await client.submitWorkflow(workflow,);
          expect(result.prompt_id,).toBe("abc-123",);
        },
      );
    });

    test("throws with the error body on non-ok responses", async () => {
      await withMockFetch(
        async () => jsonResponse({ error: "bad workflow", }, 500,),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.submitWorkflow(workflow,);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("[500]",);
            expect((error as Error).message,).toContain("bad workflow",);
          }
        },
      );
    });

    test("falls back to unknown when the error body cannot be read", async () => {
      await withMockFetch(
        async () =>
          ({
            ok: false,
            status: 400,
            text: async () => {
              throw new Error("body read failed",);
            },
          }) as unknown as Response,
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.submitWorkflow(workflow,);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("unknown",);
          }
        },
      );
    });
  });

  describe("pollResult", () => {
    test("returns not done when the prompt has no history entry", async () => {
      await withMockFetch(
        async () => jsonResponse({},),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("missing-prompt",);
          expect(result.done,).toBe(false,);
        },
      );
    });

    test("returns images when completed", async () => {
      await withMockFetch(
        async () =>
          jsonResponse({
            "p1": {
              status: "completed",
              outputs: {
                "9": { images: [{ filename: "img1.png", subfolder: "sub", type: "output", },], },
                "10": { images: [{ filename: "img2.png", },], },
              },
            },
          },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("p1",);
          expect(result.done,).toBe(true,);
          expect(result.images,).toEqual([
            { filename: "img1.png", subfolder: "sub", type: "output", },
            { filename: "img2.png", },
          ],);
          expect(result.error,).toBeUndefined();
        },
      );
    });

    test("returns empty images when completed without outputs", async () => {
      await withMockFetch(
        async () => jsonResponse({ "p1": { status: "completed", }, },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("p1",);
          expect(result.done,).toBe(true,);
          expect(result.images,).toEqual([],);
        },
      );
    });

    test("reports the stored error for failed executions", async () => {
      await withMockFetch(
        async () => jsonResponse({ "p1": { status: "failed", error: "CUDA OOM", }, },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("p1",);
          expect(result.done,).toBe(true,);
          expect(result.error,).toBe("CUDA OOM",);
        },
      );
    });

    test("reports a generic error for cancelled executions", async () => {
      await withMockFetch(
        async () => jsonResponse({ "p1": { status: "cancelled", }, },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("p1",);
          expect(result.done,).toBe(true,);
          expect(result.error,).toBe("execution cancelled",);
        },
      );
    });

    test("returns not done while pending or running", async () => {
      await withMockFetch(
        async () => jsonResponse({ "p1": { status: "running", }, },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const result = await client.pollResult("p1",);
          expect(result.done,).toBe(false,);
        },
      );
    });

    test("throws when the history fetch fails", async () => {
      await withMockFetch(
        async () => jsonResponse({}, 503,),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.pollResult("p1",);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("[503]",);
          }
        },
      );
    });
  });

  describe("waitForCompletion", () => {
    test("returns image filenames when the execution completes", async () => {
      await withMockFetch(
        async () =>
          jsonResponse({
            "p1": {
              status: "completed",
              outputs: { "9": { images: [{ filename: "a.png", }, { filename: "b.png", },], }, },
            },
          },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const filenames = await client.waitForCompletion("p1", 1000,);
          expect(filenames,).toEqual(["a.png", "b.png",],);
        },
      );
    });

    test("throws when the execution failed", async () => {
      await withMockFetch(
        async () => jsonResponse({ "p1": { status: "failed", error: "boom", }, },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.waitForCompletion("p1", 1000,);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("boom",);
          }
        },
      );
    });

    test("times out when the execution never completes", async () => {
      await withMockFetch(
        async () => jsonResponse({},),
        async () => {
          const client = new ComfyUIClient({
            baseUrl: "http://localhost:8188",
            pollIntervalMs: 10,
            timeout: 50,
          },);
          try {
            await client.waitForCompletion("p1",);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toBe("ComfyUI execution timed out",);
          }
        },
      );
    });
  });

  describe("cancelExecution", () => {
    test("posts to the interrupt endpoint", async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      await withMockFetch(
        async (url, init,) => {
          capturedUrl = url;
          capturedMethod = init.method;
          return jsonResponse({},);
        },
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          await client.cancelExecution("p1",);
        },
      );
      expect(capturedUrl,).toBe("http://localhost:8188/interrupt",);
      expect(capturedMethod,).toBe("POST",);
    });
  });

  describe("getNodeInfo", () => {
    test("returns the object_info payload", async () => {
      await withMockFetch(
        async () =>
          jsonResponse({
            KSampler: {
              name: "KSampler",
              display_name: "KSampler",
              category: "sampling",
              input: {},
              output: [],
              output_name: [],
            },
          },),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const info = await client.getNodeInfo();
          expect(info.KSampler?.display_name,).toBe("KSampler",);
        },
      );
    });

    test("throws when object_info fails", async () => {
      await withMockFetch(
        async () => jsonResponse({}, 404,),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.getNodeInfo();
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("[404]",);
          }
        },
      );
    });
  });

  describe("downloadImage", () => {
    test("builds the view url with params and returns a buffer", async () => {
      let capturedUrl: string | undefined;
      await withMockFetch(
        async (url,) => {
          capturedUrl = url;
          return new Response(new Uint8Array([1, 2, 3,],), { status: 200, },);
        },
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const buffer = await client.downloadImage("img.png", "sub", "temp",);
          expect(buffer,).toBeInstanceOf(Buffer,);
          expect(buffer.length,).toBe(3,);
        },
      );
      expect(capturedUrl,).toContain("/view?",);
      expect(capturedUrl,).toContain("filename=img.png",);
      expect(capturedUrl,).toContain("type=temp",);
      expect(capturedUrl,).toContain("subfolder=sub",);
    });

    test("omits subfolder when absent", async () => {
      let capturedUrl: string | undefined;
      await withMockFetch(
        async (url,) => {
          capturedUrl = url;
          return new Response(new Uint8Array([1,],), { status: 200, },);
        },
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          await client.downloadImage("img.png", undefined, "output",);
        },
      );
      expect(capturedUrl,).not.toContain("subfolder",);
    });

    test("throws when the download fails", async () => {
      await withMockFetch(
        async () => jsonResponse({}, 500,),
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          try {
            await client.downloadImage("img.png",);
            expect.unreachable();
          } catch (error) {
            expect((error as Error).message,).toContain("img.png",);
          }
        },
      );
    });
  });

  describe("runWorkflow", () => {
    test("submits, waits, and downloads all images", async () => {
      const calls: string[] = [];
      await withMockFetch(
        async (url,) => {
          calls.push(url,);
          if (url.endsWith("/prompt",)) {
            return jsonResponse({ prompt_id: "p1", },);
          }
          if (url.includes("/history/",)) {
            return jsonResponse({
              p1: {
                status: "completed",
                outputs: { "9": { images: [{ filename: "a.png", }, { filename: "b.png", },], }, },
              },
            },);
          }
          return new Response(new Uint8Array([7, 8,],), { status: 200, },);
        },
        async () => {
          const client = new ComfyUIClient({ baseUrl: "http://localhost:8188", },);
          const buffers = await client.runWorkflow(workflow,);
          expect(buffers,).toHaveLength(2,);
          expect(buffers[0]?.length,).toBe(2,);
        },
      );
      expect(calls.filter((u,) => u.includes("/view?",)),).toHaveLength(2,);
    });
  });
});
