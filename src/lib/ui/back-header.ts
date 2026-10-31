import { html, nothing, type TemplateResult } from "lit";
import { t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";

/**
 * A sub page's heading: a back control, then the title with an optional detail under it. A
 * string `back` is a link to that address; a function is a button that runs it, for a step
 * inside one page.
 */
export function backHeader(options: {
	title: string;
	detail?: string;
	back: string | (() => void);
}): TemplateResult {
	const { title, detail, back } = options;
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
				</button>`;
	return html`<div class="back-header" row>
		${control}
		<h1>${title}${detail ? html`<small>${detail}</small>` : nothing}</h1>
	</div>`;
}
