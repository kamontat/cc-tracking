import type { CardPayment, LedgerStatement, PlainDate, Purchase } from "#lib/domain/types"

import { css, html, LitElement, nothing, type PropertyValues } from "lit"
import { customElement, property, state } from "lit/decorators.js"

import { compareDates, daysBetween, displayDate, periodLabel } from "#lib/domain/date"
import { ledgerUrgency } from "#lib/domain/ledger"
import { formatAmount } from "#lib/domain/money"
import { LocaleController } from "#lib/i18n/controller"
import { getLocale, t } from "#lib/i18n/index"
import { base, cardBits, controls, rowPanel } from "#styles/shared"

type Tag = { urgency?: "overdue" | "soon"; tone?: "ok"; text: string }

type PaymentLine = { kind: "payment"; payment: CardPayment; amount: number }
type Line = { kind: "purchase"; purchase: Purchase } | PaymentLine

/**
 * What an unfolded statement lists: its purchases and the payment parts that settled it, in
 * one run by date (a purchase before a payment on the same day). Two parts of one payment on
 * one statement -- one naming the period, one from the pool -- read as one line.
 */
function linesOf(statement: LedgerStatement): Line[] {
	const payments = new Map<string, PaymentLine>()
	for (const part of statement.payments) {
		const seen = payments.get(part.payment.id)
		if (seen) seen.amount += part.amount
		else
			payments.set(part.payment.id, {
				kind: "payment",
				payment: part.payment,
				amount: part.amount,
			})
	}
	const dateOf = (line: Line) => (line.kind === "purchase" ? line.purchase.date : line.payment.date)
	return [...statement.purchases.map((purchase): Line => ({ kind: "purchase", purchase })), ...payments.values()].sort(
		(a, b) => compareDates(dateOf(a), dateOf(b)),
	)
}

/**
 * A card's statements, newest first (prototype `vCard`): one row each, `Mon YYYY` with a tag
 * (*Current*, *Overdue N days*, *Due in N days* within 7, *Due D*, *Paid*), its dates or *paid
 * in full*, and what is left on the right. Runs of quiet months fold into one line (DR-22). A
 * row with purchases is a button with `aria-expanded` that unfolds them: date, note, amount,
 * *Edit* and *Delete*. *Delete* swaps in place for *Delete ฿X?* with *Delete* and *Keep*
 * (UI-09), and focus follows the swap. Emits `edit-purchase` and `delete-purchase`, each with
 * `{ purchase }`.
 */
