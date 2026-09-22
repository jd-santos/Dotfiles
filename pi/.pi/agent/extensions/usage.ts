// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";

interface UsageRecord {
	source: "Pi parent" | "Pi child" | "Codex CLI";
	provider: string;
	model: string;
	timestamp: number;
	input: number;
	output: number;
	cacheRead: number;
	total: number;
	recordedPrice?: number;
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

interface PiParseStats {
	duplicates: number;
	skipped: number;
}

interface ChildParseResult {
	records: UsageRecord[];
	runIds: Set<string>;
	transcriptPaths: Set<string>;
	skipped: number;
}

const WINDOWS = [1, 7, 30, 90];
const MAX_WIDGET_LINES = 160;
const CODEX_ALLOWANCE_CACHE_MS = 5 * 60 * 1000;
const CODEX_ALLOWANCE_TIMEOUT_MS = 7_500;
const PRICING_URL =
	process.env.PI_USAGE_PRICING_URL ??
	["https:/", "models.dev", "api.json"].join("/");
let codexAllowanceCache:
	| { fetchedAt: number; result: any; error?: undefined }
	| { fetchedAt: number; result?: undefined; error: string }
	| undefined;

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

async function findFiles(
	root: string,
	predicate: (path: string, name: string) => boolean,
): Promise<string[]> {
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
			else if (entry.isFile() && predicate(path, entry.name)) files.push(path);
		}
	}
	await walk(root);
	return files;
}

async function findJsonlFiles(root: string): Promise<string[]> {
	return findFiles(root, (_path, name) => name.endsWith(".jsonl"));
}

function splitModel(value: unknown): { provider: string; model: string } {
	const full = String(value ?? "unknown").replace(
		/:(off|minimal|low|medium|high|xhigh|max)$/,
		"",
	);
	const slash = full.indexOf("/");
	if (slash < 0) return { provider: "pi", model: full };
	return { provider: full.slice(0, slash), model: full.slice(slash + 1) };
}

async function parseChildMetadata(root: string): Promise<ChildParseResult> {
	const files = await findFiles(
		root,
		(path, name) =>
			path.includes(`${sep}subagent-artifacts${sep}`) &&
			name.endsWith("_meta.json"),
	);
	const records: UsageRecord[] = [];
	const runIds = new Set<string>();
	const transcriptPaths = new Set<string>();
	const identities = new Set<string>();
	let skipped = 0;

	for (const path of files) {
		let metadata: any;
		try {
			metadata = JSON.parse(await readFile(path, "utf8"));
		} catch {
			skipped++;
			continue;
		}
		if (typeof metadata?.runId === "string") runIds.add(metadata.runId);
		if (typeof metadata?.transcriptPath === "string")
			transcriptPaths.add(metadata.transcriptPath);

		const usage = metadata?.usage;
		if (!usage) continue;
		const identity =
			typeof metadata.transcriptPath === "string"
				? metadata.transcriptPath
				: `${metadata.runId ?? basename(path)}:${metadata.agent ?? "agent"}:${metadata.timestamp ?? "unknown"}`;
		if (identities.has(identity)) continue;
		identities.add(identity);

		const input = asNumber(usage.input);
		const output = asNumber(usage.output);
		const cacheRead = asNumber(usage.cacheRead);
		const model = splitModel(metadata.model);
		records.push({
			source: "Pi child",
			provider: model.provider,
			model: model.model,
			timestamp: timestampFrom(
				metadata.timestamp,
				(await stat(path).catch(() => undefined))?.mtimeMs ?? Date.now(),
			),
			input,
			output,
			cacheRead,
			total: input + output + cacheRead,
			...(typeof usage.cost === "number" && Number.isFinite(usage.cost)
				? { recordedPrice: usage.cost }
				: {}),
		});
	}
	return { records, runIds, transcriptPaths, skipped };
}

function isChildSessionPath(
	path: string,
	runIds: Set<string>,
	transcriptPaths: Set<string>,
): boolean {
	if (
		path.includes(`${sep}subagent-artifacts${sep}`) ||
		transcriptPaths.has(path)
	)
		return true;
	const parts = new Set(path.split(sep));
	for (const runId of runIds) if (parts.has(runId)) return true;
	return false;
}

