/**
 * Server ↔ frontend plural parity.
 *
 * PINS THE BUG: `isPluralNode` was copy-pasted into `src/i18n/translator.ts`
 * and `src/frontend/i18n.ts` and the two copies drifted. The server kept the
 * whole plural node as a leaf and selected a CLDR category from `params.count`;
 * the browser copy collapsed every plural node to `.other` and its `resolveKey`
 * returned `undefined` for any non-string leaf — so the Alpine/htmx path
 * rendered the RAW KEY ("inventory.item") for both count=1 and count=7 while
 * the server rendered "1 item" / "7 items".
 *
 * BOTH halves are imported into this one test program (verified: `bun test`
 * resolves `../i18n/translator` and `./i18n` from a single file), so no disk
 * fixture round-trip is needed — the same in-memory catalog is driven through
 * each side and the selected variants are compared directly.
 *
 * Both sides now share `isPluralNode` / `selectVariant` / `pluralRuleFor` from
 * `src/i18n/plurals.ts`, so a failure here means someone reintroduced a private
 * copy or a frontend-local plural rule.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { t as alpineT, } from "./alpine/i18n";
import { resolveKey as frontendResolveKey, } from "./i18n";
import { createTranslator, flattenTranslations as serverFlatten, } from "../i18n/translator";
import type { Locale, TranslationMap, } from "../i18n/types";

/**
 * The single fixture every assertion below is driven through. `inventory.item`
 * is a two-category English node; `shop.visitor` carries the categories a naive
 * `count === 1 ? one : other` gets wrong (`zero`/`two` for ar, `few`/`many`
 * for ru). `flagReason` is a plain enum that merely CONTAINS `other` — it must
 * stay a subtree, not be mistaken for a plural node.
 */
const FIXTURE: TranslationMap = {
  inventory: {
    item: { one: "{count} item", other: "{count} items", },
  },
  shop: {
    visitor: {
      zero: "no visitors",
      one: "{count} visitor",
      two: "{count} visitors (two)",
      few: "{count} visitors (few)",
      many: "{count} visitors (many)",
      other: "{count} visitors (other)",
    },
  },
  chat: {
    flagReason: { inappropriate: "Bad", other: "Other", },
  },
};

/** Arabic-Indic digit THREE (U+0663): non-ASCII, and `Number()` cannot parse it. */
const ARABIC_THREE = "٣";

/** Counts every side must agree on. 0/1/2/7 per spec, plus fraction and negative. */
const COUNTS = [0, 1, 2, 7, 1.5, -1,] as const;

const localeStringsHost = globalThis as { __localeStrings?: unknown; currentLocale?: string };
let savedLocaleStrings: unknown;
let savedCurrentLocale: string | undefined;
let hasSaved = false;

/**
 * The frontend resolver picks its plural rule from `globalThis.currentLocale`
 * (the same `activeLocale()` seam `saveLocale` writes), while the server takes an
 * explicit locale. Point both at the same locale for the duration of `fn` and
 * restore afterwards, so sibling test files in this worker keep the real en.json
 * catalog. Mirrors `withLocale` in `alpine/chat-utils/time.test.ts`.
 * @param locale
 * @param fn
 * @returns {T}
 */
function withLocale<T>(locale: Locale, fn: () => T,): T {
  if (!hasSaved) {
    savedLocaleStrings = localeStringsHost.__localeStrings;
    savedCurrentLocale = localeStringsHost.currentLocale;
    hasSaved = true;
  }
  localeStringsHost.currentLocale = locale;
  localeStringsHost.__localeStrings = FIXTURE;
  try {
    return fn();
  } finally {
    localeStringsHost.currentLocale = savedCurrentLocale;
    localeStringsHost.__localeStrings = savedLocaleStrings;
    hasSaved = false;
  }
}

afterEach(() => {
  if (!hasSaved) { return; }
  localeStringsHost.currentLocale = savedCurrentLocale;
  localeStringsHost.__localeStrings = savedLocaleStrings;
  hasSaved = false;
});

