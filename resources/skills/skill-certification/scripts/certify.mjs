// Certify one Agent Skill: run the levels that have evidence, apply the pass
// rules, and write a certificate bound to the skill's content hash.
//
//   node certify.mjs <skill-dir> [--out <dir>]
//       [--results isolated=<result.json>] [--results pack=<result.json>]
//       [--run isolated|pack|both] [--plugin <plugin-dir>] [--runs 5]
//       [--model <id>] [--max-cost-usd 8]
//       [--negative <case-name>]... [--accept <level>=<reason>]...
//       [--require C0|C1|C2|C3] [--skip-external] [--json]
//
// Static levels (C0, C1) cost nothing. C2 and C3 need eval results: pass files
// from an earlier run with --results, or let this script run the cases with
// --run, which makes real, billed model calls bounded by --max-cost-usd.
//
// The exit code is 0 when a certificate was written, whatever level it records.
// With --require, it is 2 when the skill is below that level.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashTree, listingChars, mean, readSkill } from './lib.mjs';
import { runExecutable, runNode } from './process.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEVELS = ['C0', 'C1', 'C2', 'C3'];
const SPEC_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Thresholds measured in the Phase 2 pilot (references/levels.md).
const RULES = {
  c2MinRuns: 5,
  c2MinFiredRate: 0.8,
  c3MinRuns: 3,
  c3MinMeanDelta: 0.25,
  c3MinMeanWithScore: 0.8,
};

function usage(message) {
  if (message) console.error(`certify: ${message}`);
  console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(4, 12).map(line => line.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(64);
}

function parseArgs(argv) {
  const args = { results: {}, negative: [], accept: {}, runs: 5, maxCost: 8, external: true };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    const next = () => argv[++i] ?? usage(`missing value for ${value}`);
    if (value === '--out') args.out = next();
    else if (value === '--results') {
      const [mode, file] = next().split('=');
      if (!['isolated', 'pack'].includes(mode) || !file) usage('--results takes isolated=<file> or pack=<file>');
      args.results[mode] = path.resolve(file);
    } else if (value === '--run') {
      args.run = next();
      if (!['isolated', 'pack', 'both'].includes(args.run)) usage('--run takes isolated, pack or both');
    } else if (value === '--plugin') args.plugin = path.resolve(next());
    else if (value === '--runs') args.runs = Number(next());
    else if (value === '--model') args.model = next();
    else if (value === '--max-cost-usd') args.maxCost = Number(next());
    else if (value === '--negative') args.negative.push(next());
    else if (value === '--accept') {
      const [level, ...reason] = next().split('=');
      if (!LEVELS.includes(level) || reason.join('=').trim() === '') usage('--accept takes <level>=<reason>');
      args.accept[level] = reason.join('=').trim();
    } else if (value === '--require') {
      args.require = next();
      if (!LEVELS.includes(args.require)) usage('--require takes C0, C1, C2 or C3');
    } else if (value === '--skip-external') args.external = false;
    else if (value === '--json') args.json = true;
    else if (value === '-h' || value === '--help') usage();
    else if (value.startsWith('--')) usage(`unknown argument: ${value}`);
    else if (!args.skill) args.skill = path.resolve(value);
    else usage(`unexpected argument: ${value}`);
  }
  if (!args.skill) usage('give a skill directory');
  if (!fs.existsSync(path.join(args.skill, 'SKILL.md'))) usage(`${args.skill} has no SKILL.md`);
  return args;
}