async function parsePiFiles(
	paths: string[],
	runIds: Set<string>,
	transcriptPaths: Set<string>,
): Promise<{
	records: UsageRecord[];
	stats: PiParseStats;
	childFilesExcluded: number;
}> {
	const records: UsageRecord[] = [];
	const entryIds = new Set<string>();
	const stats: PiParseStats = { duplicates: 0, skipped: 0 };
	let childFilesExcluded = 0;

	for (const path of paths) {
		if (isChildSessionPath(path, runIds, transcriptPaths)) {
			childFilesExcluded++;
			continue;
		}
		const fileStat = await stat(path).catch(() => undefined);
		const fallbackTime = fileStat?.mtimeMs ?? Date.now();
		const text = await readFile(path, "utf8").catch(() => "");
		let lineNumber = 0;
		for (const line of text.split("\n")) {
			lineNumber++;
			if (!line.trim()) continue;
			let entry;
			try {
				entry = JSON.parse(line);
			} catch {
				stats.skipped++;
				continue;
			}
			const message = entry?.message;
			const usage = message?.usage;
			if (entry?.type !== "message" || message?.role !== "assistant" || !usage)
				continue;

			const identity =
				typeof entry.id === "string" ? entry.id : `${path}:${lineNumber}`;
			if (entryIds.has(identity)) {
				stats.duplicates++;
				continue;
			}
			entryIds.add(identity);
			const input = asNumber(usage.input);
			const output = asNumber(usage.output);
			const cacheRead = asNumber(
				usage.cacheRead ?? usage.cachedInput ?? usage.cached_input_tokens,
			);
			const total = asNumber(usage.totalTokens) || input + output + cacheRead;
			const recordedCost = asNumber(
				usage.cost?.total ??
					asNumber(usage.cost?.input) +
						asNumber(usage.cost?.output) +
						asNumber(usage.cost?.cacheRead) +
						asNumber(usage.cost?.cacheWrite),
			);
			records.push({
				source: "Pi parent",
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
				...(recordedCost > 0 ? { recordedPrice: recordedCost } : {}),
			});
		}
	}
	return { records, stats, childFilesExcluded };
}

