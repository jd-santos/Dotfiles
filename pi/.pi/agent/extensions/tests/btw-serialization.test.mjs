import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const piDir = process.env.PI_TEST_PACKAGE_DIR ?? join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent");
const require = createRequire(join(piDir, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { fsCache: false });
const { prepareBtwPayload, prefixMatches } = await jiti.import(fileURLToPath(new URL("../lib/btw.ts", import.meta.url)));
const aiDir = join(piDir, "node_modules/@earendil-works/pi-ai/dist");
// Entirely synthetic credentials, only to reach serialization. Every payload callback throws
// before dispatch; injected fetch also rejects so these tests cannot make paid requests.
const fakeKey = `test.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "synthetic-test-account" } })).toString("base64url")}.test`;
const messages = [
  { role: "system", content: "Stable system instructions", toolsAdded: [{ name: "read", description: "Read a file", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }], timestamp: 1 },
  { role: "user", content: "Main request", timestamp: 2 },
];

for (const [api, provider] of [["openai-responses", "openai"], ["openai-completions", "openrouter"], ["anthropic-messages", "anthropic"], ["openai-codex-responses", "openai-codex"]]) {
  test(`${api}: inspect installed adapter prefix compatibility without network dispatch`, async () => {
    const adapter = await import(join(aiDir, `api/${api}.js`));
    const model = { id: "synthetic-model", name: "Synthetic", api, provider, baseUrl: "https://example.invalid/v1", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 4096, cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 } };
    let networkCalls = 0;
    async function serialize(context, baseline) {
      let captured;
      const stream = adapter.streamSimple(model, context, {
        apiKey: fakeKey, sessionId: "synthetic-main-session", transport: "sse", maxTokens: 2048, toolChoice: baseline ? "none" : "auto", maxRetries: 0,
        fetch: async () => { networkCalls++; throw new Error("Network forbidden in serialization tests"); },
        onPayload(payload) {
          captured = baseline ? prepareBtwPayload(payload, baseline, model) : structuredClone(payload);
          throw new Error("Intentional stop before inference");
        },
      });
      const result = await stream.result();
      assert.equal(result.stopReason, "error");
      assert.ok(captured, "Adapter reached the pre-dispatch payload callback");
      return captured;
    }
    const baseline = await serialize({ messages });
    const side = await serialize({ messages: [...messages, { role: "user", content: "Side question only: why?", timestamp: 3 }] }, baseline);
    assert.deepEqual(side.tools, baseline.tools);
    // Anthropic relocates the last-user cache annotation and can merge adjacent
    // user messages. Treat that prefix as unverified rather than claiming a hit.
    assert.equal(prefixMatches(baseline, side), api !== "anthropic-messages");
    assert.deepEqual(side.tool_choice, api === "anthropic-messages" ? { type: "none" } : "none");
    assert.equal(networkCalls, 0);
  });
}
