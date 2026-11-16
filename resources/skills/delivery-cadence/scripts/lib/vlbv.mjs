// VLBV attachment for delivery cadence (change requests CR-14, CR-16).
//
// Cadence owns delivery rhythm and publication only. In KBD mode under VLBV it
// executes generated code solely as entries of the phase's adopted boundary
// packet (B4 step 3), and it derives an increment's outcome from the canonical
// closure instead of holding a verdict of its own. Boundaries are defined once
// in kbd-process-orchestrator/references/boundaries.md.
import fs from 'node:fs';
import path from 'node:path';

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function projectRoot(state) {
  return path.resolve(state.profile?.binding?.projectRoot ?? state.profile?.projectRoot ?? process.cwd());
}

/**
 * VLBV applies in KBD mode unless the phase's derived method context (written by
 * method-context.mjs --write from the canonical signed decisions) records a
 * signed KBD-METHOD deviation. The unsigned project.json value is never enough
 * to deviate.
 */
export function vlbvActive(state, phaseId = state.profile?.binding?.phaseId) {
  if (state.profile?.mode !== 'kbd') return false;
  if (!phaseId) return true;
  const context = readJson(path.join(projectRoot(state), '.kbd-orchestrator', 'phases', phaseId, 'method-context.json'));
  const deviation = context?.deviation;
  return !(deviation && deviation.decisionId && deviation.cadence && deviation.reason && context?.status === 'RESOLVED_REFERENCES');
}

function contractFor(state, phaseId) {
  const root = projectRoot(state);
  const explicit = state.profile?.binding?.contractPath;
  const file = explicit ? path.resolve(root, explicit) : path.join(root, '.kbd-orchestrator', 'phases', phaseId, 'adopted-contract.json');
  return { file, contract: readJson(file) };
}

const argvOf = entry => {
  if (typeof entry === 'string') return entry.trim().split(/\s+/);
  if (entry && Array.isArray(entry.argv)) return entry.argv.map(String);
  return null;
};

/**
 * A KBD-mode checkpoint may run only when its exact argv is an entry of the
 * adopted boundary packet. Otherwise it would produce a second set of receipts
 * for the same boundary (conflict CF-01).
 */
export function assertCheckpointInBoundaryPacket(state, iteration, step) {
  const phaseId = iteration.phaseId ?? state.profile?.binding?.phaseId;
  if (!vlbvActive(state, phaseId)) return null;
  const { file, contract } = contractFor(state, phaseId);
  if (!contract) throw new Error(`VLBV: KBD-mode checkpoint needs the phase's adopted contract (${file}); cadence runs generated code only as boundary-packet entries (B4 step 3)`);
  const wanted = [step.command, ...(step.args ?? [])].map(String).join(' ');
  const entries = contract.boundaryPacket?.commands ?? [];
  const match = entries.find(entry => (argvOf(entry) ?? []).join(' ') === wanted);
  if (!match) throw new Error(`VLBV: checkpoint "${step.id}" (${wanted}) is not an entry of the adopted boundary packet; add it to boundaryPacket.commands through a signed amendment or run the packet with value-scenario-verify`);
  return { contractFile: file, entry: match };
}

/**
 * Map the canonical closure to the cadence outcome words. CLOSED with every
 * scenario PASS → accepted; an open phase → pending; any FAIL, BLOCKED or
 * NOT_EXERCISED → blocked, with the real verdicts carried alongside.
 */
export function outcomeFromClosure(state, phaseId) {
  if (!vlbvActive(state, phaseId)) return null;
  const root = projectRoot(state);
  const directory = path.join(root, '.kbd-orchestrator', 'phases', phaseId);
  const results = readJson(path.join(directory, 'boundary-results.json'));
  const closure = readJson(path.join(directory, 'closure.json'));
  const { contract } = contractFor(state, phaseId);
  const verdicts = (results?.scenarios ?? []).map(s => ({ id: s.id, status: s.status }));
  const contractDigest = results?.contractDigest ?? closure?.contractDigest ?? null;
  if (!results) return { outcome: 'pending', reason: 'boundary packet has not run', contractDigest, verdicts };
  // Every adopted scenario must have a verdict; a missing one is NOT_EXERCISED.
  const required = (contract?.scenarioMatrix ?? []).map(s => s.id);
  const missing = required.filter(id => !verdicts.some(v => v.id === id || String(v.id).startsWith(`${id}-`)));
  const bad = verdicts.filter(v => v.status !== 'PASS');
  if (bad.length || missing.length) return { outcome: 'blocked', reason: missing.length ? `not exercised: ${missing.join(', ')}` : 'not every scenario passed', contractDigest, verdicts };
  if (closure?.contractDigest && results.contractDigest && closure.contractDigest !== results.contractDigest) return { outcome: 'blocked', reason: 'closure and boundary results name different contracts', contractDigest, verdicts };
  // Only the canonical disposition closes a phase (the derived closure view mirrors it).
  const closed = closure?.disposition === 'CLOSED';
  return closed
    ? { outcome: 'accepted', reason: 'phase CLOSED with every scenario PASS', contractDigest, verdicts }
    : { outcome: 'pending', reason: 'boundary passed; phase not yet closed', contractDigest, verdicts };
}

/** Work-ahead is promotable only when it names the successor phase's adopted contract. */
export function workAheadContractStatus(state, input = {}) {
  if (!vlbvActive(state)) return { promotable: true };
  const successor = input.successorPhaseId;
  if (!successor) return { promotable: false, reason: 'exploratory: no successor phase named' };
  const { file, contract } = contractFor({ ...state, profile: { ...state.profile, binding: { ...state.profile.binding, contractPath: input.successorContractPath } } }, successor);
  if (!contract) return { promotable: false, reason: `exploratory: successor contract missing (${file})` };
  if (contract.kind !== 'kbd.adopted-contract' || contract.identity?.phaseId !== successor || !Array.isArray(contract.scenarioMatrix) || !contract.scenarioMatrix.length) {
    return { promotable: false, reason: `exploratory: ${file} is not an adopted contract for phase ${successor}` };
  }
  return { promotable: true, successorPhaseId: successor, contractFile: file };
}
