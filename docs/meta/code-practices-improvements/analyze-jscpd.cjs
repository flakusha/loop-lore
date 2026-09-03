const fs = require("fs");
const r = JSON.parse(fs.readFileSync("/tmp/jscpd-full/jscpd-report.json", "utf8")).duplicates;
const root = "/home/flak/git-ai/loop-lore/";
const rel = (n) => n.replace(root, "");
// per-file duplicated tokens
const byFile = {}, byDir = {}, pairDir = {};
const top = (o, n = 18) => Object.entries(o).sort((a, b) => (typeof b[1] === "object" ? b[1].tokens : b[1]) - (typeof a[1] === "object" ? a[1].tokens : a[1])).slice(0, n);
let lines = 0;
for (const d of r) {
  lines += d.lines;
  for (const f of [rel(d.firstFile.name), rel(d.secondFile.name)]) {
    byFile[f] = byFile[f] || { tokens: 0, clones: 0 };
    byFile[f].tokens += d.tokens; byFile[f].clones++;
    const dir = f.split("/").slice(0, 2).join("/");
    byDir[dir] = (byDir[dir] || 0) + d.tokens;
  }
  const pd = [...new Set([rel(d.firstFile.name), rel(d.secondFile.name)].map((f) => f.split("/").slice(0, 2).join("/")))].sort().join(" <-> ");
  pairDir[pd] = (pairDir[pd] || 0) + d.tokens;
}
console.log("clones:", r.length, "| dup lines (sum):", lines);
console.log("\n--- top files by duplicated tokens ---");
for (const [k, v] of top(byFile, 25)) console.log(String(v.tokens).padStart(6), String(v.clones).padStart(4), k);
const NOISE = /^(public\/locales\/|public\/css\/|frontend\/|db\/schema-manifest\.ts|validation\/db-schemas\.ts|test-utils\/insert-helpers\.ts)/;
const code = r.filter((d) => !NOISE.test(rel(d.firstFile.name)) && !NOISE.test(rel(d.secondFile.name)));
const cbyFile = {}, cbyDir = {};
let clines = 0;
for (const d of code) {
  clines += d.lines;
  for (const f of [rel(d.firstFile.name), rel(d.secondFile.name)]) {
    cbyFile[f] = cbyFile[f] || { tokens: 0, clones: 0 };
    cbyFile[f].tokens += d.tokens; cbyFile[f].clones++;
    const dir = f.split("/").slice(0, 2).join("/");
    cbyDir[dir] = (cbyDir[dir] || 0) + d.tokens;
  }
}
console.log("\n=== code-only (excl locales/css/frontend/generated) ===");
console.log("clones:", code.length, "| dup lines:", clines);
console.log("--- top dirs ---");
for (const [k, v] of top(cbyDir, 20)) console.log(String(v).padStart(7), k);
console.log("--- top files ---");
for (const [k, v] of top(cbyFile, 25)) console.log(String(v.tokens).padStart(6), String(v.clones).padStart(4), k);
const cbig = [...code].sort((a, b) => b.tokens - a.tokens).slice(0, 15);
console.log("--- 15 largest code clones ---");
for (const d of cbig) console.log(`${d.tokens}t/${d.lines}l`, rel(d.firstFile.name) + ":" + d.firstFile.startLine, "<->", rel(d.secondFile.name) + ":" + d.secondFile.startLine);
// biggest single clones
const big = [...r].sort((a, b) => b.tokens - a.tokens).slice(0, 10);
console.log("\n--- 10 largest clones (tokens/lines) ---");
for (const d of big) console.log(`${d.tokens}t/${d.lines}l`, rel(d.firstFile.name) + ":" + d.firstFile.startLine, "<->", rel(d.secondFile.name) + ":" + d.secondFile.startLine);
// same-file clones
const intra = r.filter((d) => d.firstFile.name === d.secondFile.name);
console.log("\nintra-file clones:", intra.length);
// distribution of clone sizes
const buckets = { "4-5l": 0, "6-9l": 0, "10-19l": 0, "20-49l": 0, "50+l": 0 };
for (const d of r) { const l = d.lines; if (l < 6) buckets["4-5l"]++; else if (l < 10) buckets["6-9l"]++; else if (l < 20) buckets["10-19l"]++; else if (l < 50) buckets["20-49l"]++; else buckets["50+l"]++; }
console.log("clone size distribution:", buckets);