const finding = (check, severity, detail, fix) => ({ check, severity, detail, fix });
const commands = [];
// Real executables (uvx, claude, git) go by name; a name that is missing, or that
// resolves only to a .cmd/.bat shim on Windows, comes back as `available: false`
// and the level that needed it is recorded as NOT_EXERCISED, never run through a shell.
function run(command, argv, options = {}) {
  commands.push([command, ...argv].join(' '));
  return runExecutable(command, argv, options);
}
function runScript(file, argv, options = {}) {
  commands.push(['node', file, ...argv].join(' '));
  return runNode(file, argv, options);
}
function findUp(start, relative) {
  let directory = start;
  for (;;) {
    if (fs.existsSync(path.join(directory, relative))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

// ---------------------------------------------------------------- C0: spec
function builtinSpec(skill, skillDir) {
  const findings = [];
  const fm = skill.frontmatter;
  if (!fm) return [finding('frontmatter', 'error', 'SKILL.md has no YAML frontmatter', 'Add a frontmatter block with name and description.')];
  const name = fm.name;
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || name.length > 64) {
    findings.push(finding('name', 'error', `name ${JSON.stringify(name)} is not lowercase-hyphenated, 1 to 64 characters`, 'Rename to lowercase letters, digits and single hyphens.'));
  } else if (name !== path.basename(skillDir)) {
    findings.push(finding('name-directory', 'error', `name ${name} differs from the directory ${path.basename(skillDir)}`, 'Make the directory name and the name field identical.'));
  }
  const description = fm.description;
  if (typeof description !== 'string' || description.length < 1 || description.length > 1024) {
    findings.push(finding('description', 'error', `description must be 1 to 1024 characters (found ${typeof description === 'string' ? description.length : typeof description})`, 'Write one description of at most 1024 characters.'));
  }
  const extra = Object.keys(fm).filter(key => !SPEC_FIELDS.has(key));
  if (extra.length) {
    findings.push(finding('top-level-fields', 'error', `fields the specification does not allow at the top level: ${extra.join(', ')}`, 'Move them under metadata as strings, or remove them.'));
  }
  if (fm.metadata !== undefined) {
    const bad = fm.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata)
      ? Object.entries(fm.metadata).filter(([, value]) => typeof value !== 'string').map(([key]) => key)
      : ['metadata'];
    if (bad.length) findings.push(finding('metadata-strings', 'error', `metadata values must be strings: ${bad.join(', ')}`, 'Quote the value, or join a list into one comma-separated string.'));
  }
  if (typeof fm.compatibility === 'string' && fm.compatibility.length > 500) {
    findings.push(finding('compatibility', 'error', 'compatibility is longer than 500 characters', 'Shorten it.'));
  }
  return findings;
}

function levelC0(skill, args) {
  const validators = [];
  const builtin = builtinSpec(skill, args.skill);
  validators.push({ name: 'built-in specification checks', result: builtin.length ? 'FAIL' : 'PASS', findings: builtin });
  if (args.external) {
    const ref = run('uvx', ['--from', 'skills-ref', 'agentskills', 'validate', args.skill]);
    if (!ref.available) validators.push({ name: 'skills-ref (official reference validator)', result: 'NOT_EXERCISED', note: ref.reason });
    else {
      const output = `${ref.stdout}${ref.stderr}`.trim();
      validators.push({
        name: 'skills-ref (official reference validator)',
        result: ref.status === 0 ? 'PASS' : 'FAIL',
        findings: ref.status === 0 ? [] : [finding('skills-ref', 'error', output.split('\n').slice(-6).join(' | '), 'Fix what the reference validator reports; it is the specification\'s own check.')],
      });
    }
    const validator = ['scripts/validate-skills.mjs', 'scripts/validate-skills.js']
      .map(relative => ({ relative, repo: findUp(args.skill, relative) }))
      .find(entry => entry.repo);
    if (!validator) validators.push({ name: 'repository validator (strict)', result: 'NOT_EXERCISED', note: 'no scripts/validate-skills.mjs or .js above the skill' });
    else {
      const repo = validator.repo;
      const out = runScript(path.join(repo, validator.relative), ['--strict', path.relative(repo, args.skill)], { cwd: repo });
      validators.push({
        name: 'repository validator (strict)',
        result: out.status === 0 ? 'PASS' : 'FAIL',
        findings: out.status === 0 ? [] : [finding('repository-validator', 'error', `${out.stdout}${out.stderr}`.trim().split('\n').slice(-8).join(' | '), 'Fix what npm run validate:strict reports for this skill.')],
      });
    }
  }
  const exercised = validators.filter(entry => entry.result !== 'NOT_EXERCISED');
  let result = 'PASS';
  if (exercised.some(entry => entry.result === 'FAIL')) result = 'FAIL';
  else if (exercised.length < 2) result = 'INCOMPLETE';
  return {
    level: 'C0',
    claim: 'Conforms to the agentskills.io specification',
    result,
    rule: 'At least two independent validators ran and every one that ran passed.',
    validators,
    findings: validators.flatMap(entry => entry.findings ?? []),
    ...(result === 'INCOMPLETE' ? { note: 'Only one validator ran. Install uv (for skills-ref) or run from a repository that has the strict validator.' } : {}),
  };
}

// -------------------------------------------------------------- C1: static
function markdownFiles(skillDir) {
  const files = [path.join(skillDir, 'SKILL.md')];
  const references = path.join(skillDir, 'references');
  if (fs.existsSync(references)) {
    for (const name of fs.readdirSync(references)) {
      if (name.endsWith('.md')) files.push(path.join(references, name));
    }
  }
  return files;
}

function levelC1(skill, args) {
  const findings = [];
  for (const file of markdownFiles(args.skill)) {
    // Fenced code is example text; a link inside it is not a reference.
    const text = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.includes('${')) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target)))) {
        findings.push(finding('broken-link', 'error', `${path.relative(args.skill, file)} links to ${target}, which does not exist`, 'Correct the path or remove the link.'));
      }
    }
  }
  if (skill.lines > 500) {
    findings.push(finding('skill-length', 'warning', `SKILL.md is ${skill.lines} lines; the guideline is under 500`, 'Move detail into references/ and link to it.'));
  }
  // This pack runs on Windows with Node as the only runtime, and never relies on
  // an executable bit or a shebang. A shell, Python or PowerShell script inside a
  // skill cannot run there, so it is an error wherever in the skill it sits.
  const nonNode = [];
  const scan = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) scan(path.join(directory, entry.name), rel);
      else if (/\.(sh|bash|zsh|py|ps1|cmd|bat)$/i.test(entry.name)) nonNode.push(rel);
    }
  };
  scan(args.skill, '');
  for (const file of nonNode) {
    findings.push(finding('non-node-script', 'error', `${file} is not a Node script; it cannot run on Windows without extra tooling`, 'Port it to an .mjs file run as `node <file>`.'));
  }
  const description = String(skill.frontmatter?.description ?? '');
  if (!/\b(use (this |it )?(when|for|whenever|to)|when the user|when asked|whenever|trigger)/i.test(description)) {
    findings.push(finding('description-no-trigger', 'warning', 'the description does not say when to use the skill', 'Add a "Use when ..." clause; the description is the only thing a model sees before choosing a skill.'));
  }
  const hooks = path.join(args.skill, 'hooks/hooks.json');
  if (fs.existsSync(hooks)) {
    try {
      JSON.parse(fs.readFileSync(hooks, 'utf8'));
    } catch (error) {
      findings.push(finding('hooks-json', 'error', `hooks/hooks.json does not parse: ${error.message}`, 'Fix the JSON.'));
    }
  }
  if (!fs.existsSync(path.join(args.skill, 'evals'))) {
    findings.push(finding('no-eval-cases', 'warning', 'the skill has no evals/ directory, so C2 and C3 cannot be measured', 'Write two outcome cases and one near-miss case (references/writing-cases.md).'));
  }
  const errors = findings.filter(entry => entry.severity === 'error');
  return {
    level: 'C1',
    claim: 'No broken references and no static hazards',
    result: errors.length ? 'FAIL' : 'PASS',
    rule: 'No error-severity finding from the built-in static checks.',
    findings,
    listingChars: listingChars(skill.frontmatter),
    notExercised: ['security scan', 'third-party linters (agnix and others): run them separately and attach the output'],
  };
}

