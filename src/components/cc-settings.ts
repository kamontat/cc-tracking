import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LOCATIONS, type Location } from "#lib/domain/location";
import {
	canPurchaseAt,
	DEFAULT_SETTINGS,
	type Settings,
	withPurchaseAt,
} from "#lib/domain/settings";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

@customElement("cc-settings")
export class CcSettings extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			fieldset {
				margin-block-start: var(--cc-space-3);
			}

			[data-testid="none-allowed"] {
				margin-block-start: var(--cc-space-3);
				font-size: var(--cc-text-sm);
			}
		`,
	];

	@property({ attribute: false }) settings: Settings = DEFAULT_SETTINGS;

	constructor() {
		super();
		new LocaleController(this);
	}

	private toggle(location: Location, allowed: boolean) {
		this.dispatchEvent(
			new CustomEvent<Settings>("save-settings", {
				detail: withPurchaseAt(this.settings, location, allowed),
			}),
		);
	}

	override render() {
		const allowed = this.settings.purchaseLocations.length > 0;
		return html`
			<h2>${t("settings.purchases.title")}</h2>
			<p><small>${t("settings.purchases.explain")}</small></p>
			<fieldset>
				<legend>${t("settings.purchases.legend")}</legend>
				${LOCATIONS.map(
					(location) => html`
						<label>
							<input type="checkbox" data-location=${location}
								.checked=${canPurchaseAt(this.settings, location)}
								@change=${(event: Event) =>
									this.toggle(
										location,
										(event.target as HTMLInputElement).checked,
									)} />
							${locationText(location)}
						</label>
					`,
				)}
			</fieldset>
			${
				allowed
					? nothing
					: html`<p data-testid="none-allowed"><small>${t("settings.purchases.none")}</small></p>`
			}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-settings": CcSettings;
	}
}
