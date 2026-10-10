const startupStages = new Set([
  'governance_preflight', 'primary_listener_bound', 'companion_listener', 'a2a_grpc_listener',
  'skill_service_init', 'provider_registry_seed', 'governance_engine', 'serving_http'
])
const milestones = new Map([
  ['LLM configuration loaded', 'llm_config_loaded'],
  ['Governance policy engine loaded', 'governance_policy_loaded'],
  ['Actor collaboration system initialized', 'actor_system_initialized'],
  ['API key service initialized', 'api_key_service_initialized'],
  ['Compiler service initialized', 'compiler_service_initialized'],
  ['Collaboration package catalog initialized', 'collaboration_catalog_initialized'],
  ['Process-ephemeral full-harness task authority initialized', 'full_harness_initialized'],
  ['A2A state initialized', 'a2a_initialized']
])

/** Only fixed startup labels and counters may cross the IPC failure boundary. */
export class UarStartupDiagnostic {
  private stdoutLines = 0
  private stderrBytes = 0
  private stderrFragment = ''
  private lastMilestone = 'none'
  private readonly stderrCounts = {
    physicalNewlines: 0,
    retainedValidJsonLines: 0,
    retainedMessageStringLines: 0,
    retainedStageStringLines: 0,
    retainedParseFailures: 0,
    fragmentTruncations: 0,
    ansiPresentChunks: 0
  }

  observeLine(line: string): void {
    this.stdoutLines += 1
    this.observeJsonLine(line)
  }

  private observeJsonLine(line: string, fromStderr = false): void {
    try {
      const event = JSON.parse(line)
      if (fromStderr) this.stderrCounts.retainedValidJsonLines += 1
      const fields = event?.fields
      if (!fields || typeof fields !== 'object') return
      if (fromStderr) {
        if (typeof fields.message === 'string') this.stderrCounts.retainedMessageStringLines += 1
        if (typeof fields.stage === 'string') this.stderrCounts.retainedStageStringLines += 1
      }
      if (fields.message === 'UAR startup progress' && startupStages.has(fields.stage)) {
        this.lastMilestone = fields.stage
      } else {
        const milestone = milestones.get(fields.message)
        if (milestone) this.lastMilestone = milestone
      }
    } catch {
      if (fromStderr) this.stderrCounts.retainedParseFailures += 1
    }
  }

  observeStderr(value: string): void {
    this.stderrBytes += Buffer.byteLength(value)
    // Count only chunks containing an actual CSI introducer. An introducer
    // split across chunks is not counted; no plain/ANSI parsing is attempted.
    if (value.includes(String.fromCharCode(27) + '[')) this.stderrCounts.ansiPresentChunks += 1
    const lines = (this.stderrFragment + value).split('\n')
    const fragment = lines.pop()!
    this.stderrCounts.physicalNewlines += lines.length
    if (fragment.length > 16_384) this.stderrCounts.fragmentTruncations += 1
    this.stderrFragment = fragment.slice(-16_384)
    // These parser/schema counts describe retained candidates, which may lack
    // a prefix discarded by the existing fragment cap, not original log lines.
    for (const line of lines) this.observeJsonLine(line, true)
  }

  timeoutSummary(exited: boolean, signaled: boolean): string {
    return JSON.stringify({ stdoutLines: this.stdoutLines, stderrBytes: this.stderrBytes,
      stderr: this.stderrCounts, lastMilestone: this.lastMilestone, exited, signaled })
  }
}
