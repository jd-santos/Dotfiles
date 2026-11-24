// @ts-nocheck

/**
 * The shelf: a drawer below the editor that holds session sections.
 *
 * Closed by default. `/shelf`, the shortcut, and the footer's `shelf ▸` button
 * open and close it; the choice is stored as a `shelf-display` custom session
 * entry and restored on reload or resume. Sections arrive through the contract
 * in lib/shelf.ts, so any extension can add one. This file also contributes the
 * built-in Last turn, Context, and Usage sections through the same contract.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { ShelfDetail, drawerLayout, shelfHeight, type ShelfHit } from "./lib/shelf-view.ts";
export { renderDrawer, sectionHeading, shelfHeight } from "./lib/shelf-view.ts";
import { COMPACT_AT_PERCENT } from "./lib/compaction.ts";
import {
	latestAssistantModel,
	latestCustomData,
	toolCallCounts,
	usageTotals,
} from "./lib/session-usage.ts";
import {
	SHELF_REFRESH,
	SHELF_SECTION,
	SHELF_SECTION_REQUEST,
	SHELF_STATE,
	SHELF_STATE_REQUEST,
	SHELF_TOGGLE,
	refreshShelf,
	registerShelfSection,
	type ShelfSection,
	type ShelfSectionMessage,
} from "./lib/shelf.ts";
import {
	contextMeter,
	field,
	formatCount,
	formatMoney,
	packRows,
} from "./lib/shell-layout.ts";
import { TURN_ENTRY, formatElapsed, type TurnReceipt } from "./tps-tracker.ts";

const DISPLAY_ENTRY = "shelf-display";
const WIDGET_KEY = "shelf";
export const SHELF_SHORTCUT = "alt+s";

function percentColor(percent: number): string {
	return percent >= 80 ? "error" : percent >= 50 ? "warning" : "syntaxOperator";
}

function compactModel(model: string | undefined): string | undefined {
	return model?.split("/").at(-1);
}

function builtInSections(pi: ExtensionAPI, getCtx: () => any): ShelfSection[] {
	const branch = () => getCtx()?.sessionManager?.getBranch?.() ?? [];
	return [
		{
			id: "last-turn",
			title: "Last turn",
			order: 20,
			headline(theme) {
				const receipt = latestCustomData<TurnReceipt>(branch(), TURN_ENTRY);
				return receipt ? theme.fg("text", formatElapsed(receipt.elapsedMs)) : undefined;
			},
			render(width, theme) {
				const entries = branch();
				const receipt = latestCustomData<TurnReceipt>(entries, TURN_ENTRY);
				if (!receipt) return [truncateToWidth(theme.fg("dim", "No finished turn yet"), width, "…")];
				const model = compactModel(latestAssistantModel(entries));
				return packRows([
					model ? field(theme, "model", model) : undefined,
					field(theme, "out", formatCount(receipt.output)),
					receipt.tps > 0 ? field(theme, "speed", `${receipt.tps} t/s`) : undefined,
					field(theme, "cost", formatMoney(receipt.cost)),
					Number.isFinite(receipt.contextPercent)
						? field(theme, "ctx", `${Math.round(receipt.contextPercent!)}%`, percentColor(receipt.contextPercent!))
						: undefined,
				], width);
			},
		},
		{
			id: "context",
			title: "Context",
			order: 30,
			headline(theme) {
				const percent = getCtx()?.getContextUsage?.()?.percent;
				return Number.isFinite(percent)
					? theme.fg(percentColor(percent), `${Math.round(percent)}%`)
					: theme.fg("dim", "unknown");
			},
			render(width, theme) {
				const ctx = getCtx();
				const usage = ctx?.getContextUsage?.();
				const window = usage?.contextWindow ?? ctx?.model?.contextWindow;
				const lines = [contextMeter(theme, usage, ctx?.model?.contextWindow, width)];
				const tokens = Number.isFinite(usage?.tokens) ? usage.tokens : undefined;
				const compactAt = window ? Math.round((window * COMPACT_AT_PERCENT) / 100) : undefined;
				lines.push(...packRows([
					tokens !== undefined ? field(theme, "used", formatCount(tokens)) : undefined,
					window ? field(theme, "window", formatCount(window), "muted") : undefined,
					compactAt
						? field(theme, "compacts at", `${COMPACT_AT_PERCENT}% (${formatCount(compactAt)})`, "muted")
						: undefined,
					compactAt && tokens !== undefined
						? field(theme, "room", tokens < compactAt ? formatCount(compactAt - tokens) : "due", "muted")
						: undefined,
				], width));
				return lines;
			},
		},
		{
			id: "usage",
			title: "Usage",
			order: 50,
			headline(theme) {
				return theme.fg("text", formatMoney(usageTotals(branch()).cost));
			},
			render(width, theme) {
				const entries = branch();
				const totals = usageTotals(entries);
				const lines = packRows([
					field(theme, "in", formatCount(totals.input)),
					field(theme, "out", formatCount(totals.output)),
					field(theme, "cache read", formatCount(totals.cacheRead)),
					field(theme, "cache write", formatCount(totals.cacheWrite)),
					field(theme, "cost", formatMoney(totals.cost)),
				], width);
				const tools = toolCallCounts(entries);
				if (tools.length) {
					lines.push(...packRows([
						theme.fg("dim", "tools"),
						...tools.map(([name, count]) => `${theme.fg("muted", name)} ${theme.fg("text", String(count))}`),
					], width));
				} else {
					lines.push(truncateToWidth(theme.fg("dim", "No tool calls yet"), width, "…"));
				}
				return lines;
			},
		},
	];
}

export default function (pi: ExtensionAPI) {
	let open = false;
	let ctx: any;
	let tui: { requestRender(): void; terminal?: { rows?: number } } | undefined;
	const sections = new Map<string, ShelfSection>();
	let cleanups: Array<() => void> = [];
	let detail: ShelfDetail | undefined;
	let detailTui: { requestRender(): void } | undefined;
	let detailDone: (() => void) | undefined;
	let detailPending = false;

	const publishState = () => pi.events.emit(SHELF_STATE, { open });
	const redraw = () => { tui?.requestRender(); detailTui?.requestRender(); };
	const showDetails = async (id?: string) => {
		if (!ctx || ctx.mode !== "tui") {
			ctx?.ui.notify("Shelf detail requires an interactive terminal", "info");
			return;
		}
		if (detailPending) { if (id) detail?.select(id); return; }
		detailPending = true;
		try {
			await ctx.ui.custom((nextTui, theme, keybindings, done) => {
				detailTui = nextTui;
				detailDone = () => done(undefined);
				detail = new ShelfDetail(() => sections.values(), nextTui, theme, detailDone, keybindings, id);
				return detail;
			}, { overlay: true, overlayOptions: { width: "90%", maxHeight: "80%", anchor: "center" } });
		} finally {
			detail = undefined;
			detailTui = undefined;
			detailDone = undefined;
			detailPending = false;
		}
	};

	const mount = () => {
		if (!ctx?.hasUI) return;
		if (!open) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		ctx.ui.setWidget(
			WIDGET_KEY,
			(nextTui, theme) => {
				tui = nextTui;
				let hits: ShelfHit[] = [];
				return {
					render(width: number) {
						const layout = drawerLayout(sections.values(), width, theme, shelfHeight(nextTui.terminal?.rows));
						hits = layout.hits;
						return layout.lines;
					},
					handleMouse(event) {
						if (event.type !== "click" || event.button !== "left") return undefined;
						const hit = hits.find((hit) => event.x >= hit.x && event.x < hit.x + hit.width && event.y >= hit.y && event.y < hit.y + hit.height);
						if (!hit) return undefined;
						void showDetails(hit.id).catch((error) => ctx?.ui.notify(`Shelf detail failed: ${error.message}`, "error"));
						return { handled: true };
					},
					invalidate() {},
					dispose() {
						if (tui === nextTui) tui = undefined;
					},
				};
			},
			{ placement: "belowEditor" },
		);
	};

	const setOpen = (next: boolean) => {
		if (next === open) return;
		open = next;
		pi.appendEntry(DISPLAY_ENTRY, { open });
		mount();
		publishState();
	};

	pi.registerCommand("shelf", {
		description: "Toggle the shelf, choose open | close, or browse details [section-id]",
		handler: async (args) => {
			const mode = args.trim();
			if (!mode || mode === "open" || mode === "close") {
				setOpen(mode ? mode === "open" : !open);
				return;
			}
			const explicit = mode === "details" || mode.startsWith("details ");
			const id = explicit ? mode.slice("details".length).trim() : mode;
			if ((explicit && !id) || sections.has(id)) {
				await showDetails(id || undefined);
				return;
			}
			ctx?.ui.notify(`Usage: /shelf [open|close|details [section-id]|${[...sections.keys()].join("|")}]`, "info");
		},
	});

	// /costs predates the shelf; it now opens the Usage section's home.
	pi.registerCommand("costs", {
		description: "Open the shelf, where session usage and tool counts now live",
		handler: async () => setOpen(true),
	});

	pi.registerShortcut(SHELF_SHORTCUT, {
		description: "Toggle the shelf",
		handler: () => setOpen(!open),
	});

	pi.on("session_start", (_event, nextCtx) => {
		if (!nextCtx.hasUI) return;
		for (const cleanup of cleanups) cleanup();
		cleanups = [];
		sections.clear();
		ctx = nextCtx;
		open = latestCustomData<{ open?: boolean }>(ctx.sessionManager.getBranch(), DISPLAY_ENTRY)?.open === true;

		cleanups.push(pi.events.on(SHELF_SECTION, (value) => {
			const message = value as ShelfSectionMessage;
			if ("section" in message && message.section?.id) sections.set(message.section.id, message.section);
			else if ("remove" in message && message.remove) sections.delete(message.id);
			else return;
			redraw();
		}));
		cleanups.push(pi.events.on(SHELF_REFRESH, redraw));
		cleanups.push(pi.events.on(SHELF_STATE_REQUEST, publishState));
		cleanups.push(pi.events.on(SHELF_TOGGLE, (value) => {
			const wanted = (value as { open?: boolean } | undefined)?.open;
			setOpen(typeof wanted === "boolean" ? wanted : !open);
		}));
		// Sections registered before these listeners existed offer themselves again.
		pi.events.emit(SHELF_SECTION_REQUEST, undefined);
		for (const section of builtInSections(pi, () => ctx)) {
			cleanups.push(registerShelfSection(pi, section));
		}
		mount();
		publishState();
	});

	// Built-in sections read live session data on render; these are the moments it changes.
	for (const event of ["turn_end", "agent_settled", "session_compact", "model_select", "session_tree"]) {
		pi.on(event, () => refreshShelf(pi));
	}

	pi.on("session_shutdown", () => {
		detailDone?.();
		for (const cleanup of cleanups) cleanup();
		cleanups = [];
		sections.clear();
		if (ctx?.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
		tui = undefined;
		ctx = undefined;
	});
}
