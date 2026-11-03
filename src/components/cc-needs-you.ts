import {
	css,
	html,
	LitElement,
	nothing,
	type PropertyValues,
	type TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
	type ActionRowText,
	actionRow,
	actionRowStyles,
	cycleLine,
	draftText,
	listParts,
	money,
	overdueText,
	PAST_TODAY,
	plannedSay,
	plannedText,
	say,
	sentWords,
	useCycleFit,
	useOpenRow,
	waitingText,
} from "#components/action-row";
import { useTwoStep } from "#components/two-step";
import { addDays } from "#lib/domain/date";
import type { NeedsItem } from "#lib/domain/home";
import { formatAmount, MINUS } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import type { Card, LimitGroup, PlainDate } from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { listPageAddress } from "#lib/ui/list-address";
import { payAddress } from "#lib/ui/pay-address";
import { base, controls, rowPanel } from "#styles/shared";

/** How many things show before *See more*. */
const SHOWN = 5;

/**
 * What needs doing on Home, money at risk first (DD-62): bills past due, late plans, replies
 * to record, payments planned soon, drafts to finish. Each is the shared action row (DD-108):
 * its icon says the kind and the amount sits on the right. A row opens in place (one at a
 * time) to a drawer of one sentence and its buttons (DD-165): an overdue bill its billing cycle
 * line, red up to today, *Pay* the amount left and *Open card*; a plan *Paid* (`mark-paid`)
 * and a two-step *Delete* (`delete-payment`); a waiting list its lines, *Record reply* and a
 * two-step *Confirm* (`confirm-list`); a draft its lines, *Continue* and a one-step *Delete*
 * (`delete-draft`, DD-74). Home writes them. More than five show the first
 * five and *See more (N)*, which opens the rest in place, in the same order.
 */
