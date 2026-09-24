import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import {
	buildInfo,
	commitUrl,
	formatBuiltAt,
	parseBuiltAt,
	REPO_URL,
	shortCommit,
} from "#lib/ui/build-info";
import { base } from "#styles/shared";

/** What the commit reads as when no sha was inlined -- a dev server, or a build without git. */
const DEV = "dev";

/**
 * Names the build every page is served from: the repository, the commit it was built from,
 * and when. Sits below `<main>` on every route.
 *
 * The two values default from the bundler-inlined pair rather than being passed in by each
 * route, so a route cannot forget one; they stay settable for tests.
 */
@customElement("cc-site-footer")
export class CcSiteFooter extends LitElement {
	static override styles = [
		base,
		css`
			:host {
				display: block;
				border-top: var(--cc-border-width) solid var(--cc-border);
				background: var(--cc-surface);
			}

			footer {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-2) var(--cc-space-3);
				width: 100%;
				max-width: 72rem;
				margin-inline: auto;
				padding: var(--cc-space-3)
					max(var(--cc-space-4), env(safe-area-inset-left, 0px));
				padding-bottom: calc(
					var(--cc-space-3) + env(safe-area-inset-bottom, 0px)
				);
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.site-footer__commit {
				font-family: var(--cc-font-mono);
			}

			/* Only the separators between items, so the row does not open or close with one. */
			.site-footer__sep {
				color: var(--cc-border);
			}
		`,
	];

	@property() commit = buildInfo().commit;
	@property({ attribute: "built-at" }) builtAt = buildInfo().builtAt;

	constructor() {
		super();
		new LocaleController(this);
	}

	private renderCommit() {
		if (!this.commit)
			return html`<span class="site-footer__commit">${DEV}</span>`;
		const short = shortCommit(this.commit);
		return html`<a
			class="site-footer__commit"
			href=${commitUrl(this.commit)}
			aria-label=${t("footer.commit", { sha: short })}
		>${short}</a>`;
	}

	override render() {
		// A page opened from a build that carried no timestamp still shows a real time rather
		// than a gap: the moment it was opened, in the same UTC shape as a real build time.
		const built = parseBuiltAt(this.builtAt) ?? new Date();
		return html`
			<footer>
				<a class="site-footer__repo" href=${REPO_URL} rel="noreferrer">${t("footer.repo")}</a>
				<span class="site-footer__sep" aria-hidden="true">·</span>
				${this.renderCommit()}
				<span class="site-footer__sep" aria-hidden="true">·</span>
				<span class="site-footer__built">${t("footer.built", { at: formatBuiltAt(built) })}</span>
			</footer>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-site-footer": CcSiteFooter;
	}
}
