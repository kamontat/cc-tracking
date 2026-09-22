import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DueRow } from "#components/cc-due-list";
import { displayDate } from "#lib/domain/date";
import type { Location } from "#lib/domain/location";
import { LocaleController } from "#lib/i18n/controller";
import { locationText } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { base, panel } from "#styles/shared";

@customElement("cc-location-groups")
export class CcLocationGroups extends LitElement {
	static override styles = [
		base,
		panel,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}

			article[data-group] {
				gap: var(--cc-space-2);
				background: var(--cc-surface-sunken);
			}

			article[data-group] h3 {
				font-size: var(--cc-text-md);
				font-weight: 600;
			}

			ul {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
			}

			li {
				font-size: var(--cc-text-sm);
			}
		`,
	];

	@property({ attribute: false }) rows: DueRow[] = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	private grouped(): [Location, DueRow[]][] {
		const groups = new Map<Location, DueRow[]>();
		for (const row of this.rows) {
			const location = row.card.location;
			groups.set(location, [...(groups.get(location) ?? []), row]);
		}
		// `<` compares UTF-16 code units, not Thai collation, since Intl is banned here. That
		// is not dictionary order -- e.g. "กระบี่" sorts before "กรุงเทพฯ" by code unit even
		// though a Thai dictionary compares consonants first and would order them the other
		// way. This is a known, accepted limitation, not a bug to "fix" by adding collation.
		return [...groups.entries()].sort(([a], [b]) =>
			locationText(a) < locationText(b) ? -1 : 1,
		);
	}

	override render() {
		return html`
			<details>
				<summary>${t("groups.title")}</summary>
				${this.grouped().map(([location, rows]) => {
					const soonest = rows.map((row) => row.statement.dueDate).sort()[0];
					const date = soonest
						? displayDate(soonest, getLocale())
						: t("common.none");
					return html`
						<article data-group>
							<h3>${locationText(location)} (${rows.length})</h3>
							<p><small>${t("groups.nextDue", { date })}</small></p>
							<ul>
								${rows.map(
									({ card }) => html`
										<li>
											<a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
											••••${card.last4}
										</li>
									`,
								)}
							</ul>
						</article>
					`;
				})}
			</details>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-location-groups": CcLocationGroups;
	}
}
