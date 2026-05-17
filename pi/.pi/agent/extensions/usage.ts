// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface UsageRecord {
	source: "Pi" | "Codex CLI";
	provider: string;
	model: string;
	timestamp: number;
	input: number;
	output: number;
	cacheRead: number;
	total: number;
}

interface Aggregate {
	source: string;
	provider: string;
	model: string;
	turns: number;
	input: number;
	output: number;
	cacheRead: number;
	total: number;
	price: number;
}

interface PriceInfo {
	input?: number;
	output?: number;
	cacheRead?: number;
}

const WINDOWS = [1, 7, 30, 90];
const MAX_WIDGET_LINES = 120;

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function timestampFrom(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value))
		return value > 10_000_000_000 ? value : value * 1000;
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

async function findJsonlFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile() && entry.name.endsWith(".jsonl"))
				files.push(path);
		}
	}
	await walk(root);
	return files;
}

async function parsePiFile(
	path: string,
): Promise<{ records: UsageRecord[]; skipped: number }> {
	const records: UsageRecord[] = [];
	let skipped = 0;
	const fileStat = await stat(path).catch(() => undefined);
	const fallbackTime = fileStat?.mtimeMs ?? Date.now();
	const text = await readFile(path, "utf8").catch(() => "");

	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			skipped++;
			continue;
		}

		const message = entry?.message;
		const usage = message?.usage;
		if (entry?.type !== "message" || message?.role !== "assistant" || !usage)
			continue;

		const input = asNumber(usage.input);
		const output = asNumber(usage.output);
		const cacheRead = asNumber(
			usage.cacheRead ?? usage.cachedInput ?? usage.cached_input_tokens,
		);
		const total = asNumber(usage.totalTokens) || input + output + cacheRead;
		records.push({
			source: "Pi",
			provider: String(message.provider ?? message.api ?? "pi"),
			model: String(message.model ?? "unknown"),
			timestamp: timestampFrom(
				message.timestamp ?? entry.timestamp,
				fallbackTime,
			),
			input,
			output,
			cacheRead,
			total,
		});
	}
	return { records, skipped };
}

function getCodexUsage(info: any): {
	input: number;
	output: number;
	cacheRead: number;
	total: number;
} {
	const usage =
		info?.last_token_usage ?? info?.lastTokenUsage ?? info?.usage ?? info;
	const input = asNumber(
		usage?.input_tokens ?? usage?.input ?? usage?.prompt_tokens,
	);
	const output = asNumber(
		usage?.output_tokens ?? usage?.output ?? usage?.completion_tokens,
	);
	const cacheRead = asNumber(
		usage?.cached_input_tokens ??
			usage?.cache_read_input_tokens ??
			usage?.cacheRead,
	);
	const total =
		asNumber(usage?.total_tokens ?? usage?.totalTokens) ||
		input + output + cacheRead;
	return { input, output, cacheRead, total };
}

async function parseCodexFile(
	path: string,
): Promise<{ records: UsageRecord[]; skipped: number }> {
	const records: UsageRecord[] = [];
	let skipped = 0;
	let currentModel = "unknown";
	let currentProvider = "codex-cli";
	const fileStat = await stat(path).catch(() => undefined);
	const fallbackTime = fileStat?.mtimeMs ?? Date.now();
	const text = await readFile(path, "utf8").catch(() => "");

	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			skipped++;
			continue;
		}

		const payload = entry?.payload ?? entry;
		const type = payload?.type ?? entry?.type;
		if (type === "turn_context" || type === "session_meta") {
			currentModel = String(payload.model ?? payload.model_id ?? currentModel);
			currentProvider = String(
				payload.provider ?? payload.provider_id ?? currentProvider,
			);
			continue;
		}

		if (type !== "token_count") continue;
		const usage = getCodexUsage(payload?.info ?? payload);
		if (usage.total <= 0) continue;
		records.push({
			source: "Codex CLI",
			provider: currentProvider,
			model: String(payload.model ?? payload.model_id ?? currentModel),
			timestamp: timestampFrom(
				payload.timestamp ?? entry.timestamp,
				fallbackTime,
			),
			...usage,
		});
	}
	return { records, skipped };
}

function normalizeKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9.:-]+/g, "");
}

function pickPrice(model: any, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = key.split(".").reduce((obj, part) => obj?.[part], model);
		if (typeof value === "number") return value;
	}
	return undefined;
}

function collectPricing(data: any): Map<string, PriceInfo> {
	const prices = new Map<string, PriceInfo>();

	function add(key: string, model: any) {
		const input = pickPrice(model, [
			"cost.input",
			"pricing.input",
			"price.input",
			"input",
		]);
		const output = pickPrice(model, [
			"cost.output",
			"pricing.output",
			"price.output",
			"output",
		]);
		const cacheRead = pickPrice(model, [
			"cost.cacheRead",
			"cost.cachedInput",
			"pricing.cacheRead",
			"pricing.cachedInput",
			"price.cacheRead",
		]);
		if (input === undefined && output === undefined && cacheRead === undefined)
			return;
		prices.set(normalizeKey(key), { input, output, cacheRead });
	}

	function walk(node: any, path: string[] = []) {
		if (!node || typeof node !== "object") return;
		const id = node.id ?? node.name ?? node.model;
		if (typeof id === "string") add(id, node);
		if (path.length > 0) add(path.join("/"), node);
		for (const [key, value] of Object.entries(node)) {
			if (value && typeof value === "object") walk(value, [...path, key]);
		}
	}

	walk(data);
	return prices;
}

