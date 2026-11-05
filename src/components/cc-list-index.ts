import type { Card, LimitGroup, ListStatus, PurchaseList } from "#lib/domain/types"

import { css, html, LitElement, type PropertyValues } from "lit"
import { customElement, property } from "lit/decorators.js"

import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	draftText,
	listParts,
	money,
	savedText,
	say,
	sentWords,
	useOpenRow,
	waitingText,
} from "#components/action-row"
import { useTwoStep } from "#components/two-step"
import { formatAmount, MINUS } from "#lib/domain/money"
import { listTotal } from "#lib/domain/purchase-list"
import { type ListFilter, listRows } from "#lib/domain/transactions"
import { LocaleController } from "#lib/i18n/controller"
import { t } from "#lib/i18n/index"
import { listPageAddress } from "#lib/ui/list-address"
import { base, controls, rowPanel } from "#styles/shared"

const STATUSES: ListStatus[] = ["draft", "sent", "saved"]

/** Every purchase list, newest first, narrowed by status chips (none ticked means all). */
@customElement("cc-list-index")
export class CcListIndex extends LitElement {
	static override styles = [
		base,
		controls,
		rowPanel,
		actionRowStyles,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
				min-inline-size: 0;
			}

			.chips {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.chips button {
				padding: var(--cc-space-1) var(--cc-space-3);
				font-weight: 400;
				color: var(--cc-text);
				background: var(--cc-surface-sunken);
				border-color: transparent;
				border-radius: var(--cc-radius-pill);
			}

			.chips button:hover {
				background: var(--cc-border);
			}

			.chips button[aria-pressed="true"] {
				font-weight: 600;
				color: var(--cc-success);
				background: var(--cc-accent-surface);
			}
		`,
	]

	@property({ attribute: false }) lists: PurchaseList[] = []
	@property({ attribute: false }) cards: Card[] = []
	@property({ attribute: false }) groups: LimitGroup[] = []
	@property({ attribute: false }) status: ListFilter = []

	/** The two-step *Confirm* swap, shared with Home and the ledger. */
	private readonly steps = useTwoStep(this)
	/** The one open row, by `list:${id}`; a swap ends when its row closes. */
	private readonly rows = useOpenRow(this, () => this.steps.reset())

	constructor() {
		super()
		new LocaleController(this)
	}

	private toggle(status: ListStatus) {
		const next = this.status.includes(status) ? this.status.filter((s) => s !== status) : [...this.status, status]
		this.dispatchEvent(new CustomEvent("status", { detail: { status: next } }))
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("lists") || changed.has("status"))
			this.rows.prune(listRows([...this.lists], this.status).map((l) => `list:${l.id}`))
	}

	private emit(name: string, detail: object) {
		this.dispatchEvent(new CustomEvent(name, { detail }))
	}

	private text(list: PurchaseList): ActionRowText {
		if (list.status === "draft") return draftText(list, this.cards, this.groups)
		if (list.status === "sent") return waitingText(list, this.cards, this.groups)
		return savedText(list, this.cards, this.groups)
	}

	/** The opened row's one sentence: not sent yet, when it was sent, or what it bought. */
	private words(list: PurchaseList) {
		if (list.status === "draft") return t("row.say.draft")
		if (list.status === "sent") return say("row.say.sent", { date: sentWords(list) })
		return say("row.say.saved", {
			total: money(formatAmount(listTotal(list))),
		})
	}

	private buttons(list: PurchaseList) {
		const href = listPageAddress(list)
		switch (list.status) {
			case "draft":
				return html`<a class="btn" data-action="continue" href=${href}>${t("row.continue")}</a><button type="button"
					data-variant="danger" data-action="delete-draft"
					@click=${() => this.emit("delete-draft", { list })}>${t("common.delete")}</button>`
			case "sent":
				return html`<a class="btn" data-action="record-reply" href=${href}>${t("row.recordReply")}</a>${this.steps.listButtons(
					list,
					() => this.emit("confirm-list", { list }),
				)}`
			default:
				return html`<a class="btn" data-action="open" href=${href}>${t("row.open")}</a>`
		}
	}

	private row(list: PurchaseList) {
		const id = `list:${list.id}`
		const sum = listTotal(list)
		const total = formatAmount(sum)
		// A saved list is money out like a ledger purchase; a total of nothing has no sign.
		const amount: { text: string; tone: "out" | "muted" } =
			list.status !== "saved"
				? { text: `${MINUS}${total}`, tone: "muted" }
				: sum === 0
					? { text: total, tone: "muted" }
					: { text: `${MINUS}${total}`, tone: "out" }
		return actionRow(this.text(list), {
			id,
			amount,
			action: this.buttons(list),
			open: {
				expanded: this.rows.isOpen(id),
				onToggle: () => this.rows.toggle(id),
				detailsId: this.rows.detailsId(id),
				above: listParts(list, this.cards),
				say: this.words(list),
			},
		})
	}

	override render() {
		if (this.lists.length === 0)
			return html`<p class="empty" tabindex="-1" data-refocus="lists">${t("tx.lists.empty")}</p>`
		const rows = listRows([...this.lists], this.status)
		return html`
			<div class="chips">${STATUSES.map(
				(status) =>
					html`<button type="button" data-status=${status} data-variant="quiet"
						aria-pressed=${this.status.includes(status)}
						@click=${() => this.toggle(status)}>${t(`tx.lists.status.${status}`)}</button>`,
			)}</div>
			${
				rows.length === 0
					? html`<p class="empty" tabindex="-1" data-refocus="lists">${t("tx.lists.noMatch")}</p>`
					: html`<div class="panel">${rows.map((list) => this.row(list))}</div>`
			}
		`
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-index": CcListIndex
	}
}
