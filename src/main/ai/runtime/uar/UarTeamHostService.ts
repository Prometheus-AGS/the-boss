import { application } from '@application'
import { loggerService } from '@logger'
import { FileSystemServer } from '@main/ai/mcp/servers/filesystem'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { UarTeamInstance } from '@shared/types/uarTeams'

import { uarApprovalLifecycleStore } from './UarApprovalLifecycleStore'
import { createUarAuthorityProvider } from './UarAuthorityProvider'
import { codingReadTools, codingWriteTools } from './uarCodingTeamPackage'
import { scopedRequest } from './UarDurableAdministrationAdapter'
import { createUarHostMcpBridge, type UarHostMcpBridge } from './UarHostMcpBridge'
import { readUarTeamExecution } from './UarTeamExecutionAdapter'
import { resolveTeamHostScope } from './uarTeamHostScope'
import { scopedTeam } from './UarTeamsAdministrationAdapter'

const logger = loggerService.withContext('UarTeamHostService')

@Injectable('UarTeamHostService')
@ServicePhase(Phase.WhenReady)
export class UarTeamHostService extends BaseService {
  private readonly bridges = new Map<
    string,
    { generation: number; bindingRevision: number; bridge: UarHostMcpBridge }
  >()
  private readonly attaching = new Map<string, Promise<UarHostMcpBridge>>()

  ensure(team: UarTeamInstance, generation: number): Promise<UarHostMcpBridge> {
    const key = team.workspaceId + ':' + team.id
    const pending = this.attaching.get(key)
    if (pending) return pending
    const attaching = this.attach(team, generation).finally(() => this.attaching.delete(key))
    this.attaching.set(key, attaching)
    return attaching
  }

  bridge(team: UarTeamInstance, generation: number): UarHostMcpBridge | undefined {
    const saved = this.bridges.get(team.workspaceId + ':' + team.id)
    return saved?.generation === generation && saved.bindingRevision === team.binding.revision
      ? saved.bridge
      : undefined
  }

  private async attach(team: UarTeamInstance, generation: number): Promise<UarHostMcpBridge> {
    const { directory, memberTools } = await resolveTeamHostScope(team, generation)
    const key = team.workspaceId + ':' + team.id
    const saved = this.bridges.get(key)
    if (saved?.generation === generation && saved.bindingRevision === team.binding.revision) return saved.bridge
    if (saved) {
      await saved.bridge.close()
      this.bridges.delete(key)
    }
    const bridge = await createUarHostMcpBridge(
      { filesystem: { name: 'filesystem', instance: new FileSystemServer(directory).server } },
      {
        sessionId: 'team:' + team.id,
        ownerId: team.ownerId,
        principalId: team.definition.id,
        workspace: directory,
        authorityProvider: await createUarAuthorityProvider(),
        persistLifecycle: (snapshot) => uarApprovalLifecycleStore.persist(snapshot),
        disposition: (toolName) =>
          codingReadTools.includes(toolName) ? 'auto' : codingWriteTools.includes(toolName) ? 'ask' : 'deny',
        verifyTeamInvocation: async (invocation) => {
          if (generation !== (await application.get('UarSidecarService').resolveSelected()).generation) return false
          const execution = await readUarTeamExecution({ workspaceId: team.workspaceId, teamInstanceId: team.id })
          const attempt = execution.attempts.find((record) => record.runId === invocation.executingRunId)
          const current = scopedTeam(
            await scopedRequest(
              team.workspaceId,
              '/api/v1/collaboration/team-instances/' + encodeURIComponent(team.id),
              generation
            ),
            team.workspaceId
          )
          const member = attempt && current.members.find((record) => record.id === attempt.memberId)
          if (
            !attempt ||
            !member ||
            ['revoked', 'stopped'].includes(member.status) ||
            member.revision !== attempt.memberRevision ||
            attempt.status !== 'running' ||
            attempt.bindingRevision !== team.binding.revision ||
            invocation.rootRunId !== attempt.runId ||
            invocation.principalId !== member.definition.id ||
            invocation.ownerId !== team.ownerId ||
            invocation.workspace !== directory
          )
            return false
          return memberTools.get(member.role)?.includes(invocation.providerToolName) === true
        }
      },
      (error) => logger.warn('Team host request failed', { error })
    )
    try {
      await scopedRequest(
        team.workspaceId,
        '/api/v1/collaboration/team-instances/' + encodeURIComponent(team.id) + '/host-context',
        generation,
        'POST',
        {
          expected_binding_revision: team.binding.revision,
          working_directory: directory,
          mcp_servers: bridge.servers,
          tool_admission: bridge.toolAdmission
        }
      )
      this.bridges.set(key, { generation, bindingRevision: team.binding.revision, bridge })
      return bridge
    } catch (error) {
      await bridge.close()
      throw error
    }
  }

  protected async onStop(): Promise<void> {
    await Promise.allSettled(this.attaching.values())
    await Promise.allSettled([...this.bridges.values()].map(({ bridge }) => bridge.close()))
    this.bridges.clear()
  }
}
