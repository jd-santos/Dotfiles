import {
	HStack,
	ScrollView,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
	type TuiMouseEvent,
} from "@earendil-works/pi-tui";
import type { ShelfSection } from "./shelf.ts";
import type { ThemeLike } from "./shell-layout.ts";

const COLUMN_BREAKPOINT = 110;
const COLUMN_GAP = 3;

export type ShelfTui = {
	terminal?: { rows?: number };
	requestRender(): void;
};

export type ShelfHit = { id?: string; x: number; y: number; width: number; height: number };

/** Leave room for the editor and footer even in a very short terminal. */
export function shelfHeight(rows: number | undefined): number {
	const total = rows !== undefined && Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : 24;
	return Math.max(0, Math.min(12, Math.floor(total * 0.4), total - 8));
}

export function sectionHeading(theme: ThemeLike, title: string, headline: string | undefined, width: number): string {
	if (width <= 0) return "";
	const name = truncateToWidth(title, width, "…");
	let right = headline ? ` ${headline}` : "";
	if (visibleWidth(name) + 4 + visibleWidth(right) > width) {
		right = headline ? ` ${truncateToWidth(headline, Math.max(0, width - visibleWidth(name) - 5), "…")}` : "";
		if (visibleWidth(right) <= 1) right = "";
	}
	const fill = Math.max(0, width - visibleWidth(name) - 1 - visibleWidth(right));
	return truncateToWidth(
		theme.fg("mdHeading", theme.bold(name)) + (fill ? ` ${theme.fg("border", "─".repeat(fill))}` : "") + right,
		width,
		"",
	);
}

