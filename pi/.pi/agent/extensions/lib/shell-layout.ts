import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { basename } from "node:path";

export const SHELL_DATA = "dotfiles:shell-data";
export const SHELL_DATA_REQUEST = "dotfiles:shell-data-request";

export type ThemeLike = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

export type ShellData = {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
};

export function plain(text: string | undefined): string {
	return String(text ?? "")
		.replace(
			/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|[@-Z\\-_])/g,
			"",
		)
		.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
		.trim();
}

export function styledStatus(text: string): string {
	// Keep SGR colors and emphasis, but not cursor, title, or hyperlink controls.
	return text
		.replace(
			/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\)|[@-Z\\-_])/g,
			(sequence) => /^\x1b\[[\d;:]*m$/.test(sequence) ? sequence : "",
		)
		.replace(/[\x00-\x1a\x1c-\x1f\x7f-\x9f]/g, " ")
		.replace(/\x1b(?!\[[\d;:]*m)/g, "")
		.trim();
}

export function field(
	theme: ThemeLike,
	label: string,
	text: string,
	color = "text",
): string {
	return `${theme.fg("dim", `${label} `)}${theme.fg(color, text)}`;
}

export function formatCount(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "0";
	if (n < 1_000) return String(Math.round(n));
	if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k`;
	return `${(n / 1_000_000).toFixed(1)}m`;
}

export function formatMoney(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "$0.000";
	return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
}

function tail(text: string, width: number): string {
	let result = "";
	const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
	const segments = [...segmenter.segment(text)];
	for (const { segment } of segments.reverse()) {
		if (visibleWidth(segment + result) > width) break;
		result = segment + result;
	}
	return result;
}

export function shortenMiddle(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	if (width === 1) return "…";
	const end = tail(text, Math.floor((width - 1) / 2));
	return `${truncateToWidth(text, width - 1 - visibleWidth(end), "")}…${end}`;
}

export function formatCwd(cwd: string): string {
	const home = homedir();
	if (cwd === home) return "~";
	return plain(cwd.startsWith(`${home}/`) ? `~/${cwd.slice(home.length + 1)}` : cwd);
}

export function location(theme: ThemeLike, cwd: string, width: number): string {
	const path = formatCwd(cwd);
	const leaf = path === "~" || path === "/" ? path : basename(path);
	let prefix = path.slice(0, path.length - leaf.length);
	if (visibleWidth(path) > width) prefix = prefix ? "…/" : "";
	if (visibleWidth(prefix + leaf) > width) prefix = "";
	const name = shortenMiddle(leaf, width - visibleWidth(prefix));
	return theme.fg("dim", prefix) + theme.fg("mdLink", theme.bold(name));
}

export function permission(status?: string): { mode: string; rules: string } {
	const parts = plain(status).split(/\s*\|\s*/);
	const rules = parts.filter((part) => /^[+-]\d+$/.test(part)).join(" ");
	let mode = parts.includes("ask") ? "ask" : "?";
	if (rules) mode = "scoped";
	if (parts.includes("yolo")) mode = "yolo";
	if (parts.includes("readonly")) mode = "readonly";
	return { mode, rules };
}

export function permissionLabel(
	theme: ThemeLike,
	status?: string,
	details = false,
): string {
	const { mode, rules } = permission(status);
	const color = mode === "yolo" ? "warning" : mode === "readonly" ? "mdLink" : "muted";
	return field(theme, "perm", `${mode}${details && rules ? ` ${rules}` : ""}`, color);
}

export function workspaceLabel(
	theme: ThemeLike,
	cwd: string,
	data: ShellData | undefined,
	width: number,
): string {
	const status = data?.getExtensionStatuses().get("permission-gate");
	const perm = permissionLabel(theme, status, width >= 90);
	const branch = plain(data?.getGitBranch() ?? undefined);
	const branchText = branch || (data ? "no repo" : "…");
	const permWidth = visibleWidth(perm);
	// Budget each field independently so long paths cannot consume the branch or mode.
	if (width < permWidth + 12) {
		const mode = permission(status).mode;
		const git = theme.fg("mdCode", shortenMiddle(branchText, 4));
		const modeText = theme.fg(mode === "yolo" ? "warning" : "muted", mode);
		return truncateToWidth(`${location(theme, cwd, 4)} ${git} ${modeText}`, width, "…");
	}
	const available = width - permWidth - 4;
	const branchWidth = Math.min(
		visibleWidth(branchText) + 4,
		Math.max(10, Math.floor(available * 0.5)),
	);
	const cwdWidth = available - branchWidth;
	const git = field(
		theme,
		"git",
		shortenMiddle(branchText, branchWidth - 4),
		branch === "detached" ? "warning" : branch ? "mdCode" : "dim",
	);
	const left = `${location(theme, cwd, cwdWidth)}  ${git}`;
	return left + " ".repeat(Math.max(2, width - visibleWidth(left) - permWidth)) + perm;
}

export function border(
	theme: ThemeLike,
	label: string,
	width: number,
	overflow = "",
	bash = false,
): string {
	if (width <= 0) return "";
	const color = bash ? "bashMode" : "border";
	const right = overflow ? ` ${overflow} ` : "";
	const budget = Math.max(0, width - visibleWidth(right) - 4);
	const content = truncateToWidth(label, budget, "…");
	const fill = Math.max(0, width - visibleWidth(content) - visibleWidth(right) - 3);
	const line = theme.fg(color, "─ ") + content +
		theme.fg(color, ` ${"─".repeat(fill)}${right}`);
	return truncateToWidth(line, width, "");
}

export function packRows(
	parts: Array<string | undefined>,
	width: number,
	separator = "  ",
): string[] {
	if (width <= 0) return [];
	const lines: string[] = [];
	let line = "";
	for (const part of parts) {
		if (!part) continue;
		const segment = truncateToWidth(part, width, "…");
		if (line && visibleWidth(line + separator + segment) > width) {
			lines.push(line);
			line = "";
		}
		line = line ? line + separator + segment : segment;
	}
	if (line) lines.push(line);
	return lines;
}

export function contextMeter(
	theme: ThemeLike,
	usage: { percent?: number | null; tokens?: number | null; contextWindow?: number } | undefined,
	modelWindow: number | undefined,
	width: number,
): string {
	const window = usage?.contextWindow ?? modelWindow;
	const suffix = window ? theme.fg("dim", ` / ${formatCount(window)}`) : "";
	if (
		usage?.tokens === null ||
		typeof usage?.percent !== "number" ||
		!Number.isFinite(usage.percent)
	) {
		const label = field(theme, "ctx", "unavailable", "muted");
		return truncateToWidth(label + suffix, width, "…");
	}
	const percent = Math.max(0, Math.min(100, usage.percent));
	const color = percent >= 80 ? "error" : percent >= 50 ? "warning" : "syntaxOperator";
	const percentText = `${Math.round(percent)}%`.padStart(4);
	const label = theme.fg("dim", "ctx ");
	const barWidth = Math.min(20, Math.max(0, width - 10 - visibleWidth(suffix)));
	const fill = Math.round((percent / 100) * barWidth);
	const bar = theme.fg(color, "█".repeat(fill)) +
		theme.fg("border", "░".repeat(barWidth - fill));
	const line = `${label}${bar}${barWidth ? " " : ""}${theme.fg(color, percentText)}${suffix}`;
	return truncateToWidth(line, width, "…");
}

export function terminalTitle(cwd: string, branch: string | null): string {
	return `Pi · ${plain(basename(cwd) || cwd)}${branch ? ` · ${plain(branch)}` : ""}`;
}
