// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface FileStat {
	path: string;
	added: number | null;
	deleted: number | null;
	status: string;
}

type Mode = "unstaged" | "staged" | "all";

function parseMode(args: string): Mode {
	const normalized = args.trim();
	if (normalized === "--staged" || normalized === "staged") return "staged";
	if (normalized === "--all" || normalized === "all") return "all";
	return "unstaged";
}

function parseNumstat(output: string): FileStat[] {
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [addedRaw, deletedRaw, ...pathParts] = line.split(/\s+/);
			return {
				path: pathParts.join(" "),
				added: addedRaw === "-" ? null : Number(addedRaw),
				deleted: deletedRaw === "-" ? null : Number(deletedRaw),
				status: "modified",
			};
		});
}

function parsePorcelain(output: string): Map<string, string> {
	const statuses = new Map<string, string>();
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const status = line.slice(0, 2);
		let path = line.slice(3);
		const renameMarker = " -> ";
		if (path.includes(renameMarker))
			path = path.split(renameMarker).at(-1) ?? path;
		statuses.set(path, status);
	}
	return statuses;
}

async function countUntrackedLines(
	cwd: string,
	path: string,
): Promise<number | null> {
	try {
		const buffer = await readFile(resolve(cwd, path));
		if (buffer.includes(0)) return null;
		const text = buffer.toString("utf8");
		if (!text) return 0;
		return text.endsWith("\n")
			? text.split("\n").length - 1
			: text.split("\n").length;
	} catch {
		return null;
	}
}

function formatCount(value: number | null): string {
	return value === null ? "binary" : value.toLocaleString();
}

function summarize(files: FileStat[], mode: Mode): string {
	const changed = files.length;
	const added = files.reduce((sum, file) => sum + (file.added ?? 0), 0);
	const deleted = files.reduce((sum, file) => sum + (file.deleted ?? 0), 0);
	const binary = files.filter(
		(file) => file.added === null || file.deleted === null,
	).length;
	const label =
		mode === "unstaged"
			? "unstaged"
			: mode === "staged"
				? "staged"
				: "staged and unstaged";

	if (changed === 0) return `No ${label} changes found.`;

	const lines = [
		`Found ${changed} ${label} changed file${changed === 1 ? "" : "s"}: +${added.toLocaleString()} / -${deleted.toLocaleString()}${binary ? ` (${binary} binary)` : ""}.`,
		"",
		"| File | Status | + | - |",
		"| --- | ---: | ---: | ---: |",
	];

	for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
		lines.push(
			`| \`${file.path}\` | ${file.status.trim() || "modified"} | ${formatCount(file.added)} | ${formatCount(file.deleted)} |`,
		);
	}

	lines.push(
		"",
		`Total: +${added.toLocaleString()} / -${deleted.toLocaleString()}`,
	);
	return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("lg", {
		description:
			"Summarize git changes with per-file +/- counts. Args: --staged, --all",
		handler: async (args, ctx) => {
			const mode = parseMode(args ?? "");
			const diffArgs =
				mode === "staged" ? "--cached" : mode === "all" ? "HEAD" : "";
			const statusResult = await pi.exec("git", ["status", "--porcelain"], {
				signal: ctx.signal,
				timeout: 10_000,
			});
			if (statusResult.code !== 0) {
				ctx.ui.notify(
					`git status failed: ${statusResult.stderr || statusResult.stdout}`,
					"error",
				);
				return;
			}

			const numstatCommand = `git diff --numstat ${diffArgs}`.trim();
			const diffResult = await pi.exec("bash", ["-lc", numstatCommand], {
				signal: ctx.signal,
				timeout: 10_000,
			});
			if (diffResult.code !== 0) {
				ctx.ui.notify(
					`git diff failed: ${diffResult.stderr || diffResult.stdout}`,
					"error",
				);
				return;
			}

			const statuses = parsePorcelain(statusResult.stdout ?? "");
			const files = parseNumstat(diffResult.stdout ?? "").map((file) => ({
				...file,
				status: statuses.get(file.path) ?? file.status,
			}));

			if (mode !== "staged") {
				const untrackedResult = await pi.exec(
					"bash",
					["-lc", "git ls-files --others --exclude-standard"],
					{
						signal: ctx.signal,
						timeout: 10_000,
					},
				);
				for (const path of (untrackedResult.stdout ?? "")
					.split("\n")
					.filter(Boolean)) {
					if (files.some((file) => file.path === path)) continue;
					files.push({
						path,
						status: "??",
						added: await countUntrackedLines(ctx.cwd, path),
						deleted: 0,
					});
				}
			}

			const report = summarize(files, mode);
			if (!ctx.hasUI) return;

			ctx.ui.setWidget("lg", report.split("\n"), { placement: "belowEditor" });
			ctx.ui.notify(
				"Git summary shown below the editor. It clears in 20s.",
				"info",
			);
			setTimeout(() => {
				try {
					ctx.ui.setWidget("lg", undefined);
				} catch {
					// The extension context can be stale if the session exits or reloads before the timer fires.
				}
			}, 20_000);
		},
	});
}
