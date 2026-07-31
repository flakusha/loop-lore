import { describe, expect, test, } from "bun:test";
import {
  SCRIPT_TAG,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  HASH_INJECTION_SCRIPT,
  HASH_INJECTION_LINK,
} from "./html-sanitize";

// ── Script Tag ────────────────────────────────────────────

describe("SCRIPT_TAG", () => {
  test("removes simple script tag", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    expect(html.replaceAll(SCRIPT_TAG, "")).toBe("<p>Hello</p><p>World</p>");
  });

  test("removes multiline script tag", () => {
    const html = '<script type="text/javascript">\nalert("xss");\n</script>';
    expect(html.replaceAll(SCRIPT_TAG, "")).toBe("");
  });

  test("removes script with attributes", () => {
    const html = '<script src="/evil.js" async></script>';
    expect(html.replaceAll(SCRIPT_TAG, "")).toBe("");
  });

  test("preserves non-script content", () => {
    const html = "<p>Safe content</p>";
    expect(html.replaceAll(SCRIPT_TAG, "")).toBe("<p>Safe content</p>");
  });
});

// ── On Event Handlers ─────────────────────────────────────

describe("ON_EVENT_DOUBLE", () => {
  test("removes onclick handler", () => {
    const html = '<button onclick="steal()">Click</button>';
    // Regex doesn't consume the space before the attribute
    expect(html.replaceAll(ON_EVENT_DOUBLE, "")).toBe("<button >Click</button>");
  });

  test("removes onerror handler", () => {
    const img = '<img src=x onerror="alert(1)">';
    expect(img.replaceAll(ON_EVENT_DOUBLE, "")).toBe("<img src=x >");
  });

  test("preserves other attributes", () => {
    const html = '<button class="btn" onclick="fn()" id="ok">Click</button>';
    expect(html.replaceAll(ON_EVENT_DOUBLE, "")).toBe('<button class="btn"  id="ok">Click</button>');
  });
});

describe("ON_EVENT_SINGLE", () => {
  test("removes onclick handler with single quotes", () => {
    const html = "<button onclick='steal()'>Click</button>";
    expect(html.replaceAll(ON_EVENT_SINGLE, "")).toBe("<button >Click</button>");
  });

  test("removes onerror with single quotes", () => {
    const img = "<img src=x onerror='alert(1)'>";
    expect(img.replaceAll(ON_EVENT_SINGLE, "")).toBe("<img src=x >");
  });
});

// ── Hash Injection ────────────────────────────────────────

describe("HASH_INJECTION_SCRIPT", () => {
  test("captures script src components", () => {
    const html = '<script src="/app.js"></script>';
    const match = HASH_INJECTION_SCRIPT.exec(html);
    expect(match).not.toBeNull();
    // First group includes the trailing /
    expect(match?.[1]).toBe('<script src="/');
    expect(match?.[2]).toBe("app.js");
    expect(match?.[3]).toBe('"></script>');
  });

  test("captures css file", () => {
    const html = '<script src="/styles.css"></script>';
    HASH_INJECTION_SCRIPT.lastIndex = 0;
    const match = HASH_INJECTION_SCRIPT.exec(html);
    expect(match?.[2]).toBe("styles.css");
  });

  test("does not match non-root paths", () => {
    const html = '<script src="https://evil.com/x.js"></script>';
    const match = HASH_INJECTION_SCRIPT.exec(html);
    expect(match).toBeNull();
  });
});

describe("HASH_INJECTION_LINK", () => {
  test("captures link href components", () => {
    const html = '<link rel="stylesheet" href="/styles.css">';
    const match = HASH_INJECTION_LINK.exec(html);
    expect(match).not.toBeNull();
    // First group includes the trailing /
    expect(match?.[1]).toBe('<link rel="stylesheet" href="/');
    expect(match?.[2]).toBe("styles.css");
    expect(match?.[3]).toBe('">');
  });

  test("captures js file in link", () => {
    const html = '<link href="/app.js" rel="preload">';
    HASH_INJECTION_LINK.lastIndex = 0;
    const match = HASH_INJECTION_LINK.exec(html);
    expect(match?.[2]).toBe("app.js");
  });

  test("does not match CDN URLs", () => {
    const html = '<link href="https://cdn.example.com/style.css" rel="stylesheet">';
    const match = HASH_INJECTION_LINK.exec(html);
    expect(match).toBeNull();
  });
});