@customElement("cc-card-statements")
export class CcCardStatements extends LitElement {
	static override styles = [
		base,
		controls,
		rowPanel,
		cardBits,
		css`
			:host {
				display: block;
			}

			.statement {
				display: flex;
				flex-direction: column;
			}

			/* The head reaches a little past the text into the panel's side padding, so its ring
			   -- drawn inside, never clipped by the panel -- keeps clear of the text and of the
			   panel's edge alike (the unfolded items stay on the text's line, inset from it). */
			.head {
				grid-template-columns: minmax(0, 1fr) auto;
				inline-size: auto;
				margin-inline: calc(var(--cc-space-2) * -1);
				padding-inline: var(--cc-space-2);
				border-radius: var(--cc-radius-sm);
			}

			button.head:focus-visible {
				box-shadow: var(--cc-focus-ring-inset);
			}

			button.head:hover {
				box-shadow:
					calc(var(--cc-space-2) * -1) 0 0 var(--cc-surface-sunken),
					var(--cc-space-2) 0 0 var(--cc-surface-sunken);
			}

			button.head:hover:focus-visible {
				box-shadow: var(--cc-focus-ring-inset);
			}

			div.head {
				cursor: default;
			}

			.title {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				gap: var(--cc-space-1) var(--cc-space-2);
			}

			.name {
				font-weight: 650;
			}

			.title .tag {
				align-self: center;
			}

			.left {
				font-weight: 650;
				white-space: nowrap;
			}

			.left[data-zero] {
				color: var(--cc-text-muted);
			}

			/* One grid for the whole list -- date, note, amount, actions -- that each line takes
			   up as a subgrid, so dates, notes and amounts line up from line to line, a payment
			   line (which has no actions) included. */
			.purchases {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto auto;
				gap: 0 var(--cc-space-3);
				/* A gap above the items, so the head's hover tint never runs into them. */
				padding: var(--cc-space-2) 0 var(--cc-space-3);
				margin: 0;
				text-align: start;
				list-style: none;
			}

			.purchase {
				display: grid;
				grid-column: 1 / -1;
				grid-template-columns: subgrid;
				align-items: center;
				row-gap: var(--cc-space-1);
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				background: var(--cc-surface-sunken);
			}

			/* A payment line reads along one baseline -- date, *Payment*, amount -- with
			   *(part of ฿X)* on its own line under *Payment*. */
			.payment {
				align-items: baseline;
			}

			.payment .pnote {
				display: grid;
				justify-items: start;
			}

			.payment .pamount {
				grid-column: 3;
			}

			.purchase:first-child {
				border-radius: var(--cc-radius-sm) var(--cc-radius-sm) 0 0;
			}

			.purchase:last-child {
				border-radius: 0 0 var(--cc-radius-sm) var(--cc-radius-sm);
			}

			.purchase:only-child {
				border-radius: var(--cc-radius-sm);
			}

			.purchase + .purchase {
				border-top: var(--cc-border-width) solid var(--cc-border);
			}

			.pdate {
				color: var(--cc-text-muted);
				white-space: nowrap;
			}

			.pnote {
				overflow-wrap: anywhere;
			}

			/* Amounts share the list's column, flush right in it, so they line up. */
			.pamount {
				justify-self: end;
				font-weight: 600;
				white-space: nowrap;
			}

			.pamount.in {
				color: var(--cc-success);
			}

			.ppart {
				display: block;
				white-space: nowrap;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.pactions {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				align-items: center;
				justify-content: flex-end;
				gap: var(--cc-space-2);
			}

			.pactions button {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-size: var(--cc-text-sm);
			}

			.ask {
				font-weight: 600;
			}

			/* On a phone the buttons take their own line under the date, note and amount. */
			@media (max-width: 639px) {
				.purchases {
					grid-template-columns: auto minmax(0, 1fr) auto;
				}

				.pactions {
					grid-column: 1 / -1;
				}
			}

			.quiet {
				padding: var(--cc-space-2) 0;
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}
		`,
	]

	@property({ attribute: false }) statements: LedgerStatement[] = []
	@property() today: PlainDate = ""

	/** The periods unfolded to their purchases; kept across reloads, by period. */
	@state() private openPeriods = new Set<string>()
	/** The purchase whose *Delete* is asking, by id. */
	@state() private asking: string | null = null
	/** The button to focus once the delete swap has rendered. */
	private refocus: { action: string; id: string } | null = null
	/** A confirmed delete waiting for its row to go, and the statement it was in. */
	private deleted: { id: string; period: string } | null = null

	constructor() {
		super()
		new LocaleController(this)
	}

	protected override updated(changed: PropertyValues<this>) {
		this.settleDelete(changed)
		const want = this.refocus
		if (!want) return
		this.refocus = null
		this.renderRoot
			.querySelector<HTMLElement>(`[data-purchase="${CSS.escape(want.id)}"] [data-action="${want.action}"]`)
			?.focus()
	}

	/**
	 * Once the statements reload after a confirmed delete: with the row gone, focus would fall
	 * to the page, so it moves to the statement's own button (any statement's, when that one has
	 * nothing left to unfold). A row still there means the delete failed; focus stays as it is.
	 */
	private settleDelete(changed: PropertyValues<this>) {
		const pending = this.deleted
		if (!pending || !changed.has("statements")) return
		this.deleted = null
		if (this.renderRoot.querySelector(`[data-purchase="${CSS.escape(pending.id)}"]`)) return
		;(
			this.renderRoot.querySelector<HTMLElement>(`[data-period="${CSS.escape(pending.period)}"] button.head`) ??
			this.renderRoot.querySelector<HTMLElement>("button.head")
		)?.focus()
	}