export function orderedSections(sections: Iterable<ShelfSection>): ShelfSection[] {
	return [...sections].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function safeHeadline(section: ShelfSection, theme: ThemeLike): string | undefined {
	try {
		return section.headline?.(theme) || undefined;
	} catch {
		return theme.fg("error", "error");
	}
}

export function sectionBody(section: ShelfSection, theme: ThemeLike, width: number): string[] {
	if (width <= 0) return [];
	try {
		const lines = section.render(width, theme);
		return Array.isArray(lines) ? lines.map((line) => truncateToWidth(String(line), width, "…")) : [];
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return [truncateToWidth(theme.fg("error", `section failed: ${message}`), width, "…")];
	}
}

/** Compact figures first; previews use spare rows, never replacing data with overflow notices. */
export function drawerLayout(
	sections: Iterable<ShelfSection>, width: number, theme: ThemeLike, maxLines: number,
): { lines: string[]; hits: ShelfHit[] } {
	if (width <= 0 || maxLines <= 0) return { lines: [], hits: [] };
	const ordered = orderedSections(sections);
	const columns = width >= COLUMN_BREAKPOINT ? 2 : 1;
	const budget = Math.max(0, maxLines - 1);
	const shown = ordered.slice(0, budget * columns);
	const groups = Math.ceil(shown.length / columns);
	const lines: string[] = [];
	const hits: ShelfHit[] = [];
	for (let row = 0; row < groups; row++) {
		const height = Math.min(3, Math.floor(budget / groups) + (row < budget % groups ? 1 : 0));
		const cells = shown.slice(row * columns, (row + 1) * columns);
		const cellWidth = columns === 2 ? Math.floor((width - COLUMN_GAP) / 2) : width;
		const components = cells.map((section, index) => {
			hits.push({ id: section.id, x: index * (cellWidth + COLUMN_GAP), y: lines.length, width: cellWidth, height });
			return {
				component: {
					invalidate() {},
					render(available: number) {
						const headline = safeHeadline(section, theme);
						const body = sectionBody(section, theme, Math.max(0, available - 2));
						if (height === 1) {
							const value = headline ?? body.find((line) => visibleWidth(line) > 0);
							return [truncateToWidth(theme.fg("mdHeading", theme.bold(section.title)) + (value ? `  ${value}` : ""), available, "…")];
						}
						const preview = [sectionHeading(theme, section.title, headline, available), ...body.slice(0, height - 1).map((line) => `  ${line}`)];
						while (preview.length < height) preview.push("");
						return preview;
					},
				},
				basis: cellWidth, grow: 0, shrink: 1,
			};
		});
		lines.push(...new HStack(components, { gap: COLUMN_GAP }).render(width));
	}
	const hidden = ordered.length - shown.length;
	const hint = ordered.length ? `/shelf details${hidden ? ` · +${hidden} sections` : " · select a section"}` : "Shelf empty · /shelf details";
	hits.push({ x: 0, y: lines.length, width, height: 1 });
	lines.push(truncateToWidth(theme.fg("dim", hint), width, "…"));
	return { lines, hits };
}

export function renderDrawer(sections: Iterable<ShelfSection>, width: number, theme: ThemeLike, maxLines: number): string[] {
	return drawerLayout(sections, width, theme, maxLines).lines;
}

/**
 * Pi's overlay renderer supplies width, not a bounded layout viewport. Adapt
 * the native ScrollView's clamping and navigation to that render contract.
 */
export class ShelfDetail implements Component {
	private selectedId?: string;
	private scroll: ScrollView;
	private bodyLines: string[] = [];
	private bodyHeight = 1;
	private sectionHits: ShelfHit[] = [];

	constructor(
		private getSections: () => Iterable<ShelfSection>,
		private tui: ShelfTui,
		private theme: ThemeLike,
		private done: () => void,
		private keybindings: { matches(data: string, action: "tui.select.cancel" | "tui.select.up" | "tui.select.down"): boolean },
		initialId?: string,
	) {
		this.selectedId = initialId;
		this.scroll = new ScrollView({ render: () => this.bodyLines, invalidate() {} }, { overscroll: "contain" });
	}

	select(id: string): void {
		if (this.selectedId === id) return;
		this.selectedId = id;
		this.scroll.scrollToStart();
		this.tui.requestRender();
	}

	invalidate(): void {}

	private moveSection(delta: number): void {
		const sections = orderedSections(this.getSections());
		if (!sections.length) return;
		const current = Math.max(0, sections.findIndex((section) => section.id === this.selectedId));
		this.select(sections[(current + delta + sections.length) % sections.length].id);
	}

	handleInput(data: string): void {
		if (this.keybindings.matches(data, "tui.select.cancel")) return this.done();
		if (matchesKey(data, "right") || matchesKey(data, "tab")) this.moveSection(1);
		else if (matchesKey(data, "left") || matchesKey(data, "shift+tab")) this.moveSection(-1);
		else if (this.keybindings.matches(data, "tui.select.up")) this.scroll.scrollBy(-1);
		else if (this.keybindings.matches(data, "tui.select.down")) this.scroll.scrollBy(1);
		else if (matchesKey(data, "pageUp")) this.scroll.scrollBy(-this.bodyHeight);
		else if (matchesKey(data, "pageDown") || data === " ") this.scroll.scrollBy(this.bodyHeight);
		else if (matchesKey(data, "home")) this.scroll.scrollToStart();
		else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
		else return;
		this.tui.requestRender();
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.type === "wheel") {
			this.scroll.scrollBy(event.wheelDelta ?? 0);
			this.tui.requestRender();
			return { handled: true };
		}
		if (event.type !== "click" || event.button !== "left") return undefined;
		const hit = this.sectionHits.find((hit) => event.x >= hit.x && event.x < hit.x + hit.width && event.y >= hit.y && event.y < hit.y + hit.height);
		if (hit?.id) { this.select(hit.id); return { handled: true }; }
		// Compact headers advance on click; the keyboard also works in regular mode.
		if (event.y === 0) { this.moveSection(1); return { handled: true }; }
		return undefined;
	}

	render(width: number): string[] {
		if (width <= 0) return [];
		const rows = this.tui.terminal?.rows;
		const totalRows = rows !== undefined && Number.isFinite(rows) && rows > 0 ? rows : 24;
		const height = Math.max(1, Math.floor(totalRows * 0.8));
		this.sectionHits = [];
		const sections = orderedSections(this.getSections());
		const selected = sections.find((section) => section.id === this.selectedId) ?? sections[0];
		if (selected?.id !== this.selectedId) {
			this.selectedId = selected?.id;
			this.scroll.scrollToStart();
		}
		const index = selected ? sections.indexOf(selected) : -1;
		const sidebar = width >= 100 && height >= 5;
		const navWidth = sidebar ? Math.min(24, Math.floor(width / 4)) : 0;
		const contentWidth = width - (sidebar ? navWidth + COLUMN_GAP : 0);
		const header = selected ? `Shelf · ${selected.title} (${index + 1}/${sections.length})` : "Shelf · no sections";
		const lines = [truncateToWidth(this.theme.fg("mdHeading", this.theme.bold(header)), width, "…")];
		if (height === 1) return lines;
		this.bodyHeight = Math.max(0, height - 2);
		const headline = selected && safeHeadline(selected, this.theme);
		this.bodyLines = selected
			? [...(headline ? [truncateToWidth(headline, contentWidth, "…")] : []), ...sectionBody(selected, this.theme, contentWidth)]
			: [this.theme.fg("dim", "No sections registered")];
		this.scroll.updateLayout(this.bodyLines.length, this.bodyHeight, () => this.tui.requestRender());
		const visible = this.scroll.render(contentWidth).slice(this.scroll.scrollTop, this.scroll.scrollTop + this.bodyHeight);
		while (visible.length < this.bodyHeight) visible.push("");
		if (sidebar) {
			const start = Math.max(0, Math.min(index - Math.floor(this.bodyHeight / 2), sections.length - this.bodyHeight));
			const nav = sections.slice(start, start + this.bodyHeight).map((section, row) => {
				this.sectionHits.push({ id: section.id, x: 0, y: 1 + row, width: navWidth, height: 1 });
				return truncateToWidth(this.theme.fg(section.id === selected?.id ? "accent" : "muted", `${section.id === selected?.id ? "›" : " "} ${section.title}`), navWidth, "…");
			});
			lines.push(...new HStack([
				{ component: { render: () => nav, invalidate() {} }, basis: navWidth, grow: 0, shrink: 0 },
				{ component: { render: () => visible, invalidate() {} }, basis: contentWidth, grow: 0, shrink: 1 },
			], { gap: COLUMN_GAP }).render(width));
		} else lines.push(...visible);
		const range = this.bodyLines.length ? `${Math.min(this.bodyLines.length, this.scroll.scrollTop + 1)}-${Math.min(this.bodyLines.length, this.scroll.scrollTop + this.bodyHeight)}/${this.bodyLines.length}` : "0/0";
		const help = width >= 65 ? `${range} · ←/→ section · ↑/↓ scroll · PgUp/PgDn · Esc close` : `${range} · Esc close · ←/→ section · ↑/↓ scroll`;
		lines.push(truncateToWidth(this.theme.fg("dim", help), width, "…"));
		return lines.map((line) => truncateToWidth(line, width, ""));
	}
}
