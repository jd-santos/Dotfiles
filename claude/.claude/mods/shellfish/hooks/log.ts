import type { SessionRateLimit } from 'claude-code'

import type { Receipt, Totals } from '../types'

// The usage log's row shapes. register.tsx writes them: the validator follows $ only into
// functions declared in the same file, so anything that touches $ lives there.
// ~/.claude/shellfish/usage.jsonl gets one row per main-loop turn, appended.
// ~/.claude/shellfish/sessions/<session id>.json is that session's running total, rewritten.
// Costs are Claude Code's own figures at API list prices, so they are an estimate of
// what the session would cost on the API, not what a subscription bills.

export type SessionRecord = {
  session: string
  cwd: string
  startedAt: string
  updatedAt: string
  turns: number
  models: string[]
  totals: Totals
  costUsd: number
  rateLimits: readonly SessionRateLimit[]
}

export function turnRow(session: string, cwd: string, receipt: Receipt, sessionCostUsd: number) {
  return {
    type: 'turn',
    at: new Date(receipt.at).toISOString(),
    session,
    cwd,
    model: receipt.model,
    effort: receipt.effort,
    durationMs: receipt.durationMs,
    tokens: {
      input: receipt.input,
      output: receipt.output,
      cacheRead: receipt.cacheRead,
      cacheWrite: receipt.cacheWrite,
    },
    costUsd: Number(receipt.costUsd.toFixed(6)),
    sessionCostUsd: Number(sessionCostUsd.toFixed(6)),
    contextPercent: receipt.contextPercent,
    cacheHit: receipt.cacheHit,
    gapMs: receipt.gapMs,
    cold: receipt.cold,
  }
}