	private swap(asking: string | null, action: string, id: string) {
		this.refocus = { action, id }
		this.asking = asking
	}

	private toggle(period: string) {
		const next = new Set(this.openPeriods)
		if (next.has(period)) next.delete(period)
		else next.add(period)
		this.openPeriods = next
	}

	private emit(name: string, purchase: Purchase) {
		this.dispatchEvent(new CustomEvent(name, { detail: { purchase } }))
	}

	override render() {
		if (this.statements.length === 0) return html`<p class="empty">${t("statements.empty")}</p>`
		return html`<div class="panel">${this.segments().map((segment) =>
			Array.isArray(segment) ? this.quietLine(segment) : this.statement(segment),
		)}</div>`
	}

	/**
	 * Statements in order, with each run of quiet ones -- closed, nothing spent, nothing paid --
	 * gathered into an array (DR-22). The open period stays whole even when empty.
	 */
	private segments(): (LedgerStatement | LedgerStatement[])[] {
		const segments: (LedgerStatement | LedgerStatement[])[] = []
		for (const statement of this.statements) {
			const quiet =
				statement.purchases.length === 0 &&
				statement.paidAmount === 0 &&
				ledgerUrgency(statement, this.today) !== "open"
			const last = segments.at(-1)
			if (!quiet) segments.push(statement)
			else if (Array.isArray(last)) last.push(statement)
			else segments.push([statement])
		}
		return segments
	}

	private quietLine(run: LedgerStatement[]) {
		const locale = getLocale()
		// Statements arrive newest first; the range reads oldest to newest.
		const newest = periodLabel(run[0]?.period ?? "", locale)
		const oldest = periodLabel(run.at(-1)?.period ?? "", locale)
		return html`<p class="quiet">${
			run.length === 1
				? t("statements.quietOne", { period: newest })
				: t("statements.quietRun", { from: oldest, to: newest })
		}</p>`
	}

	/**
	 * The statement a purchase made today lands on: the earliest one not yet closed. Later ones
	 * exist only when a purchase is dated ahead, and are not current.
	 */
	private get currentPeriod(): string | null {
		let current: LedgerStatement | null = null
		for (const statement of this.statements) {
			if (compareDates(this.today, statement.closeDate) > 0) continue
			if (!current || compareDates(statement.closeDate, current.closeDate) < 0) current = statement
		}
		return current?.period ?? null
	}

	private tag(statement: LedgerStatement, current: boolean): Tag | null {
		if (current) return { tone: "ok", text: t("statements.current") }
		const urgency = ledgerUrgency(statement, this.today)
		if (urgency === "paid") return { text: t("statements.paidTag") }
		if (urgency === "overdue") {
			const days = daysBetween(statement.dueDate, this.today)
			return {
				urgency,
				text: t(days === 1 ? "pay.tag.overdue.one" : "pay.tag.overdue.many", {
					days,
				}),
			}
		}
		if (urgency === "soon") {
			const days = daysBetween(this.today, statement.dueDate)
			return {
				urgency,
				text: t(days === 1 ? "pay.tag.soon.one" : "pay.tag.soon.many", {
					days,
				}),
			}
		}
		if (urgency === "due")
			return {
				text: t("pay.tag.due", {
					date: displayDate(statement.dueDate, getLocale()),
				}),
			}
		return null
	}

