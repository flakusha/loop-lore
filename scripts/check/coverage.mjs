// Coverage reporter: parse .tmp/coverage/lcov.info, emit per-module line %
// Usage: bun run scripts/check/coverage.mjs [--floor 80]
const fs = require("fs",);
const floor = parseInt(process.argv.find((a,) => a.startsWith("--floor="))?.split("=",)[1], 10,) || 80;
const lcovPath = ".tmp/coverage/lcov.info";
if (!fs.existsSync(lcovPath,)) {
  console.error("lcov not found at " + lcovPath + " — run 'bun test --coverage' first",);
  process.exit(1,);
}

const lcov = fs.readFileSync(lcovPath, "utf8",);
const records = lcov.split("end_of_record",).filter(Boolean,);
const modules = {};

for (const r of records) {
  const sf = r.match(/SF:(.+)/,)?.[1];
  if (!sf) { continue; }
  const mod = sf.replace(/^src\//, "",).split("/",)[0];
  const lf = parseInt(r.match(/LF:(\d+)/,)?.[1] || "0", 10,);
  const lh = parseInt(r.match(/LH:(\d+)/,)?.[1] || "0", 10,);
  modules[mod] = modules[mod] || { lf: 0, lh: 0, };
  modules[mod].lf += lf;
  modules[mod].lh += lh;
}

const rows = Object.entries(modules,)
  .map(([m, v,],) => ({ mod: m, pct: v.lf ? (v.lh / v.lf) * 100 : 0, lf: v.lf, lh: v.lh, }))
  .sort((a, b,) => a.pct - b.pct);

console.error("\n| module | line % | lines hit / total |\n|---|---|---|",);
for (const r of rows) {
  console.error(`| ${r.mod} | ${r.pct.toFixed(1,)}% | ${r.lh}/${r.lf} |`,);
}

const fails = rows.filter((r,) => r.pct < floor);
console.log(JSON.stringify({ floor, total: rows.length, fail: fails.length, modules: rows, },),);
process.exit(fails.length ? 1 : 0,);
