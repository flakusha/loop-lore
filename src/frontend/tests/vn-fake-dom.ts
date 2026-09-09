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

/** Fully-populated MessageAttachment for fixture use. */
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
    url: `/api/assets/${assetId}`,
    filename: `${assetId}.png`,
    mimeType: "image/png",
    type: "image",
    width: 10,
    height: 10,
    ...overrides,
  };
}

export interface FakeEl {
  tagName: string;
  className: string;
  style: {
    setProperty: (name: string, value: string,) => void;
    [prop: string]: string | ((name: string, value: string,) => void);
  };
  children: FakeEl[];
  parent: FakeEl | null;
  textContent: string;
  disabled: boolean;
  isConnected: boolean;
  src: string;
  alt: string;
  listeners: Map<string, Array<(e?: unknown,) => void>>;
  append: (...nodes: FakeEl[]) => void;
  replaceChildren: () => void;
  remove: () => void;
  querySelector: (sel: string,) => FakeEl | null;
  classList: { contains: (cls: string,) => boolean };
  addEventListener: (type: string, fn: (e?: unknown,) => void,) => void;
  removeEventListener: (type: string, fn: (e?: unknown,) => void,) => void;
  dispatch: (type: string,) => void;
}

export function makeEl(tag = "div",): FakeEl {
  const children: FakeEl[] = [];
  const listeners = new Map<string, Array<(e?: unknown,) => void>>();
  const style: FakeEl["style"] = {
    setProperty(name, value,) {
      style[name] = value;
    },
  };
  const find = (el: FakeEl, cls: string,): FakeEl | null => {
    for (const child of el.children) {
      if (child.className.split(" ",).includes(cls,)) { return child; }
      const hit = find(child, cls,);
      if (hit) { return hit; }
    }
    return null;
  };
  return {
    tagName: tag.toUpperCase(),
    className: "",
    style,
    children,
    parent: null,
    textContent: "",
    disabled: false,
    isConnected: true,
    src: "",
    alt: "",
    listeners,
    append(...nodes) {
      for (const node of nodes) { node.parent = this; }
      children.push(...nodes,);
    },
    replaceChildren() {
      for (const child of children) { child.parent = null; }
      children.length = 0;
    },
    remove() {
      const p = this.parent;
      if (p) {
        const i = p.children.indexOf(this,);
        if (i >= 0) { p.children.splice(i, 1,); }
      }
      this.parent = null;
    },
    get classList() {
      return { contains: (cls: string,) => this.className.split(" ",).includes(cls,), };
    },
    querySelector(sel,) {
      return find(this, sel.replace(/^\./, "",),);
    },
    addEventListener(type, fn,) {
      listeners.set(type, [...(listeners.get(type,) ?? []), fn,],);
    },
    removeEventListener(type, fn,) {
      listeners.set(
        type,
        (listeners.get(type,) ?? []).filter((l,) => l !== fn),
      );
    },
    dispatch(type,) {
      const event = { type, target: null, };
      for (const fn of [...(listeners.get(type,) ?? []),]) { fn(event,); }
    },
  };
}

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
