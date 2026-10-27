import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import type { Locale, MessageKey } from "#lib/i18n/index";
import { getLocale, setLocale, t } from "#lib/i18n/index";
import { getTheme, setTheme, THEMES, type Theme } from "#lib/ui/theme";
import { base, controls } from "#styles/shared";

const LOCALES: readonly Locale[] = ["en", "th"];

const THEME_KEYS: Record<Theme, MessageKey> = {
	system: "theme.system",
	light: "theme.light",
	dark: "theme.dark",
};

/**
 * The reader's own display choices: language and colour theme. Both live in this browser's
 * local storage rather than the repository, so they apply before any data loads and are
 * not carried along in a backup.
 */
@customElement("cc-display-settings")
export class CcDisplaySettings extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.fields {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(var(--cc-tile-min), 1fr));
				gap: var(--cc-space-3);
				margin-block-start: var(--cc-space-3);
			}
		`,
	];

	@state() private theme: Theme = getTheme();

	constructor() {
		super();
		new LocaleController(this);
	}

	private onLocale(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		if (value === "en" || value === "th") setLocale(value);
	}

	private onTheme(event: Event) {
		const value = (event.target as HTMLSelectElement).value as Theme;
		if (!THEMES.includes(value)) return;
		setTheme(value);
		this.theme = value;
	}

	override render() {
		const locale = getLocale();
		return html`
			<h2>${t("settings.display.title")}</h2>
			<div class="fields">
				<label>${t("lang.label")}
					<select name="language" @change=${this.onLocale}>
						${LOCALES.map(
							(option) =>
								html`<option value=${option} ?selected=${option === locale}>
									${t(option === "en" ? "lang.en" : "lang.th")}
								</option>`,
						)}
					</select>
				</label>
				<label>${t("theme.label")}
					<select name="theme" @change=${this.onTheme}>
						${THEMES.map(
							(option) =>
								html`<option value=${option} ?selected=${option === this.theme}>
									${t(THEME_KEYS[option])}
								</option>`,
						)}
					</select>
				</label>
			</div>
		`;
	}

	override updated() {
		// Keep the DOM selection in step when the locale changes from somewhere else: an
		// option's `selected` binding sets defaultSelected, which a re-render will not reapply.
		const language = this.renderRoot.querySelector<HTMLSelectElement>(
			'select[name="language"]',
		);
		if (language) language.value = getLocale();
		const theme = this.renderRoot.querySelector<HTMLSelectElement>(
			'select[name="theme"]',
		);
		if (theme) theme.value = this.theme;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-display-settings": CcDisplaySettings;
	}
}
