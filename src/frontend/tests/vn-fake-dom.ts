// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared fake DOM + browser globals for VN tests (no happy-dom in bun test).
 *
 * installVnFakeDom() overrides document.createElement, matchMedia, and the
 * requestAnimationFrame pair for the duration of a test; restore() puts the
 * previous globals back. Animation frames are queued macrotasks, so tests
 * await the promises the code exposes and flush with tick().
 */

import type { MessageAttachment, } from "../alpine/chat-types/messages";
import { type FakeEl, makeEl, } from "./vn-fake-element";

/**
 * Fully-populated MessageAttachment for fixture use.
 * @param assetId
 * @param caption
 * @param overrides
 */
export function makeAttachment(
  assetId: string,
  caption: string,
  overrides: Partial<MessageAttachment> = {},
): MessageAttachment {
  return {
    assetId,
    order: 0,
    caption,
    label: caption,
    url: `/api/v1/assets/${assetId}`,
    filename: `${assetId}.png`,
    mimeType: "image/png",
    type: "image",
    width: 10,
    height: 10,
    ...overrides,
  };
}
export { type FakeEl, makeEl, } from "./vn-fake-element";

type Globals = Record<string, unknown>;

/** Minimal Web Storage stub (same shape as settings.test.ts). */
export function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number,) {
      return Array.from(store.keys(),)[index] ?? null;
    },
    getItem(key: string,) {
      return store.get(key,) ?? null;
    },
    setItem(key: string, value: string,) {
      store.set(key, String(value,),);
    },
    removeItem(key: string,) {
      store.delete(key,);
    },
    clear() {
      store.clear();
    },
  };
}

export interface FakeDom {
  makeEl: (tag?: string,) => FakeEl;
  reducedMotion: { value: boolean };
  restore: () => void;
}

export function installVnFakeDom(): FakeDom {
  const globals = globalThis as Globals;
  const originals = {
    document: globals.document,
    matchMedia: globals.matchMedia,
    requestAnimationFrame: globals.requestAnimationFrame,
    cancelAnimationFrame: globals.cancelAnimationFrame,
  };
  const reducedMotion = { value: false, };
  const frames = new Map<number, () => void>();
  let nextFrameId = 0;

  globals.document = {
    ...(originals.document as object),
    createElement: (tag: string,): HTMLElement => makeEl(tag,) as unknown as HTMLElement,
  };
  globals.matchMedia = (query: string,): { matches: boolean } => ({
    matches: reducedMotion.value && query.includes("reduce",),
  });
  globals.requestAnimationFrame = (cb: () => void,): number => {
    const id = ++nextFrameId;
    frames.set(id, cb,);
    setTimeout(() => {
      const frame = frames.get(id,);
      frames.delete(id,);
      frame?.();
    }, 0,);
    return id;
  };
  globals.cancelAnimationFrame = (id: number,): void => {
    frames.delete(id,);
  };

  return {
    makeEl,
    reducedMotion,
    restore() {
      globals.document = originals.document;
      globals.matchMedia = originals.matchMedia;
      globals.requestAnimationFrame = originals.requestAnimationFrame;
      globals.cancelAnimationFrame = originals.cancelAnimationFrame;
    },
  };
}

/** Flush pending macrotasks once (stubbed frames, timer-boundary flushes). */
export function tick(): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, 0,);
  return promise;
}