function getCodexUsage(info: any) {
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

async function parseCodexFiles(
	paths: string[],
): Promise<{ records: UsageRecord[]; skipped: number }> {
	const records: UsageRecord[] = [];
	let skipped = 0;
	for (const path of paths) {
		let currentModel = "unknown";
		let currentProvider = "codex-cli";
		const fallbackTime =
			(await stat(path).catch(() => undefined))?.mtimeMs ?? Date.now();
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
		if (input !== undefined || output !== undefined || cacheRead !== undefined)
			prices.set(normalizeKey(key), { input, output, cacheRead });
	}
	function walk(node: any, path: string[] = []) {
		if (!node || typeof node !== "object") return;
		const id = node.id ?? node.name ?? node.model;
		if (typeof id === "string") add(id, node);
		if (path.length > 0) add(path.join("/"), node);
		for (const [key, value] of Object.entries(node))
			if (value && typeof value === "object") walk(value, [...path, key]);
	}
	walk(data);
	return prices;
}

async function loadPricing() {
	try {
		const response = await fetch(PRICING_URL, {
			headers: { "User-Agent": "Mozilla/5.0 pi-usage-extension" },
		});
		if (!response.ok)
			return {
				prices: new Map<string, PriceInfo>(),
				note: `models.dev returned HTTP ${response.status}`,
			};
		return {
			prices: collectPricing(await response.json()),
			note: `models.dev lookup ${new Date().toISOString().slice(0, 10)}`,
		};
	} catch (error) {
		return {
			prices: new Map<string, PriceInfo>(),
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
	for (const candidate of candidates)
		if (prices.has(candidate)) return prices.get(candidate);
	for (const [key, price] of prices)
		if (
			candidates.some(
				(candidate) => key.endsWith(candidate) || candidate.endsWith(key),
			)
		)
			return price;
	return undefined;
}

function estimatedCost(
	record: Pick<
		UsageRecord,
		"provider" | "model" | "input" | "output" | "cacheRead"
	>,
	prices: Map<string, PriceInfo>,
): number {
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
	const cutoff = now - windowDays * 86_400_000;
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
		group.price +=
			record.recordedPrice === undefined
				? estimatedCost(record, prices)
				: record.recordedPrice;
		groups.set(key, group);
	}
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
		"| Source | Model | Turns/Runs | Input | Output | Cached In | Total Tokens | Cost |",
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
	for (const row of rows)
		lines.push(
			`| ${row.source} | ${row.provider}/${row.model} | ${int(row.turns)} | ${int(row.input)} | ${int(row.output)} | ${int(row.cacheRead)} | ${int(row.total)} | ${money(row.price)} |`,
		);
	lines.push(
		`| **Combined** |  | **${int(total.turns)}** | **${int(total.input)}** | **${int(total.output)}** | **${int(total.cacheRead)}** | **${int(total.total)}** | **${money(total.price)}** |`,
		"",
	);
	return lines;
}

function fetchCodexAllowance(): Promise<any> {
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
				finish(
					new Error(`Codex app-server exited with status ${code ?? "unknown"}`),
				);
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
						return finish(
							new Error(message.error.message ?? "Codex initialization failed"),
						);
					send({ method: "initialized", params: {} });
					send({ id: 2, method: "account/rateLimits/read", params: {} });
				} else if (message.id === 2) {
					if (message.error)
						return finish(
							new Error(message.error.message ?? "Codex allowance lookup failed"),
						);
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

async function loadCodexAllowance() {
	if (
		codexAllowanceCache &&
		Date.now() - codexAllowanceCache.fetchedAt < CODEX_ALLOWANCE_CACHE_MS
	)
		return codexAllowanceCache;
	try {
		codexAllowanceCache = {
			fetchedAt: Date.now(),
			result: await fetchCodexAllowance(),
		};
	} catch (error) {
		codexAllowanceCache = {
			fetchedAt: Date.now(),
			error: error instanceof Error ? error.message : String(error),
		};
	}
	return codexAllowanceCache;
}

function durationLabel(minutes: unknown, fallback: string): string {
	const value = asNumber(minutes);
	if (value >= 10_000 && value <= 10_500) return "Weekly";
	if (value >= 280 && value <= 320) return "5-hour";
	if (value >= 1_400 && value <= 1_500) return "Daily";
	return value ? `${Math.round(value / 60)}h window` : fallback;
}

function resetLabel(value: unknown): string {
	const seconds = asNumber(value);
	if (!seconds) return "unknown";
	return new Date(seconds * 1000).toLocaleString();
}

function allowanceLines(snapshot: any): string[] {
	if (snapshot.error)
		return [
			"### Codex subscription allowance",
			"",
			`Unavailable: ${snapshot.error}.`,
			"",
		];
	const result = snapshot.result ?? {};
	const buckets =
		result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length
			? Object.entries(result.rateLimitsByLimitId)
			: [[result.rateLimits?.limitId ?? "Codex", result.rateLimits]];
	const lines = [
		"### Codex subscription allowance",
		"",
		"| Allowance | Window | Used | Remaining | Resets |",
		"| --- | --- | ---: | ---: | --- |",
	];
	let plan: string | undefined;
	for (const [id, bucket] of buckets) {
		if (!bucket) continue;
		plan ??= bucket.planType ? String(bucket.planType) : undefined;
		const label = bucket.limitName ?? id;
		for (const [role, window] of [
			["Primary", bucket.primary],
			["Secondary", bucket.secondary],
		]) {
			if (!window) continue;
			const used = Math.max(0, Math.min(100, asNumber(window.usedPercent)));
			lines.push(
				`| ${label} | ${durationLabel(window.windowDurationMins, role)} | ${used.toFixed(0)}% | ${(100 - used).toFixed(0)}% | ${resetLabel(window.resetsAt)} |`,
			);
		}
	}
	lines.push("");
	if (plan) lines.push(`- Plan: ${plan}.`);
	lines.push(
		`- Live snapshot via Codex app-server; cached for ${CODEX_ALLOWANCE_CACHE_MS / 60_000} minutes.`,
		"",
	);
	return lines;
}

export {
	aggregate,
	allowanceLines,
	isChildSessionPath,
	parseChildMetadata,
	parsePiFiles,
};

export default function (pi: ExtensionAPI) {
	pi.registerCommand("usage", {
		description:
			"Show deduplicated parent, child, Codex CLI, and subscription usage",
		handler: async (_args, ctx) => {
			if (ctx.hasUI)
				ctx.ui.setStatus("usage", ctx.ui.theme.fg("dim", "usage: scanning..."));
			const piRoot = join(homedir(), ".pi", "agent", "sessions");
			const children = await parseChildMetadata(piRoot);
			const piFiles = await findJsonlFiles(piRoot);
			const parents = await parsePiFiles(
				piFiles,
				children.runIds,
				children.transcriptPaths,
			);
			const codexFiles = [
				...(await findJsonlFiles(join(homedir(), ".codex", "sessions"))),
				...(await findJsonlFiles(join(homedir(), ".codex", "archived_sessions"))),
			];
			const codex = await parseCodexFiles(codexFiles);
			if (ctx.hasUI)
				ctx.ui.setStatus(
					"usage",
					ctx.ui.theme.fg("dim", "usage: pricing and allowance..."),
				);
			const [pricing, allowance] = await Promise.all([
				loadPricing(),
				loadCodexAllowance(),
			]);
			const records = [...parents.records, ...children.records, ...codex.records];
			const now = Date.now();
			const lines = ["# Usage report", "", ...allowanceLines(allowance)];
			for (const days of WINDOWS)
				lines.push(
					...tableFor(
						`Last ${days} day${days === 1 ? "" : "s"}`,
						aggregate(records, days, now, pricing.prices),
					),
				);

			const unmatched = new Set<string>();
			for (const record of records)
				if (
					record.source !== "Pi child" &&
					!findPrice(pricing.prices, record.provider, record.model)
				)
					unmatched.add(`${record.provider}/${record.model}`);
			lines.push(
				"### Accounting notes",
				"",
				`- ${pricing.note}. Child costs use recorded subagent metadata instead of estimated pricing.`,
				`- Parent Pi entries: ${parents.records.length.toLocaleString()} unique; ${parents.stats.duplicates.toLocaleString()} cloned duplicates excluded.`,
				`- Child runs: ${children.records.length.toLocaleString()} metadata records; ${parents.childFilesExcluded.toLocaleString()} child JSONL files excluded from parent totals.`,
				`- Codex CLI records: ${codex.records.length.toLocaleString()} across ${codexFiles.length.toLocaleString()} files.`,
				`- Skipped malformed records: Pi ${parents.stats.skipped}, child metadata ${children.skipped}, Codex CLI ${codex.skipped}.`,
				"- Codex CLI reasoning output tokens are included in output and total tokens when present.",
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
