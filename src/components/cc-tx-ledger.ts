import type {
	Card,
	CardLedger,
	CardPayment,
	LedgerStatement,
	LimitGroup,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types"

import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"

import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	type CycleMark,
	cycleLine,
	listParts,
	money,
	PAST_TODAY,
	partLines,
	plannedSay,
	plannedText,
	say,
	sentWords,
	useCycleFit,
	useOpenRow,
	waitingText,
} from "#components/action-row"
import { useTwoStep } from "#components/two-step"
import { addDays, compareDates, dayMonth, daysBetween, displayDate, headerDate, monthName } from "#lib/domain/date"
import { statementStart } from "#lib/domain/ledger"
import { formatAmount, MINUS, sumAmounts } from "#lib/domain/money"
import { listTotal } from "#lib/domain/purchase-list"
import { entriesTotal, entryAmount, entryDate, listIdOf, type TxEntry } from "#lib/domain/transactions"
import { LocaleController } from "#lib/i18n/controller"
import { getLocale, t } from "#lib/i18n/index"
import { cardMini, cardPanelLabel } from "#lib/ui/card-label"
import { listPageAddress } from "#lib/ui/list-address"
import { base, cardBits, controls, rowPanel } from "#styles/shared"

/** How many ledger rows show at first, and how many more each *Show more* adds. */
export const LEDGER_PAGE = 50

export type Upcoming = {
	lists: PurchaseList[]
	planned: { payment: CardPayment; card: Card | undefined }[]
	/** Every stored card, to name a waiting list's cards. */
	cards: Card[]
}

/**
 * The ledger: purchases and paid payments, grouped under day headings (`groups`) or flat
 * (`entries`), and the *Upcoming* section above it. Each day (or the flat list) is one panel
 * of rows. Every row is the shared opening row (action-row.ts): its head is one button and it
 * opens in place, one row at a time across Upcoming and every day, to a drawer of one sentence
 * and its buttons (DD-165). A purchase opens to its statement's billing cycle line and what
 * that statement holds, with *Open card* and, when from a list, *Open list*; a paid payment to
 * how much reached each statement and any credit kept, with a two-step *Delete* (DD-77). In
 * Upcoming a waiting list opens to its lines, *Record reply* and a two-step *Confirm*
 * (`confirm-list`); a planned payment to its date, *Paid* (`mark-paid`) and a two-step
 * *Delete* (`delete-payment`). Each second step swaps the buttons in place
 * (UI-09) and focus follows the swap; a swap ends when its row closes. Only the first `limit`
 * rows show; a quiet *Show more* under them asks for more (`show-more`). The results line
 * still counts every entry.
 */
