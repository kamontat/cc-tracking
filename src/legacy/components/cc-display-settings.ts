import type { Locale, MessageKey } from "#lib/i18n/index"

import { html, LitElement } from "lit"
import { customElement, state } from "lit/decorators.js"

import { LocaleController } from "#legacy/lib/i18n/controller"
import { base, controls, setRows } from "#legacy/styles/shared"
import { getLocale, setLocale, t } from "#lib/i18n/index"
import { getTheme, setTheme, type Theme } from "#lib/ui/theme"

const LOCALES: readonly Locale[] = ["en", "th"]

/** Each language named in its own script, so a reader lost in the other one still finds theirs. */
const LOCALE_KEYS: Record<Locale, MessageKey> = {
	en: "lang.en",
	th: "lang.th",
}

/** Light and Dark first, then the device's own choice, as the prototype orders them. */
const THEME_ORDER: readonly Theme[] = ["light", "dark", "system"]

const THEME_KEYS: Record<Theme, MessageKey> = {
	system: "theme.system",
	light: "theme.light",
	dark: "theme.dark",
}

/**
 * The reader's own display choices: language and colour theme, as two settings rows each with
 * a segmented choice. Both live in this browser's local storage rather than the repository, so
 * they apply before any data loads and are not carried along in a backup. The page supplies
 * the section's heading and its `.set` panel.
 */
@customElement("cc-display-settings")
export class CcDisplaySettings extends LitElement {
	static override styles = [base, controls, setRows]

	@state() private theme: Theme = getTheme()

	constructor() {
		super()
		new LocaleController(this)
	}

	private pickTheme(value: Theme) {
		setTheme(value)
		this.theme = value
	}

	override render() {
		const locale = getLocale()
		return html`
			<div class="set-row" data-row="language">
				<span id="language">${t("lang.label")}</span>
				<div class="seg" role="group" aria-labelledby="language">
					${LOCALES.map(
						(option) => html`<button
							type="button"
							data-value=${option}
							lang=${option}
							aria-pressed=${option === locale ? "true" : "false"}
							@click=${() => setLocale(option)}
						>${t(LOCALE_KEYS[option])}</button>`,
					)}
				</div>
			</div>
			<div class="set-row" data-row="theme">
				<span id="theme">${t("theme.label")}</span>
				<div class="seg" role="group" aria-labelledby="theme">
					${THEME_ORDER.map(
						(option) => html`<button
							type="button"
							data-value=${option}
							aria-pressed=${option === this.theme ? "true" : "false"}
							@click=${() => this.pickTheme(option)}
						>${t(THEME_KEYS[option])}</button>`,
					)}
				</div>
			</div>
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-display-settings": CcDisplaySettings
	}
}
