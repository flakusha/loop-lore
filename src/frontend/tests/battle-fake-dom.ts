// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake DOM + event helpers for battle-panel tests (no happy-dom in bun test).
 *
 * Follows the inline harness of `asset-preview.test.ts` with the extras the
 * interactive panel needs: class-list/className sync, `data-*` attributes,
 * `disabled`, keyboard events with payloads, and a focus recorder. The shared
 * `vn-fake-dom.ts` has none of those, so the panel cannot run on it.
 */

export interface FakeEl {
  tagName: string;
  type: string;
  className: string;
  textContent: string;
  innerHTML: string;
  tabIndex: number;
  disabled: boolean;
  style: Record<string, string>;
  dataset: Record<string, string>;
  attrs: Record<string, string>;
  children: FakeEl[];
  parentNode: FakeEl | null;
  listeners: Record<string, ((e: unknown,) => void)[]>;
  classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
    contains(name: string,): boolean;
  };
  setAttribute(name: string, value: string,): void;
  getAttribute(name: string,): string | null;
  append(...els: FakeEl[]): void;
  replaceChildren(...els: FakeEl[]): void;
  remove(): void;
  click(): void;
  focus(): void;
  addEventListener(type: string, fn: (e: unknown,) => void,): void;
  removeEventListener(type: string, fn: (e: unknown,) => void,): void;
  querySelector(selector: string,): FakeEl | null;
}

const FOCUS_LOG: FakeEl[] = [];

/** Element that received the most recent focus() call, if any. */
export function lastFocus(): FakeEl | null {
  return FOCUS_LOG[FOCUS_LOG.length - 1] ?? null;
}

/** Drop all recorded focus calls (call between tests). */
export function clearFocusLog(): void {
  FOCUS_LOG.length = 0;
}

export function makeEl(tag = "div",): FakeEl {
  const classes = new Set<string>();
  const children: FakeEl[] = [];
  const listeners: Record<string, ((e: unknown,) => void)[]> = {};
  const el: FakeEl = {
    tagName: tag.toUpperCase(),
    type: "",
    className: "",
    textContent: "",
    innerHTML: "",
    tabIndex: -1,
    disabled: false,
    style: {},
    dataset: {},
    attrs: {},
    children,
    parentNode: null,
    listeners,
    classList: {
      add: (...names) => {
        for (const n of names) { classes.add(n,); }
      },
      remove: (...names) => {
        for (const n of names) { classes.delete(n,); }
      },
      contains: (n,) => classes.has(n,),
    },
    setAttribute: (name, value,) => {
      el.attrs[name] = value;
      if (name.startsWith("data-",)) {
        el.dataset[name.slice(5,).replace(/-([a-z])/g, (_, c: string,) => c.toUpperCase(),)] = value;
      }
    },
    getAttribute: (name,) => el.attrs[name] ?? null,
    append: (...added) => {
      for (const c of added) {
        c.parentNode = el;
        children.push(c,);
      }
    },
    replaceChildren: (...added) => {
      for (const c of children) { c.parentNode = null; }
      children.length = 0;
      el.append(...added,);
    },
    remove: () => {
      const parent = el.parentNode;
      if (parent) { parent.children.splice(parent.children.indexOf(el,), 1,); }
      el.parentNode = null;
    },
    click: () => {
      fire(el, "click", {},);
    },
    focus: () => {
      FOCUS_LOG.push(el,);
    },
    addEventListener: (type, fn,) => {
      (listeners[type] ??= []).push(fn,);
    },
    removeEventListener: (type, fn,) => {
      listeners[type] = (listeners[type] ?? []).filter((kept,) => kept !== fn);
    },
    querySelector: (selector,) => query(el, selector,),
  };
  // `className` string assignments (render.ts builds class strings) stay in
  // sync with the classList set so tests can read either representation.
  Object.defineProperty(el, "className", {
    get: () => [...classes,].join(" ",),
    set: (value: string,) => {
      classes.clear();
      for (const part of value.split(/\s+/,)) { if (part) { classes.add(part,); } }
    },
  },);
  return el;
}

/**
 * Invoke the listeners registered for `type` with a synthetic event.
 * @param el
 * @param type
 * @param event
 */
export function fire(el: FakeEl, type: string, event: Record<string, unknown> = {},): void {
  for (const fn of [...(el.listeners[type] ?? []),]) { fn(event,); }
}

/**
 * Send a keydown to `el`; returns whether the handler preventDefault()ed.
 * @param el
 * @param key
 */
export function pressKey(el: FakeEl, key: string,): boolean {
  let prevented = false;
  fire(el, "keydown", {
    key,
    preventDefault: () => {
      prevented = true;
    },
  },);
  return prevented;
}

/**
 * Depth-first `[data-name='value']` selector match over a fake subtree.
 * @param root
 * @param selector
 */
export function query(root: FakeEl, selector: string,): FakeEl | null {
  const m = /^\[data-([a-z-]+)=["']([^"']+)["']\]$/.exec(selector.trim(),);
  if (!m) { return null; }
  return find(
    root.children,
    m[1]!.replace(/-([a-z])/g, (_, c: string,) => c.toUpperCase(),),
    m[2]!,
  );
}

function find(els: FakeEl[], key: string, value: string,): FakeEl | null {
  for (const el of els) {
    if (el.dataset[key] === value) { return el; }
    const hit = find(el.children, key, value,);
    if (hit) { return hit; }
  }
  return null;
}

const docHost = globalThis as { document?: unknown };
const cssHost = globalThis as { CSS?: unknown };

/** Swap in a fake document + identity CSS.escape; returns the restore fn. */
export function installBattleDom(): () => void {
  const savedDocument = docHost.document;
  const savedCss = cssHost.CSS;
  docHost.document = { createElement: (tag: string,) => makeEl(tag,), };
  cssHost.CSS = { escape: (value: string,) => value, };
  return () => {
    docHost.document = savedDocument;
    cssHost.CSS = savedCss;
  };
}
