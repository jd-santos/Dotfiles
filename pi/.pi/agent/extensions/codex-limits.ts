// @ts-nocheck

/**
 * Codex subscription allowance in the footer and the shelf.
 *
 * While the active model's provider is `openai-codex`, this publishes
 * `5h 12%  7d 34%` as the `limits` status (the footer places it), adds a Limits
 * shelf section with bars and reset times, and shows a toast once when a window
 * reaches 80%. The snapshot comes from lib/codex-allowance.ts, which caches it
 * for five minutes, so turn ends refresh it at most that often.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	CODEX_ALLOWANCE_CACHE_MS,
	allowanceBuckets,
	loadCodexAllowance,
	type AllowanceSnapshot,
	type AllowanceWindow,
} from "./lib/codex-allowance.ts";
import { refreshShelf, registerShelfSection } from "./lib/shelf.ts";
import type { ThemeLike } from "./lib/shell-layout.ts";

export const CODEX_PROVIDER = "openai-codex";
const STATUS_KEY = "limits";
export const TOAST_AT_PERCENT = 80;

export function limitColor(percent: number): string {
	return percent >= 80 ? "error" : percent >= 50 ? "warning" : "text";
}

/** `5h 12%  7d 34%` for the primary bucket. */
export function limitsStatus(theme: ThemeLike, snapshot: AllowanceSnapshot | undefined): string | undefined {
	if (!snapshot) return undefined;
	if (snapshot.error) return theme.fg("dim", "limits ") + theme.fg("muted", "unavailable");
	const windows = allowanceBuckets(snapshot)[0]?.windows ?? [];
	if (!windows.length) return undefined;
	return windows
		.map((window) => theme.fg("dim", `${window.short} `) + theme.fg(limitColor(window.usedPercent), `${Math.round(window.usedPercent)}%`))
		.join("  ");
}

export function resetText(resetsAt: number, now = Date.now()): string {
	if (!resetsAt) return "reset unknown";
	const at = new Date(resetsAt * 1000);
	const minutes = Math.max(0, Math.round((at.getTime() - now) / 60_000));
	const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	const day = minutes >= 24 * 60
		? `${at.toLocaleDateString("en-US", { weekday: "short" })} ${time}`
		: time;
	const left = minutes < 60
		? `${minutes}m`
		: minutes < 48 * 60
			? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
			: `${Math.round(minutes / (24 * 60))}d`;
	return `resets ${day} (in ${left})`;
}

function bar(theme: ThemeLike, percent: number, cells: number): string {
	const fill = Math.round((percent / 100) * cells);
	return theme.fg(limitColor(percent), "█".repeat(fill)) + theme.fg("border", "░".repeat(cells - fill));
}

export function limitsLines(
	theme: ThemeLike,
	snapshot: AllowanceSnapshot | undefined,
	width: number,
	now = Date.now(),
): string[] {
	const fit = (line: string) => truncateToWidth(line, width, "…");
	if (!snapshot) return [fit(theme.fg("dim", "Checking Codex allowance…"))];
	if (snapshot.error) return [fit(theme.fg("warning", `Unavailable: ${snapshot.error}`))];
	const buckets = allowanceBuckets(snapshot);
	const lines: string[] = [];
	for (const bucket of buckets) {
		if (buckets.length > 1) lines.push(fit(theme.fg("muted", bucket.label)));
		for (const window of bucket.windows) {
			const label = theme.fg("dim", window.short.padEnd(3));
			const percent = theme.fg(limitColor(window.usedPercent), `${Math.round(window.usedPercent)}%`.padStart(4));
			const reset = theme.fg("dim", resetText(window.resetsAt, now));
			const cells = Math.min(20, Math.max(0, width - 3 - 1 - 1 - 4 - 2 - visibleWidth(reset)));
			const meter = cells >= 5 ? `${bar(theme, window.usedPercent, cells)} ` : "";
			lines.push(fit(`${label} ${meter}${percent}  ${reset}`));
		}
	}
	if (!lines.length) lines.push(fit(theme.fg("dim", "No allowance windows reported")));
	const plan = buckets.find((bucket) => bucket.plan)?.plan;
	const age = Math.max(0, Math.round((now - snapshot.fetchedAt) / 60_000));
	lines.push(fit(theme.fg("dim", `${plan ? `plan ${plan} · ` : ""}checked ${age ? `${age}m ago` : "just now"}`)));
	return lines;
}

