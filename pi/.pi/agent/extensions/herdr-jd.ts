// @ts-nocheck

/**
 * Herdr bridge.
 *
 * Publishes the conversation short title as a Core terminal label for Herdr
 * App's Card File, or pane metadata for the legacy Herdr TUI. Lifecycle reports
 * and the terminal's own title are left alone.
 *
 * The generated `herdr-agent-state.ts` integration is Herdr-managed and is
 * overwritten on integration updates, so this bridge lives beside it.
 */
import { readFileSync } from "node:fs";

import {
	APP_TITLE_LABEL,
	SUMMARY_UPDATED_EVENT,
	TITLE_TTL_MS,
	composeAgentTitle,
	latestConversationTitle,
} from "./lib/herdr-title.ts";

const SUMMARY_ENTRY_TYPE = "conversation-summary";
const TOKEN_NAME = "title";
const GLYPH_TOKEN_NAME = "pi_glyph";
const SOURCE = "herdr:jd";

export default function (pi) {
	const terminalId = process.env.HC_TERMINAL_ID;
	const paneId = process.env.HERDR_PANE_ID;
	const legacyBin = process.env.HERDR_BIN_PATH;
	const legacy = process.env.HERDR_ENV === "1" && paneId && legacyBin;
	if (!terminalId && !legacy) return;

	let parentTitle;
	let parentResolved = false;
	let currentContext;
	let warned = false;
	let pending = Promise.resolve();

	// Keep writes ordered, including clear-before-reload. Never launch a shell.
	function run(args) {
		const ctx = currentContext;
		pending = pending.then(async () => {
			try {
				const result = await pi.exec(terminalId ? "hc" : legacyBin, args, {
					timeout: 2000,
					maxBuffer: 8192,
				});
				if (result.code !== 0) throw new Error("Title publish failed");
			} catch {
				if (ctx && currentContext === ctx && !warned) {
					warned = true;
					ctx.ui.notify("Herdr title could not be updated; check hc is on PATH", "warning");
				}
			}
		});
		return pending;
	}

	function clear() {
		if (terminalId) return run(["label", terminalId, `${APP_TITLE_LABEL}=`]);
		return run([
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
		if (terminalId) {
			const value = text ? JSON.stringify({ title: text, expiresAt: Date.now() + TITLE_TTL_MS }) : "";
			return run(["label", terminalId, `${APP_TITLE_LABEL}=${value}`]);
		}
		const titleArgs = text
			? ["--token", `${TOKEN_NAME}=${text}`]
			: ["--clear-token", TOKEN_NAME];
		return run([
			"pane",
			"report-metadata",
			paneId,
			"--source",
			SOURCE,
			"--token",
			`${GLYPH_TOKEN_NAME}=π`,
			...titleArgs,
			"--ttl-ms",
			String(TITLE_TTL_MS),
		]);
	}

	function latestTitle(ctx) {
		try {
			return latestConversationTitle(ctx.sessionManager.getBranch() ?? []);
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
			return publish(undefined);
		}

		if (force || !parentResolved) {
			parentTitle = resolveParentTitle(ctx);
			parentResolved = true;
		}

		return publish(
			composeAgentTitle({
				title,
				parentTitle,
			}),
		);
	}

	pi.on("session_start", (_event, ctx) => {
		// Non-interactive children inherit Core's terminal ID but do not own its card.
		if (ctx.mode !== "tui") return;
		currentContext = ctx;
		warned = false;
		parentTitle = undefined;
		parentResolved = false;
		return refresh(ctx, true);
	});

	for (const event of ["session_info_changed", "session_tree", "agent_start"]) {
		pi.on(event, (_event, ctx) => {
			if (currentContext) return refresh(ctx);
		});
	}

	const unsubscribe = pi.events.on(SUMMARY_UPDATED_EVENT, () => {
		if (currentContext) void refresh(currentContext);
	});

	pi.on("session_shutdown", () => {
		unsubscribe();
		if (!currentContext) return;
		const cleared = clear();
		currentContext = undefined;
		return cleared;
	});
}