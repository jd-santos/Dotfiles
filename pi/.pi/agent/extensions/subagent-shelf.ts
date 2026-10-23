// @ts-nocheck

/**
 * Agents section for the shelf drawer.
 *
 * Lists the subagents running in this session (glyph, agent, task, tokens,
 * elapsed) and a one-line summary of the ones that finished, with their cost.
 * All data comes from the versioned in-process RPC that pi-subagents
 * documents in docs/extension-api.md ("In-process event-bus RPC"):
 *
 * - `status` with no target returns `data.fleet` (fleet status DTO v1): the
 *   active children with agent, model, startedAt, and tokens. It is served
 *   from memory, so it is polled once a second, but only while work runs.
 * - `cost` returns the `/subagent-cost` report as data. It walks the session
 *   branch and run artifacts, so it is requested at boundaries only: session
 *   start, the end of a subagent tool call, an async completion, and
 *   `agent_settled`.
 *
 * The fleet DTO carries no task text and hides run ids, so the task shown on a
 * row is taken from the `subagent` tool call's own `agent`/`task` arguments
 * and matched to new fleet entries by agent name, oldest first. Workflow
 * scripts have no plain task to show.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatCount, formatMoney, plain } from "./lib/shell-layout.ts";
import { refreshShelf, registerShelfSection } from "./lib/shelf.ts";

export const RPC_REQUEST = "subagents:rpc:v1:request";
export const RPC_READY = "subagents:rpc:v1:ready";
export const RPC_REPLY_PREFIX = "subagents:rpc:v1:reply:";
export const ASYNC_STARTED = "subagent:async-started";
export const ASYNC_COMPLETE = "subagent:async-complete";
export const CHILD_STATUS = "subagent:child-status";

export const STATUS_KEY = "agents";
export const POLL_MS = 1_000;
export const RPC_TIMEOUT_MS = 3_000;
const MAX_ROWS = 6;
const TASK_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_TASKS = 32;
const GLYPH = "●";

export interface AgentRow {
	key: string;
	agent: string;
	task?: string;
	model?: string;
	startedAt: number;
	tokens: number;
}

export function formatElapsed(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function oneLine(text: unknown): string {
	return typeof text === "string" ? plain(text).replace(/\s+/g, " ") : "";
}

function shortModel(model?: string): string {
	return model ? model.split("/").at(-1) ?? model : "";
}

/** `{agent, task}` pairs named directly in a `subagent` tool call. */
export function tasksFromArgs(args: any): Array<{ agent: string; task: string }> {
	if (!args || typeof args !== "object" || args.action) return [];
	const found: Array<{ agent: string; task: string }> = [];
	const visit = (item: any) => {
		if (!item || typeof item !== "object") return;
		if (typeof item.agent === "string" && typeof item.task === "string" && item.task.trim()) {
			found.push({ agent: item.agent, task: oneLine(item.task) });
		}
		for (const list of [item.tasks, item.chain, item.parallel]) {
			if (Array.isArray(list)) list.forEach(visit);
		}
	};
	visit(args);
	return found;
}

/** One running agent: glyph, agent, task, tokens, elapsed, within `width` columns. */
export function renderRow(theme, row: AgentRow, now: number, width: number): string {
	if (width <= 0) return "";
	const elapsed = formatElapsed(now - row.startedAt);
	const tokens = width >= 60 && row.tokens > 0 ? `${formatCount(row.tokens)} tok` : "";
	const tail = [tokens, elapsed].filter(Boolean).join("  ");
	const agentWidth = Math.min(visibleWidth(row.agent), 14);
	const fixed = 2 + agentWidth + 2 + visibleWidth(tail);
	const left = `${theme.fg("accent", GLYPH)} ${theme.fg("text", truncateToWidth(row.agent, agentWidth, "…"))}`;
	const detail = row.task || shortModel(row.model);
	const room = width - fixed - 2;
	let line = left;
	if (detail && room >= 6) {
		const text = truncateToWidth(detail, room, "…");
		line += `  ${theme.fg(row.task ? "muted" : "dim", text)}`;
	}
	const gap = width - visibleWidth(line) - visibleWidth(tail);
	if (gap >= 2) line += " ".repeat(gap) + theme.fg("dim", tail);
	return truncateToWidth(line, width, "");
}