function peakWindow(snapshot: AllowanceSnapshot | undefined): AllowanceWindow | undefined {
	const windows = allowanceBuckets(snapshot).flatMap((bucket) => bucket.windows);
	return windows.sort((a, b) => b.usedPercent - a.usedPercent)[0];
}

/** The extension, with an injectable fetcher and clock for tests. */
export function createCodexLimits(options: { fetcher?: () => Promise<any>; now?: () => number } = {}) {
	return (pi: ExtensionAPI) => codexLimits(pi, options);
}

export default createCodexLimits();

function codexLimits(pi: ExtensionAPI, options: { fetcher?: () => Promise<any>; now?: () => number }) {
	const now = options.now ?? Date.now;
	let ctx: any;
	let provider: string | undefined;
	let snapshot: AllowanceSnapshot | undefined;
	let unregister: (() => void) | undefined;
	let lastStatus: string | undefined;
	// Window keys (bucket, window, reset time) that have already had their toast.
	const toasted = new Set<string>();

	const active = () => ctx?.hasUI === true && provider === CODEX_PROVIDER;

	const publish = () => {
		if (!ctx?.hasUI) return;
		const text = active() ? limitsStatus(ctx.ui.theme, snapshot) : undefined;
		if (text !== lastStatus) {
			ctx.ui.setStatus(STATUS_KEY, text);
			lastStatus = text;
		}
		refreshShelf(pi);
	};

	const toast = () => {
		for (const bucket of allowanceBuckets(snapshot)) {
			for (const window of bucket.windows) {
				const key = `${bucket.id}:${window.role}:${window.resetsAt}`;
				if (window.usedPercent < TOAST_AT_PERCENT || toasted.has(key)) continue;
				toasted.add(key);
				ctx.ui.notify(
					`Codex ${window.label.toLowerCase()} allowance at ${Math.round(window.usedPercent)}%; ${resetText(window.resetsAt, now())}.`,
					"warning",
				);
			}
		}
	};

	const refresh = async () => {
		if (!active()) return;
		const requested = ctx;
		const next = await loadCodexAllowance({ fetcher: options.fetcher, now });
		if (ctx !== requested) return;
		snapshot = next;
		if (active()) toast();
		publish();
	};

	const sync = () => {
		if (active() && !unregister) {
			unregister = registerShelfSection(pi, {
				id: "limits",
				title: "Limits",
				order: 60,
				headline(theme) {
					const peak = peakWindow(snapshot);
					if (snapshot?.error) return theme.fg("dim", "unavailable");
					return peak
						? theme.fg(limitColor(peak.usedPercent), `${peak.short} ${Math.round(peak.usedPercent)}%`)
						: undefined;
				},
				render: (width, theme) => limitsLines(theme, snapshot, width, now()),
			});
		} else if (!active() && unregister) {
			unregister();
			unregister = undefined;
		}
		publish();
		void refresh();
	};

	pi.on("session_start", (_event, nextCtx) => {
		ctx = nextCtx;
		provider = nextCtx.model?.provider;
		lastStatus = undefined;
		sync();
	});

	pi.on("model_select", (event, nextCtx) => {
		ctx = nextCtx;
		provider = event.model?.provider ?? nextCtx.model?.provider;
		sync();
	});

	// The shared cache keeps this to one app-server launch per five minutes.
	pi.on("turn_end", () => {
		if (!snapshot || now() - snapshot.fetchedAt >= CODEX_ALLOWANCE_CACHE_MS) void refresh();
	});

	pi.on("session_shutdown", () => {
		unregister?.();
		unregister = undefined;
		if (lastStatus !== undefined && ctx?.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
		lastStatus = undefined;
		ctx = undefined;
	});
}
