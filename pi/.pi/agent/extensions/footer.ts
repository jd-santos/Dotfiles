// @ts-nocheck

/**
 * Central Pi footer.
 *
 * This extension replaces Pi's default footer and lays out existing extension
 * statuses in one place. Other extensions still publish their state with
 * ctx.ui.setStatus(); this footer decides how to display it.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const STATUS_SEPARATOR = " | ";
const MCP_CACHE_TTL_MS = 2_000;

type ThemeLike = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

type McpSnapshot = {
	serverNames: string[];
	configured: number;
	cached: number;
};

let mcpSnapshot: { at: number; cwd: string; value: McpSnapshot } | undefined;

function stripAnsi(text: string | undefined): string {
	return String(text ?? "").replace(
		/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g,
		"",
	);
}

function parseJsonFile(path: string): any | undefined {
	if (!existsSync(path)) return undefined;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return undefined;
	}
}

function expandPath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
	return resolve(path);
}

function getAgentDir(): string {
	const configured = process.env.PI_CODING_AGENT_DIR?.trim();
	return configured ? expandPath(configured) : join(homedir(), ".pi", "agent");
}

function getMcpConfigPaths(cwd: string): string[] {
	const configArgIndex = process.argv.indexOf("--mcp-config");
	const override =
		configArgIndex >= 0 ? process.argv[configArgIndex + 1] : undefined;
	const agentConfig = override
		? expandPath(override)
		: join(getAgentDir(), "mcp.json");

	return [
		join(homedir(), ".config", "mcp", "mcp.json"),
		agentConfig,
		resolve(cwd, ".mcp.json"),
		resolve(cwd, ".pi", "mcp.json"),
	];
}

function getSettingsPaths(cwd: string): string[] {
	return [
		join(getAgentDir(), "settings.json"),
		resolve(cwd, ".pi", "settings.json"),
	];
}

function isAutoCompactionEnabled(cwd: string): boolean {
	let enabled = true;
	for (const path of getSettingsPaths(cwd)) {
		const settings = parseJsonFile(path);
		if (settings?.compaction?.enabled !== undefined) {
			enabled = settings.compaction.enabled !== false;
		}
	}
	return enabled;
}

function getMcpSnapshot(cwd: string): McpSnapshot {
	const now = Date.now();
	if (
		mcpSnapshot &&
		mcpSnapshot.cwd === cwd &&
		now - mcpSnapshot.at < MCP_CACHE_TTL_MS
	) {
		return mcpSnapshot.value;
	}

	const serverNames = new Set<string>();
	for (const path of getMcpConfigPaths(cwd)) {
		const config = parseJsonFile(path);
		const servers = config?.mcpServers;
		if (!servers || typeof servers !== "object") continue;
		for (const name of Object.keys(servers)) serverNames.add(name);
	}

	const cache = parseJsonFile(join(getAgentDir(), "mcp-cache.json"));
	let cached = 0;
	for (const name of serverNames) {
		const entry = cache?.servers?.[name];
		const toolCount = Array.isArray(entry?.tools) ? entry.tools.length : 0;
		const resourceCount = Array.isArray(entry?.resources)
			? entry.resources.length
			: 0;
		if (toolCount + resourceCount > 0) cached += 1;
	}

	const value = {
		serverNames: [...serverNames],
		configured: serverNames.size,
		cached,
	};
	mcpSnapshot = { at: now, cwd, value };
	return value;
}

function formatCount(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0";
	if (n < 1_000) return String(Math.round(n));
	if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
	return `${(n / 1_000_000).toFixed(1)}m`;
}

function formatMoney(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0";
	return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(3)}`;
}

function label(theme: ThemeLike, text: string): string {
	return theme.fg("dim", text);
}

function value(theme: ThemeLike, color: string, text: string): string {
	return theme.fg(color, text);
}

function field(
	theme: ThemeLike,
	name: string,
	color: string,
	text: string,
): string {
	return `${label(theme, `${name} `)}${value(theme, color, text)}`;
}

function formatCwd(cwd: string): string {
	const home = homedir();
	if (cwd === home) return "~";
	if (cwd.startsWith(`${home}/`)) return `~/${cwd.slice(home.length + 1)}`;
	return cwd;
}

function splitStatusParts(text: string): string[] {
	return stripAnsi(text)
		.split(/\s*\|\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function getUsageTotals(ctx: any): {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
} {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message?.role !== "assistant")
			continue;
		const usage = entry.message.usage;
		if (!usage) continue;
		input += Number(usage.input ?? 0);
		output += Number(usage.output ?? 0);
		cacheRead += Number(
			usage.cacheRead ?? usage.cachedInput ?? usage.cached_input_tokens ?? 0,
		);
		cacheWrite += Number(
			usage.cacheWrite ?? usage.cache_write_input_tokens ?? 0,
		);

		const usageCost = usage.cost;
		if (typeof usageCost === "number") {
			cost += usageCost;
		} else {
			cost += Number(usageCost?.total ?? 0);
		}
	}

	return { input, output, cacheRead, cacheWrite, cost };
}

function formatContext(ctx: any, theme: ThemeLike): string | undefined {
	const usage = ctx.getContextUsage?.();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	if (!contextWindow) return undefined;

	const percent =
		usage?.percent === null || usage?.percent === undefined
			? "?"
			: `${Math.round(Number(usage.percent))}%`;
	const percentValue = Number(usage?.percent ?? 0);
	const color =
		percentValue >= 90 ? "error" : percentValue >= 75 ? "warning" : "muted";
	const auto = isAutoCompactionEnabled(ctx.cwd) ? " auto" : "";
	return field(
		theme,
		"◷ ctx",
		color,
		`${percent}/${formatCount(contextWindow)}${auto}`,
	);
}

function formatTokenDetails(
	usageTotals: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
	},
	theme: ThemeLike,
): string {
	const parts = [
		`${label(theme, "↑")}${value(theme, "muted", formatCount(usageTotals.input))}`,
		`${label(theme, "↓")}${value(theme, "accent", formatCount(usageTotals.output))}`,
	];
	if (usageTotals.cacheRead > 0) {
		parts.push(
			`${label(theme, "R")}${value(theme, "dim", formatCount(usageTotals.cacheRead))}`,
		);
	}
	if (usageTotals.cacheWrite > 0) {
		parts.push(
			`${label(theme, "W")}${value(theme, "dim", formatCount(usageTotals.cacheWrite))}`,
		);
	}

	if (usageTotals.cost > 0) {
		parts.push(value(theme, "muted", formatMoney(usageTotals.cost)));
	}
	return parts.join(label(theme, " "));
}

function formatMcpStatus(
	statusText: string | undefined,
	cwd: string,
	theme: ThemeLike,
): string | undefined {
	const snapshot = getMcpSnapshot(cwd);
	const text = stripAnsi(statusText).trim();
	if (!text && snapshot.configured === 0) return undefined;

	const connecting = text.match(/MCP:\s*connecting to\s+(.+?)\.*$/i);
	if (connecting) {
		return `${field(theme, "mcp", "warning", "connecting")} ${value(theme, "muted", connecting[1])}`;
	}

	const countMatch = text.match(/MCP:\s*(\d+)\/(\d+)/i);
	const live = countMatch ? Number(countMatch[1]) : 0;
	const total = countMatch ? Number(countMatch[2]) : snapshot.configured;
	const configured = Math.max(total, snapshot.configured);
	const cached = snapshot.cached;
	const liveColor =
		live === configured && configured > 0
			? "success"
			: live > 0
				? "accent"
				: "warning";
	const cacheColor = cached > 0 ? "muted" : "dim";

	return [
		field(theme, "mcp", liveColor, `live ${live}/${configured}`),
		field(theme, "cache", cacheColor, `${cached}/${configured}`),
	].join(label(theme, " "));
}

function formatTpsStatus(
	statusText: string | undefined,
	theme: ThemeLike,
): string | undefined {
	const text = stripAnsi(statusText).trim();
	if (!text) return undefined;
	if (/^done:/i.test(text)) return undefined;
	if (/N\/A/i.test(text)) return undefined;
	return field(theme, "tps", "accent", text.replace(/^⏱\s*/, ""));
}

