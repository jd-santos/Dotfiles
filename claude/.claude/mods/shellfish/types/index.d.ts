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
  /** Milliseconds between the previous turn's end and this one's start; null on the first. */
  gapMs: number | null
  /** Share of this turn's input served from the prompt cache, 0 to 100. */
  cacheHit: number | null
  /** Why the cache was mostly rewritten this turn, when it was. */
  cold: ColdCause | null
}

export type ColdCause = 'idle' | 'model' | 'effort' | 'prefix'

export type KeepAlive = { until: number; probes: number }

export type ContextSlice = { name: string; tokens: number; color: string }
export type Breakdown = { slices: ContextSlice[]; maxTokens: number; autoCompactAt: number | null; isAutoCompactEnabled: boolean }

/** A prompt the person sent and when, so its transcript row can carry a timestamped divider. */
export type PromptMark = { text: string; at: number }

export type AgentRow = { id: string; type: string; description: string; status: string; firstSeen: number }

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
      tick: number
      /** When the prompt cache written by the last request expires, in clock ms; null before the first. */
      warmUntil: number | null
      /** Bumped every ten seconds while the cache is warm, so timers redraw. */
      clockTick: number
      /** Keep-alive: re-read the cache entry before it lapses, until `until`; null when off. */
      keepAlive: KeepAlive | null
      /** The person's recent prompts, newest last, for the dividers above them in the transcript. */
      prompts: PromptMark[]
    }
  }
}