// ------------------------------------------------------ C2 / C3: eval data
function loadCases(file, skillName, negatives) {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const all = report.cases ?? [];
  // A pack run holds every skill's cases; keep the ones under this skill's folder.
  const scoped = all.filter(entry => String(entry.dir ?? '').split(/[\\/]/).includes(skillName));
  const cases = (scoped.length ? scoped : all).map(entry => {
    const withRuns = entry.arms?.with ?? [];
    const withoutRuns = entry.arms?.without ?? [];
    const graders = {};
    for (const [arm, runs] of [['with', withRuns], ['without', withoutRuns]]) {
      for (const one of runs) {
        for (const grader of one.graders ?? []) {
          if (grader.name.startsWith('00-')) continue;
          const slot = (graders[grader.name] ??= { with: [0, 0], without: [0, 0], judged: false });
          slot[arm][0] += grader.passed ? 1 : 0;
          slot[arm][1] += 1;
          if (Array.isArray(grader.judgeVotes)) slot.judged = true;
        }
      }
    }
    const negative = /^(near-miss|quiet)-/.test(entry.name) || negatives.includes(entry.name);
    // The 00- grader states what the case expects. On a near-miss case it
    // expects no call, so it passes when the skill stayed quiet.
    const expectationMet = withRuns
      .map(one => one.graders?.find(grader => grader.name.startsWith('00-'))?.passed)
      .filter(value => value !== undefined);
    return {
      name: entry.name,
      negative,
      named: /^named-/.test(entry.name),
      fired: expectationMet.map(met => (negative ? !met : met)),
      withScores: withRuns.map(one => one.score),
      withoutScores: withoutRuns.map(one => one.score),
      errors: [...withRuns, ...withoutRuns].filter(one => one.error).length,
      graders,
    };
  });
  return {
    file,
    claudeVersion: report.claudeVersion ?? null,
    model: report.suite?.modelOverride ?? null,
    plugins: (report.suite?.plugins ?? []).map(plugin => plugin.name),
    costUsd: report.costUsd ?? null,
    partial: Boolean(report.partial),
    cases,
  };
}

