import type {
	ContextUsage,
	ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const WRAP_UP_PERCENT = 50;
const STOP_PERCENT = 80;
const MESSAGE_TYPE = "context-planning-advisory";

type PlanningState = "normal" | "wrap-up" | "stop";

function planningState(percent: number): PlanningState {
	if (percent >= STOP_PERCENT) return "stop";
	if (percent >= WRAP_UP_PERCENT) return "wrap-up";
	return "normal";
}

function formatTokens(tokens: number): string {
	return Math.round(tokens).toLocaleString("en-US");
}

function buildAdvisory(usage: ContextUsage | undefined): string {
	if (!usage || usage.tokens === null || usage.percent === null) {
		return `<context-planning-advisory>
Context usage is temporarily unavailable, which commonly happens immediately after compaction. Treat capacity as unknown. Avoid assuming that a large task fits, but do not stop work solely because telemetry is unavailable. This advisory is planning input only and does not authorize compaction, TODO edits, session switching, or subagent execution.
</context-planning-advisory>`;
	}

	const percent = usage.percent;
	const state = planningState(percent);
	const ceilingTokens = usage.contextWindow * (STOP_PERCENT / 100);
	const tokensUntilCeiling = Math.max(0, ceilingTokens - usage.tokens);
	const distanceToCeiling = Math.max(0, STOP_PERCENT - percent);

	let guidance: string;
	if (state === "stop") {
		guidance =
			"The 80% working ceiling has been reached. Do not start new work. Only perform small fixes needed to leave the project coherent, prepare bounded future-agent or future-subagent packets, and record handoff preparation in TODO.md when a handoff is actually prepared.";
	} else if (state === "wrap-up") {
		guidance = `Wrap-up planning is active, with ${distanceToCeiling.toFixed(1)} percentage points before the 80% working ceiling. Prefer finishing the current coherent unit over expanding scope. Recommend wrapping up, divide remaining work into bounded future-agent or future-subagent packets, and give each packet a small, medium, or large estimated context size.`;
	} else {
		guidance =
			"Capacity is below the wrap-up threshold. Work normally, but keep newly discovered future work divisible into focused changes, subsystem clusters, research tasks, or future-subagent packets.";
	}

	return `<context-planning-advisory>
Snapshot captured after the latest user prompt:
- Context: ${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)} tokens (${percent.toFixed(1)}%)
- Planning state: ${state}
- Estimated tokens before the 80% working ceiling: ${formatTokens(tokensUntilCeiling)}

${guidance}

Use this snapshot when deciding scope and tool calls for this agent run. The estimated budget before the ceiling is planning guidance, not guaranteed output capacity. This advisory does not authorize compaction, TODO edits, session switching, or subagent execution.
</context-planning-advisory>`;
}

export default function (pi: ExtensionAPI) {
	let advisory: string | undefined;

	pi.on("session_start", () => {
		advisory = undefined;
	});

	pi.on("before_agent_start", (_event, ctx) => {
		advisory = buildAdvisory(ctx.getContextUsage());
	});

	pi.on("context", (event) => {
		if (!advisory) return;

		return {
			messages: [
				...event.messages,
				{
					role: "custom" as const,
					customType: MESSAGE_TYPE,
					content: advisory,
					display: false,
					timestamp: Date.now(),
				},
			],
		};
	});
}
