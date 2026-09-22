import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import type { Locale } from "#lib/i18n/index";
import { getLocale, setLocale, t } from "#lib/i18n/index";

const LOCALES: readonly Locale[] = ["en", "th"];

@customElement("cc-lang-switch")
export class CcLangSwitch extends LitElement {
	constructor() {
		super();
		new LocaleController(this);
	}

	private onChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		if (value === "en" || value === "th") setLocale(value);
	}

	override render() {
		const current = getLocale();
		return html`
			<select aria-label=${t("lang.label")} @change=${this.onChange}>
				${LOCALES.map(
					(locale) =>
						html`<option value=${locale} ?selected=${locale === current}>
							${t(locale === "en" ? "lang.en" : "lang.th")}
						</option>`,
				)}
			</select>
		`;
	}

	override updated() {
		// Keep the DOM selection in step when the locale changes from somewhere else: an
		// option's `selected` binding sets defaultSelected, which a re-render will not reapply.
		const select = this.renderRoot.querySelector<HTMLSelectElement>("select");
		if (select) select.value = getLocale();
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-lang-switch": CcLangSwitch;
	}
}
