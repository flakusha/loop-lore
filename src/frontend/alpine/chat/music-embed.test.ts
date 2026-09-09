// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for the music-embed XSS hardening helpers (`escText`, `escAttr`,
 * `safeUrl`) and the `chatMusicEmbed.renderMusicEmbed` card/sanitizer flow.
 *
 * Regression target: `BUG-frontend-music-embed-fallback-esc-allows-stored-xss-via-attr`.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { MusicLinkMessage, } from "../chat-types/messages";
import { chatMusicEmbed as chatMusicEmbedState, escAttr, escText, safeUrl, } from "./music-embed";

/** ChatMusicEmbed is the empty `Pick<ChatState, never>` slice; the object
 * exposes the renderer at runtime — view it through its real shape here. */
const chatMusicEmbed = chatMusicEmbedState as {
  renderMusicEmbed(msg: MusicLinkMessage,): string;
};

describe("escText", () => {
  test("escapes ampersand, less-than, greater-than", () => {
    expect(escText(`a & b <c> d`,),).toBe("a &amp; b &lt;c&gt; d",);
  });

  test("passes quotes through unchanged (use escAttr for attribute context)", () => {
    expect(escText(`he said "hi"`,),).toBe(`he said "hi"`,);
  });

  test("treats null/undefined as empty string", () => {
    expect(escText(null,),).toBe("",);
    expect(escText(undefined,),).toBe("",);
  });

  test("does not double-escape `&lt;` (already-escaped values stay raw)", () => {
    // Browser textContent renders `&lt;` as plain text; no normalization here.
    expect(escText("&lt;",),).toBe("&amp;lt;",);
  });
});

describe("escAttr", () => {
  test('escapes & < > and "', () => {
    expect(escAttr(`a & b <c> d "e" f`,),).toBe("a &amp; b &lt;c&gt; d &quot;e&quot; f",);
  });

  test("closes the attribute-breakout vector on alt=", () => {
    // A user-controlled title containing a double-quote could previously
    // break out of the `alt="..."` attribute. The output must contain
    // `&quot;` and never a literal `"` outside the surrounding delimiters.
    const escaped = escAttr(`evil"onerror="alert(1)`,);
    expect(escaped,).not.toContain(`"onerror=`,);
    expect(escaped,).toContain("&quot;",);
  });

  test("treats null/undefined as empty string", () => {
    expect(escAttr(null,),).toBe("",);
    expect(escAttr(undefined,),).toBe("",);
  });
});

describe("safeUrl", () => {
  test("accepts http: and https: schemes", () => {
    expect(safeUrl("http://music.example.com/track/1",),).toBe(
      "http://music.example.com/track/1",
    );
    expect(safeUrl("https://cdn.example.com/a.jpg",),).toBe(
      "https://cdn.example.com/a.jpg",
    );
  });
  test("accepts mailto: scheme", () => {
    expect(safeUrl("mailto:[email protected]",),).toBe(
      "mailto:[email protected]",
    );
  });

  test("rejects javascript: URLs", () => {
    expect(safeUrl("javascript:alert(1)",),).toBe("#blocked",);
  });

  test("rejects data: URLs", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>",),).toBe("#blocked",);
  });

  test("rejects vbscript: URLs", () => {
    expect(safeUrl("vbscript:msgbox(1)",),).toBe("#blocked",);
  });

  test("rejects file: URLs", () => {
    expect(safeUrl("file:///etc/passwd",),).toBe("#blocked",);
  });

  test("rejects protocol-relative URLs", () => {
    expect(safeUrl("//cdn.example.com/a.jpg",),).toBe("#blocked",);
  });

  test("rejects empty string", () => {
    expect(safeUrl("",),).toBe("#blocked",);
  });

  test("rejects null and undefined", () => {
    expect(safeUrl(null,),).toBe("#blocked",);
    expect(safeUrl(undefined,),).toBe("#blocked",);
  });

  test("rejects relative paths", () => {
    expect(safeUrl("/track/123",),).toBe("#blocked",);
  });

  test("scheme allowlist is case-insensitive", () => {
    expect(safeUrl("HTTPS://cdn.example.com",),).toBe(
      `HTTPS://cdn.example.com`,
    );
    expect(safeUrl("MAILTO:[email protected]",),).toBe(
      `MAILTO:[email protected]`,
    );
  });

  test("escapes attribute-breaking chars in the URL fragment", () => {
    expect(safeUrl(`https://x.y/?a"b&c=d"`,),).toBe(
      `https://x.y/?a&quot;b&amp;c=d&quot;`,
    );
  });
});

// ── chatMusicEmbed.renderMusicEmbed ─────────────────────────