function triggerSummary(data) {
  const positives = data.cases.filter(entry => !entry.negative);
  const negatives = data.cases.filter(entry => entry.negative);
  const pooled = positives.flatMap(entry => entry.fired);
  return {
    positives: positives.map(entry => ({ name: entry.name, fired: entry.fired.filter(Boolean).length, runs: entry.fired.length })),
    negatives: negatives.map(entry => ({ name: entry.name, fired: entry.fired.filter(Boolean).length, runs: entry.fired.length })),
    firedRate: pooled.length ? pooled.filter(Boolean).length / pooled.length : null,
    minRuns: data.cases.length ? Math.min(...data.cases.map(entry => entry.fired.length)) : 0,
    nameInvoked: positives.length > 0 && positives.every(entry => entry.named),
  };
}

function levelC2(packData, isolatedData, args) {
  const base = {
    level: 'C2',
    claim: 'Starts on requests it should handle and stays quiet on those it should not',
    rule: `With the catalogue users get loaded: at least ${RULES.c2MinRuns} runs per case, positive cases fire on at least ${RULES.c2MinFiredRate * 100}% of runs pooled, no positive case at zero, and no near-miss case ever fires.`,
    findings: [],
  };
  const isolated = isolatedData ? { ...triggerSummary(isolatedData), note: 'Only this skill was loaded. Reported for diagnosis; it is not the C2 result.' } : null;
  if (!packData) {
    return { ...base, result: 'NOT_EXERCISED', isolated, note: 'No pack-mode results. Triggering alone is not triggering in the catalogue users get.' };
  }
  const summary = triggerSummary(packData);
  const catalogue = { plugins: packData.plugins, listingChars: null };
  if (args.plugin) {
    const size = runScript(path.join(HERE, 'listing-size.mjs'), [args.plugin, '--json']);
    if (size.status === 0) catalogue.listingChars = JSON.parse(size.stdout).topLevel.chars;
  }
  const out = { ...base, catalogue, isolated, ...summary, invocation: summary.nameInvoked ? 'by name' : 'from a plain request' };
  if (summary.positives.length === 0) return { ...out, result: 'NOT_EXERCISED', note: 'No positive cases were found for this skill in the pack results.' };
  for (const entry of summary.negatives.filter(one => one.fired > 0)) {
    out.findings.push(finding('near-miss-fired', 'error', `${entry.name} fired ${entry.fired} of ${entry.runs} runs`, 'Add a "do not use for ..." clause naming this kind of request to the description.'));
  }
  for (const entry of summary.positives.filter(one => one.fired === 0)) {
    out.findings.push(finding('positive-never-fired', 'error', `${entry.name} never fired (0 of ${entry.runs})`, 'Rewrite the description around the words a user would use for this request, or certify the skill as invoked by name.'));
  }
  if (summary.firedRate !== null && summary.firedRate < RULES.c2MinFiredRate) {
    out.findings.push(finding('fired-rate', 'error', `positive cases fired on ${(summary.firedRate * 100).toFixed(0)}% of runs; the rule is ${RULES.c2MinFiredRate * 100}%`, 'Sharpen the trigger clause. If the skill fires alone but not in the pack, the catalogue is too large: install by domain or shorten neighbouring descriptions.'));
  }
  if (out.findings.length) return { ...out, result: 'FAIL' };
  if (summary.minRuns < RULES.c2MinRuns) {
    return { ...out, result: 'INCOMPLETE', note: `Cases have ${summary.minRuns} run(s); the rule needs ${RULES.c2MinRuns}. Three runs only resolve thirds.` };
  }
  return { ...out, result: 'PASS' };
}

