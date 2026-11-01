import { afterEach, describe, expect, it, } from "bun:test";
import { createChat, } from "./chat-create-api";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
},);

function stubFetch(handler: (body: unknown,) => Response,): { seen: { url: string; body: unknown }[] } {
  const seen: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (url: unknown, options: unknown,) => {
    const init = options as { body?: string };
    const body = init.body !== undefined ? JSON.parse(init.body,) : undefined;
    seen.push({ url: String(url,), body, },);

    return handler(body,);
  }) as typeof fetch;

  return { seen, };
}

function okResponse(payload: unknown,): Response {
  return new Response(JSON.stringify(payload,), { status: 201, },);
}

describe("createChat", () => {
  it("omits templateId for a blank chat", async () => {
    const { seen, } = stubFetch(() => okResponse({ id: "chat-1", },));
    const result = await createChat({ name: "Plain", },);

    expect(result,).toEqual({ ok: true, chatId: "chat-1", },);
    expect(seen[0]!.body,).toEqual({ name: "Plain", },);
  });

  it("sends templateId when a template is picked", async () => {
    const { seen, } = stubFetch(() => okResponse({ id: "chat-2", },));
    const result = await createChat({ name: "Battle", templateId: "tmpl-battle", },);

    expect(result,).toEqual({ ok: true, chatId: "chat-2", },);
    expect(seen[0]!.body,).toEqual({ name: "Battle", templateId: "tmpl-battle", },);
  });

  it("surfaces the server error body on failure", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "age gate", },), { status: 403, },));
    const result = await createChat({ name: "Nope", },);

    expect(result,).toEqual({ ok: false, error: "age gate", },);
  });
});
