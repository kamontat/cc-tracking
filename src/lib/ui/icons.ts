import { type SVGTemplateResult, svg } from "lit";

/**
 * Every icon draws on the same 24-unit grid with a 1.9 stroke in the current text colour, so
 * it takes its colour and its current-tab state from the link around it. Decorative only: the
 * link's own label (or `aria-label`) names it, so each is hidden from assistive technology.
 *
 * The `<svg>` element sits inside an `svg`-tagged template on purpose: lit parses that template
 * inside an SVG context, so the element comes out in the SVG namespace either way and renders
 * as an ordinary inline icon wherever an `html` template places it.
 */
const icon = (body: SVGTemplateResult): SVGTemplateResult =>
	svg`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons: Record<
	"home" | "transactions" | "cards" | "settings" | "plus",
	SVGTemplateResult
> = {
	home: icon(
		svg`<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>`,
	),
	transactions: icon(
		svg`<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>`,
	),
	cards: icon(
		svg`<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>`,
	),
	// Lucide's `settings` cog.
	settings: icon(
		svg`<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
	),
	plus: icon(svg`<path d="M12 5v14M5 12h14"/>`),
};