function levelC3(isolatedData) {
  const base = {
    level: 'C3',
    claim: 'Output with the skill is measurably better than output without it',
    rule: `Every positive case has a delta above zero, the mean delta is at least ${RULES.c3MinMeanDelta}, the mean with-skill score is at least ${RULES.c3MinMeanWithScore}, and at least one deterministic grader passes with the skill and fails without it. At least ${RULES.c3MinRuns} runs per arm.`,
    findings: [],
  };
  if (!isolatedData) return { ...base, result: 'NOT_EXERCISED', note: 'No isolated-mode results.' };
  const positives = isolatedData.cases.filter(entry => !entry.negative && entry.withoutScores.length > 0);
  if (positives.length === 0) return { ...base, result: 'NOT_EXERCISED', note: 'No positive case has both arms.' };
  const cases = positives.map(entry => ({
    name: entry.name,
    with: mean(entry.withScores),
    without: mean(entry.withoutScores),
    delta: mean(entry.withScores) - mean(entry.withoutScores),
    runs: Math.min(entry.withScores.length, entry.withoutScores.length),
    fired: `${entry.fired.filter(Boolean).length}/${entry.fired.length}`,
  }));
  const graderRows = positives.flatMap(entry => Object.entries(entry.graders).map(([name, slot]) => ({ case: entry.name, name, ...slot })));
  const always = slot => slot[1] > 0 && slot[0] === slot[1];
  const nonDiscriminating = graderRows.filter(row => always(row.with) && always(row.without)).map(row => `${row.case}/${row.name}`);
  const discriminating = graderRows.filter(row => !row.judged && row.with[1] > 0 && row.without[1] > 0 && row.with[0] * 2 > row.with[1] && row.without[0] * 2 < row.without[1]).map(row => `${row.case}/${row.name}`);
  const meanDelta = mean(cases.map(entry => entry.delta));
  const meanWith = mean(cases.map(entry => entry.with));
  const out = { ...base, cases, meanDelta, meanWithScore: meanWith, discriminatingDeterministicGraders: discriminating, nonDiscriminatingGraders: nonDiscriminating };
  for (const entry of cases.filter(one => !(one.delta > 0))) {
    out.findings.push(finding('no-improvement', 'error', `${entry.name}: delta ${entry.delta.toFixed(2)} (skill fired ${entry.fired})`, entry.fired.startsWith('0/') ? 'The skill never fired, so nothing was measured: fix triggering first.' : 'Read the with-skill output in the HTML report. Either the skill does not deliver this promise, or the graders do not check it.'));
  }
  if (meanDelta < RULES.c3MinMeanDelta) out.findings.push(finding('mean-delta', 'error', `mean delta ${meanDelta.toFixed(2)} is below ${RULES.c3MinMeanDelta}`, 'Strengthen the instructions behind the weakest case, or replace graders that pass in both arms.'));
  if (meanWith < RULES.c3MinMeanWithScore) out.findings.push(finding('mean-with-score', 'error', `mean with-skill score ${meanWith.toFixed(2)} is below ${RULES.c3MinMeanWithScore}`, 'Find the grader that fails with the skill loaded and fix the instruction it checks, or the grader if it rejects a legitimate format.'));
  if (discriminating.length === 0) out.findings.push(finding('no-deterministic-discriminator', 'error', 'no deterministic grader passes with the skill and fails without it', 'Add a regex, file or tool-use grader for the skill\'s most specific promise.'));
  if (nonDiscriminating.length) out.findings.push(finding('non-discriminating-graders', 'warning', `pass in both arms on every run: ${nonDiscriminating.join(', ')}`, 'Remove or sharpen them; they do not count towards C3.'));
  if (out.findings.some(entry => entry.severity === 'error')) return { ...out, result: 'FAIL' };
  if (Math.min(...cases.map(entry => entry.runs)) < RULES.c3MinRuns) return { ...out, result: 'INCOMPLETE', note: `Fewer than ${RULES.c3MinRuns} runs per arm.` };
  return { ...out, result: 'PASS' };
}