@customElement("cc-needs-you")
export class CcNeedsYou extends LitElement {
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
			}

			h1 {
				font-size: var(--cc-text-2xl);
				font-weight: 700;
			}

			.panel {
				box-shadow: var(--cc-shadow-sm);
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				border-radius: var(--cc-radius-sm);
				background: var(--cc-surface-sunken);
			}

			.more {
				align-self: center;
			}

			.note[data-tone="ok"] {
				background: var(--cc-accent-surface);
			}
		`,
	];

	@property({ attribute: false }) items: NeedsItem[] = [];
	/** Every stored card, to name a draft's cards. */
	@property({ attribute: false }) cards: Card[] = [];
	/** Every stored limit group, to say whose card it is (DR-13). */
	@property({ attribute: false }) groups: LimitGroup[] = [];
	/** Today, to say how far off a planned payment is. */
	@property() today: PlainDate = "";

	/** Whether the things past the first `SHOWN` are open (DD-106). */
	@state() private expanded = false;

	/** The two-step *Delete* and *Confirm* swaps, shared with the ledger. */
	private readonly steps = useTwoStep(this);
	/** The one open row, by `rowId`; a swap ends when its row closes. */
	private readonly rows = useOpenRow(this, () => this.steps.reset());

	constructor() {
		super();
		new LocaleController(this);
		// Cycle line labels make room by measuring (DD-165).
		useCycleFit(this);
	}

	protected override willUpdate(changed: PropertyValues<this>) {
		if (changed.has("items")) this.rows.prune(this.items.map(rowId));
	}

	private emit(name: string, detail: object) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	/** Draws `item` as a row that opens in place: `above` and the sentence `words`, then `action`. */
	private opening(
		item: NeedsItem,
		text: ActionRowText,
		amount: { text: string; tone: "out" | "in" | "muted" | "danger" },
		above: TemplateResult | typeof nothing,
		words: string | TemplateResult,
		action: TemplateResult,
	) {
		const id = rowId(item);
		return actionRow(text, {
			id,
			amount,
			action,
			open: {
				expanded: this.rows.isOpen(id),
				onToggle: () => this.rows.toggle(id),
				detailsId: this.rows.detailsId(id),
				above,
				say: words,
			},
		});
	}

	private row(item: NeedsItem) {
		switch (item.kind) {
			case "waiting":
				return this.opening(
					item,
					waitingText(item.list, this.cards, this.groups),
					{
						text: `${MINUS}${formatAmount(listTotal(item.list))}`,
						tone: "muted",
					},
					listParts(item.list, this.cards),
					say("row.say.sent", { date: sentWords(item.list) }),
					html`<a class="btn" data-action="record-reply" href=${listPageAddress(item.list)}>${t("row.recordReply")}</a>${this.steps.listButtons(
						item.list,
						() => this.emit("confirm-list", { list: item.list }),
					)}`,
				);
			case "overdue":
				return this.opening(
					item,
					overdueText(item.card, this.groups, item.days),
					{ text: formatAmount(item.remaining), tone: "danger" },
					// From the statement's start to a few days past today, so today sits inside.
					cycleLine({
						start: item.startDate,
						end: addDays(this.today, PAST_TODAY),
						marks: [
							{ kind: "closed", date: item.closeDate },
							{ kind: "due", date: item.dueDate },
							{ kind: "now", date: this.today },
						],
						fillTo: this.today,
						late: true,
					}),
					say("row.say.left", {
						left: money(formatAmount(item.remaining)),
						total: money(formatAmount(item.billed)),
						when:
							item.days === 1
								? t("row.say.late.one")
								: t("row.say.late.many", { days: item.days }),
					}),
					html`<a class="btn" data-action="pay" href=${payAddress({
						cardId: item.card.id,
						amount: item.remaining,
					})}>${t("row.payAmount", { amount: formatAmount(item.remaining) })}</a><a class="btn" data-variant="quiet" data-action="open-card"
						href=${`/card?id=${encodeURIComponent(item.card.id)}`}>${t("row.openCard")}</a>`,
				);
			case "planned": {
				const { payment } = item;
				return this.opening(
					item,
					plannedText(payment, item.card, this.groups, this.today),
					{ text: `+${formatAmount(payment.amount)}`, tone: "in" },
					nothing,
					// The subtitle has no note, so the sentence carries it.
					plannedSay(payment),
					this.steps.planButtons(payment, item.card, {
						paid: () => this.emit("mark-paid", { payment }),
						remove: () => this.emit("delete-payment", { payment }),
					}),
				);
			}
			case "draft":
				return this.opening(
					item,
					draftText(item.list, this.cards, this.groups),
					{
						text: `${MINUS}${formatAmount(listTotal(item.list))}`,
						tone: "muted",
					},
					listParts(item.list, this.cards),
					t("row.say.draft"),
					html`<a class="btn" data-action="continue" href=${listPageAddress(item.list)}>${t("row.continue")}</a><button type="button"
						data-variant="danger" data-action="delete-draft"
						@click=${() => this.emit("delete-draft", { list: item.list })}>${t("common.delete")}</button>`,
				);
		}
	}

	override render() {
		if (this.items.length === 0) {
			return html`
				<h1 tabindex="-1" data-refocus="needs">${t("home.caughtUp")}</h1>
				<p class="note" data-tone="ok">${t("home.caughtUpDetail")}</p>
			`;
		}
		const count = this.items.length;
		return html`
			<h1 tabindex="-1" data-refocus="needs">${count === 1 ? t("home.needs.one") : t("home.needs.many", { count })}</h1>
			<div class="panel" id="needs-list">
				${(this.expanded ? this.items : this.items.slice(0, SHOWN)).map(
					(item) => this.row(item),
				)}
			</div>
			${
				count > SHOWN
					? html`<button type="button" class="more" data-variant="quiet" data-action="more"
							aria-controls="needs-list" aria-expanded=${this.expanded ? "true" : "false"}
							@click=${() => {
								this.expanded = !this.expanded;
							}}>${
								this.expanded
									? t("common.showLess")
									: t("common.seeMore", { count: count - SHOWN })
							}</button>`
					: nothing
			}
		`;
	}
}

/** A row's id in the open-row controller, unique across kinds (a payment's id repeats across cards). */
function rowId(item: NeedsItem): string {
	switch (item.kind) {
		case "overdue":
			return `due:${item.card.id}`;
		case "planned":
			return `plan:${item.payment.cardId}:${item.payment.id}`;
		default:
			return `list:${item.list.id}`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-needs-you": CcNeedsYou;
	}
}
