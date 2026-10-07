import { useEffect, useRef, useState } from 'react'

import { ipcApi } from '@renderer/ipc'
import type { UarTeamExecutionAttempt } from '@shared/types/uarTeams'

export interface UarTeamLiveOutput {
  runId: string
  cursor: number
  text: string
  gap: boolean
  disconnected: boolean
  done: boolean
}

export function useUarTeamLiveOutput(
  workspaceId: string,
  teamInstanceId: string,
  attempts: UarTeamExecutionAttempt[],
  available: boolean
) {
  const attemptsRef = useRef(attempts)
  const [outputs, setOutputs] = useState<Record<string, UarTeamLiveOutput>>({})

  useEffect(() => {
    attemptsRef.current = attempts
  }, [attempts])

  useEffect(() => {
    const captured: Record<string, UarTeamLiveOutput> = {}
    let disposed = false
    let reading = false
    setOutputs({})
    if (!available) return

    const read = async () => {
      if (reading || disposed) return
      reading = true
      try {
        for (const attempt of attemptsRef.current) {
          if (disposed) break
          if (attempt.workspaceId !== workspaceId || attempt.teamId !== teamInstanceId) continue
          const previous = captured[attempt.id]?.runId === attempt.runId ? captured[attempt.id] : undefined
          const active = ['running', 'cancellation_requested'].includes(attempt.status)
          if (attempt.status === 'queued' || previous?.done || (!active && !previous)) continue
          if (!active && attempt.output != null) continue
          const current =
            previous?.runId === attempt.runId
              ? previous
              : {
                  runId: attempt.runId,
                  cursor: 0,
                  text: '',
                  gap: false,
                  disconnected: false,
                  done: false
                }
          try {
            const page = await ipcApi.request('prometheus.uar.teams.events', {
              workspaceId,
              teamInstanceId,
              attemptId: attempt.id,
              after: current.cursor
            })
            if (disposed) break
            if (
              page.attemptId !== attempt.id ||
              page.teamInstanceId !== teamInstanceId ||
              page.runId !== attempt.runId
            ) {
              throw new Error('TEAM_SCOPE_DENIED')
            }
            let text = page.gapReason ? '' : current.text
            let done = false
            for (const event of page.events) {
              if (!event.data || typeof event.data !== 'object') continue
              const data = event.data as Record<string, unknown>
              if (data.request_id !== attempt.runId) continue
              if (event.eventName === 'agui.message.delta' && data.delta && typeof data.delta === 'object') {
                const delta = data.delta as Record<string, unknown>
                if (typeof delta.text === 'string') text += delta.text
              }
              if (event.eventName === 'agui.done' || event.eventName === 'agui.cancelled') done = true
            }
            captured[attempt.id] = {
              runId: attempt.runId,
              cursor: page.gapReason === 'cursor-ahead' ? 0 : page.cursor,
              text,
              gap: current.gap || page.gapReason !== null,
              disconnected: false,
              done: page.gapReason !== 'cursor-ahead' && (done || !active)
            }
          } catch {
            if (disposed) break
            captured[attempt.id] = { ...current, disconnected: true, done: !active }
          }
          setOutputs({ ...captured })
        }
      } finally {
        reading = false
      }
    }

    void read()
    const timer = window.setInterval(() => void read(), 3000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [workspaceId, teamInstanceId, available])

  return outputs
}