/** Full MusicLinkMessage with sensible defaults; tests override per case. */
function musicMsg(overrides: Partial<MusicLinkMessage> = {},): MusicLinkMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "",
    created_at: "2026-01-01T00:00:00Z",
    type: "music_link",
    musicService: "spotify",
    url: "https://open.spotify.com/track/1",
    embedHtml: null,
    title: "Song",
    artist: "Artist",
    thumbnailUrl: null,
    durationSecs: 180,
    serviceTrackId: "t1",
    serviceUrl: "https://open.spotify.com/track/1",
    isPlaylist: false,
    trackCount: null,
    explicit: false,
    nsfwHidden: false,
    ...overrides,
  };
}

interface SanitizeCall {
  html: string;
  config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] };
}

/** chat-vendor.ts installs the real sanitizer under this well-known key; tests inject a stub. */
const domPurifyHost = globalThis as {
  __DOMPurify?: { sanitize(html: string, config: SanitizeCall["config"],): string };
};

/** Install a recording DOMPurify stub; returns the calls it captured. */
function installDomPurify(result = "<iframe></iframe>",): { calls: SanitizeCall[] } {
  const calls: SanitizeCall[] = [];
  domPurifyHost.__DOMPurify = {
    sanitize: (html: string, config: SanitizeCall["config"],) => {
      calls.push({ html, config, },);
      return result;
    },
  };
  return { calls, };
}

afterEach(() => {
  domPurifyHost.__DOMPurify = undefined;
},);

describe("chatMusicEmbed.renderMusicEmbed", () => {
  test("nsfwHidden returns the lock placeholder even when embedHtml exists", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ nsfwHidden: true, embedHtml: "<iframe src=https://e.com></iframe>", },),
    );
    expect(html,).toBe('<span class="music-embed-nsfw">🔒 Explicit content hidden</span>',);
    expect(html,).not.toContain("iframe src",);
  });

  test("fallback card renders title — artist link without a thumbnail", () => {
    const html = chatMusicEmbed.renderMusicEmbed(musicMsg(),);
    expect(html,).toContain('class="music-embed-card"',);
    expect(html,).toContain(
      `href="https://open.spotify.com/track/1" target="_blank" rel="noopener" class="music-embed-link"`,
    );
    expect(html,).toContain("Song — Artist",);
    expect(html,).not.toContain("<img",);
  });

  test("fallback card includes an escaped thumbnail when thumbnailUrl is set", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ thumbnailUrl: "https://cdn.example.com/a.jpg", title: `A"B&C`, },),
    );
    expect(html,).toContain(
      `<img src="https://cdn.example.com/a.jpg" alt="A&quot;B&amp;C" class="music-embed-thumb" />`,
    );
  });

  test("fallback escapes metadata so a hostile title cannot inject markup", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ title: `"><script>alert(1)</script>`, artist: "<b>x</b>", },),
    );
    // Link text: escText neutralizes tags (& < >); a bare " is inert as text.
    expect(html,).toContain(`"&gt;&lt;script&gt;alert(1)&lt;/script&gt;`,);
    expect(html,).not.toContain("<script>",);
    expect(html,).toContain("&lt;b&gt;x&lt;/b&gt;",);
  });

  test("hostile title cannot break out of the thumbnail alt attribute", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ title: `x" onerror="alert(1)`, thumbnailUrl: "https://cdn.example.com/a.jpg", },),
    );
    expect(html,).toContain(`alt="x&quot; onerror=&quot;alert(1)"`,);
    expect(html,).not.toContain(`alt="x" onerror="alert(1)"`,);
  });

  test("blocked serviceUrl and thumbnailUrl schemes become #blocked anchors", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ serviceUrl: "javascript:alert(1)", thumbnailUrl: "data:text/html,x", },),
    );
    expect(html,).toContain('href="#blocked"',);
    expect(html,).toContain('src="#blocked"',);
    expect(html,).not.toContain("javascript:",);
    expect(html,).not.toContain("data:text/html",);
  });

  test("embedHtml without a sanitizer fails closed to an error placeholder", () => {
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ embedHtml: `<img src=x onerror="alert(1)">`, },),
    );
    expect(html,).toBe(
      '<span class="music-embed-error">Embed unavailable (sanitizer missing)</span>',
    );
    expect(html,).not.toContain("onerror",);
  });

  test("embedHtml is sanitized through DOMPurify with the iframe allowlist", () => {
    const { calls, } = installDomPurify("<iframe sanitized></iframe>",);
    const html = chatMusicEmbed.renderMusicEmbed(
      musicMsg({ embedHtml: `<iframe src="https://e.com"></iframe>`, },),
    );
    expect(html,).toBe("<iframe sanitized></iframe>",);
    expect(calls.length,).toBe(1,);
    expect(calls[0]!.html,).toBe(`<iframe src="https://e.com"></iframe>`,);
    expect(calls[0]!.config.ALLOWED_TAGS,).toEqual(["iframe", "span",],);
    expect(calls[0]!.config.ALLOWED_ATTR,).toContain("src",);
    expect(calls[0]!.config.ALLOWED_ATTR,).not.toContain("onerror",);
  });
});