	private statement(statement: LedgerStatement) {
		const locale = getLocale()
		const tag = this.tag(statement, statement.period === this.currentPeriod)
		const paid = ledgerUrgency(statement, this.today) === "paid"
		const lines = linesOf(statement)
		const hasLines = lines.length > 0
		const open = hasLines && this.openPeriods.has(statement.period)
		const listId = `purchases-${statement.period}`
		const body = html`
			<span class="what">
				<span class="title">
					<b class="name">${periodLabel(statement.period, locale)}</b>
					${
						tag
							? html`<span class="tag" data-urgency=${tag.urgency ?? nothing}
								data-tone=${tag.tone ?? nothing}>${tag.text}</span>`
							: nothing
					}
				</span>
				<span class="sub">${
					paid
						? t("statements.paid")
						: t("statements.header", {
								close: displayDate(statement.closeDate, locale),
								due: displayDate(statement.dueDate, locale),
							})
				}</span>
			</span>
			<span class="r">
				<span class="left" data-numeric ?data-zero=${statement.remaining === 0}
					>${formatAmount(statement.remaining)}</span>
				${
					!statement.paid && statement.paidAmount > 0
						? html`<small class="paid-part">${t("statements.paidAmount", {
								amount: formatAmount(statement.paidAmount),
							})}</small>`
						: nothing
				}
			</span>
		`
		return html`<div class="statement" data-period=${statement.period}>
			${
				hasLines
					? html`<button type="button" class="crow head" aria-expanded=${open ? "true" : "false"}
						aria-controls=${open ? listId : nothing}
						@click=${() => this.toggle(statement.period)}>${body}</button>`
					: html`<div class="crow head">${body}</div>`
			}
			${
				open
					? html`<ul class="purchases" id=${listId}>${lines.map((line) =>
							line.kind === "purchase" ? this.purchase(line.purchase, statement.period) : this.payment(line),
						)}</ul>`
					: nothing
			}
		</div>`
	}

	/** A payment part: date, *Payment*, `+฿part`, and `(part of ฿total)` when split. No buttons. */
	private payment(line: PaymentLine) {
		const locale = getLocale()
		const { payment, amount } = line
		return html`<li class="purchase payment" data-payment=${payment.id}>
			<span class="pdate">${displayDate(payment.date, locale)}</span>
			<span class="pnote"><span>${t("statements.payment")}</span>${
				amount < payment.amount
					? html` <small class="ppart">${t("statements.partOf", {
							total: formatAmount(payment.amount),
						})}</small>`
					: nothing
			}</span>
			<span class="pamount in" data-numeric>+${formatAmount(amount)}</span>
		</li>`
	}

	private purchase(purchase: Purchase, period: string) {
		const locale = getLocale()
		const amount = formatAmount(purchase.amount)
		const date = displayDate(purchase.date, locale)
		return html`<li class="purchase" data-purchase=${purchase.id}>
			<span class="pdate">${date}</span>
			<span class="pnote">${purchase.note}</span>
			<span class="pamount" data-numeric>${amount}</span>
			<span class="pactions">${
				this.asking === purchase.id
					? html`<span class="ask">${t("card.purchase.deleteAsk", { amount })}</span>
						<button type="button" data-variant="danger" data-action="confirm-delete"
							@click=${() => {
								this.asking = null
								this.deleted = { id: purchase.id, period }
								this.emit("delete-purchase", purchase)
							}}>${t("common.delete")}</button>
						<button type="button" data-variant="quiet" data-action="keep"
							@click=${() => this.swap(null, "delete-purchase", purchase.id)}
							>${t("card.purchase.keep")}</button>`
					: html`<button type="button" data-variant="quiet" data-action="edit-purchase"
							aria-label=${t("card.purchase.editOne", { amount, date })}
							@click=${() => this.emit("edit-purchase", purchase)}>${t("common.edit")}</button>
						<button type="button" data-variant="danger" data-action="delete-purchase"
							aria-label=${t("card.purchase.deleteOne", { amount, date })}
							@click=${() => this.swap(purchase.id, "confirm-delete", purchase.id)}
							>${t("common.delete")}</button>`
			}</span>
		</li>`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-statements": CcCardStatements
	}
}
