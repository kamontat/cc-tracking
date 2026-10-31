import { html, nothing, type TemplateResult } from "lit";
import { t } from "#lib/i18n/index";
import { icons } from "#lib/ui/icons";

/**
 * A sub page's compact heading (prototype `subHead`): a slim bar that sticks under the app
 * header -- a back link, the title over a muted `detail` line, and `actions` (an Edit link, a
 * More menu) at its end. app.css draws it; it bleeds to the window's edges while its content
 * keeps the page's measure.
 */
export function subHeader(options: {
	title: string;
	detail?: string;
	back: string;
	actions?: TemplateResult;
}): TemplateResult {
	const { title, detail, back, actions } = options;
	return html`<div class="sub-header">
		<a data-action="back" href=${back} aria-label=${t("common.back")}
			>${icons.back}</a
		>
		<h1>
			<span class="sub-header__title">${title}</span>${
				detail
					? html`<small class="sub-header__detail">${detail}</small>`
					: nothing
			}
		</h1>
		${actions ? html`<div class="sub-header__actions">${actions}</div>` : nothing}
	</div>`;
}
