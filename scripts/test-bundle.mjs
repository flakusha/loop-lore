#!/usr/bin/env bun
// Quick smoke test for built bundles — checks Alpine stores and app() component
const dist = new URL("../dist/public/", import.meta.url).pathname;

// Browser globals stub
Object.assign(globalThis, {
  document: { addEventListener: ()=>{}, querySelector: ()=>null, body: {classList:{toggle:()=>{}}}, head:{appendChild:()=>{}}, createElement:()=>({rel:'',href:'',onload:null,onerror:null}), cookie:'locale=en', documentElement:{dir:'ltr',lang:'en'}, style:{setProperty:()=>{}} },
  window: globalThis, navigator: {userAgent:'node'}, localStorage: {getItem:()=>null,setItem:()=>{}},
  location: {href:'http://localhost:7171',pathname:'/views/chat'},
  fetch: async()=>({ok:true,json:async()=>({})}),
  XMLHttpRequest: class{open(){}send(){}setRequestHeader(){}addEventListener(){}},
  MutationObserver: class{observe(){}disconnect(){}},
  HTMLElement: class{},
  requestAnimationFrame: (cb)=>setTimeout(cb,0),
  customElements: {define:()=>{}},
});

globalThis.HTMLLinkElement = class extends globalThis.HTMLElement {};

try {
  await import(dist + "vendor.js");
  console.log("✓ vendor.js loaded");
  console.log("  Alpine:", !!globalThis.Alpine);
  console.log("  htmx:", !!globalThis.htmx);
  try { console.log("  sidebar store:", !!Alpine.store("sidebar")); } catch(e) { console.log("  sidebar ERR:", e.message); }
  try { console.log("  chat store:", !!Alpine.store("chat")); } catch(e) { console.log("  chat ERR:", e.message); }
  try { console.log("  ui store:", !!Alpine.store("ui")); } catch(e) { console.log("  ui ERR:", e.message); }
} catch(e) { console.log("✗ vendor.js FAILED:", e.message); }

try {
  await import(dist + "app.js");
  console.log("\n✓ app.js loaded");
  console.log("  globalThis.app:", typeof globalThis.app);
  console.log("  globalThis.chatState:", typeof globalThis.chatState);
  if (typeof globalThis.app === "function") {
    const o = globalThis.app();
    console.log("  app() keys:", Object.keys(o).join(", "));
    console.log("  applyTheme:", typeof o.applyTheme);
    console.log("  init:", typeof o.init);
  }
} catch(e) { console.log("\n✗ app.js FAILED:", e.message); }