// --------------------------------------------------- what the operator can do
const IMPACT = {
  C0: {
    accept: 'The skill may be rejected or silently skipped by harnesses that validate strictly. It cannot be published as agentskills.io-conformant.',
    fixCost: 'Minutes; edits to frontmatter only.',
  },
  C1: {
    accept: 'A model following the skill will hit a missing file or a script it cannot run, usually mid-task.',
    fixCost: 'Minutes to an hour; no model runs.',
  },
  C2: {
    accept: 'The skill will rarely start on its own in this catalogue, or will start on the wrong requests. It still works when invoked by name (/skill-name) or called by another skill.',
    fixCost: 'A description rewrite plus a re-run of the trigger cases (billed model runs).',
  },
  C3: {
    accept: 'There is no evidence the skill improves the result. It adds listing and context cost for an unmeasured benefit.',
    fixCost: 'Changes to the skill body or its graders plus a re-run of both arms (the most expensive level).',
  },
};

function decisions(levels, accepted) {
  return levels
    .filter(entry => entry.result === 'FAIL' || entry.result === 'INCOMPLETE')
    .map(entry => {
      const errors = entry.findings.filter(one => one.severity === 'error');
      return {
        level: entry.level,
        result: entry.result,
        failed: errors.length ? errors.map(one => one.detail) : [entry.note ?? 'not enough evidence'],
        proposedFix: errors.length ? [...new Set(errors.map(one => one.fix))] : [entry.note ?? 'Gather the missing evidence and certify again.'],
        options: {
          fix: `Apply the proposed fix and certify again. Cost: ${IMPACT[entry.level].fixCost}`,
          accept: `Ship at the level below with a recorded exception. Impact: ${IMPACT[entry.level].accept}`,
          abandon: 'Do not ship the skill. Nothing is installed and no certificate is kept.',
        },
        accepted: accepted[entry.level] ?? null,
      };
    });
}

// ------------------------------------------------------------------- report
function reportMarkdown(certificate) {
  const lines = [`# Certification: ${certificate.skill}`, '', `**Level held:** ${certificate.level}`, `**Date:** ${certificate.date}`, `**Content hash:** \`${certificate.contentHash}\``, `**Harness:** ${certificate.harness.name} ${certificate.harness.version ?? 'version unknown'}, model ${certificate.harness.model ?? 'not recorded'}`, '', '| Level | Result | Claim |', '|---|---|---|'];
  for (const entry of certificate.levels) lines.push(`| ${entry.level} | ${entry.result} | ${entry.claim} |`);
  lines.push('| C4 | NOT_EXERCISED | C2 and C3 hold on each named harness |', '');
  for (const entry of certificate.levels) {
    if (!entry.findings.length && !entry.note) continue;
    lines.push(`## ${entry.level}: ${entry.result}`, '');
    if (entry.note) lines.push(entry.note, '');
    for (const one of entry.findings) lines.push(`- **${one.severity}** ${one.detail}`, `  - Fix: ${one.fix}`);
    lines.push('');
  }
  const c2 = certificate.levels.find(entry => entry.level === 'C2');
  if (c2?.catalogue) {
    lines.push('## Catalogue C2 was measured in', '', `Plugins loaded: ${c2.catalogue.plugins.join(', ') || 'unknown'}. Listing size: ${c2.catalogue.listingChars ?? 'not measured (pass --plugin)'} characters. Invocation certified: ${c2.invocation}.`, '', 'A trigger result holds only for this catalogue. The same skill can fire alone and never fire in a larger one.', '');
  }
  if (certificate.decisions.length) {
    lines.push('## Decisions for the operator', '');
    for (const one of certificate.decisions) {
      lines.push(`### ${one.level} ${one.result}`, '', 'What failed:', ...one.failed.map(text => `- ${text}`), '', 'Proposed fix:', ...one.proposedFix.map(text => `- ${text}`), '', 'Options:', `1. **Fix.** ${one.options.fix}`, `2. **Accept.** ${one.options.accept}`, `3. **Abandon.** ${one.options.abandon}`, '');
      if (one.accepted) lines.push(`Recorded exception: ${one.accepted}`, '');
    }
  }
  lines.push('## Limits', '', '- The certificate is bound to the content hash, the harness version and the model. An edit to the skill or a new model voids it.', '- Security scanning and third-party linters were not run by this tool.', '- C4 (other harnesses) was not exercised.', '', '## Commands', '', '```', ...certificate.commands, '```', '');
  return lines.join('\n');
}

