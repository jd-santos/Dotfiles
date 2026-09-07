// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	SHELL_DATA,
	SHELL_DATA_REQUEST,
	contextMeter,
	field,
	formatCount,
	formatMoney,
	packRows,
	permission,
	plain,
	styledStatus,
	terminalTitle,
	type ThemeLike,
} from "./lib/shell-layout.ts";

const DISPLAY_ENTRY = "shell-display";

function getUsageTotals(ctx: any) {
	const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
		const usage = entry.message.usage;
		if (!usage) continue;
		totals.input += Number(usage.input ?? 0);
		totals.output += Number(usage.output ?? 0);
		totals.cacheRead += Number(usage.cacheRead ?? usage.cachedInput ?? usage.cached_input_tokens ?? 0);
		totals.cacheWrite += Number(usage.cacheWrite ?? usage.cache_write_input_tokens ?? 0);
		totals.cost += Number(typeof usage.cost === "number" ? usage.cost : usage.cost?.total ?? 0);
	}
	return totals;
}

function speed(theme: ThemeLike, status?: string): string {
	const text = plain(status);
	const rate = text.match(/(~?[\d,.]+)\s*(?:tok|tokens|t)\/s/i)?.[1];
	const active = text && !/^done:/i.test(text);
	return field(theme, "t/s", (rate ?? (active ? "…" : "—")).padStart(5), active ? "text" : "dim");
}

function statusPriority(theme: ThemeLike, text: string): number {
	const hasColor = (color: string) => {
		const prefix = theme.fg(color, "probe").split("probe")[0];
		return prefix && text.includes(prefix);
	};
	if (hasColor("error") || /\b(error|failed|failure|inactive|disconnected)\b/i.test(plain(text))) return 0;
	if (hasColor("warning") || /\b(warning|connecting|unavailable)\b/i.test(plain(text))) return 1;
	return 2;
}

export function pluginStatuses(statuses: ReadonlyMap<string, string>, theme: ThemeLike, details: boolean): string[] {
	const known = new Set(["model-source", "tps", "permission-gate", "conv-summary"]);
	const result: Array<{ text: string; priority: number }> = [];
	for (const [id, raw] of statuses) {
		if (known.has(id) || !plain(raw)) continue;
		const priority = statusPriority(theme, raw);
		if (priority === 2 && id === "usage" && !details && /\b[\d,]+ records\b/i.test(plain(raw))) continue;
		// Cached MCP tool definitions are not connection health. Use live status only.
		if (priority === 2 && id === "mcp" && !details && /MCP:\s*(\d+)\/\1\b/i.test(plain(raw))) continue;
		let name = id.replace(/^pi-/, "").replace(/-/g, " ");
		let body = styledStatus(raw);
		if (id === "pi-lens-lsp") {
			name = "lsp";
			body = body.replace(/LSP\s+(Active|Inactive)/i, (_, state) => state.toLowerCase());
		} else if (id === "usage" || id === "mcp") {
			body = body.replace(new RegExp(`${id}:\\s*`, "i"), "");
		}
		const color = priority === 0 ? "error" : priority === 1 ? "warning" : "muted";
		// Preserve value styling while making the plugin label quiet.
		result.push({ text: theme.fg("dim", `${name} `) + theme.fg(color, body), priority });
	}
	return result.sort((a, b) => a.priority - b.priority).map(({ text }) => text);
}

export default function (pi: ExtensionAPI) {
	let details = false;
	let refresh: (() => void) | undefined;
	let refreshTitle: (() => void) | undefined;

	pi.registerCommand("shell", {
		description: "Toggle shell telemetry, or choose compact / details",
		handler: async (args, ctx) => {
			const mode = args.trim();
			if (mode && mode !== "compact" && mode !== "details") {
				ctx.ui.notify("Usage: /shell [compact|details]", "info");
				return;
			}
			details = mode ? mode === "details" : !details;
			pi.appendEntry(DISPLAY_ENTRY, { details });
			refresh?.();
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		details = false;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === DISPLAY_ENTRY) details = entry.data?.details === true;
		}
		ctx.ui.setFooter((tui, theme, footerData) => {
			refresh = () => tui.requestRender();
			let previousTitle = "";
			const updateTitle = (force = false) => {
				const title = terminalTitle(ctx.cwd, footerData.getGitBranch());
				if (force || title !== previousTitle) {
					ctx.ui.setTitle(title);
					previousTitle = title;
				}
			};
			refreshTitle = () => updateTitle(true);
			const publish = () => pi.events.emit(SHELL_DATA, footerData);
			const unsubscribeRequest = pi.events.on(SHELL_DATA_REQUEST, publish);
			const unsubscribeBranch = footerData.onBranchChange(() => {
				updateTitle();
				tui.requestRender();
			});
			publish();
			updateTitle();
			return {
				dispose() {
					unsubscribeRequest();
					unsubscribeBranch();
					pi.events.emit(SHELL_DATA, undefined);
					refresh = undefined;
					refreshTitle = undefined;
				},
				invalidate() {},
				render(width: number): string[] {
					if (width <= 0) return [];
					updateTitle();
					const statuses = footerData.getExtensionStatuses();
					const totals = getUsageTotals(ctx);
					const cost = field(theme, "cost", formatMoney(totals.cost).padStart(8));
					const fitsCost = width >= 48;
					const meterWidth = fitsCost ? width - visibleWidth(cost) - 2 : width;
					const meter = contextMeter(theme, ctx.getContextUsage?.(), ctx.model?.contextWindow, meterWidth);
					const contextLine = fitsCost ? meter + " ".repeat(width - visibleWidth(meter) - visibleWidth(cost)) + cost : meter;
					const lines = [contextLine];
					lines.push(...packRows([
						!fitsCost ? cost : undefined,
						field(theme, "out", formatCount(totals.output).padStart(5)),
						speed(theme, statuses.get("tps")),
						...pluginStatuses(statuses, theme, details),
					], width));
					if (details) {
						const rules = permission(statuses.get("permission-gate")).rules;
						lines.push(...packRows([
							field(theme, "in", formatCount(totals.input), "muted"),
							field(theme, "cache read", formatCount(totals.cacheRead), "muted"),
							field(theme, "cache write", formatCount(totals.cacheWrite), "muted"),
							rules ? field(theme, "rules", rules, "muted") : undefined,
						], width));
					}
					const summary = plain(statuses.get("conv-summary")) || plain(pi.getSessionName?.());
					if (summary) lines.push(...packRows([
						theme.fg("dim", "» ") + theme.fg("text", theme.bold(summary)),
					], width));
					return lines;
				},
			};
		});
	});

	pi.on("session_info_changed", () => refreshTitle?.());
	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setFooter(undefined);
	});
}
