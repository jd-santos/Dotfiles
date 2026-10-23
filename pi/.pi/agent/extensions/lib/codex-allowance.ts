// Codex subscription allowance, read from the local Codex app-server.
//
// Shared by usage.ts (the /usage report) and codex-limits.ts (footer, shelf,
// and toasts). Codex owns authentication; this module never reads its auth
// file. Snapshots, including failures, are cached for five minutes so turn
// ends cannot spawn the app-server more often than that.

import { spawn } from "node:child_process";

export const CODEX_ALLOWANCE_CACHE_MS = 5 * 60 * 1000;
const CODEX_ALLOWANCE_TIMEOUT_MS = 7_500;

export type AllowanceSnapshot =
	| { fetchedAt: number; result: any; error?: undefined }
	| { fetchedAt: number; result?: undefined; error: string };

export interface AllowanceWindow {
	/** "Primary" or "Secondary", as the app-server reports them. */
	role: string;
	/** Long label for reports: "5-hour", "Weekly". */
	label: string;
	/** Short label for the footer: "5h", "7d". */
	short: string;
	usedPercent: number;
	/** Unix seconds, or 0 when unknown. */
	resetsAt: number;
}

export interface AllowanceBucket {
	id: string;
	label: string;
	plan?: string;
	windows: AllowanceWindow[];
}

let cache: AllowanceSnapshot | undefined;
let inflight: Promise<AllowanceSnapshot> | undefined;

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function fetchCodexAllowance(): Promise<any> {
	return new Promise((resolve, reject) => {
		const child = spawn("codex", ["app-server", "--stdio"], {
			stdio: ["pipe", "pipe", "ignore"],
		});
		let settled = false;
		let buffer = "";
		const finish = (error?: Error, result?: any) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.kill();
			if (error) reject(error);
			else resolve(result);
		};
		const send = (message: any) => {
			if (settled || !child.stdin.writable)
				return finish(new Error("Codex app-server input is unavailable"));
			try {
				child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		};
		const timer = setTimeout(
			() => finish(new Error("Codex app-server timed out")),
			CODEX_ALLOWANCE_TIMEOUT_MS,
		);
		child.on("error", (error) => finish(error));
		child.stdin.on("error", (error) => finish(error));
		child.on("exit", (code) => {
			if (!settled)
				finish(new Error(`Codex app-server exited with status ${code ?? "unknown"}`));
		});
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				let message;
				try {
					message = JSON.parse(line);
				} catch {
					continue;
				}
				if (message.id === 1) {
					if (message.error)
						return finish(new Error(message.error.message ?? "Codex initialization failed"));
					send({ method: "initialized", params: {} });
					send({ id: 2, method: "account/rateLimits/read", params: {} });
				} else if (message.id === 2) {
					if (message.error)
						return finish(new Error(message.error.message ?? "Codex allowance lookup failed"));
					return finish(undefined, message.result);
				}
			}
		});
		send({
			id: 1,
			method: "initialize",
			params: {
				clientInfo: {
					name: "pi-usage-extension",
					title: "Pi usage extension",
					version: "1.0.0",
				},
				capabilities: { experimentalApi: true },
			},
		});
	});
}

/** The cached snapshot, without fetching. */
export function peekCodexAllowance(): AllowanceSnapshot | undefined {
	return cache;
}

/** Clear the cache. For tests. */
export function resetCodexAllowanceCache(): void {
	cache = undefined;
	inflight = undefined;
}

/** A fresh snapshot, or the cached one when it is younger than five minutes. */
export function loadCodexAllowance(
	options: { fetcher?: () => Promise<any>; now?: () => number } = {},
): Promise<AllowanceSnapshot> {
	const now = options.now ?? Date.now;
	if (cache && now() - cache.fetchedAt < CODEX_ALLOWANCE_CACHE_MS) return Promise.resolve(cache);
	// Concurrent callers share one app-server launch.
	inflight ??= (async () => {
		try {
			cache = { fetchedAt: now(), result: await (options.fetcher ?? fetchCodexAllowance)() };
		} catch (error) {
			cache = {
				fetchedAt: now(),
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			inflight = undefined;
		}
		return cache;
	})();
	return inflight;
}

export function durationLabel(minutes: unknown, fallback: string): string {
	const value = asNumber(minutes);
	if (value >= 10_000 && value <= 10_500) return "Weekly";
	if (value >= 280 && value <= 320) return "5-hour";
	if (value >= 1_400 && value <= 1_500) return "Daily";
	return value ? `${Math.round(value / 60)}h window` : fallback;
}

export function shortDurationLabel(minutes: unknown, fallback: string): string {
	const value = asNumber(minutes);
	if (!value) return fallback;
	if (value >= 1_400 && value % 1_440 < 60) return `${Math.round(value / 1_440)}d`;
	if (value >= 10_000 && value <= 10_500) return "7d";
	return value < 60 ? `${Math.round(value)}m` : `${Math.round(value / 60)}h`;
}

/** Every bucket and window in a snapshot, primary bucket first. */
export function allowanceBuckets(snapshot: AllowanceSnapshot | undefined): AllowanceBucket[] {
	const result = snapshot?.result;
	if (!result) return [];
	const byId = result.rateLimitsByLimitId;
	const entries: Array<[string, any]> =
		byId && Object.keys(byId).length
			? Object.entries(byId)
			: [[result.rateLimits?.limitId ?? "Codex", result.rateLimits]];
	const primaryId = result.rateLimits?.limitId;
	if (primaryId) entries.sort(([a], [b]) => Number(b === primaryId) - Number(a === primaryId));
	const buckets: AllowanceBucket[] = [];
	for (const [id, bucket] of entries) {
		if (!bucket) continue;
		const windows: AllowanceWindow[] = [];
		for (const [role, window] of [
			["Primary", bucket.primary],
			["Secondary", bucket.secondary],
		] as const) {
			if (!window) continue;
			windows.push({
				role,
				label: durationLabel(window.windowDurationMins, role),
				short: shortDurationLabel(window.windowDurationMins, role === "Primary" ? "p" : "s"),
				usedPercent: Math.max(0, Math.min(100, asNumber(window.usedPercent))),
				resetsAt: asNumber(window.resetsAt),
			});
		}
		buckets.push({
			id: String(id),
			label: String(bucket.limitName ?? id),
			plan: bucket.planType ? String(bucket.planType) : undefined,
			windows,
		});
	}
	return buckets;
}
