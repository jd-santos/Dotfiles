import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  aggregate,
  allowanceLines,
  parseChildMetadata,
  parsePiFiles,
} from "../usage.ts";

function assistantEntry(id, timestamp = 1_700_000_000_000) {
  return JSON.stringify({
    type: "message",
    id,
    timestamp,
    message: {
      role: "assistant",
      provider: "provider",
      model: "model",
      usage: {
        input: 10,
        output: 2,
        cacheRead: 3,
        totalTokens: 15,
        cost: { total: 0.25 },
      },
    },
  });
}

test("deduplicates cloned parent entries by Pi entry id", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-usage-"));
  try {
    const first = join(root, "first.jsonl");
    const clone = join(root, "clone.jsonl");
    await writeFile(first, `${assistantEntry("same-id")}\n`);
    await writeFile(clone, `${assistantEntry("same-id")}\n`);
    const parsed = await parsePiFiles([first, clone], new Set(), new Set());
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.stats.duplicates, 1);
    assert.equal(parsed.records[0].recordedPrice, 0.25);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses child metadata and excludes child transcript sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-usage-"));
  try {
    const artifacts = join(root, "subagent-artifacts");
    await mkdir(artifacts);
    const transcript = join(artifacts, "run_worker_transcript.jsonl");
    const metadata = join(artifacts, "run_worker_meta.json");
    await writeFile(transcript, `${assistantEntry("child-entry")}\n`);
    await writeFile(
      metadata,
      JSON.stringify({
        runId: "run-id",
        agent: "worker",
        model: "openai-codex/gpt-test:medium",
        timestamp: 1_700_000_000_000,
        transcriptPath: transcript,
        usage: { input: 20, output: 4, cacheRead: 6, cost: 0.5 },
      }),
    );

    const children = await parseChildMetadata(root);
    const parents = await parsePiFiles(
      [transcript],
      children.runIds,
      children.transcriptPaths,
    );
    assert.equal(children.records.length, 1);
    assert.equal(children.records[0].total, 30);
    assert.equal(children.records[0].recordedPrice, 0.5);
    assert.equal(parents.records.length, 0);
    assert.equal(parents.childFilesExcluded, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("leaves missing child cost available for price estimation", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-usage-"));
  try {
    const artifacts = join(root, "subagent-artifacts");
    await mkdir(artifacts);
    await writeFile(
      join(artifacts, "run_worker_meta.json"),
      JSON.stringify({
        runId: "run-id",
        agent: "worker",
        model: "openai-codex/gpt-test:medium",
        timestamp: 1_700_000_000_000,
        usage: { input: 20, output: 4, cacheRead: 6 },
      }),
    );
    const children = await parseChildMetadata(root);
    assert.equal(children.records.length, 1);
    assert.equal(children.records[0].recordedPrice, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("combines recorded and estimated costs without dropping either", () => {
  const now = Date.now();
  const rows = aggregate(
    [
      {
        source: "Pi parent",
        provider: "provider",
        model: "model",
        timestamp: now,
        input: 10,
        output: 2,
        cacheRead: 3,
        total: 15,
        recordedPrice: 1.25,
      },
      {
        source: "Pi parent",
        provider: "provider",
        model: "model",
        timestamp: now,
        input: 10,
        output: 0,
        cacheRead: 0,
        total: 10,
      },
    ],
    1,
    now,
    new Map([["providermodel", { input: 1_000_000 }]]),
  );
  assert.equal(rows[0].price, 11.25);
});

test("renders subscription windows", () => {
  const lines = allowanceLines({
    result: {
      rateLimits: {
        limitName: "Codex",
        planType: "plus",
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_900_000_000,
        },
      },
    },
  });
  assert.ok(lines.some((line) => line.includes("75%")));
  assert.ok(lines.some((line) => line.includes("Plan: plus")));
});
