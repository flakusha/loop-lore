// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fake DOM element for VN tests (no happy-dom in bun test): construction,
 * traversal, and event stubs. Browser-global installation lives in
 * ./vn-fake-dom.
 */

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
  querySelectorAll: (sel: string,) => FakeEl[];
  addEventListener: (type: string, fn: (e?: unknown,) => void,) => void;
  removeEventListener: (type: string, fn: (e?: unknown,) => void,) => void;
  dispatch: (type: string, init?: Record<string, unknown>,) => void;
  parentElement: FakeEl | null;
  setAttribute: (name: string, value: string,) => void;
  getAttribute: (name: string,) => string | null;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  dataset: Record<string, string>;
  classList: {
    contains: (cls: string,) => boolean;
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    toggle: (cls: string, force?: boolean,) => boolean;
  };
}

export function makeEl(tag = "div",): FakeEl {
  const children: FakeEl[] = [];
  const listeners = new Map<string, Array<(e?: unknown,) => void>>();
  const attrs: Record<string, string> = {};
  const style: FakeEl["style"] = {
    setProperty(name, value,) {
      style[name] = value;
    },
  };
  const matchesSel = (el: FakeEl, sel: string,): boolean => {
    return el.className.split(" ",).includes(sel,) || el.tagName === sel.toUpperCase();
  };
  const find = (el: FakeEl, cls: string,): FakeEl | null => {
    for (const child of el.children) {
      if (matchesSel(child, cls,)) { return child; }
      const hit = find(child, cls,);
      if (hit) { return hit; }
    }
    return null;
  };
  const findAll = (el: FakeEl, cls: string, out: FakeEl[],): void => {
    for (const child of el.children) {
      if (matchesSel(child, cls,)) { out.push(child,); }
      findAll(child, cls, out,);
    }
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
      const tokens = (): string[] => {
        return this.className.split(" ",).filter(Boolean,);
      };
      const write = (list: string[],): void => {
        this.className = list.join(" ",);
      };
      return {
        contains: (cls: string,) => {
          return tokens().includes(cls,);
        },
        add: (...names: string[]) => {
          const list = tokens();
          for (const name of names) {
            if (!list.includes(name,)) { list.push(name,); }
          }
          write(list,);
        },
        remove: (...names: string[]) => {
          write(
            tokens().filter((t,) => {
              return !names.includes(t,);
            },),
          );
        },
        toggle: (cls: string, force?: boolean,) => {
          const list = tokens();
          const has = list.includes(cls,);
          const next = force ?? !has;
          if (next && !has) { list.push(cls,); }
          if (!next && has) { list.splice(list.indexOf(cls,), 1,); }
          write(list,);
          return next;
        },
      };
    },
    dataset: {},
    querySelector(sel,) {
      return find(this, sel.replace(/^\./, "",),);
    },
    querySelectorAll(sel,) {
      const out: FakeEl[] = [];
      findAll(this, sel.replace(/^\./, "",), out,);
      return out;
    },
    addEventListener(type, fn,) {
      listeners.set(type, [...(listeners.get(type,) ?? []), fn,],);
    },
    removeEventListener(type, fn,) {
      listeners.set(
        type,
        (listeners.get(type,) ?? []).filter((l,) => {
          return l !== fn;
        },),
      );
    },
    dispatch(type, init,) {
      const event = { type, target: null, ...(init ?? {}), };
      for (const fn of [...(listeners.get(type,) ?? []),]) { fn(event,); }
    },
    get parentElement() {
      return this.parent;
    },
    setAttribute(name, value,) {
      attrs[name] = value;
    },
    getAttribute(name,) {
      return attrs[name] ?? null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 0, height: 0, };
    },
  };
}
