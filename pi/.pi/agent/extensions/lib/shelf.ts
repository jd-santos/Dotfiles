// Contract between the shelf drawer (shelf.ts) and the extensions that fill it.
//
// The drawer owns placement, toggling, ordering, and section headings. Any
// extension can contribute a section through pi.events without importing the
// drawer, so sections and the drawer load in any order:
//
//   const unregister = registerShelfSection(pi, {
//     id: "cache",
//     title: "Cache",
//     order: 40,
//     headline: (theme) => theme.fg("success", "warm 4:12"),
//     render: (width, theme) => ["…"],
//   });
//   // when the section's data changes:
//   refreshShelf(pi);
//
// Call registerShelfSection from session_start and the returned function from
// session_shutdown.

import type { ThemeLike } from "./shell-layout.ts";

export const SHELF_SECTION = "dotfiles:shelf-section";
export const SHELF_SECTION_REQUEST = "dotfiles:shelf-section-request";
export const SHELF_REFRESH = "dotfiles:shelf-refresh";

export interface ShelfSection {
	/** Stable key; registering the same id again replaces the section. */
	id: string;
	/** Heading text, drawn by the drawer as a ruled heading. */
	title: string;
	/** Lower numbers render first. */
	order: number;
	/** Optional headline figure the drawer sets at the right of the heading. */
	headline?(theme: ThemeLike): string | undefined;
	/** Body lines. Every line must fit within `width` visible columns. */
	render(width: number, theme: ThemeLike): string[];
}

export type ShelfSectionMessage =
	| { section: ShelfSection }
	| { id: string; remove: true };

type EventBus = {
	on(name: string, callback: (value: unknown) => void): () => void;
	emit(name: string, value: unknown): void;
};

/** Offer a section now and again whenever the drawer asks. Returns an unregister function. */
export function registerShelfSection(pi: { events: EventBus }, section: ShelfSection): () => void {
	const offer = () => pi.events.emit(SHELF_SECTION, { section } satisfies ShelfSectionMessage);
	const unsubscribe = pi.events.on(SHELF_SECTION_REQUEST, offer);
	offer();
	return () => {
		unsubscribe();
		pi.events.emit(SHELF_SECTION, { id: section.id, remove: true } satisfies ShelfSectionMessage);
	};
}

/** Ask the drawer to redraw after a section's data changes. */
export function refreshShelf(pi: { events: EventBus }): void {
	pi.events.emit(SHELF_REFRESH, undefined);
}