async function loadPricing(): Promise<{
	prices: Map<string, PriceInfo>;
	note: string;
}> {
	try {
		const response = await fetch("https://models.dev/api.json", {
			headers: { "User-Agent": "Mozilla/5.0 pi-usage-extension" },
		});
		if (!response.ok)
			return {
				prices: new Map(),
				note: `models.dev returned HTTP ${response.status}`,
			};
		return {
			prices: collectPricing(await response.json()),
			note: `models.dev lookup ${new Date().toISOString().slice(0, 10)}`,
		};
	} catch (error) {
		return {
			prices: new Map(),
			note: `models.dev lookup failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

function findPrice(
	prices: Map<string, PriceInfo>,
	provider: string,
	model: string,
): PriceInfo | undefined {
	const candidates = [
		normalizeKey(`${provider}/${model}`),
		normalizeKey(model),
		normalizeKey(model.split("/").at(-1) ?? model),
	];
	for (const candidate of candidates) {
		if (prices.has(candidate)) return prices.get(candidate);
	}
	for (const [key, price] of prices) {
		if (
			candidates.some(
				(candidate) => key.endsWith(candidate) || candidate.endsWith(key),
			)
		)
			return price;
	}
	return undefined;
}

function costFor(record: Aggregate, prices: Map<string, PriceInfo>): number {
	const price = findPrice(prices, record.provider, record.model);
	if (!price) return 0;
	return (
		((price.input ?? 0) * record.input +
			(price.output ?? 0) * record.output +
			(price.cacheRead ?? 0) * record.cacheRead) /
		1_000_000
	);
}

function aggregate(
	records: UsageRecord[],
	windowDays: number,
	now: number,
	prices: Map<string, PriceInfo>,
): Aggregate[] {
	const cutoff = now - windowDays * 24 * 60 * 60 * 1000;
	const groups = new Map<string, Aggregate>();
	for (const record of records) {
		if (record.timestamp < cutoff) continue;
		const key = `${record.source}\t${record.provider}\t${record.model}`;
		const group = groups.get(key) ?? {
			source: record.source,
			provider: record.provider,
			model: record.model,
			turns: 0,
			input: 0,
			output: 0,
			cacheRead: 0,
			total: 0,
			price: 0,
		};
		group.turns++;
		group.input += record.input;
		group.output += record.output;
		group.cacheRead += record.cacheRead;
		group.total += record.total;
		groups.set(key, group);
	}
	for (const group of groups.values()) group.price = costFor(group, prices);
	return [...groups.values()].sort((a, b) => b.total - a.total);
}

function money(value: number): string {
	return value >= 10 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function int(value: number): string {
	return Math.round(value).toLocaleString();
}

function tableFor(title: string, rows: Aggregate[]): string[] {
	const lines = [
		`### ${title}`,
		"",
		"| Source | Model | Turns | Input | Output | Cached In | Total Tokens | Price |",
		"| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
	];
	const total = rows.reduce(
		(sum, row) => ({
			turns: sum.turns + row.turns,
			input: sum.input + row.input,
			output: sum.output + row.output,
			cacheRead: sum.cacheRead + row.cacheRead,
			total: sum.total + row.total,
			price: sum.price + row.price,
		}),
		{ turns: 0, input: 0, output: 0, cacheRead: 0, total: 0, price: 0 },
	);

	for (const row of rows) {
		lines.push(
			`| ${row.source} | ${row.provider}/${row.model} | ${int(row.turns)} | ${int(row.input)} | ${int(row.output)} | ${int(row.cacheRead)} | ${int(row.total)} | ${money(row.price)} |`,
		);
	}
	lines.push(
		`| **Total** |  | **${int(total.turns)}** | **${int(total.input)}** | **${int(total.output)}** | **${int(total.cacheRead)}** | **${int(total.total)}** | **${money(total.price)}** |`,
		"",
	);
	return lines;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description:
			"Show Pi and Codex CLI token usage for the last 1, 7, 30, and 90 days",
		handler: async (_args, ctx) => {
			if (ctx.hasUI)
				ctx.ui.setStatus("usage", ctx.ui.theme.fg("dim", "usage: scanning..."));

			const piFiles = await findJsonlFiles(
				join(homedir(), ".pi", "agent", "sessions"),
			);
			const codexFiles = [
				...(await findJsonlFiles(join(homedir(), ".codex", "sessions"))),
				...(await findJsonlFiles(
					join(homedir(), ".codex", "archived_sessions"),
				)),
			];

			const records: UsageRecord[] = [];
			let skippedPi = 0;
			let skippedCodex = 0;

			for (const file of piFiles) {
				const parsed = await parsePiFile(file);
				records.push(...parsed.records);
				skippedPi += parsed.skipped;
			}
			for (const file of codexFiles) {
				const parsed = await parseCodexFile(file);
				records.push(...parsed.records);
				skippedCodex += parsed.skipped;
			}

			if (ctx.hasUI)
				ctx.ui.setStatus("usage", ctx.ui.theme.fg("dim", "usage: pricing..."));
			const pricing = await loadPricing();
			const now = Date.now();
			const lines = ["# Usage report", ""];
			for (const days of WINDOWS)
				lines.push(
					...tableFor(
						`Last ${days} day${days === 1 ? "" : "s"}`,
						aggregate(records, days, now, pricing.prices),
					),
				);

			const unmatched = new Set<string>();
			for (const record of records) {
				if (!findPrice(pricing.prices, record.provider, record.model))
					unmatched.add(`${record.provider}/${record.model}`);
			}
			lines.push(
				"### Pricing notes",
				"",
				`- ${pricing.note}.`,
				`- Parsed ${piFiles.length} Pi files and ${codexFiles.length} Codex CLI files.`,
				`- Skipped malformed lines: Pi ${skippedPi}, Codex CLI ${skippedCodex}.`,
				"- Codex CLI reasoning output tokens are treated as included in output and total tokens when present.",
			);
			if (unmatched.size > 0)
				lines.push(
					`- No models.dev price match for: ${[...unmatched].slice(0, 20).join(", ")}${unmatched.size > 20 ? ", …" : ""}. Missing rates are priced as $0.`,
				);

			const widgetLines =
				lines.length > MAX_WIDGET_LINES
					? [
							...lines.slice(0, MAX_WIDGET_LINES),
							"",
							`Report truncated in widget at ${MAX_WIDGET_LINES} lines.`,
						]
					: lines;
			ctx.ui.setWidget("usage", widgetLines, { placement: "belowEditor" });
			ctx.ui.notify(
				"Usage report shown below the editor. Run /usage again to refresh.",
				"info",
			);
			if (ctx.hasUI)
				ctx.ui.setStatus(
					"usage",
					ctx.ui.theme.fg(
						"dim",
						`usage: ${records.length.toLocaleString()} records`,
					),
				);
		},
	});
}
