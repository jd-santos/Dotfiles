// @ts-nocheck

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface NormalizedMessage {
	role: string;
	text: string;
	timestamp?: number;
	provider?: string;
	model?: string;
	usage?: unknown;
	toolName?: string;
	isError?: boolean;
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || "pi-session"
	);
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (typeof block?.text === "string") return block.text;
			if (typeof block?.thinking === "string")
				return `[thinking]\n${block.thinking}`;
			if (block?.type === "toolCall") {
				return `[tool call: ${block.name ?? "unknown"}]\n${JSON.stringify(
					block.arguments ?? {},
					null,
					2,
				)}`;
			}
			if (block?.type === "image") return "[image omitted]";
			return "";
		})
		.filter(Boolean)
		.join("\n\n");
}

function normalizeEntry(entry: any): NormalizedMessage | undefined {
	if (entry?.type !== "message") return undefined;
	const message = entry.message;
	if (!message) return undefined;

	if (message.role === "bashExecution") {
		return {
			role: "bashExecution",
			text: `$ ${message.command ?? ""}\n\n${message.output ?? ""}`,
			timestamp: message.timestamp,
			isError: message.exitCode !== 0,
		};
	}

	return {
		role: message.role ?? "unknown",
		text: textFromContent(message.content),
		timestamp: message.timestamp,
		provider: message.provider,
		model: message.model,
		usage: message.usage,
		toolName: message.toolName,
		isError: message.isError,
	};
}

function transcript(messages: NormalizedMessage[]): string {
	return messages
		.map((message, index) => {
			const label = `${index + 1}. ${message.role}${message.toolName ? `:${message.toolName}` : ""}`;
			return `### ${label}\n\n${message.text || "[empty]"}`;
		})
		.join("\n\n");
}

function firstUserText(messages: NormalizedMessage[]): string {
	return messages.find((message) => message.role === "user")?.text ?? "";
}

function promptfooConfig(name: string) {
	return {
		$schema: "https://promptfoo.dev/config-schema.json",
		description: `Pi session export: ${name}`,
		prompts: ["file://judge-prompt.txt"],
		providers: ["openai:gpt-4.1-mini"],
		defaultTest: {
			assert: [
				{
					type: "llm-rubric",
					value:
						"Score whether the assistant was useful, followed instructions, calibrated confidence, used tools appropriately, and avoided unsupported claims. Return a 1-5 score with brief reasons.",
				},
			],
		},
		tests: [
			{
				vars: {
					conversation: "file://conversation.md",
					original_user_request: "file://original-user-request.txt",
				},
			},
		],
	};
}

function readme(name: string): string {
	return `# ${name}\n\nPromptfoo stub exported from a Pi session.\n\n## Files\n\n- \`conversation.json\`: normalized message records from the active Pi branch\n- \`conversation.md\`: Markdown transcript for judge prompts\n- \`original-user-request.txt\`: first user message in the active branch\n- \`judge-prompt.txt\`: starter LLM-as-judge prompt\n- \`promptfooconfig.json\`: starter promptfoo config\n\n## Run\n\n\`\`\`bash\npromptfoo eval -c promptfooconfig.json\n\`\`\`\n\nBefore sharing this export, redact paths, names, secrets, tool outputs, and any private project details.\n`;
}

const JUDGE_PROMPT = `You are evaluating a Pi coding-agent conversation.\n\nOriginal user request:\n{{ original_user_request }}\n\nConversation transcript:\n{{ conversation }}\n\nEvaluate the assistant across these dimensions:\n\n1. Task completion\n2. Instruction following\n3. Tool-use judgment\n4. Confidence calibration\n5. Factuality and source handling\n6. Helpfulness for the user's actual workflow\n7. Conciseness\n\nReturn JSON with this shape:\n\n{\n  "score": 1-5,\n  "strengths": ["..."],\n  "issues": ["..."],\n  "follow_up_eval_ideas": ["..."]\n}\n`;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("promptfoo-export", {
		description: "Export the active Pi branch as a promptfoo eval stub",
		handler: async (args, ctx) => {
			const sessionName = pi.getSessionName?.() || args.trim() || "pi-session";
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const dir = join(
				homedir(),
				".pi",
				"agent",
				"evals",
				"promptfoo",
				`${slugify(sessionName)}-${timestamp}`,
			);

			const branch =
				ctx.sessionManager.getBranch?.() ??
				ctx.sessionManager.getEntries?.() ??
				[];
			const messages = branch.map(normalizeEntry).filter(Boolean);

			await mkdir(dir, { recursive: true });
			await writeFile(
				join(dir, "conversation.json"),
				JSON.stringify(
					{
						exportedAt: new Date().toISOString(),
						session: ctx.sessionManager.getSessionFile?.(),
						cwd: ctx.sessionManager.getCwd?.(),
						messages,
					},
					null,
					2,
				),
			);
			await writeFile(join(dir, "conversation.md"), transcript(messages));
			await writeFile(
				join(dir, "original-user-request.txt"),
				firstUserText(messages),
			);
			await writeFile(join(dir, "judge-prompt.txt"), JUDGE_PROMPT);
			await writeFile(
				join(dir, "promptfooconfig.json"),
				JSON.stringify(promptfooConfig(sessionName), null, 2),
			);
			await writeFile(join(dir, "README.md"), readme(sessionName));

			ctx.ui.notify(`Promptfoo export written to ${dir}`, "success");
		},
	});
}
