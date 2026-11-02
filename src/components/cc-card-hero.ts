import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { cardUsePct } from "#lib/domain/cards-view";
import { closeDateOf, dueDateOf } from "#lib/domain/cycle";
import { displayDate } from "#lib/domain/date";
import { ledgerUrgency } from "#lib/domain/ledger";
import { usageLevel } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { cardOwnerOf } from "#lib/domain/owner";
import type { GroupRoom } from "#lib/domain/room";
import { openPeriod } from "#lib/domain/statement";
import type {
	Card,
	LedgerStatement,
	LimitGroup,
	LocationRecord,
	PlainDate,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { nameOfLocation } from "#lib/i18n/format";
import { getLocale, t } from "#lib/i18n/index";
import { groupTone } from "#lib/ui/card-label";
import { base } from "#styles/shared";

/**
 * The top of a card's page (prototype `vCard`): the hero on the group's pastel -- the group and
 * its holder, the cards it is shared with, the room big, the limit, the bar, and the share used
 * with the dates a purchase made today lands on -- then three stats: *Owed*, *Next bill* (the
 * bad colour when overdue) and *Credit* when there is credit, else *Kept in*. Every figure
 * arrives computed (`roomFor`, the card's ledger, `nextBill`); this only lays them out.
 */
@customElement("cc-card-hero")
export class CcCardHero extends LitElement {
	static override styles = [
		base,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.hero {
				display: grid;
				gap: var(--cc-space-3);
				padding: var(--cc-space-4);
				color: var(--cc-text);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			.hero[data-g] {
				border-color: transparent;
			}

			.hero[data-g="1"] {
				color: var(--cc-group-1-text);
				background: var(--cc-group-1);
			}

			.hero[data-g="2"] {
				color: var(--cc-group-2-text);
				background: var(--cc-group-2);
			}

			.hero[data-g="3"] {
				color: var(--cc-group-3-text);
				background: var(--cc-group-3);
			}

			.hero[data-g="4"] {
				color: var(--cc-group-4-text);
				background: var(--cc-group-4);
			}

			.who,
			.used {
				font-size: var(--cc-text-xs);
			}

			.who {
				font-weight: 600;
			}

			.figure {
				display: flex;
				flex-direction: column;
			}

			/* The room is the page's one big figure, in ink so it reads first on any pastel. */
			.big {
				font-size: var(--cc-text-2xl);
				font-weight: 780;
				line-height: 1.1;
				letter-spacing: -0.02em;
				color: var(--cc-text);
				font-variant-numeric: tabular-nums;
			}

			.of {
				font-size: var(--cc-text-sm);
			}

			/* The bar in the group's own ink, its track a tint of the same. */
			.bar {
				display: block;
				block-size: calc(var(--cc-space-1) * 1.5);
				overflow: hidden;
				background: color-mix(
					in oklab,
					currentColor var(--cc-hero-track),
					transparent
				);
				border-radius: var(--cc-radius-pill);
			}

			.bar > span {
				display: block;
				block-size: 100%;
				background: currentColor;
				border-radius: var(--cc-radius-pill);
			}

			.bar[data-level="high"] > span {
				background: var(--cc-warning);
			}

			.bar[data-level="over"] > span {
				background: var(--cc-danger);
			}

			.stats {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: var(--cc-space-2);
			}

			.stat {
				display: flex;
				flex-direction: column;
				gap: calc(var(--cc-space-1) * 0.75);
				min-inline-size: 0;
				padding: var(--cc-space-2) var(--cc-space-3);
				line-height: 1.3;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-sm);
			}

			.stat small {
				font-size: var(--cc-text-xs);
				font-weight: 600;
				color: var(--cc-text-muted);
				text-transform: uppercase;
				letter-spacing: 0.06em;
			}

			.stat b {
				font-size: var(--cc-text-md);
				font-weight: 650;
				overflow-wrap: anywhere;
			}

			.stat b[data-overdue] {
				color: var(--cc-danger);
			}

			@media (max-width: 639px) {
				.stat {
					padding-inline: var(--cc-space-2);
				}

				.stat b {
					font-size: var(--cc-text-sm);
				}
			}

			@media (forced-colors: active) {
				.bar {
					border: var(--cc-border-width) solid;
				}

				.bar > span {
					background: CanvasText;
				}
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;
	/** Every stored card, to name the others on this card's group. */
	@property({ attribute: false }) cards: Card[] = [];
	/** Every stored group, in order, for the group's pastel. */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** The card's group room, from `roomFor`; null when it draws on no group. */
	@property({ attribute: false }) room: GroupRoom | null = null;
	/** What this card alone still owes, from its ledger. */
	@property({ attribute: false }) owed = 0;
	/** Paid money the card's statements could not spend, from its ledger. */
	@property({ attribute: false }) credit = 0;
	/** The oldest closed statement still owing, from `nextBill`. */
	@property({ attribute: false }) next: LedgerStatement | null = null;
	@property() today: PlainDate = "";
	/** The stored locations, which name the place the card is kept at. */
	@property({ attribute: false }) locations: LocationRecord[] = [];

	constructor() {
		super();
		new LocaleController(this);
	}

	override render() {
		const card = this.card;
		if (!card) return nothing;
		return html`${this.hero(card)}${this.stats(card)}`;
	}

	private hero(card: Card) {
		const room = this.room;
		const tone = groupTone(card, this.groups);
		if (!room)
			return html`<section class="hero"><p>${t("card.hero.noGroup")}</p></section>`;
		const { group } = room;
		const holder = cardOwnerOf(card, group);
		const others = this.cards
			.filter((c) => c.limitGroupId === group.id && c.id !== card.id)
			.map((c) => c.id);
		const who = [
			group.name,
			holder,
			others.length > 0
				? t("card.hero.shared", { cards: others.join(", ") })
				: "",
		]
			.filter(Boolean)
			.join(" · ");
		const pct = cardUsePct(room) ?? 0;
		const period = openPeriod(card, this.today);
		const locale = getLocale();
		return html`<section class="hero" data-g=${tone ?? nothing}>
			<span class="who">${who}</span>
			<div class="figure">
				<span class="big" data-numeric>${formatAmount(room.room)}</span>
				<span class="of">${t("card.hero.roomOf", { limit: formatAmount(group.limit) })}</span>
			</div>
			<span class="bar" data-level=${usageLevel(room.used + room.held, group.limit)} aria-hidden="true">
				<span style=${`inline-size: ${Math.min(100, pct)}%`}></span>
			</span>
			<span class="used">${t("card.hero.used", {
				pct,
				close: displayDate(closeDateOf(card.cycle, period), locale),
				due: displayDate(dueDateOf(card.cycle, period), locale),
			})}</span>
		</section>`;
	}

	private stats(card: Card) {
		const next = this.next;
		const overdue =
			next !== null && ledgerUrgency(next, this.today) === "overdue";
		return html`<div class="stats">
			<div class="stat">
				<small>${t("card.stat.owed")}</small>
				<b data-numeric>${formatAmount(this.owed)}</b>
			</div>
			<div class="stat">
				<small>${t("card.stat.next")}</small>
				<b data-numeric ?data-overdue=${overdue}>${next ? formatAmount(next.remaining) : "—"}</b>
			</div>
			${
				this.credit > 0
					? html`<div class="stat">
						<small>${t("card.stat.credit")}</small>
						<b data-numeric>${formatAmount(this.credit)}</b>
					</div>`
					: html`<div class="stat">
						<small>${t("card.stat.keptIn")}</small>
						<b>${nameOfLocation(this.locations, card.location)}</b>
					</div>`
			}
		</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-hero": CcCardHero;
	}
}
