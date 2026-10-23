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
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
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
	type ThemeLike,
} from "./lib/shell-layout.ts";
import { TURN_ENTRY, formatElapsed, type TurnReceipt } from "./tps-tracker.ts";

const DISPLAY_ENTRY = "shelf-display";
const WIDGET_KEY = "shelf";
export const SHELF_SHORTCUT = "alt+s";
/** Share of the terminal the drawer may take, and its floor in rows. */
const HEIGHT_SHARE = 0.4;
const MIN_HEIGHT = 4;
const INDENT = "  ";

export function shelfHeight(rows: number | undefined): number {
	const total = Number.isFinite(rows) && rows > 0 ? rows : 24;
	return Math.max(MIN_HEIGHT, Math.floor(total * HEIGHT_SHARE));
}

/** `Title ──────── headline`, fitted to `width`. The headline drops before the title truncates. */
export function sectionHeading(
	theme: ThemeLike,
	title: string,
	headline: string | undefined,
	width: number,
): string {
	if (width <= 0) return "";
	const name = truncateToWidth(title, width, "…");
	const styledName = theme.fg("mdHeading", theme.bold(name));
	let right = headline ? ` ${headline}` : "";
	// Keep at least a short rule between the title and the headline.
	if (right && visibleWidth(name) + 4 + visibleWidth(right) > width) {
		right = ` ${truncateToWidth(headline!, Math.max(0, width - visibleWidth(name) - 5), "…")}`;
		if (visibleWidth(right) <= 1) right = "";
	}
	const fill = Math.max(0, width - visibleWidth(name) - 1 - visibleWidth(right));
	const rule = fill > 0 ? ` ${theme.fg("border", "─".repeat(fill))}` : "";
	return truncateToWidth(styledName + rule + right, width, "");
}

function safeHeadline(section: ShelfSection, theme: ThemeLike): string | undefined {
	try {
		return section.headline?.(theme) || undefined;
	} catch {
		return theme.fg("error", "error");
	}
}

function safeBody(section: ShelfSection, theme: ThemeLike, width: number): string[] {
	try {
		const lines = section.render(width, theme);
		return Array.isArray(lines) ? lines.map((line) => truncateToWidth(String(line), width, "…")) : [];
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return [truncateToWidth(theme.fg("error", `section failed: ${message}`), width, "…")];
	}
}

/**
 * Every section as a heading plus its body, within `maxLines`. When the drawer
 * is too short, headings stay and body lines are shared out round-robin in
 * section order; a cut section ends with `… +n more`.
 */
export function renderDrawer(
	sections: Iterable<ShelfSection>,
	width: number,
	theme: ThemeLike,
	maxLines: number,
): string[] {
	if (width <= 0 || maxLines <= 0) return [];
	const ordered = [...sections].sort((a, b) => a.order - b.order);
	if (!ordered.length) {
		return [truncateToWidth(theme.fg("dim", `${INDENT}The shelf is empty.`), width, "")];
	}
	const bodyWidth = Math.max(0, width - INDENT.length);
	const blocks = ordered.map((section) => ({
		heading: sectionHeading(theme, section.title, safeHeadline(section, theme), width),
		body: bodyWidth > 0 ? safeBody(section, theme, bodyWidth) : [],
	}));
	const indent = (line: string) => truncateToWidth(INDENT + line, width, "");
	const total = blocks.reduce((sum, block) => sum + 1 + block.body.length, 0);
	if (total <= maxLines) return blocks.flatMap((block) => [block.heading, ...block.body.map(indent)]);

	if (blocks.length >= maxLines) {
		const shown = blocks.slice(0, Math.max(1, maxLines - 1)).map((block) => block.heading);
		const hidden = blocks.length - shown.length;
		if (hidden > 0) shown.push(truncateToWidth(theme.fg("dim", `${INDENT}… +${hidden} more sections`), width, ""));
		return shown.slice(0, maxLines);
	}
	let budget = maxLines - blocks.length;
	const allowed = blocks.map(() => 0);
	while (budget > 0) {
		let gave = false;
		for (let index = 0; index < blocks.length && budget > 0; index++) {
			if (allowed[index] < blocks[index].body.length) {
				allowed[index]++;
				budget--;
				gave = true;
			}
		}
		if (!gave) break;
	}
	return blocks.flatMap((block, index) => {
		const shown = block.body.slice(0, allowed[index]).map(indent);
		const hidden = block.body.length - allowed[index];
		if (hidden > 0 && shown.length) {
			shown[shown.length - 1] = indent(theme.fg("dim", `… +${hidden + 1} more`));
		}
		return [block.heading, ...shown];
	});
}

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

	const publishState = () => pi.events.emit(SHELF_STATE, { open });
	const redraw = () => tui?.requestRender();

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
				return {
					render: (width: number) =>
						renderDrawer(sections.values(), width, theme, shelfHeight(nextTui.terminal?.rows)),
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
		description: "Open or close the shelf below the editor (open | close)",
		handler: async (args) => {
			const mode = args.trim();
			if (mode && mode !== "open" && mode !== "close") {
				ctx?.ui.notify("Usage: /shelf [open|close]", "info");
				return;
			}
			setOpen(mode ? mode === "open" : !open);
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
		for (const cleanup of cleanups) cleanup();
		cleanups = [];
		sections.clear();
		if (ctx?.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined);
		tui = undefined;
		ctx = undefined;
	});
}
