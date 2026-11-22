import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SelectList, Text, matchesKey, type KeyId } from "@earendil-works/pi-tui";

export interface PermissionChoice {
	value: string;
	key: KeyId;
	label: string;
}

/** Prompt-local shortcuts. No keys are registered on the main editor. */
export async function selectPermissionChoice(
	ctx: ExtensionContext,
	title: string,
	choices: PermissionChoice[],
	hint: string,
): Promise<string | undefined> {
	if (ctx.mode !== "tui") {
		const labels = choices.map((choice) => `[${choice.key}] ${choice.label}`);
		const selected = await ctx.ui.select(`${title}\n${hint}`, labels);
		return choices[labels.indexOf(selected ?? "")]?.value;
	}

	return ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
		const heading = new Text(title, 0, 0);
		const help = new Text(theme.fg("muted", hint), 0, 0);
		const navigation = new Text(
			theme.fg("dim", `${keys.getKeys("tui.select.up").join("/")}/${keys.getKeys("tui.select.down").join("/")} move · ${keys.getKeys("tui.select.confirm").join("/")} selects · ${keys.getKeys("tui.select.cancel").join("/")} denies once`),
			0,
			0,
		);
		const list = new SelectList(
			choices.map((choice) => ({ value: choice.value, label: `[${choice.key}] ${choice.label}` })),
			choices.length,
			{
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("muted", text),
			},
		);
		let selectedIndex = 0;
		return {
			capturesViewportInput: true,
			render(width: number) {
				return [...heading.render(width), ...list.render(width), ...help.render(width), ...navigation.render(width)];
			},
			invalidate() {
				heading.invalidate();
				list.invalidate();
				help.invalidate();
				navigation.invalidate();
			},
			handleInput(data: string) {
				if (keys.matches(data, "tui.select.cancel")) {
					done(undefined);
					return;
				}
				if (keys.matches(data, "tui.select.confirm")) {
					done(choices[selectedIndex]?.value);
					return;
				}
				const shortcut = choices.find((choice) => matchesKey(data, choice.key));
				if (shortcut) {
					done(shortcut.value);
					return;
				}
				if (keys.matches(data, "tui.select.up")) {
					selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
				} else if (keys.matches(data, "tui.select.down")) {
					selectedIndex = (selectedIndex + 1) % choices.length;
				} else {
					return;
				}
				list.setSelectedIndex(selectedIndex);
				tui.requestRender();
			},
		};
	}, { blocked: { kind: "permission", message: "Tool approval required" } });
}
