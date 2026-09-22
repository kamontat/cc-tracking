import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, panel } from "#styles/shared";

@customElement("cc-error-banner")
export class CcErrorBanner extends LitElement {
	static override styles = [base, controls, panel];

	@property() message = "";
	// Left empty rather than defaulting to a catalog string: a property default is evaluated
	// once at construction, which would freeze the language at load. render() falls back to
	// t("common.retry") instead, re-evaluated on every render.
	@property({ attribute: "retry-label" }) retryLabel = "";

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		if (!this.message) return nothing;
		return html`
			<article role="alert" data-tone="danger">
				<p>${this.message}</p>
				<button data-variant="quiet" @click=${() => this.dispatchEvent(new CustomEvent("retry"))}>
					${this.retryLabel || t("common.retry")}
				</button>
			</article>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-error-banner": CcErrorBanner;
	}
}
