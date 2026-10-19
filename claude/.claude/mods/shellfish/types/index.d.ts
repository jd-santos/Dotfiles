export type Speed = { rate: number | null; isLive: boolean }
export type Totals = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Summary = { text: string; isManual: boolean } | null

/** One finished main-loop turn: what the turn-duration line, the shelf and the log show. */
export type Receipt = {
  at: number
  durationMs: number
  model: string
  effort: string | null
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
  contextPercent: number | null
  rate: number | null
}

export type ContextSlice = { name: string; tokens: number; color: string }
export type Breakdown = { slices: ContextSlice[]; autoCompactAt: number | null; isAutoCompactEnabled: boolean }

export type AgentRow = { id: string; type: string; description: string; status: string; firstSeen: number }

/** Which band field's card is pinned open by a click. */
export type Card = 'context' | 'tokens' | 'cost' | null

declare module 'claude-code' {
  interface PluginState {
    shellfish: {
      cwd: string | null
      home: string | null
      branch: string | null
      mode: string | null
      model: string | null
      effort: string | null
      speed: Speed
      totals: Totals
      summary: Summary
      receipts: Receipt[]
      breakdown: Breakdown | null
      agents: AgentRow[]
      card: Card
      tick: number
    }
  }
}
