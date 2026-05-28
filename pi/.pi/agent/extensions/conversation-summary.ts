/**
 * Conversation Summary Extension
 *
 * After each agent turn, runs a separate `pi` process in print mode to
 * generate a short summary of the conversation. The subprocess handles
 * its own model resolution and API calls, so this extension has no
 * hardcoded vendor logic.
 *
 * The summary shows in the footer and doubles as the session name
 * (visible in the session selector).
 *
 * How it works:
 *   1. turn_end fires after each LLM response
 *   2. We build a short sketch of the conversation (first 300 chars per message)
 *   3. We spawn `pi -p --no-session --model <cheap-model> "summarize this"`
 *      -p = print mode (no TUI, just stdout)
 *      --no-session = don't save to a session file
 *   4. Parse stdout for the summary, update footer + session name
 *   5. Persist via appendEntry so it survives reload
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SUMMARY_ENTRY_TYPE = "conversation-summary";
const SUMMARY_STATUS_KEY = "conv-summary";
const MIN_TURNS_BETWEEN_UPDATES = 2;

// Preferred model for summaries (cheap and fast). Falls back to session model.
const SUMMARY_MODEL = "anthropic/claude-haiku-4-5";

type SessionEntry = {
  type: string;
  customType?: string;
  data?: Record<string, unknown>;
  message?: {
    role?: string;
    content?: unknown;
  };
};

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as any[])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function buildSketch(entries: SessionEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;

    const text = extractText(entry.message?.content).trim();
    if (!text) continue;

    const snippet = text.length > 300 ? `${text.slice(0, 300)}…` : text;
    parts.push(`${role === "user" ? "User" : "Assistant"}: ${snippet}`);
  }
  return parts.join("\n\n");
}

function countAssistantMessages(entries: SessionEntry[]): number {
  return entries.filter((e) => e.type === "message" && e.message?.role === "assistant").length;
}

export default function (pi: ExtensionAPI) {
  let currentSummary: string | undefined;
  let lastSummaryAtTurn = 0;
  let generating = false;

  // --- Restore on session load ---
  pi.on("session_start", (_event, ctx) => {
    currentSummary = undefined;
    lastSummaryAtTurn = 0;

    for (const entry of ctx.sessionManager.getEntries() as SessionEntry[]) {
      if (entry.type === "custom" && entry.customType === SUMMARY_ENTRY_TYPE) {
        const stored = entry.data?.summary;
        if (typeof stored === "string" && stored) {
          currentSummary = stored;
          lastSummaryAtTurn = Number(entry.data?.turnCount ?? 0);
        }
      }
    }

    if (ctx.hasUI) {
      ctx.ui.setStatus(SUMMARY_STATUS_KEY, currentSummary ?? "(awaiting first exchange)");
      if (currentSummary) pi.setSessionName(currentSummary);
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(SUMMARY_STATUS_KEY, undefined);
  });

  // --- Generate summary via subprocess ---
  async function generateSummary(sketch: string, turnCount: number, hasUI: boolean, ui: any) {
    const prompt = [
      "Write a very short summary (8-15 words max) of what this conversation is about.",
      "Focus on the main task or goal. No quotes, no punctuation at the end, no preamble.",
      "Just the summary phrase itself.",
      "",
      "<conversation>",
      sketch,
      "</conversation>",
    ].join("\n");

    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const start = Date.now();
      const base = currentSummary ?? "(generating summary...)";
      if (hasUI) {
        ui.setStatus(SUMMARY_STATUS_KEY, currentSummary ? `${base} ↻` : base);
        timer = setInterval(() => {
          const elapsed = Math.round((Date.now() - start) / 1000);
          ui.setStatus(SUMMARY_STATUS_KEY, currentSummary ? `${base} ↻${elapsed}s` : `(generating summary... ${elapsed}s)`);
        }, 1_000);
      }

      // Spawn a separate pi process in print mode. It handles model
      // resolution, API keys, and the actual LLM call for us.
      const result = await pi.exec("pi", [
        "-p",
        "--no-session",
        "--model", SUMMARY_MODEL,
        prompt,
      ], { timeout: 20_000 });

      if (result.code !== 0) {
        const errDetail = result.stderr.trim().split("\n").pop() || `exit ${result.code}`;
        if (hasUI) ui.setStatus(SUMMARY_STATUS_KEY, `(error: ${errDetail})`);
        generating = false;
        return;
      }

      const summary = result.stdout.trim();
      if (!summary) {
        const errDetail = result.stderr.trim().split("\n").pop() || "no output";
        if (hasUI) ui.setStatus(SUMMARY_STATUS_KEY, `(empty: ${errDetail})`);
        generating = false;
        return;
      }

      currentSummary = summary;
      lastSummaryAtTurn = turnCount;

      pi.appendEntry(SUMMARY_ENTRY_TYPE, { summary, turnCount });
      pi.setSessionName(summary);
      if (hasUI) ui.setStatus(SUMMARY_STATUS_KEY, summary);
    } catch (err) {
      if (hasUI) {
        const msg = err instanceof Error ? err.message : String(err);
        ui.setStatus(SUMMARY_STATUS_KEY, `(error: ${msg})`);
      }
    } finally {
      if (timer) clearInterval(timer);
      generating = false;
    }
  }

  // --- Trigger after each turn ---
  pi.on("turn_end", (_event, ctx) => {
    if (generating) return;

    const branch = ctx.sessionManager.getBranch() as SessionEntry[];
    const turnCount = countAssistantMessages(branch);

    // Throttle: skip if not enough new turns since last summary
    if (currentSummary && turnCount - lastSummaryAtTurn < MIN_TURNS_BETWEEN_UPDATES) return;
    if (turnCount < 1) return;

    const sketch = buildSketch(branch);
    if (!sketch.trim()) return;

    generating = true;
    generateSummary(sketch, turnCount, ctx.hasUI, ctx.ui).catch(() => {
      generating = false;
    });
  });

  // --- Manual control ---
  pi.registerCommand("summary", {
    description: "Show, set, or clear (/summary clear) the conversation summary",
    handler: async (args, ctx) => {
      const text = String(args || "").trim();
      if (text === "clear") {
        currentSummary = undefined;
        lastSummaryAtTurn = 0;
        generating = false;
        pi.setSessionName("");
        ctx.ui.setStatus(SUMMARY_STATUS_KEY, "(awaiting next exchange)");
        ctx.ui.notify("Summary cleared", "info");
      } else if (text) {
        currentSummary = text;
        lastSummaryAtTurn = countAssistantMessages(
          ctx.sessionManager.getBranch() as SessionEntry[],
        );
        pi.appendEntry(SUMMARY_ENTRY_TYPE, { summary: text, turnCount: lastSummaryAtTurn });
        pi.setSessionName(text);
        ctx.ui.setStatus(SUMMARY_STATUS_KEY, text);
        ctx.ui.notify(`Summary: ${text}`, "info");
      } else if (currentSummary) {
        ctx.ui.notify(`Summary: ${currentSummary}`, "info");
      } else {
        ctx.ui.notify("No summary yet", "info");
      }
    },
  });
}
