import type { Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, matchesKey, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";

/** Owns only overlay input. It never forwards Escape or Ctrl+C to the main agent. */
export class BtwOverlay implements Component {
	private markdown: Markdown;
	private phase: "preparing" | "approval" | "running" | "finished" = "preparing";
	private scroll = 0;
	private receipt = "";
	private approve?: (value: boolean) => void;
	private closed = false;
	private approvalRead = false;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private title: string,
		private controller: AbortController,
		private done: () => void,
	) {
		this.markdown = new Markdown("Preparing an isolated request. No model call has been sent.", 0, 0, getMarkdownTheme());
	}

	async requestApproval(text: string): Promise<void> {
		if (this.controller.signal.aborted) throw new Error("Side question cancelled before dispatch.");
		this.phase = "approval";
		this.approvalRead = false;
		this.scroll = 0;
		this.setText(text);
		const approved = await new Promise<boolean>((resolve) => {
			const onAbort = () => finish(false);
			const finish = (value: boolean) => {
				this.controller.signal.removeEventListener("abort", onAbort);
				this.approve = undefined;
				resolve(value);
			};
			this.approve = finish;
			this.controller.signal.addEventListener("abort", onAbort, { once: true });
		});
		if (!approved || this.controller.signal.aborted) throw new Error("Side question cancelled before dispatch.");
		this.phase = "running";
		this.setText("Waiting for the side answer. The main agent continues running.");
	}

	setText(text: string): void {
		if (this.closed) return;
		this.markdown.setText(text);
		this.tui.requestRender();
	}

	finish(text: string, receipt: string): void {
		this.phase = "finished";
		this.receipt = receipt;
		this.setText(text);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.controller.abort();
		this.approve?.(false);
		this.done();
	}

	dispose(): void {
		this.closed = true;
		this.controller.abort();
		this.approve?.(false);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) { this.close(); return; }
		if (matchesKey(data, "enter") && this.phase === "approval") {
			if (this.approvalRead) this.approve?.(true);
			return;
		}
		if (matchesKey(data, "up") || data === "k") this.scroll = Math.max(0, this.scroll - 1);
		if (matchesKey(data, "down") || data === "j") this.scroll++;
		if (matchesKey(data, "pageUp")) this.scroll = Math.max(0, this.scroll - 10);
		if (matchesKey(data, "pageDown")) this.scroll += 10;
		if (matchesKey(data, "home")) this.scroll = 0;
		if (matchesKey(data, "end")) this.scroll = Number.MAX_SAFE_INTEGER;
		this.tui.requestRender();
	}

	invalidate(): void { this.markdown.invalidate(); }

	render(width: number): string[] {
		const height = Math.max(1, Math.min(24, Math.floor(this.tui.terminal.rows * 0.8) - 3));
		const body = this.markdown.render(Math.max(1, width));
		this.scroll = Math.max(0, Math.min(this.scroll, body.length - height));
		if (this.phase === "approval" && this.scroll + height >= body.length) this.approvalRead = true;
		const controls = this.phase === "approval"
			? this.approvalRead ? "Enter: approve request · Esc: cancel · ↑↓/PgUp/PgDn: scroll" : "Scroll to end to enable approval (End) · Esc: cancel"
			: this.phase === "finished" ? "Esc: close · ↑↓/PgUp/PgDn: scroll" : "Esc: cancel side request only · ↑↓: scroll";
		return [
			this.theme.fg("accent", truncateToWidth(this.title, width)),
			...body.slice(this.scroll, this.scroll + height),
			...(this.receipt ? [this.theme.fg("dim", truncateToWidth(this.receipt, width))] : []),
			this.theme.fg("muted", truncateToWidth(controls, width)),
		];
	}
}
