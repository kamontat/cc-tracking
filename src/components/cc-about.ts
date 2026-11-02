import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import type { MessageKey } from "#lib/i18n/index";
import { getLocale, t } from "#lib/i18n/index";
import {
	type BuildInfo,
	buildInfo,
	CHANGELOG_URL,
	commitUrl,
	type Environment,
	formatBuiltLocal,
	parseBuiltAt,
	REPO_URL,
	shortCommit,
	sourceLabel,
	viewerTimeZone,
} from "#lib/ui/build-info";
import { base } from "#styles/shared";

const ENV_KEYS: Record<Environment, MessageKey> = {
	development: "about.env.development",
	local: "about.env.local",
	preview: "about.env.preview",
	production: "about.env.production",
};

/**
 * Names the build the page is served from: where it runs, when it was built, and links to
 * the source, the commit and the changelog. Each row shows only when it has something true
 * to say for this environment.
 */
@customElement("cc-about")
export class CcAbout extends LitElement {
	static override styles = [
		base,
		css`
			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			dl {
				margin: var(--cc-space-3) 0 0;
			}

			.row {
				display: flex;
				flex-wrap: wrap;
				justify-content: space-between;
				gap: var(--cc-space-1) var(--cc-space-3);
				padding-block: var(--cc-space-3);
				border-bottom: var(--cc-border-width) solid var(--cc-border);
			}

			.row:last-child {
				border-bottom: 0;
			}

			dt {
				color: var(--cc-text-muted);
			}

			dd {
				margin: 0;
			}

			a {
				color: var(--cc-link);
				font-weight: 600;
				text-decoration: none;
			}

			a:hover {
				text-decoration: underline;
			}

			.mono {
				font-family: var(--cc-font-mono);
			}
		`,
	];

	@property({ attribute: false }) build: BuildInfo = buildInfo();
	@property({ attribute: "time-zone" }) timeZone: string = viewerTimeZone();

	constructor() {
		super();
		new LocaleController(this);
	}

	private row(name: string, label: MessageKey, value: unknown) {
		return html`<div class="row" data-row=${name}><dt>${t(label)}</dt><dd>${value}</dd></div>`;
	}

	private link(href: string, text: string, className?: string) {
		return html`<a class=${className ?? nothing} href=${href} target="_blank" rel="noreferrer">${text}</a>`;
	}

	override render() {
		const { environment, commit, builtAt } = this.build;
		const builtOn = parseBuiltAt(builtAt);
		const showCommit =
			(environment === "preview" || environment === "production") && commit;

		return html`
			<h2>${t("about.title")}</h2>
			<dl>
				${this.row("environment", "about.environment", t(ENV_KEYS[environment]))}
				${
					environment !== "development" && builtOn
						? this.row(
								"built",
								"about.built",
								formatBuiltLocal(builtOn, getLocale(), this.timeZone),
							)
						: nothing
				}
				${this.row("source", "about.source", this.link(REPO_URL, sourceLabel(this.build)))}
				${
					showCommit
						? this.row(
								"commit",
								"about.commit",
								this.link(commitUrl(commit), shortCommit(commit), "mono"),
							)
						: nothing
				}
				${
					environment === "production"
						? this.row(
								"changelog",
								"about.changelog",
								this.link(CHANGELOG_URL, t("about.whatsNew")),
							)
						: nothing
				}
			</dl>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-about": CcAbout;
	}
}
