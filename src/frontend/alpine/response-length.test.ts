import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
// Import attaches the component factory to globalThis (side effect under test).
import "./response-length";

interface LengthPreset {
  value: string;
  label: string;
  maxTokens: number;
}

interface LengthState {
  preset: string;
  customMin: number;
  customMax: number;
  showCustom: boolean;
  presets: readonly LengthPreset[];
  maxTokens: number;
  label: string;
  toggleCustom(): void;
  setPreset(value: string,): void;
  saveCustom(): void;
  load(): void;
}

/** In-memory localStorage twin; swapped in for each test. */
function installMemoryStorage(): { store: Map<string, string>; restore: () => void } {
  const g = globalThis as unknown as { localStorage?: Storage };
  const original = g.localStorage;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k,) => store.get(k,) ?? null,
    setItem: (k, v,) => {
      store.set(k, String(v,),);
    },
    removeItem: (k,) => {
      store.delete(k,);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
  return {
    store,
    restore: () => {
      g.localStorage = original;
    },
  };
}

let storage: ReturnType<typeof installMemoryStorage>;

beforeEach(() => {
  storage = installMemoryStorage();
},);
afterAll(() => {
  storage.restore();
},);

function freshState(): LengthState {
  const factory = (globalThis as unknown as { responseLength: () => LengthState }).responseLength;
  return factory();
}

describe("responseLength factory", () => {
  test("defaults to the medium preset", () => {
    const state = freshState();
    expect(state.preset,).toBe("medium",);
    expect(state.customMin,).toBe(0,);
    expect(state.customMax,).toBe(400,);
    expect(state.showCustom,).toBe(false,);
    expect(state.maxTokens,).toBe(400,);
    expect(state.label,).toBe("Medium (150–400 tokens)",);
  });

  test("exposes the four presets", () => {
    const state = freshState();
    expect(state.presets.map((p,) => p.value),).toEqual(["short", "medium", "long", "custom",],);
    expect(state.presets.map((p,) => p.maxTokens),).toEqual([150, 400, 1000, 0,],);
  });

  test("maps each preset to its token budget", () => {
    const short = freshState();
    short.preset = "short";
    expect(short.maxTokens,).toBe(150,);
    const long = freshState();
    long.preset = "long";
    expect(long.maxTokens,).toBe(1000,);
  });

  test("custom preset uses the configured max, floored at 1", () => {
    const state = freshState();
    state.preset = "custom";
    state.customMax = 250;
    expect(state.maxTokens,).toBe(250,);
    state.customMax = 0;
    expect(state.maxTokens,).toBe(1,);
  });

  test("unknown presets fall back to medium behavior", () => {
    const state = freshState();
    state.preset = "bogus";
    expect(state.maxTokens,).toBe(400,);
    expect(state.label,).toBe("Medium",);
  });

  test("toggleCustom only opens for the custom preset", () => {
    const state = freshState();
    state.preset = "custom";
    state.toggleCustom();
    expect(state.showCustom,).toBe(true,);
    state.preset = "medium";
    state.toggleCustom();
    expect(state.showCustom,).toBe(false,);
  });

  test("setPreset persists the selection", () => {
    const state = freshState();
    state.setPreset("long",);
    expect(storage.store.get("response-length-preset",),).toBe("long",);
  });

  test("saveCustom persists min and max", () => {
    const state = freshState();
    state.customMin = 25;
    state.customMax = 750;
    state.saveCustom();
    expect(storage.store.get("response-length-custom-min",),).toBe("25",);
    expect(storage.store.get("response-length-custom-max",),).toBe("750",);
  });

  test("load restores persisted values and opens the custom panel", () => {
    storage.store.set("response-length-preset", "custom",);
    storage.store.set("response-length-custom-min", "40",);
    storage.store.set("response-length-custom-max", "900",);
    const state = freshState();
    state.load();
    expect(state.preset,).toBe("custom",);
    expect(state.customMin,).toBe(40,);
    expect(state.customMax,).toBe(900,);
    expect(state.showCustom,).toBe(true,);
  });

  test("load ignores garbage numbers and empty storage", () => {
    storage.store.set("response-length-preset", "short",);
    storage.store.set("response-length-custom-min", "not-a-number",);
    const state = freshState();
    state.load();
    expect(state.preset,).toBe("short",);
    expect(state.customMin,).toBe(0,); // fallback kept
    expect(state.customMax,).toBe(400,);
    expect(state.showCustom,).toBe(false,);
  });
});
