declare module "@mariozechner/pi-coding-agent" {
	export type ExtensionAPI = any;
	export type ExtensionContext = any;
	export type ToolRenderResultOptions = any;
	export type ReadToolDetails = any;
	export const createReadToolDefinition: any;
	export const getLanguageFromPath: any;
	export const highlightCode: any;
	export const keyHint: any;
	export const keyText: any;
}

declare module "@mariozechner/pi-tui" {
	export interface Component {
		render(width: number): string[];
		handleInput?(data: string): void;
		invalidate(): void;
	}

	export class Box implements Component {
		constructor(
			paddingX?: number,
			paddingY?: number,
			bgFn?: (text: string) => string,
		);
		addChild(component: Component): void;
		clear(): void;
		setBgFn(bgFn?: (text: string) => string): void;
		render(width: number): string[];
		invalidate(): void;
	}

	export class Text implements Component {
		constructor(
			text: string,
			paddingX?: number,
			paddingY?: number,
			bgFn?: (text: string) => string,
		);
		setText(text: string): void;
		render(width: number): string[];
		invalidate(): void;
	}
}
