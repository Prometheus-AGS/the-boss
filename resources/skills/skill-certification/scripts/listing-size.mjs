// Estimate how much of a harness's skill listing a plugin's skills take.
//
// Claude Code puts every model-invocable skill's name and description into the
// session, inside a budget of 1% of the model's context window, and drops
// descriptions when the listing overflows. A skill whose description was
// dropped can still be invoked by name but is unlikely to be chosen.
//
// Usage: node listing-size.mjs <plugin-dir> [--prefix <plugin-name>:] [--json]
//
// Counts are estimates: the per-entry overhead and the characters-per-token
// ratio are assumptions. Claude Code 2.1.326 registers only a plugin's
// top-level skills; a skill nested inside another skill's directory is not
// listed and cannot be invoked by name. Nested counts are reported because
// other harnesses (Codex) recurse.
import fs from 'node:fs';
import path from 'node:path';
import { frontmatterText, parseFrontmatter } from './lib.mjs';

const args = process.argv.slice(2);
const pluginDir = args.find(a => !a.startsWith('--'));
if (!pluginDir) {
  console.error('usage: listing-size.mjs <plugin-dir> [--prefix <name>:] [--json]');
  process.exit(64);
}
const prefixArg = args.indexOf('--prefix');
const asJson = args.includes('--json');

const MAX_DESCRIPTION = 1536; // documented per-entry cap
const ENTRY_OVERHEAD = 6; // separators around one listing entry (assumed)
const CHARS_PER_TOKEN = 4; // assumed
const BUDGET_FRACTION = 0.01; // documented default
const CONTEXT_WINDOWS = { '200k-token model': 200_000, '1M-token model': 1_000_000 };

let pluginName = '';
for (const manifest of ['.claude-plugin/plugin.json', 'plugin.json']) {
  const file = path.join(pluginDir, manifest);
  if (fs.existsSync(file)) pluginName = JSON.parse(fs.readFileSync(file, 'utf8')).name ?? '';
}
const prefix = prefixArg >= 0 ? args[prefixArg + 1] : pluginName ? `${pluginName}:` : '';

function entry(skillFile) {
  const text = frontmatterText(skillFile);
  if (text === null) return null;
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter?.name) return null;
  const description = `${frontmatter.description ?? ''} ${frontmatter.when_to_use ?? ''}`.trim();
  return {
    name: String(frontmatter.name),
    modelInvocable: String(frontmatter['disable-model-invocation']) !== 'true',
    chars: Math.min(description.length, MAX_DESCRIPTION) + String(frontmatter.name).length + prefix.length + ENTRY_OVERHEAD,
  };
}

const skillsDir = path.join(pluginDir, 'skills');
const topLevel = [];
const nested = [];
const visit = (directory, depth) => {
  for (const name of fs.readdirSync(directory).sort()) {
    const child = path.join(directory, name);
    if (!fs.lstatSync(child).isDirectory()) continue;
    const skillFile = path.join(child, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      const found = entry(skillFile);
      if (found) (depth === 0 ? topLevel : nested).push(found);
    }
    visit(child, depth + 1);
  }
};
if (fs.existsSync(skillsDir)) visit(skillsDir, 0);

const sum = list => list.filter(item => item.modelInvocable).reduce((total, item) => total + item.chars, 0);
const result = {
  plugin: pluginName || path.basename(pluginDir),
  topLevel: { skills: topLevel.length, modelInvocable: topLevel.filter(i => i.modelInvocable).length, chars: sum(topLevel) },
  nested: { skills: nested.length, modelInvocable: nested.filter(i => i.modelInvocable).length, chars: sum(nested) },
  budgets: Object.fromEntries(
    Object.entries(CONTEXT_WINDOWS).map(([label, tokens]) => [label, Math.round(tokens * BUDGET_FRACTION * CHARS_PER_TOKEN)])
  ),
  largest: [...topLevel].sort((a, b) => b.chars - a.chars).slice(0, 5).map(i => `${i.name} (${i.chars})`),
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`plugin: ${result.plugin}`);
  console.log(`top-level skills: ${result.topLevel.skills} (${result.topLevel.modelInvocable} model-invocable), listing about ${result.topLevel.chars} chars`);
  console.log(`nested skills:    ${result.nested.skills} (${result.nested.modelInvocable} model-invocable), ${result.nested.chars} chars (not listed by Claude Code; counted by harnesses that recurse)`);
  for (const [label, budget] of Object.entries(result.budgets)) {
    const ratio = (result.topLevel.chars / budget).toFixed(1);
    console.log(`budget on a ${label}: about ${budget} chars; top-level listing is ${ratio}x that`);
  }
  console.log(`largest entries: ${result.largest.join(', ')}`);
}
