// @ts-nocheck

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const COMPACT_AT_PERCENT = 70;
const RETRY_AFTER_ADDITIONAL_TOKENS = 5_000;

export default function (pi: ExtensionAPI) {
	let compacting = false;
	let lastFailedAtTokens: number | undefined;

	const reset = () => {
		compacting = false;
		lastFailedAtTokens = undefined;
	};

	const maybeCompact = (ctx: ExtensionContext) => {
		const usage = ctx.getContextUsage();
		if (
			compacting ||
			usage?.tokens === null ||
			usage?.tokens === undefined ||
			usage.percent === null ||
			usage.percent === undefined ||
			!Number.isFinite(usage.percent) ||
			usage.percent < COMPACT_AT_PERCENT
		)
			return;
		if (
			lastFailedAtTokens !== undefined &&
			usage.tokens < lastFailedAtTokens + RETRY_AFTER_ADDITIONAL_TOKENS
		)
			return;

		compacting = true;
		if (ctx.hasUI)
			ctx.ui.notify(
				`Context reached ${usage.percent.toFixed(1)}%; compacting at the 70% limit.`,
				"info",
			);
		const fail = (error: Error) => {
			compacting = false;
			lastFailedAtTokens = usage.tokens ?? undefined;
			if (ctx.hasUI)
				ctx.ui.notify(`Automatic compaction failed: ${error.message}`, "error");
		};
		try {
			ctx.compact({
				onComplete: reset,
				onError: fail,
			});
		} catch (error) {
			fail(error instanceof Error ? error : new Error(String(error)));
		}
	};

	pi.on("session_start", reset);
	pi.on("session_compact", reset);
	pi.on("turn_end", (_event, ctx) => maybeCompact(ctx));
}