@customElement("cc-tx-ledger")
export class CcTxLedger extends LitElement {
	static override styles = [
		base,
		controls,
		cardBits,
		rowPanel,
		actionRowStyles,
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

			.sec-head {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: baseline;
				justify-content: space-between;
				gap: var(--cc-space-2);
			}

			h2,
			h3 {
				font-size: var(--cc-text-xs);
				font-weight: 650;
				letter-spacing: var(--cc-tracking-caps);
				text-transform: uppercase;
				color: var(--cc-text-muted);
			}

			.sec-head small {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.result-head {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.more {
				align-self: center;
			}

			.empty {
				text-align: center;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}
		`,
	]

	@property({ attribute: false }) groups: { date: PlainDate; entries: TxEntry[] }[] | null = null
	@property({ attribute: false }) entries: TxEntry[] = []
	@property({ attribute: false }) lists: PurchaseList[] = []
	/** Each card's ledger, by card id: a purchase's statement and where a payment went. */
	@property({ attribute: false }) ledgers: Map<string, CardLedger> = new Map()
	/** The stored limit groups, in order: a row's chip takes its group's colour. */
	@property({ attribute: false }) limitGroups: LimitGroup[] = []
	@property({ attribute: false }) upcoming: Upcoming | null = null
	@property() today: PlainDate = ""
	@property({ type: Boolean }) filtered = false
	/** How many rows show; the page raises it by `LEDGER_PAGE` on `show-more`. */
	@property({ attribute: false }) limit = LEDGER_PAGE
	/** The two-step *Delete* and *Confirm* swaps, shared with Needs you. */
	private readonly steps = useTwoStep(this)
	/** The one open row on the page, Upcoming and ledger alike; a swap ends when its row closes. */
	private readonly rows = useOpenRow(this, () => this.steps.reset())

	constructor() {
		super()
		new LocaleController(this)
		// Cycle line labels make room by measuring (DD-165).
		useCycleFit(this)
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("groups") || changed.has("entries") || changed.has("upcoming") || changed.has("limit"))
			this.rows.prune(this.drawnIds())
	}

	/** Every row drawn now, by its open-row id. */
	private drawnIds(): string[] {
		const up = this.upcoming
		const shown = this.groups
			? this.shownGroups(this.groups).flatMap((g) => g.entries)
			: this.entries.slice(0, this.limit)
		return [
			...(up?.lists.map((l) => `list:${l.id}`) ?? []),
			...(up?.planned.map(({ payment }) => planId(payment)) ?? []),
			...shown.map(entryId),
		]
	}

	private emit(name: string, detail: object) {
		this.dispatchEvent(new CustomEvent(name, { detail }))
	}

	private all(): TxEntry[] {
		return this.groups ? this.groups.flatMap((g) => g.entries) : this.entries
	}

	private signed(entry: TxEntry): string {
		return `${entry.kind === "payment" ? "+" : MINUS}${formatAmount(entryAmount(entry))}`
	}

	private listOf(entry: TxEntry & { kind: "purchase" }) {
		const listId = listIdOf(entry.purchase.id)
		return listId ? this.lists.find((l) => l.id === listId) : undefined
	}

	/** Draws a row that opens in place under the id `id`: `drawer` above its buttons `action`. */
	private opening(
		id: string,
		text: ActionRowText,
		amount: { text: string; tone: "out" | "in" | "muted" },
		drawer: Drawer,
		action: TemplateResult,
		lead?: TemplateResult,
	) {
		return actionRow(text, {
			id,
			lead,
			amount,
			action,
			open: {
				expanded: this.rows.isOpen(id),
				onToggle: () => this.rows.toggle(id),
				detailsId: this.rows.detailsId(id),
				above: drawer.above ?? nothing,
				say: drawer.say,
			},
		})
	}

	/**
	 * A purchase's drawer: its statement's billing cycle line, from the statement's start to its
	 * due date, and one sentence of what the statement holds. The note and the list it came from
	 * are on the sub line already (and *Open list* links the list), so they are not said twice.
	 */
	private purchaseDrawer(entry: TxEntry & { kind: "purchase" }): Drawer {
		const { purchase } = entry
		const ledger = this.ledgers.get(purchase.cardId)
		const statement = ledger?.statements.find((s) => s.purchases.some((p) => p.id === purchase.id))
		if (!ledger || !statement) return { say: nothing }
		const start = entry.card ? statementStart(entry.card, ledger.statements, statement.period) : undefined
		const words = this.statementWords(statement)
		if (!start) return { say: words }
		const today = this.today
		const closed = !statement.open && compareDates(statement.closeDate, today) < 0
		const settled = statement.remaining === 0
		const late = closed && !settled && compareDates(today, statement.dueDate) > 0
		const marks: CycleMark[] = [
			{ kind: "buy", date: purchase.date },
			{ kind: closed ? "closed" : "closes", date: statement.closeDate },
			{ kind: "due", date: statement.dueDate },
		]
		// Today shows while the statement is still to pay; once it is late the line runs past
		// today, as an overdue bill's does in Needs you.
		if (!closed || !settled) marks.push({ kind: "now", date: today })
		return {
			above: cycleLine({
				start,
				end: late ? addDays(today, PAST_TODAY) : statement.dueDate,
				marks,
				fillTo: today,
				late,
			}),
			say: words,
		}
	}

	/** One sentence of what a purchase's statement holds: so far, what is left and when, or paid. */
	private statementWords(statement: LedgerStatement): TemplateResult {
		const total = money(formatAmount(statement.total))
		const today = this.today
		if (statement.open || compareDates(statement.closeDate, today) >= 0) {
			const days = daysBetween(today, statement.closeDate)
			return say("row.say.open", {
				month: monthName(statement.closeDate, getLocale()),
				total,
				closes:
					days === 0
						? t("row.say.closesToday")
						: days === 1
							? t("row.say.closesIn.one")
							: t("row.say.closesIn.many", { days }),
			})
		}
		if (statement.remaining === 0) return say("row.say.paid", { total })
		const days = daysBetween(today, statement.dueDate)
		const when =
			days === 0
				? t("row.say.dueToday")
				: days === 1
					? t("row.say.dueIn.one")
					: days > 1
						? t("row.say.dueIn.many", { days })
						: html`<span class="a-late">${
								days === -1 ? t("row.say.late.one") : t("row.say.late.many", { days: -days })
							}</span>`
		return say("row.say.left", {
			left: money(formatAmount(statement.remaining)),
			total,
			when,
		})
	}

	/**
	 * A paid payment's drawer: how much reached each statement, oldest first, and what it kept
	 * as credit (its note is on the sub line).
	 */
	private paymentDrawer(payment: CardPayment): Drawer {
		const ledger = this.ledgers.get(payment.cardId)
		const parts: { label: string; amount: number }[] = []
		for (const statement of [...(ledger?.statements ?? [])].reverse()) {
			const amount = sumAmounts(
				statement.payments
					.filter((part) => part.payment.cardId === payment.cardId && part.payment.id === payment.id)
					.map((part) => part.amount),
			)
			if (amount > 0)
				parts.push({
					label: t("row.part.statement", {
						month: monthName(statement.closeDate, getLocale()),
					}),
					amount,
				})
		}
		// Only a known ledger can say what was not spent on a statement.
		const credit = ledger ? payment.amount - sumAmounts(parts.map((part) => part.amount)) : 0
		if (credit > 0) parts.push({ label: t("row.part.credit"), amount: credit })
		const paid = t("row.say.paidOn", {
			date: dayMonth(payment.date, getLocale()),
		})
		return {
			above:
				parts.length > 0
					? partLines(
							parts.map((part) => ({
								label: part.label,
								amount: formatAmount(part.amount),
							})),
						)
					: nothing,
			say: credit > 0 ? `${paid} ${t("row.say.credit")}` : paid,
		}
	}

	private row(entry: TxEntry, showDate: boolean) {
		const purchase = entry.kind === "purchase"
		const id = purchase ? entry.purchase.cardId : entry.payment.cardId
		const list = purchase ? this.listOf(entry) : undefined
		const parts: string[] = []
		const note = purchase ? entry.purchase.note : entry.payment.note
		if (note) parts.push(note)
		if (list) parts.push(t("tx.fromList", { date: headerDate(list.date, getLocale(), false) }))
		if (showDate) parts.push(displayDate(entryDate(entry), getLocale()))
		const text: ActionRowText = {
			kind: entry.kind,
			// The signed, coloured amount says purchase or payment (UI-07: the sign is the
			// non-colour signal), so the title is the card alone.
			title: cardPanelLabel(id, entry.card),
			subtitle: html`${parts.length > 0 ? html`<span>${parts.join(" · ")}</span>` : nothing}${
				entry.card?.archived ? html`<span class="tag archived">${t("cards.archived")}</span>` : nothing
			}`,
		}
		const amount = {
			text: this.signed(entry),
			tone: purchase ? ("out" as const) : ("in" as const),
		}
		const chip = cardMini(entry.card, this.limitGroups)
		if (entry.kind === "purchase")
			return this.opening(
				entryId(entry),
				text,
				amount,
				this.purchaseDrawer(entry),
				html`<a class="btn" data-variant="quiet" data-action="open-card"
					href=${`/card?id=${encodeURIComponent(entry.purchase.cardId)}`}>${t("row.openCard")}</a>${
						list
							? html`<a class="btn" data-variant="quiet" data-action="open-list"
								href=${`/list/view?id=${encodeURIComponent(list.id)}`}>${t("row.openList")}</a>`
							: nothing
					}`,
				chip,
			)
		const { payment } = entry
		return this.opening(
			entryId(entry),
			text,
			amount,
			this.paymentDrawer(payment),
			this.steps.paidButtons(payment, entry.card, () => this.emit("delete-payment", { payment })),
			chip,
		)
	}

	private renderUpcoming() {
		const up = this.upcoming
		if (!up || (up.lists.length === 0 && up.planned.length === 0)) return nothing
		return html`<section class="upcoming">
			<div class="sec-head"><h2 tabindex="-1" data-refocus="upcoming">${t("tx.upcoming")}</h2></div>
			<div class="panel">
				${up.lists.map((list) =>
					this.opening(
						`list:${list.id}`,
						waitingText(list, up.cards, this.limitGroups),
						{
							text: `${MINUS}${formatAmount(listTotal(list))}`,
							tone: "muted",
						},
						{
							above: listParts(list, up.cards),
							say: say("row.say.sent", { date: sentWords(list) }),
						},
						html`<a class="btn" data-action="record-reply" href=${listPageAddress(list)}>${t("row.recordReply")}</a>${this.steps.listButtons(
							list,
							() => this.emit("confirm-list", { list }),
						)}`,
					),
				)}
				${up.planned.map(({ payment, card }) =>
					this.opening(
						planId(payment),
						plannedText(payment, card, this.limitGroups, this.today),
						{ text: `+${formatAmount(payment.amount)}`, tone: "in" },
						// The subtitle has no note, so the sentence carries it.
						{ say: plannedSay(payment) },
						this.steps.planButtons(payment, card, {
							paid: () => this.emit("mark-paid", { payment }),
							remove: () => this.emit("delete-payment", { payment }),
						}),
					),
				)}
			</div>
		</section>`
	}

	private renderHead(all: TxEntry[]) {
		if (!this.filtered) return nothing
		const total = entriesTotal(all)
		const sign = total < 0 ? MINUS : "+"
		return html`<p class="result-head">${t(all.length === 1 ? "tx.results.one" : "tx.results.many", {
			count: all.length,
			total: `${sign}${formatAmount(Math.abs(total))}`,
		})}</p>`
	}

	/** The day groups cut to the first `limit` rows; a day cut part-way keeps its heading. */
	private shownGroups(groups: { date: PlainDate; entries: TxEntry[] }[]) {
		const shown: { date: PlainDate; entries: TxEntry[] }[] = []
		let left = this.limit
		for (const group of groups) {
			if (left <= 0) break
			shown.push({ ...group, entries: group.entries.slice(0, left) })
			left -= group.entries.length
		}
		return shown
	}

	/** *Show 50 more · N left*, or *Show N more* when fewer than a page are left. */
	private renderMore(total: number) {
		const left = total - this.limit
		if (left <= 0) return nothing
		return html`<button type="button" class="more" data-variant="quiet" data-action="show-more"
			@click=${() => this.emit("show-more", {})}>${
				left > LEDGER_PAGE
					? t("tx.showMore.page", { page: LEDGER_PAGE, count: left })
					: t("tx.showMore.rest", { count: left })
			}</button>`
	}

	override render() {
		const all = this.all()
		return html`
			${this.renderUpcoming()}
			${this.renderHead(all)}
			${
				all.length === 0
					? html`<p class="empty" tabindex="-1" data-refocus="ledger">${t(this.filtered ? "tx.noResults" : "tx.empty")}</p>`
					: this.groups
						? this.shownGroups(this.groups).map(
								(group) => html`<section class="day">
									<h3 tabindex="-1" data-refocus=${`day:${group.date}`}>${
										group.date === this.today
											? t("tx.today", {
													date: headerDate(group.date, getLocale(), false),
												})
											: headerDate(group.date, getLocale(), false)
									}</h3>
									<div class="panel">${group.entries.map((e) => this.row(e, false))}</div>
								</section>`,
							)
						: html`<div class="panel">${this.entries.slice(0, this.limit).map((e) => this.row(e, true))}</div>`
			}
			${this.renderMore(all.length)}
		`
	}
}

/** What an opened row shows above its buttons: a cycle line or parts, then one sentence. */
type Drawer = {
	above?: TemplateResult | typeof nothing
	say: string | TemplateResult | typeof nothing
}

/** A planned payment's open-row id: a payment's id repeats across cards. */
const planId = (payment: CardPayment) => `plan:${payment.cardId}:${payment.id}`

/** A ledger row's open-row id, unique across kinds and cards. */
function entryId(entry: TxEntry): string {
	return entry.kind === "purchase"
		? `buy:${entry.purchase.cardId}:${entry.purchase.id}`
		: `pay:${entry.payment.cardId}:${entry.payment.id}`
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-tx-ledger": CcTxLedger
	}
}
