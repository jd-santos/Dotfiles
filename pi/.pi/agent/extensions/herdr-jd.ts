// @ts-nocheck

/**
 * Herdr bridge.
 *
 * Publishes small pieces of Pi state as display-only Herdr pane metadata. The
 * first export is the conversation short title, shown on the Herdr Agent
 * sidebar row. Herdr tracks the value on the agent that owns the pane.
 *
 * The generated `herdr-agent-state.ts` integration is Herdr-managed and is
 * overwritten on integration updates, so this bridge lives beside it.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";

import { composeAgentTitle } from "./lib/herdr-title.ts";

const SUMMARY_ENTRY_TYPE = "conversation-summary";
const TOKEN_NAME = "title";
const GLYPH_TOKEN_NAME = "pi_glyph";
const SOURCE = "herdr:jd";
const TTL_MS = 6 * 60 * 60 * 1000;

export default function (pi) {
	const enabled = process.env.HERDR_ENV === "1";
	const paneId = process.env.HERDR_PANE_ID;
	const bin = process.env.HERDR_BIN_PATH;
	if (!enabled || !paneId || !bin) return;

	let parentTitle;
	let parentResolved = false;

	function run(args) {
		execFile(bin, args, () => {});
	}

	function clear() {
		run([
			"pane",
			"report-metadata",
			paneId,
			"--source",
			SOURCE,
			"--clear-token",
			TOKEN_NAME,
			"--clear-token",
			GLYPH_TOKEN_NAME,
		]);
	}

	function publish(text) {
		const titleArgs = text
			? ["--token", `${TOKEN_NAME}=${text}`]
			: ["--clear-token", TOKEN_NAME];
		run([
			"pane",
			"report-metadata",
			paneId,
			"--source",
			SOURCE,
			"--token",
			`${GLYPH_TOKEN_NAME}=π`,
			...titleArgs,
			"--ttl-ms",
			String(TTL_MS),
		]);
	}

	function latestTitle(ctx) {
		try {
			const entries = ctx.sessionManager.getEntries() ?? [];
			for (let index = entries.length - 1; index >= 0; index -= 1) {
				const entry = entries[index];
				if (
					entry?.type !== "custom" ||
					entry.customType !== SUMMARY_ENTRY_TYPE
				) {
					continue;
				}
				const data = entry.data ?? {};
				if (data.source === "manual-clear") return undefined;
				if (typeof data.title === "string" && data.title) return data.title;
				if (typeof data.summary === "string" && data.summary)
					return data.summary;
				return undefined;
			}
		} catch {
			// Fall through to no title.
		}
		return undefined;
	}

	// For a forked session, read the parent title from the parent session file
	// recorded in this session's header.
	function resolveParentTitle(ctx) {
		try {
			const file = ctx.sessionManager.getSessionFile?.();
			if (!file) return undefined;

			const header = JSON.parse(readFileSync(file, "utf8").split("\n", 1)[0]);
			const parent = header?.parentSession;
			if (typeof parent !== "string" || !parent) return undefined;

			let name;
			for (const line of readFileSync(parent, "utf8").split("\n")) {
				if (!line.trim()) continue;
				let entry;
				try {
					entry = JSON.parse(line);
				} catch {
					continue;
				}
				if (entry?.type === "session_info" && typeof entry.name === "string") {
					name = entry.name;
				}
				if (
					entry?.type === "custom" &&
					entry.customType === SUMMARY_ENTRY_TYPE
				) {
					const data = entry.data ?? {};
					if (typeof data.title === "string" && data.title) name = data.title;
				}
			}
			return name;
		} catch {
			return undefined;
		}
	}

	function refresh(ctx, force = false) {
		const title = latestTitle(ctx);
		if (!title) {
			publish(undefined);
			return;
		}

		if (force || !parentResolved) {
			parentTitle = resolveParentTitle(ctx);
			parentResolved = true;
		}

		publish(
			composeAgentTitle({
				title,
				parentTitle,
			}),
		);
	}

	pi.on("session_start", (_event, ctx) => {
		parentTitle = undefined;
		parentResolved = false;
		refresh(ctx, true);
	});

	pi.on("session_info_changed", (_event, ctx) => {
		refresh(ctx);
	});

	pi.on("session_shutdown", () => {
		clear();
	});
}