export default function (pi: ExtensionAPI) {
	let ctx: any;
	let live = false;
	let available: boolean | undefined;
	let rows: AgentRow[] = [];
	let omitted = 0;
	let finishedLocal = 0;
	let cost: any;
	let timer: ReturnType<typeof setInterval> | undefined;
	let statusInFlight = false;
	let costInFlight = false;
	let costAgain = false;
	let lastStatus = "";
	const inFlightCalls = new Set<string>();
	const knownKeys = new Map<string, AgentRow>();
	let pendingTasks: Array<{ agent: string; task: string; at: number }> = [];
	const cleanups: Array<() => void> = [];
	const replyWaits = new Set<() => void>();

	const listen = (name: string, callback: (value: any) => void) => {
		const off = pi.events.on(name, callback);
		cleanups.push(() => off?.());
	};

	const rpc = (method: string, params?: any): Promise<any> =>
		new Promise((resolve) => {
			const requestId = `subagent-shelf-${method}-${globalThis.crypto.randomUUID()}`;
			let off: (() => void) | undefined;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const finish = (reply?: any) => {
				off?.();
				off = undefined;
				if (timeout) clearTimeout(timeout);
				replyWaits.delete(cancel);
				resolve(reply);
			};
			const cancel = () => finish(undefined);
			replyWaits.add(cancel);
			off = pi.events.on(`${RPC_REPLY_PREFIX}${requestId}`, (reply) => finish(reply));
			timeout = setTimeout(cancel, RPC_TIMEOUT_MS);
			timeout.unref?.();
			pi.events.emit(RPC_REQUEST, { version: 1, requestId, method, ...(params ? { params } : {}), source: { extension: "subagent-shelf" } });
		});

	const publishStatus = () => {
		const text = rows.length || omitted ? `${GLYPH} ${rows.length + omitted}` : "";
		if (text === lastStatus || !ctx?.hasUI) return;
		lastStatus = text;
		ctx.ui.setStatus(STATUS_KEY, text || undefined);
	};

	const refresh = () => {
		publishStatus();
		refreshShelf(pi);
	};

	const stopTimer = () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	};

	const requestCost = async () => {
		if (!live) return;
		if (costInFlight) {
			costAgain = true;
			return;
		}
		costInFlight = true;
		const reply = await rpc("cost");
		costInFlight = false;
		if (!live) return;
		if (reply?.success && reply.data?.version === 1) {
			available = true;
			cost = reply.data;
			refreshShelf(pi);
		}
		if (costAgain) {
			costAgain = false;
			void requestCost();
		}
	};

	const applyFleet = (fleet: any) => {
		const now = Date.now();
		pendingTasks = pendingTasks.filter((item) => now - item.at < TASK_TTL_MS);
		const next: AgentRow[] = [];
		for (const entry of fleet.entries ?? []) {
			if (typeof entry?.key !== "string" || typeof entry.agent !== "string") continue;
			let row = knownKeys.get(entry.key);
			if (!row) {
				const index = pendingTasks.findIndex((item) => item.agent === entry.agent);
				const task = oneLine(entry.goal) || (index >= 0 ? pendingTasks.splice(index, 1)[0].task : undefined);
				row = { key: entry.key, agent: oneLine(entry.agent), task, startedAt: now, tokens: 0 };
			}
			row.model = typeof entry.model === "string" ? entry.model : row.model;
			row.startedAt = Number.isFinite(entry.startedAt) ? entry.startedAt : row.startedAt;
			row.tokens = Number(entry.tokens?.total) || 0;
			next.push(row);
		}
		const seen = new Set(next.map((row) => row.key));
		let finished = 0;
		for (const key of knownKeys.keys()) {
			if (!seen.has(key)) {
				knownKeys.delete(key);
				finished++;
			}
		}
		for (const row of next) knownKeys.set(row.key, row);
		finishedLocal += finished;
		rows = next;
		omitted = Math.max(0, (Number(fleet.totalActive) || 0) - next.length);
		if (finished) void requestCost();
	};

	const poll = async () => {
		if (!live || statusInFlight) return;
		statusInFlight = true;
		const reply = await rpc("status");
		statusInFlight = false;
		if (!live) return;
		if (reply?.success && reply.data?.fleet?.version === 1) {
			available = true;
			applyFleet(reply.data.fleet);
		} else if (!reply) {
			available ??= false;
		}
		if (!rows.length && !omitted && inFlightCalls.size === 0) stopTimer();
		refresh();
	};

	const wake = () => {
		if (!live) return;
		if (!timer) {
			timer = setInterval(() => void poll(), POLL_MS);
			timer.unref?.();
		}
		void poll();
	};

	const headline = (theme) => {
		const count = rows.length + omitted;
		if (count) return theme.fg("accent", `${GLYPH} ${count} running`);
		if (available === false) return theme.fg("dim", "unavailable");
		return theme.fg("dim", "none");
	};

	const render = (width: number, theme) => {
		if (width <= 0) return [];
		const now = Date.now();
		const lines: string[] = [];
		const shown = rows.slice(0, MAX_ROWS);
		for (const row of shown) lines.push(renderRow(theme, row, now, width));
		const hidden = rows.length - shown.length + omitted;
		if (hidden > 0) lines.push(theme.fg("dim", truncateToWidth(`  +${hidden} more`, width, "")));
		const count = cost ? cost.children?.length ?? 0 : finishedLocal;
		if (count > 0) {
			const parts = [`finished ${count}`];
			if (cost) {
				const lowerBound = cost.unresolvedAsyncChildren > 0 ? "≥" : "";
				parts.push(`${lowerBound}${formatMoney(cost.childTotal?.cost ?? 0)}`);
				const tokens = (cost.childTotal?.input ?? 0) + (cost.childTotal?.output ?? 0);
				if (tokens > 0) parts.push(`${formatCount(tokens)} tok`);
			}
			lines.push(theme.fg("dim", truncateToWidth(parts.join(" · "), width, "…")));
		}
		if (!lines.length) {
			const text = available === false ? "pi-subagents is not responding" : "No subagents this session";
			lines.push(theme.fg("dim", truncateToWidth(text, width, "…")));
		}
		return lines;
	};

	pi.on("session_start", (_event, nextCtx) => {
		ctx = nextCtx;
		live = true;
		cleanups.push(registerShelfSection(pi, { id: "agents", title: "Agents", order: 10, headline, render }));
		listen(RPC_READY, () => {
			wake();
			void requestCost();
		});
		listen(ASYNC_STARTED, wake);
		listen(CHILD_STATUS, wake);
		listen(ASYNC_COMPLETE, () => {
			wake();
			void requestCost();
		});
		// Pick up async runs that survived a reload or resume.
		wake();
		void requestCost();
	});

	pi.on("tool_execution_start", (event) => {
		if (!live || event.toolName !== "subagent") return;
		const now = Date.now();
		for (const item of tasksFromArgs(event.args)) pendingTasks.push({ ...item, at: now });
		pendingTasks = pendingTasks.slice(-MAX_PENDING_TASKS);
		inFlightCalls.add(event.toolCallId);
		wake();
	});

	pi.on("tool_execution_end", (event) => {
		if (!live || event.toolName !== "subagent") return;
		inFlightCalls.delete(event.toolCallId);
		void poll();
		void requestCost();
	});

	pi.on("agent_settled", () => {
		if (!live) return;
		void requestCost();
	});

	pi.on("session_shutdown", () => {
		live = false;
		stopTimer();
		for (const cancel of [...replyWaits]) cancel();
		for (const cleanup of cleanups.splice(0)) cleanup();
		if (lastStatus && ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		lastStatus = "";
		rows = [];
		omitted = 0;
		finishedLocal = 0;
		cost = undefined;
		available = undefined;
		statusInFlight = false;
		costInFlight = false;
		costAgain = false;
		inFlightCalls.clear();
		knownKeys.clear();
		pendingTasks = [];
		ctx = undefined;
	});
}