// --------------------------------------------------------------------- main
const args = parseArgs(process.argv.slice(2));
const skill = readSkill(args.skill);
const skillName = String(skill.frontmatter?.name ?? path.basename(args.skill));
const out = path.resolve(args.out ?? path.join('certification', skillName));
fs.mkdirSync(out, { recursive: true });

const c0 = levelC0(skill, args);
const c1 = levelC1(skill, args);

if (args.run) {
  if (c0.result === 'FAIL') {
    console.error('certify: C0 failed, so no model runs were started. A skill that does not parse cannot be evaluated.');
  } else {
    const modes = args.run === 'both' ? ['isolated', 'pack'] : [args.run];
    for (const mode of modes) {
      const target = path.join(out, 'evals', mode);
      const argv = ['--mode', mode, '--out', target, '--runs', String(args.runs), '--max-cost-usd', String(args.maxCost)];
      if (args.model) argv.push('--model', args.model);
      if (args.plugin) argv.push('--plugin', args.plugin);
      argv.push(args.skill);
      // The runner exits 1 when any case is below its threshold: a finding, not a failure.
      const result = runScript(path.join(HERE, 'run-evals.mjs'), argv, { stdio: ['ignore', 'inherit', 'inherit'], timeout: 4 * 3600_000 });
      if (!result.available) console.error(`certify: could not run the ${mode} cases: ${result.reason}`);
      const file = mode === 'isolated' ? path.join(target, path.basename(args.skill), 'result.json') : path.join(target, 'result.json');
      if (fs.existsSync(file)) args.results[mode] = file;
    }
  }
}

const isolated = args.results.isolated ? loadCases(args.results.isolated, skillName, args.negative) : null;
const pack = args.results.pack ? loadCases(args.results.pack, skillName, args.negative) : null;
const levels = [c0, c1, levelC2(pack, isolated, args), levelC3(isolated)];

let held = 'none';
for (const entry of levels) {
  if (entry.result !== 'PASS') break;
  held = entry.level;
}
const version = run('claude', ['--version']);
const evidence = pack ?? isolated;
const certificate = {
  schemaVersion: 'prometheus-skill-certificate-v1',
  skill: skillName,
  path: args.skill,
  date: new Date().toISOString().slice(0, 10),
  contentHash: hashTree(args.skill, ['evals']),
  casesHash: fs.existsSync(path.join(args.skill, 'evals')) ? hashTree(path.join(args.skill, 'evals')) : null,
  level: held,
  harness: {
    name: 'claude-code',
    version: evidence?.claudeVersion ?? (version.available && version.status === 0 ? version.stdout.trim().split(/\s+/)[0] : null),
    model: evidence?.model ?? null,
  },
  otherHarnesses: 'NOT_EXERCISED',
  levels,
  decisions: decisions(levels, args.accept),
  exceptions: Object.entries(args.accept).map(([level, reason]) => ({ level, reason })),
  evalCostUsd: [isolated, pack].filter(Boolean).reduce((total, data) => total + (data.costUsd ?? 0), 0),
  commands,
};
fs.writeFileSync(path.join(out, 'certificate.json'), `${JSON.stringify(certificate, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'report.md'), reportMarkdown(certificate));

if (args.json) console.log(JSON.stringify(certificate, null, 2));
else {
  console.log(`${skillName}: level ${held}`);
  for (const entry of levels) console.log(`  ${entry.level} ${entry.result}${entry.note ? ` (${entry.note})` : ''}`);
  for (const one of certificate.decisions) console.log(`  decision needed: ${one.level} ${one.result}: ${one.failed[0]}`);
  console.log(`  certificate: ${path.join(out, 'certificate.json')}`);
  console.log(`  report:      ${path.join(out, 'report.md')}`);
}
if (args.require && LEVELS.indexOf(held) < LEVELS.indexOf(args.require)) process.exit(2);