function formatUsageStatus(
	statusText: string | undefined,
	theme: ThemeLike,
): string | undefined {
	const text = stripAnsi(statusText).trim();
	if (!text) return undefined;
	return field(theme, "usage", "muted", text.replace(/^usage:\s*/i, ""));
}

function formatPermissionStatus(
	statusText: string | undefined,
	theme: ThemeLike,
): string | undefined {
	const parts = splitStatusParts(statusText ?? "");
	if (parts.length === 0) return undefined;
	const color = parts.includes("readonly")
		? "warning"
		: parts.includes("yolo")
			? "success"
			: "muted";
	return field(theme, "perm", color, parts.join(" "));
}

function renderSegments(
	parts: Array<string | undefined>,
	width: number,
	theme: ThemeLike,
): string {
	const separator = label(theme, STATUS_SEPARATOR);
	const segments = parts.filter(Boolean) as string[];
	if (segments.length === 0 || width <= 0) return "";

	let line = "";
	for (const segment of segments) {
		const candidate = line ? `${line}${separator}${segment}` : segment;
		if (visibleWidth(candidate) <= width) {
			line = candidate;
			continue;
		}

		if (!line) return truncateToWidth(segment, width, "...");
		const remaining = width - visibleWidth(line) - visibleWidth(separator);
		if (remaining >= 12) {
			return `${line}${separator}${truncateToWidth(segment, remaining, "...")}`;
		}
		return line;
	}

	return truncateToWidth(line, width, "...");
}

