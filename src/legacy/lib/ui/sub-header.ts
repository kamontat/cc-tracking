import { html, nothing, type TemplateResult } from "lit"

import { icons } from "#legacy/lib/ui/icons"
import { t } from "#lib/i18n/index"

/**
 * A sub page's compact heading (prototype `subHead`), on every page below a tab: a slim bar
 * that sticks under the app header -- a back control, the title over a muted `detail` line,
 * and `actions` (an Edit link, a More menu) at its end. A string `back` is a link to that
 * address; a function is a quiet button that runs it, for a step inside one page. app.css
 * draws it; it bleeds to the window's edges while its content keeps the page's measure.
 */
export function subHeader(options: {
	title: string
	detail?: string | undefined
	back: string | (() => void)
	actions?: TemplateResult
}): TemplateResult {
	const { title, detail, back, actions } = options
	const control =
		typeof back === "string"
			? html`<a data-action="back" href=${back} aria-label=${t("common.back")}
					>${icons.back}</a
				>`
			: html`<button
					type="button"
					data-variant="quiet"
					data-action="back"
					aria-label=${t("common.back")}
					@click=${back}
				>
					${icons.back}
				</button>`
	return html`<div class="sub-header">
		${control}
		<h1>
			<span class="sub-header__title">${title}</span>${
				detail ? html`<small class="sub-header__detail">${detail}</small>` : nothing
			}
		</h1>
		${actions ? html`<div class="sub-header__actions">${actions}</div>` : nothing}
	</div>`
}
