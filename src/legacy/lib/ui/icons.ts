import { type SVGTemplateResult, svg } from "lit"
import { unsafeSVG } from "lit/directives/unsafe-svg.js"

import { ICON_PATHS, type IconName } from "#lib/ui/icon-paths"

/**
 * The legacy Lit form of the icons drawn by `#lib/ui/icon-paths`, which the `Icon` atom also
 * reads. Every icon takes its colour and its current-tab state from the link around it, and is
 * decorative only: the link's own label (or `aria-label`) names it, so each is hidden from
 * assistive technology.
 *
 * The `<svg>` element sits inside an `svg`-tagged template on purpose: lit parses that template
 * inside an SVG context, so the element comes out in the SVG namespace either way and renders
 * as an ordinary inline icon wherever an `html` template places it.
 */
const icon = (name: IconName): SVGTemplateResult =>
	svg`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${unsafeSVG(ICON_PATHS[name])}</svg>`

export const icons = Object.fromEntries(
	(Object.keys(ICON_PATHS) as IconName[]).map((name) => [name, icon(name)]),
) as Record<IconName, SVGTemplateResult>