describe("server/frontend plural parity", () => {
  for (const locale of ["en", "ru", "ar",] as const) {
    it(`selects the same variant on both sides (${locale})`, () => {
      const serverT = createTranslator({
        primary: serverFlatten(FIXTURE,),
        locale,
      },);

      for (const key of ["inventory.item", "shop.visitor",]) {
        for (const count of COUNTS) {
          const viaServer = serverT(key, { count, },);
          const viaFrontend = withLocale(locale, () => alpineT(key, { count, },));

          expect(viaFrontend, `${locale} ${key} @ count=${count}`,).toBe(viaServer,);
        }
      }
    });
  }

  it("agrees on `other` when the count is a non-ASCII digit string", () => {
    const serverT = createTranslator({ primary: serverFlatten(FIXTURE,), locale: "en", },);

    // `Number("٣")` is NaN — Arabic-Indic digits are not parseable — so a
    // non-numeric count must NOT drive selection on either side; both take
    // `other` and render the count verbatim through interpolation.
    expect(Number(ARABIC_THREE,),).toBeNaN();

    const viaServer = serverT("inventory.item", { count: ARABIC_THREE, },);
    const viaFrontend = withLocale("en", () => alpineT("inventory.item", { count: ARABIC_THREE, },));

    expect(viaServer,).toBe("٣ items");
    expect(viaFrontend,).toBe(viaServer,);
  });

  it("agrees when no count is supplied at all (both take `other`)", () => {
    const serverT = createTranslator({ primary: serverFlatten(FIXTURE,), locale: "ru", },);

    // ru classifies 1 as `one`, but with no count there is nothing to classify.
    expect(serverT("inventory.item",),).toBe("{count} items");
    expect(withLocale("ru", () => alpineT("inventory.item",),),).toBe(serverT("inventory.item",),);
  });

  it("falls back to `other` on both sides when the category is absent", () => {
    // ru classifies 2 as `few`, which this partial catalog does not define.
    const partial: TranslationMap = {
      inventory: { item: { one: "{count} item", other: "{count} items (fallback)", }, },
    };
    const serverT = createTranslator({ primary: serverFlatten(partial,), locale: "ru", },);
    const viaFrontend = withLocale("ru", () => frontendResolveKey(partial, "inventory.item", 2,),);

    expect(serverT("inventory.item", { count: 2, },),).toBe("2 items (fallback)");
    // `resolveKey` returns the un-interpolated template; `alpineT` interpolates.
    expect(viaFrontend,).toBe("{count} items (fallback)");
  });
});

describe("browser regression: a plural key is not a missing key", () => {
  it("resolves the plural string instead of the raw key", () => {
    // Pre-fix every one of these returned `undefined`, and every caller turned
    // that into the raw key, so the browser showed the literal "inventory.item".
    expect(frontendResolveKey(FIXTURE, "inventory.item",),).toBe("{count} items");
    expect(frontendResolveKey(FIXTURE, "inventory.item", 1,),).toBe("{count} item");
    expect(frontendResolveKey(FIXTURE, "inventory.item", 7,),).toBe("{count} items");
  });

  it("renders the shipped Alpine translator output the server renders", () => {
    withLocale("en", () => {
      expect(alpineT("inventory.item", { count: 1, },)).toBe("1 item");
      expect(alpineT("inventory.item", { count: 0, },)).toBe("0 items");
      expect(alpineT("inventory.item", { count: 2, },)).toBe("2 items");
      expect(alpineT("inventory.item", { count: 7, },)).toBe("7 items");
    },);
    withLocale("ru", () => {
      expect(alpineT("shop.visitor", { count: 1, },)).toBe("1 visitor");
      expect(alpineT("shop.visitor", { count: 3, },)).toBe("3 visitors (few)");
      expect(alpineT("shop.visitor", { count: 5, },)).toBe("5 visitors (many)");
    },);
  });

  it("still treats an enum containing `other` as a normal subtree", () => {
    // A node is plural-variant data only when EVERY key is a CLDR category.
    expect(frontendResolveKey(FIXTURE, "chat.flagReason.other",)).toBe("Other");
    expect(frontendResolveKey(FIXTURE, "chat.flagReason",)).toBeUndefined();
  });
});