function formatUnknownStatuses(
	statuses: ReadonlyMap<string, string>,
	theme: ThemeLike,
): string[] {
	const known = new Set([
		"mcp",
		"model-source",
		"tps",
		"usage",
		"permission-gate",
		"conv-summary",
	]);
	const result: string[] = [];
	for (const [id, value] of statuses.entries()) {
		if (known.has(id)) continue;
		const text = stripAnsi(value).trim();
		if (!text) continue;
		result.push(field(theme, id, "dim", text));
	}
	return result;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const statuses = footerData.getExtensionStatuses();
					const branch = footerData.getGitBranch();
					const usageTotals = getUsageTotals(ctx);
					const sessionName = pi.getSessionName?.();

					const convSummary = statuses.get("conv-summary");
						const locationLine = renderSegments(
						[
							value(theme, "accent", formatCwd(ctx.cwd)),
							branch ? field(theme, "git", "success", branch) : undefined,
							convSummary
								? theme.fg("accent", theme.bold(`» ${stripAnsi(convSummary).trim()}`))
								: sessionName
									? field(theme, "session", "dim", sessionName)
									: undefined,
						],
						width,
						theme,
					);

					const tokenLine = renderSegments(
						[formatContext(ctx, theme), formatTokenDetails(usageTotals, theme)],
						width,
						theme,
					);

					const extensionLine = renderSegments(
						[
							formatMcpStatus(statuses.get("mcp"), ctx.cwd, theme),
							...formatUnknownStatuses(statuses, theme),
							formatPermissionStatus(statuses.get("permission-gate"), theme),
							formatTpsStatus(statuses.get("tps"), theme),
							formatUsageStatus(statuses.get("usage"), theme),
						],
						width,
						theme,
					);

					return [locationLine, tokenLine, extensionLine].filter(Boolean);
				},
			};
		});
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setFooter(undefined);
	});
}
