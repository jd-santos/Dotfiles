/// <reference path="../types.d.ts" />
// @ts-nocheck

import type {
	ExtensionAPI,
	ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import {
	CustomEditor,
	createReadToolDefinition,
	getLanguageFromPath,
	highlightCode,
	keyHint,
	keyText,
	type ReadToolDetails,
} from "@mariozechner/pi-coding-agent";
import {
	Box,
	type Component,
	Text,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

declare const process: { cwd(): string };

const READ_PREVIEW_LINES = 5;

type ThemeLike = {
	bg(color: string, text: string): string;
	fg(color: string, text: string): string;
	bold(text: string): string;
};

type ModelSource = "default" | "set" | "cycle" | "restore";

// Slash command -> keybinding IDs. The IDs are stable Pi config keys. The
// displayed shortcuts come from the active keybinding config via keyText().
const COMMAND_KEYBINDINGS: Record<string, string[]> = {
	model: ["app.model.select"],
	new: ["app.session.new"],
	tree: ["app.session.tree"],
	fork: ["app.session.fork"],
	resume: ["app.session.resume"],
};

function textOutput(result?: {
	content?: Array<{ type: string; text?: string }>;
}): string {
	return (
		result?.content
			?.filter((part) => part.type === "text")
			.map((part) => part.text ?? "")
			.join("\n") ?? ""
	);
}

function normalizeDisplayText(text: string): string {
	return text.replace(/\t/g, "    ");
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") end--;
	return lines.slice(0, end);
}

function shortenPath(path: string, max = 80): string {
	if (path.length <= max) return path;
	const keep = Math.max(10, max - 1);
	return `…${path.slice(-keep)}`;
}

function formatLineRange(args: Record<string, unknown>): string {
	const offset = typeof args.offset === "number" ? args.offset : undefined;
	const limit = typeof args.limit === "number" ? args.limit : undefined;
	if (offset === undefined && limit === undefined) return "";

	const startLine = offset ?? 1;
	const endLine = limit !== undefined ? startLine + limit - 1 : undefined;
	return endLine ? `:${startLine}-${endLine}` : `:${startLine}`;
}

function truncatePlain(text: string, max: number): string {
	if (max <= 0) return "";
	if (text.length <= max) return text;
	if (max === 1) return "…";
	return `${text.slice(0, max - 1)}…`;
}

function describeModelSource(source: ModelSource): string {
	switch (source) {
		case "default":
			return "default";
		case "set":
			return "selected";
		case "cycle":
			return "scoped";
		case "restore":
			return "restored";
	}
}

function compactModelName(label: string): string {
	if (!label) return "none";
	return label.split("/").at(-1) ?? label;
}

function formatModelBanner(
	pi: ExtensionAPI,
	ctx: any,
	modelLabel: string,
	source: ModelSource,
	theme: ThemeLike,
): string {
	const sourceLabel =
		source === "default" ? "" : `${describeModelSource(source)} `;
	const thinking = pi.getThinkingLevel?.();
	const provider = ctx.model?.provider;
	const auth =
		ctx.modelRegistry?.isUsingOAuth?.(ctx.model) === true ? "sub" : "key";
	const modelColor = source === "restore" ? "warning" : "accent";
	const thinkingColor =
		thinking === "off"
			? "dim"
			: thinking === "high" || thinking === "xhigh"
				? "warning"
				: "muted";
	const providerColor = auth === "sub" ? "success" : "muted";
	const parts = [
		`${theme.fg("dim", "model: ")}${theme.fg(modelColor, `${sourceLabel}${compactModelName(modelLabel)}`)}`,
		thinking
			? `${theme.fg("dim", "think: ")}${theme.fg(thinkingColor, thinking)}`
			: undefined,
		provider
			? `${theme.fg("dim", "via ")}${theme.fg(providerColor, `${provider} (${auth})`)}`
			: undefined,
	].filter(Boolean);
	return ` ${parts.join(theme.fg("dim", " · "))} `;
}

class EmptyComponent implements Component {
	render(): string[] {
		return [];
	}

	invalidate(): void {}
}

class ReadPreviewComponent implements Component {
	private box: Box;
	private header = new Text("", 0, 0);
	private body = new Text("", 0, 0);
	private theme: ThemeLike;
	private args: Record<string, unknown> = {};
	private result?: {
		content: Array<{ type: string; text?: string }>;
		details?: ReadToolDetails;
	};
	private expanded = false;
	private isError = false;

	constructor(theme: ThemeLike) {
		this.theme = theme;
		this.box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		this.box.addChild(this.header);
		this.box.addChild(this.body);
	}

	setCall(
		args: Record<string, unknown>,
		theme: ThemeLike,
		expanded: boolean,
		isError: boolean,
	): void {
		this.args = args;
		this.theme = theme;
		this.expanded = expanded;
		this.isError = isError;
		this.refresh();
	}

	setResult(
		result: {
			content: Array<{ type: string; text?: string }>;
			details?: ReadToolDetails;
		},
		options: ToolRenderResultOptions,
		theme: ThemeLike,
		isError: boolean,
	): void {
		this.result = result;
		this.theme = theme;
		this.expanded = options.expanded;
		this.isError = isError;
		this.refresh();
	}

	private refresh(): void {
		const rawPath = String(this.args.path ?? this.args.file_path ?? "");
		const path = rawPath ? shortenPath(rawPath) : "…";
		const range = formatLineRange(this.args);
		const bgColor = this.isError ? "toolErrorBg" : "customMessageBg";
		this.box.setBgFn((text) => this.theme.bg(bgColor, text));
		this.header.setText(
			`${this.theme.fg("toolTitle", this.theme.bold("read"))} ${this.theme.fg("accent", path)}${
				range ? this.theme.fg("warning", range) : ""
			}`,
		);

		if (!this.result) {
			this.body.setText("");
			this.box.invalidate();
			return;
		}

		if (this.isError) {
			this.body.setText(`\n${this.theme.fg("error", textOutput(this.result))}`);
			this.box.invalidate();
			return;
		}

		const output = textOutput(this.result);
		if (!output) {
			this.body.setText("");
			this.box.invalidate();
			return;
		}

		const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
		const rendered = lang
			? highlightCode(normalizeDisplayText(output), lang)
			: normalizeDisplayText(output)
					.split("\n")
					.map((line) => this.theme.fg("toolOutput", line));
		const lines = trimTrailingEmptyLines(rendered);
		const maxLines = this.expanded ? lines.length : READ_PREVIEW_LINES;
		const displayLines = lines.slice(0, maxLines);
		const remaining = lines.length - maxLines;

		let body = `\n${displayLines.join("\n")}`;
		if (remaining > 0) {
			body += `${this.theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint(
				"app.tools.expand",
				"to expand",
			)})`;
		}
		this.body.setText(body);
		this.box.invalidate();
	}

	render(width: number): string[] {
		return this.box.render(width);
	}

	invalidate(): void {
		this.box.invalidate();
	}
}

function getShortcutHint(command: string): string | undefined {
	const keybindingIds = COMMAND_KEYBINDINGS[command];
	if (!keybindingIds) return undefined;

	const keys = keybindingIds.map((id) => keyText(id)).filter(Boolean);
	return keys.length > 0 ? keys.join(" / ") : undefined;
}

function appendShortcut(
	description: string | undefined,
	shortcut: string,
): string {
	if (!description) return `[${shortcut}]`;
	if (description.startsWith(`[${shortcut}]`)) return description;
	return `[${shortcut}] ${description}`;
}

export default function (pi: ExtensionAPI) {
	const readTool = createReadToolDefinition(process.cwd());
	let activeTui: { requestRender(): void } | undefined;
	let activeModelLabel = "";
	let activeModelSource: ModelSource = "default";

	const syncModelState = (
		ctx: { model?: { provider?: string; id?: string }; ui: any },
		next?: { provider?: string; id?: string },
		source?: ModelSource,
	) => {
		const model = next ?? ctx.model;
		activeModelLabel = model?.id ? `${model.provider}/${model.id}` : "";
		if (source) activeModelSource = source;

		if (!activeModelLabel) return;
		const color = activeModelSource === "restore" ? "warning" : "accent";
		ctx.ui.setStatus(
			"model-source",
			ctx.ui.theme.fg(
				color,
				`model ${describeModelSource(activeModelSource)}: ${activeModelLabel}`,
			),
		);
	};

	class ConversationEditor extends CustomEditor {
		private uiTheme: ThemeLike;
		private sessionCtx: any;

		constructor(
			tui: any,
			theme: any,
			keybindings: any,
			uiTheme: ThemeLike,
			sessionCtx: any,
		) {
			super(tui, theme, keybindings, { paddingX: 0 });
			this.uiTheme = uiTheme;
			this.sessionCtx = sessionCtx;
			activeTui = tui;
		}

		render(width: number): string[] {
			const lines = super.render(width);
			if (lines.length < 2 || width < 2) return lines;

			const borderColor = (text: string) => this.borderColor(text);
			const topLabel = " YOU ";
			const topFill = Math.max(0, width - 2 - topLabel.length);
			lines[0] = `${borderColor("─")}${this.uiTheme.fg("accent", topLabel)}${borderColor(
				"─".repeat(topFill),
			)}${borderColor("─")}`;

			const bottomLabel = truncateToWidth(
				formatModelBanner(
					pi,
					this.sessionCtx,
					activeModelLabel,
					activeModelSource,
					this.uiTheme,
				),
				Math.max(0, width - 2),
				"...",
			);
			const bottomFill = Math.max(0, width - 2 - visibleWidth(bottomLabel));
			lines[lines.length - 1] = `${borderColor("─")}${bottomLabel}${borderColor(
				"─".repeat(bottomFill),
			)}${borderColor("─")}`;
			return lines;
		}
	}

	pi.registerTool({
		...readTool,
		renderShell: "self",
		renderCall(args, theme, context) {
			const state = context.state as { readPreview?: ReadPreviewComponent };
			const component = state.readPreview ?? new ReadPreviewComponent(theme);
			state.readPreview = component;
			component.setCall(
				args as Record<string, unknown>,
				theme,
				context.expanded,
				context.isError,
			);
			return component;
		},
		renderResult(result, options, theme, context) {
			const state = context.state as { readPreview?: ReadPreviewComponent };
			const component = state.readPreview ?? new ReadPreviewComponent(theme);
			state.readPreview = component;
			component.setResult(
				result as {
					content: Array<{ type: string; text?: string }>;
					details?: ReadToolDetails;
				},
				options,
				theme,
				context.isError,
			);
			return context.lastComponent ?? new EmptyComponent();
		},
	});

	pi.on("session_start", (_event, ctx) => {
		syncModelState(ctx);
		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) =>
				new ConversationEditor(tui, theme, keybindings, ctx.ui.theme, ctx),
		);
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const suggestions = await current.getSuggestions(
					lines,
					cursorLine,
					cursorCol,
					options,
				);
				if (!suggestions?.prefix.startsWith("/")) return suggestions;

				return {
					...suggestions,
					items: suggestions.items.map((item) => {
						const command = String(item.value ?? item.label ?? "");
						const shortcut = getShortcutHint(command);
						if (!shortcut) return item;
						return {
							...item,
							description: appendShortcut(item.description, shortcut),
						};
					}),
				};
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(
					lines,
					cursorLine,
					cursorCol,
					item,
					prefix,
				);
			},
			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return (
					current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
					true
				);
			},
		}));
	});

	pi.on("model_select", async (event, ctx) => {
		syncModelState(ctx, event.model, event.source);
		activeTui?.requestRender();

		if (event.source === "restore") {
			ctx.ui.notify(
				`Restored ${event.model.provider}/${event.model.id} from this session. Use /new for the configured default model.`,
				"info",
			);
		}
	});

	pi.on("session_shutdown", () => {
		activeTui = undefined;
	});
}
