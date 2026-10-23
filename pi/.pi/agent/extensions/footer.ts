// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { usageTotals } from "./lib/session-usage.ts";
import {
	SHELF_STATE,
	SHELF_STATE_REQUEST,
	toggleShelf,
	type ShelfState,
} from "./lib/shelf.ts";
import {
	SHELL_DATA,
	SHELL_DATA_REQUEST,
	contextMeter,
	field,
	formatCount,
	formatMoney,
	keepByRank,
	permission,
	plain,
	rankedRow,
	styledStatus,
	summaryRow,
	terminalTitle,
	type RankedField,
	type ThemeLike,
} from "./lib/shell-layout.ts";

const DISPLAY_ENTRY = "shell-display";

// Statuses the footer places on the telemetry row instead of the plugin list.
// `prefix` adds a dim `<id> ` label unless the text already starts with the id.
const PLACED_STATUSES = {
	limits: { prefix: false },
	cache: { prefix: true },
	agents: { prefix: true },
};

// Lower ranks survive longer as the terminal narrows. The context meter is not
// ranked: it always shows and shrinks from 37 to 22 columns before anything drops.
// Drop order, first to last: cache, out, limits, agents, cost, shelf button.
export const TELEMETRY_RANKS = {
	shelf: 0,
	cost: 1,
	agents: 2,
	limits: 3,
	out: 4,
	cache: 5,
};
const METER = { min: 22, max: 37 };

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
	const known = new Set([
		"model-source",
		"permission-gate",
		"conv-summary",
		"pi-lens-lsp",
		...Object.keys(PLACED_STATUSES),
	]);
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
			if (id === "mcp") body = body.replace(/🔌️?/gu, "↔");
		}
		const color = priority === 0 ? "error" : priority === 1 ? "warning" : "muted";
		// Preserve value styling while making the plugin label quiet.
		result.push({ text: theme.fg("dim", `${name} `) + theme.fg(color, body), priority });
	}
	return result.sort((a, b) => a.priority - b.priority).map(({ text }) => text);
}

export function placedStatus(
	theme: ThemeLike,
	statuses: ReadonlyMap<string, string>,
	id: keyof typeof PLACED_STATUSES,
): string | undefined {
	const raw = statuses.get(id);
	if (!plain(raw)) return undefined;
	const body = styledStatus(raw);
	const labelled = !PLACED_STATUSES[id].prefix || new RegExp(`^${id}\\b`, "i").test(plain(raw));
	return labelled ? body : theme.fg("dim", `${id} `) + body;
}

export function shelfButton(theme: ThemeLike, open: boolean): string {
	return open
		? theme.fg("accent", "shelf ▾")
		: theme.fg("muted", "shelf ") + theme.fg("accent", "▸");
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
			// Unknown until the shelf extension reports; the button hides until then.
			let shelf: ShelfState | undefined;
			let button: { start: number; end: number } | undefined;
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
			const unsubscribeShelf = pi.events.on(SHELF_STATE, (state) => {
				shelf = state as ShelfState | undefined;
				tui.requestRender();
			});
			const unsubscribeBranch = footerData.onBranchChange(() => {
				updateTitle();
				tui.requestRender();
			});
			publish();
			pi.events.emit(SHELF_STATE_REQUEST, undefined);
			updateTitle();
			return {
				dispose() {
					unsubscribeRequest();
					unsubscribeShelf();
					unsubscribeBranch();
					pi.events.emit(SHELL_DATA, undefined);
					refresh = undefined;
					refreshTitle = undefined;
				},
				invalidate() {},
				// Fullscreen mode routes clicks here. The button toggles the shelf;
				// anywhere else on the telemetry row opens it. /shelf and the
				// shortcut are the keyboard path.
				handleMouse(event) {
					if (!shelf || event.type !== "click" || event.button !== "left" || event.y !== 0) return undefined;
					if (button && event.x >= button.start && event.x < button.end) toggleShelf(pi);
					else if (!shelf.open) toggleShelf(pi, true);
					else return undefined;
					return { handled: true };
				},
				render(width: number): string[] {
					if (width <= 0) return [];
					updateTitle();
					const statuses = footerData.getExtensionStatuses();
					const totals = usageTotals(ctx.sessionManager.getBranch());
					const buttonText = shelf ? shelfButton(theme, shelf.open) : undefined;
					const fields: RankedField[] = [
						{ text: placedStatus(theme, statuses, "limits"), rank: TELEMETRY_RANKS.limits },
						{ text: placedStatus(theme, statuses, "cache"), rank: TELEMETRY_RANKS.cache },
						{ text: field(theme, "out", formatCount(totals.output).padStart(5)), rank: TELEMETRY_RANKS.out },
						{ text: field(theme, "cost", formatMoney(totals.cost).padStart(7)), rank: TELEMETRY_RANKS.cost },
						{ text: placedStatus(theme, statuses, "agents"), rank: TELEMETRY_RANKS.agents, side: "right" },
						{ text: buttonText, rank: TELEMETRY_RANKS.shelf, side: "right" },
					];
					const usage = ctx.getContextUsage?.();
					const row = rankedRow(width, {
						...METER,
						render: (meterWidth) => contextMeter(theme, usage, ctx.model?.contextWindow, meterWidth),
					}, fields);
					button = buttonText && row.kept.some((kept) => kept.text === buttonText)
						? { start: width - visibleWidth(buttonText), end: width }
						: undefined;
					const lines = [row.line];
					const summary = plain(statuses.get("conv-summary")) || plain(pi.getSessionName?.());
					lines.push(summaryRow(
						theme,
						summary ? theme.fg("dim", "» ") + theme.fg("text", theme.bold(summary)) : "",
						pluginStatuses(statuses, theme, details),
						width,
					));
					if (details) {
						const rules = permission(statuses.get("permission-gate")).rules;
						const extra = keepByRank([
							field(theme, "in", formatCount(totals.input), "muted"),
							field(theme, "cache read", formatCount(totals.cacheRead), "muted"),
							field(theme, "cache write", formatCount(totals.cacheWrite), "muted"),
							rules ? field(theme, "rules", rules, "muted") : undefined,
						].map((text, rank) => ({ text, rank })), width);
						lines.push(extra.map((kept) => kept.text).join("  "));
					}
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
