export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ObjectValue = { [key: string]: Json };
export const harnesses = ['uar', 'codex', 'claude', 'copilot', 'kimi', 'minimax', 'opencode', 'deepseek'] as const;
export type Harness = typeof harnesses[number];
export type Target = Harness | 'bossfang';
export type Tier = 'low' | 'medium' | 'hard';
export interface ModelPolicy {
  model?: string;
  tier?: Tier;
  capabilities?: string[];
  maxInputPerMillion?: number;
  maxOutputPerMillion?: number;
}
export interface Role {
  id: string;
  description: string;
  prompt: string;
  skills: string[];
  owns: string[];
  inputs: string[];
  outputs: string[];
  dependsOn: string[];
  modelPolicy?: ModelPolicy;
  native?: Partial<Record<Target, ObjectValue>>;
}
export const exportCapabilityNames = ["agent-definition","role-model","team-options","agent-plugin","agent-marketplace","static-team-roster","model-policy-resolution"] as const;
export type ExportCapability = typeof exportCapabilityNames[number];
export type AdapterCapabilities = Record<ExportCapability, 'emitted' | 'preserved-only' | 'not-emitted'>;
export interface NativeConfig {
  version: string;
  source: string;
  options?: ObjectValue;
  files?: Record<string, string>;
  requiredCapabilities?: ExportCapability[];
}
export interface Team {
  schemaVersion: 1;
  id: string;
  outcome: string;
  scope: 'project' | 'uar' | 'bossfang';
  harness: Harness;
  roles: Role[];
  modelPolicy?: ModelPolicy;
  skillPolicies?: Record<string, ModelPolicy>;
  native?: Partial<Record<Target, NativeConfig>>;
  /** Opt-in per-harness agent memory. `claude: 'local'` emits `memory: local` and a per-role MEMORY.md. */
  agentMemory?: { claude?: 'local' };
}
export interface KbdIdentity {
  projectId: string;
  runId: string;
  phaseId: string;
  changeId: string;
  taskId: string;
}
export interface TeamTask {
  id: string;
  title: string;
  owner: string;
  harness: Harness;
  status: 'pending' | 'running' | 'blocked' | 'complete' | 'cancelled';
  revision: number;
  dependsOn: string[];
  evidence: string[];
  remaining: string[];
  modelPolicy?: ModelPolicy;
  kbd?: KbdIdentity;
}
export interface Handoff {
  schemaVersion: 1;
  id: string;
  taskId: string;
  taskRevision: number;
  from: { owner: string; harness: Harness };
  to: { owner: string; harness: Harness };
  context: string;
  evidence: string[];
  remaining: string[];
  memoryRefs: string[];
  git: { root: string; head: string | null; branch: string | null; dirty: boolean | null };
  createdAt: string;
  acceptedAt?: string;
  prompt: string;
  provenance?: HandoffProvenance;
}
export interface HandoffFileIdentity {
  path: string;
  observation: 'observed' | 'missing' | 'unknown';
  bytes: number | null;
  sha256: string | null;
}
export interface HandoffCanonicalIdentity {
  path: string;
  identity: KbdIdentity | null;
  observation: 'observed' | 'unknown';
  revision: number | null;
  eventId: string | null;
  taskStatus: string | null;
  receiptSha256: string | null;
  reason: string | null;
}
export interface HandoffMemoryIdentity {
  id: string;
  status: 'queued' | 'published' | null;
  observation: 'observed' | 'unknown';
  projectId: string | null;
  teamId: string;
  scope: string | null;
  contentSha256: string | null;
  provenanceSha256: string | null;
  kbd: KbdIdentity | null;
  publication: {
    outcome: string | null;
    publicationKey: string | null;
    remoteIdSha256: string | null;
    receiptSha256: string;
    uncertain: boolean | null;
  } | null;
}
export interface HandoffProvenance {
  schemaVersion: 1;
  capturedAt: string;
  canonical: HandoffCanonicalIdentity;
  sources: HandoffFileIdentity[];
  evidence: HandoffFileIdentity[];
  karpathy: HandoffFileIdentity[];
  memory: HandoffMemoryIdentity[];
}
export interface MemoryEntry {
  id: string;
  content: string;
  scope: string;
  provenance: ObjectValue;
  status: 'queued' | 'published';
  receipt?: Json;
  /** Optional locally; required for scoped REST publication. Legacy entries remain readable. */
  projectId?: string;
  ts?: string;
  kind?: 'lesson' | 'gotcha' | 'decision' | 'progress' | 'candidate';
  roleId?: string;
  author?: ObjectValue;
}
export interface TeamState {
  schemaVersion: 1;
  revision: number;
  team: Team;
  tasks: TeamTask[];
  handoffs: Handoff[];
  outbox: MemoryEntry[];
  events: { id: string; at: string; kind: string; detail: ObjectValue }[];
}
export interface ExportResult {
  target: Target;
  capabilities: AdapterCapabilities;
  files: Record<string, string>;
  verification: { level: 'source-verified'; source: string; version: string; live: 'unverified' };
  diagnostics: string[];
  instructions: string[];
}
export type UarDefinitionKind = 'AgentDefinition' | 'TeamDefinition' | 'WorkflowDefinition';
export interface UarAuthoringDefinition {
  path: string;
  document: ObjectValue;
}
export interface UarAuthoringPackage {
  manifest: ObjectValue;
  definitions: UarAuthoringDefinition[];
}
export interface UarCompiledPackage {
  manifest: ObjectValue;
  manifestUtf8: string;
  files: { path: string; contentUtf8: string }[];
}
export interface UarConnection {
  baseUrl: string;
  credentialRef?: string;
}
export const UAR_PROFILE_V1 = 'urn:prometheus:uar:collaboration:0.1.0-draft.1' as const;
export const UAR_PROFILE_V2 = 'urn:prometheus:uar:collaboration:0.1.0-draft.2' as const;
export type UarProfile = typeof UAR_PROFILE_V1 | typeof UAR_PROFILE_V2;
export type MigrationDisposition = 'exact' | 'translated' | 'optional-unsupported' | 'required-unsupported';
export interface MigrationDiagnostic {
  sourceDocument: string;
  sourcePointer: string;
  disposition: MigrationDisposition;
  targetDocument?: string;
  targetPointer?: string;
  reason: string;
}
export interface UarMigrationReceipt {
  schemaVersion: 1;
  sourceProfile: string;
  targetProfile: typeof UAR_PROFILE_V2;
  diagnostics: MigrationDiagnostic[];
  activationBlocked: boolean;
  preservedSource?: Json;
}
export interface UarWorkspaceIndex {
  schemaVersion: 1;
  revision: number;
  profile: typeof UAR_PROFILE_V2;
  teamId: string;
  packageId: string;
  packageVersion: string;
  manifest: string;
  definitions: string[];
  migrationReceipt?: string;
  bindingIntent?: 'package-only' | 'package-and-binding';
  base?: { teamId: string; revision: number; packageVersion: string };
  questionState: UarQuestionState;
}
export interface UarQuestionNode {
  id: string;
  document: string;
  pointer: string;
  prompt: string;
  required: boolean;
  state: 'pending' | 'answered';
  answer?: Json;
}
export interface UarQuestionState {
  currentQuestionId: string | null;
  questions: UarQuestionNode[];
}
export interface UarWorkspace {
  root: string;
  index: UarWorkspaceIndex;
  package: UarAuthoringPackage;
  migrationReceipt?: UarMigrationReceipt;
}
export interface UarDiagnosticPage {
  items: MigrationDiagnostic[];
  cursor: string | null;
  remaining: number;
}
export interface UarWorkspaceStatus {
  teamId: string;
  revision: number;
  packageId: string;
  packageVersion: string;
  profile: typeof UAR_PROFILE_V2;
  counts: { agents: number; teams: number; workflows: number; diagnostics: number };
  complete: boolean;
  nextQuestion: { id: string; document: string; pointer: string; question: string } | null;
  questions: { answered: number; pending: number; currentQuestionId: string | null };
  diagnostics: UarDiagnosticPage;
}
