import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";

@customElement("cc-error-banner")
export class CcErrorBanner extends LitElement {
	static override styles = css`
		article {
			border-left: 4px solid var(--pico-del-color, #b3261e);
			padding: 0.75rem 1rem;
			margin: 0 0 1rem;
			background: var(--pico-card-background-color, #fff2f0);
		}
		p { margin: 0 0 0.5rem; }
	`;

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
			<article role="alert">
				<p>${this.message}</p>
				<button @click=${() => this.dispatchEvent(new CustomEvent("retry"))}>
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
