import assert from "node:assert/strict";
import test from "node:test";

import {
	MAX_AGENT_TITLE_CHARS,
	cleanPhrase,
	composeAgentTitle,
	formatForkSuffix,
	parseSummaryResponse,
	truncatePhrase,
} from "../lib/herdr-title.ts";

test("parses labeled title and summary", () => {
	const parsed = parseSummaryResponse(
		"TITLE: Fix auth redirect\nSUMMARY: Discussed the OAuth login redirect bug and its fix.",
	);
	assert.equal(parsed.title, "Fix auth redirect");
	assert.equal(
		parsed.summary,
		"Discussed the OAuth login redirect bug and its fix",
	);
});

test("falls back to a single unlabeled line as the summary", () => {
	const parsed = parseSummaryResponse("  Just a summary.  ");
	assert.equal(parsed.title, undefined);
	assert.equal(parsed.summary, "Just a summary");
});

test("cleans quotes and trailing punctuation", () => {
	assert.equal(cleanPhrase('"Fix auth redirect."', 80), "Fix auth redirect");
});

test("truncates on a word boundary and stays within the cap", () => {
	const title = truncatePhrase("alpha beta gamma delta epsilon", 20);
	assert.ok(title.length <= 20);
	assert.ok(!title.endsWith(" "));
	assert.equal(title, "alpha beta gamma…");
});

test("formats a compact fork suffix", () => {
	assert.equal(formatForkSuffix("Original title"), " ↳ Original title");
	assert.equal(formatForkSuffix(undefined), "");
});

test("composes an unprefixed title with the fork suffix", () => {
	const composed = composeAgentTitle({
		title: "Fix auth redirect",
		parentTitle: "OAuth refactor",
	});
	assert.equal(composed, "Fix auth redirect ↳ OAuth refactor");
});

test("caps the composed title at the character budget", () => {
	const composed = composeAgentTitle({
		title: "a".repeat(200),
		maxChars: MAX_AGENT_TITLE_CHARS,
	});
	assert.ok(composed.length <= MAX_AGENT_TITLE_CHARS);
});

test("returns an unprefixed title without a parent", () => {
	assert.equal(composeAgentTitle({ title: "Fix auth redirect" }), "Fix auth redirect");
});

test("returns an empty string without a title", () => {
	assert.equal(composeAgentTitle({ title: "   " }), "");
});