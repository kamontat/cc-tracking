import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { CardsResults, CardsRooms } from "#lib/domain/cards-view";
import { closeDateOf, dueDateOf } from "#lib/domain/cycle";
import { displayDate, today } from "#lib/domain/date";
import { takesPurchases } from "#lib/domain/locations";
import { formatAmount } from "#lib/domain/money";
import { openPeriod } from "#lib/domain/statement";
import type {
	Card,
	CardLedger,
	LimitGroup,
	LocationRecord,
	PlainDate,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { nameOfLocation } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { cardMini, cardRowTitle } from "#lib/ui/card-label";
import { panelOpen, rememberPanel } from "#lib/ui/panel";
import { roomNote } from "#lib/ui/room-note";
import { base, cardBits, controls, rowPanel } from "#styles/shared";

const ARCHIVE_PANEL = "cards-archive";

const cardsCount = (count: number) =>
	count === 1
		? t("cards.page.count.one")
		: t("cards.page.count.many", { count });

/**
 * The Cards page's results (DD prototype `cardResults`): by place, a section per location
 * headed by its name, its count and whether it takes purchases; under any other sort, one flat
 * list headed by its count whose rows also say the place and holder. Archived matches fold at
 * the end (`cc:panel:cards-archive`). A row links to its card page and shows, on the right, its
 * group's room with *room*, *N% used* from 80%, or the credit the card holds.
 */
@customElement("cc-cards-list")
export class CcCardsList extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		rowPanel,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
				min-inline-size: 0;
			}

			section {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
			}

			.place {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				gap: var(--cc-space-2);
			}

			.place small,
			.result-head {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.result-head {
				font-size: var(--cc-text-sm);
			}

			.t {
				display: inline;
			}

			.title {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: var(--cc-space-1) var(--cc-space-2);
			}

			.sub {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.r small[data-tone="warn"] {
				color: var(--cc-warning);
			}

			.r small[data-tone="muted"] {
				color: var(--cc-text-muted);
			}

			details.archive {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
			}

			details.archive > summary {
				font-size: var(--cc-text-sm);
				font-weight: 600;
				color: var(--cc-text-muted);
				cursor: pointer;
			}

			details.archive > summary + * {
				margin-top: var(--cc-space-2);
			}

			.empty {
				padding: var(--cc-space-4);
				color: var(--cc-text-muted);
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	];

	@property({ attribute: false }) results: CardsResults = {
		sections: [],
		flat: null,
		archived: [],
		count: 0,
	};
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	@property({ attribute: false }) rooms: CardsRooms = new Map();
	/** The credit each card holds, in satang, keyed by card id; none when absent. */
	@property({ attribute: false }) credits: Map<string, number> = new Map();
	/** The stored locations: each section's name, and whether it takes purchases. */
	@property({ attribute: false }) locations: LocationRecord[] = [];
	/** How many cards are stored at all, to tell "none yet" from "none match". */
	@property({ type: Number }) total = 0;
	/** Each card's ledger, keyed by card id: its open statement holds the dates to show. */
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map();
	/** Today, which picks each card's open period for the row's close and due dates. */
	@property() today: PlainDate = today(new Date());

	constructor() {
		super();
		new LocaleController(this);
	}

	private right(card: Card) {
		const room = card.limitGroupId ? this.rooms.get(card.limitGroupId) : null;
		if (!room)
			return html`<span class="r"><small data-tone="muted">${t("cards.page.noGroup")}</small></span>`;
		const note = roomNote(room, this.credits.get(card.id) ?? 0);
		return html`<span class="r">
			<b class="amount" data-numeric>${formatAmount(room.room)}</b>
			<small data-tone=${note.warn ? "warn" : nothing}>${note.text}</small>
		</span>`;
	}

	private dates(card: Card): string {
		const period = openPeriod(card, this.today);
		// The ledger's open statement honours kept dates; the cycle only fills in without one.
		const kept = this.ledgers.get(card.id)?.statements.find((s) => s.open);
		const locale = getLocale();
		return t("cards.page.dates", {
			close: displayDate(
				kept?.closeDate ?? closeDateOf(card.cycle, period),
				locale,
			),
			due: displayDate(kept?.dueDate ?? dueDateOf(card.cycle, period), locale),
		});
	}

	private row(card: Card, flat: boolean) {
		const extra = flat ? nameOfLocation(this.locations, card.location) : "";
		return html`<a class="crow" data-card=${card.id}
			href=${`/card?id=${encodeURIComponent(card.id)}`}>
			${cardMini(card, this.groups)}
			<span class="what"><span class="title"><span class="t"><b>${cardRowTitle(card, this.groups)}</b>${
				extra ? html` <span class="word">· ${extra}</span>` : nothing
			}</span>${
				card.supplementary
					? html`<span class="tag">${t("cards.page.supplementary")}</span>`
					: nothing
			}</span>
			<span class="sub">${this.dates(card)}</span></span>
			${this.right(card)}
		</a>`;
	}

	private panel(cards: Card[], flat: boolean) {
		return html`<div class="panel">${cards.map((c) => this.row(c, flat))}</div>`;
	}

	private archive() {
		const { archived } = this.results;
		if (archived.length === 0) return nothing;
		return html`<details class="archive" ?open=${panelOpen(ARCHIVE_PANEL, false)}
			@toggle=${rememberPanel(ARCHIVE_PANEL)}>
			<summary>${t("cards.archivedList", { count: archived.length })}</summary>
			${this.panel(archived, true)}
		</details>`;
	}

	override render() {
		const { sections, flat, count } = this.results;
		const none =
			count === 0
				? html`<p class="empty">${
						this.total === 0 ? t("cards.page.empty") : t("cards.page.noMatch")
					}</p>`
				: nothing;
		return html`${none}
			${(sections ?? []).map(
				({ location, cards }) => html`<section data-location=${location}>
					<h2 class="place"><b>${nameOfLocation(this.locations, location)}</b> <small>${cardsCount(cards.length)}${
						takesPurchases(this.locations, location)
							? ` · ${t("cards.page.takesPurchases")}`
							: ""
					}</small></h2>
					${this.panel(cards, false)}
				</section>`,
			)}
			${
				flat && flat.length > 0
					? html`<section>
						<p class="result-head">${cardsCount(flat.length)}</p>
						${this.panel(flat, true)}
					</section>`
					: nothing
			}
			${this.archive()}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-cards-list": CcCardsList;
	}
}
