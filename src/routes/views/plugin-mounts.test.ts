/**
 * Tests for views/plugin-mounts.ts (FEAT-050): registered plugin components
 * must appear as inert host containers in rendered views.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { registry, } from "../../plugins/registry";
import { serveView, } from "./index";

/**
 * @param view
 */
async function render(view: string,): Promise<string> {
  const res = serveView(view, true,);
  if (!res) { throw new Error(`view not served: ${view}`,); }
  return res.text();
}

describe("views — plugin mount points", () => {
  beforeAll(() => {
    registry.register({
      manifest: { name: "mount-test", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);
    registry.addUIComponents("mount-test", [
      { type: "web", name: "sidebar-widget", location: "chat.sidebar", props: { label: "Hi", }, },
      { type: "tui", name: "tui-widget", location: "chat.sidebar", },
      { type: "both", name: "dash-widget", location: "admin.dashboard", },
    ],);
  },);

  afterAll(() => {
    registry.unregisterAll();
  },);

  test("chat view mounts web components with data attributes", async () => {
    const html = await render("chat",);
    expect(html,).toContain('data-plugin-component="sidebar-widget"',);
    expect(html,).toContain('data-plugin-location="chat.sidebar"',);
    expect(html,).toContain('data-plugin-props="{&quot;label&quot;:&quot;Hi&quot;}"',);
  });

  test("tui-only components are never mounted into web views", async () => {
    const html = await render("chat",);
    expect(html,).not.toContain("tui-widget",);
  });

  test("plugin props are HTML-escaped, not raw-interpolated", async () => {
    registry.register({
      manifest: { name: "evil-plugin", version: "1.0", description: "", author: "test", },
      origin: "core",
      directory: "/tmp",
    },);
    registry.addUIComponents("evil-plugin", [
      { type: "web", name: "evil", location: "chat.composer", props: { x: "</script><script>alert(1)</script>", }, },
    ],);
    const html = await render("chat",);
    expect(html,).not.toContain("<script>alert(1)</script>",);
    expect(html,).toContain("&lt;script&gt;alert(1)&lt;/script&gt;",);
  });

  test("admin view mounts dashboard components", async () => {
    const html = await render("admin",);
    expect(html,).toContain('data-plugin-component="dash-widget"',);
    expect(html,).toContain('data-plugin-location="admin.dashboard"',);
  });

  test("zero components renders no container and leaves no directive", async () => {
    registry.unregisterAll();
    const html = await render("chat",);
    expect(html,).not.toContain("data-plugin-component=",);
    expect(html,).not.toContain("{{plugin:",);
  });
});
