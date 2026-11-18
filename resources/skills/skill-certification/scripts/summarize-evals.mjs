// Summarise `claude plugin eval` result.json files: per case, per arm mean score
// and spread, the skill-fired rate, per-grader pass counts, cost and time.
// Usage: node summarize-evals.mjs label=path/result.json [...] [-v] [--json]
import { readFileSync } from 'node:fs';

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = a =>
  a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0;
const f = n => (Number.isNaN(n) ? '  - ' : n.toFixed(2));
const flags = process.argv.slice(2).filter(a => a.startsWith('-'));
const inputs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const rows = [];

for (const [label, path] of inputs.map(a => a.split('='))) {
  const r = JSON.parse(readFileSync(path, 'utf8'));
  for (const c of r.cases) {
    const w = c.arms.with ?? [];
    const wo = c.arms.without ?? [];
    const fired = w
      .map(x => x.graders.find(g => g.name.startsWith('00-'))?.passed)
      .filter(v => v !== undefined);
    const graders = {};
    for (const [arm, runs] of [['with', w], ['without', wo]]) {
      for (const run of runs) {
        for (const g of run.graders) {
          if (g.name.startsWith('00-')) continue;
          graders[g.name] ??= { with: [0, 0], without: [0, 0] };
          graders[g.name][arm][0] += g.passed ? 1 : 0;
          graders[g.name][arm][1] += 1;
        }
      }
    }
    const all = [...w, ...wo];
    rows.push({
      label,
      dir: c.dir,
      name: c.name,
      neg: c.name.startsWith('near-miss'),
      with: w.map(x => x.score),
      without: wo.map(x => x.score),
      fired,
      graders,
      cost: all.reduce((s, x) => s + (x.costUsd || 0) + (x.judgeCostUsd || 0), 0),
      costWith: mean(w.map(x => x.costUsd || 0)),
      costWithout: mean(wo.map(x => x.costUsd || 0)),
      secs: mean(all.map(x => x.durationSeconds)),
      errors: all.filter(x => x.error).length,
      suiteCost: r.costUsd,
      partial: r.partial,
    });
  }
}

if (flags.includes('--json')) {
  console.log(JSON.stringify(rows));
} else {
  let last = '';
  for (const r of rows) {
    if (r.label !== last) {
      console.log(`\n## ${r.label}  (suite cost $${(r.suiteCost ?? 0).toFixed(2)}${r.partial ? ', PARTIAL' : ''})`);
      last = r.label;
    }
    const hits = r.fired.filter(Boolean).length;
    console.log(
      `${r.name.padEnd(46)} ${r.neg ? 'quiet' : 'fired'} ${hits}/${r.fired.length}  ` +
        `with ${f(mean(r.with))}±${f(sd(r.with))}  without ${f(mean(r.without))}±${f(sd(r.without))}  ` +
        `Δ ${f(mean(r.with) - mean(r.without))}  $${r.cost.toFixed(2)}  ${Math.round(r.secs)}s  err ${r.errors}`
    );
    if (flags.includes('-v') && !r.neg) {
      for (const [g, v] of Object.entries(r.graders)) {
        console.log(`    ${g.padEnd(34)} with ${v.with[0]}/${v.with[1]}  without ${v.without[0]}/${v.without[1]}`);
      }
    }
  }
}
