#!/usr/bin/env bun
// Quick smoke test for built bundles — checks Alpine stores and app() component
const distribution = new URL("../dist/public/", import.meta.url).pathname;

// Browser globals stub
Object.assign(globalThis, {
  document: { addEventListener: ()=>{}, querySelector: ()=>null, body: {classList:{toggle:()=>{}}}, head:{appendChild:()=>{}}, createElement:()=>({rel:'',href:'',onload:null,onerror:null}), cookie:'locale=en', documentElement:{dir:'ltr',lang:'en'}, style:{setProperty:()=>{}} },
  window: globalThis, navigator: {userAgent:'node'}, localStorage: {getItem:()=>null,setItem:()=>{}},
  location: {href:'http://localhost:7171',pathname:'/views/chat'},
  fetch: async()=>({ok:true,json:async()=>({})}),
  XMLHttpRequest: class{open(){}send(){}setRequestHeader(){}addEventListener(){}},
  MutationObserver: class{observe(){}disconnect(){}},
  HTMLElement: class{},
  requestAnimationFrame: (callback)=>setTimeout(callback,0),
  customElements: {define:()=>{}},
});

// Intentional browser-global stub for script execution outside a browser.
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.HTMLLinkElement = class extends globalThis.HTMLElement {};

try {
  await import(distribution + "vendor.js");
  console.log("✓ vendor.js loaded");
  console.log("  Alpine:", !!globalThis.Alpine);
  console.log("  htmx:", !!globalThis.htmx);
  try { console.log("  sidebar store:", !!globalThis.Alpine.store("sidebar")); } catch(error) { console.log("  sidebar ERR:", error.message); }
  try { console.log("  chat store:", !!globalThis.Alpine.store("chat")); } catch(error) { console.log("  chat ERR:", error.message); }
  try { console.log("  ui store:", !!globalThis.Alpine.store("ui")); } catch(error) { console.log("  ui ERR:", error.message); }
} catch(error) { console.log("✗ vendor.js FAILED:", error.message); }

try {
  await import(distribution + "app.js");
  console.log("\n✓ app.js loaded");
  console.log("  globalThis.app:", typeof globalThis.app);
  console.log("  globalThis.chatState:", typeof globalThis.chatState);
  if (typeof globalThis.app === "function") {
    const o = globalThis.app();
    console.log("  app() keys:", Object.keys(o).join(", "));
    console.log("  applyTheme:", typeof o.applyTheme);
    console.log("  init:", typeof o.init);
  }
} catch(error) { console.log("\n✗ app.js FAILED:", error.message); }
