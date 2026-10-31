import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { live } from "lit/directives/live.js";
import { addDays, headerDate } from "#lib/domain/date";
import { lineAmount, withNote } from "#lib/domain/list-entry";
import { formatAmount, formatAmountInput } from "#lib/domain/money";
import type {
	Card,
	LimitGroup,
	ListLine,
	PurchaseList,
} from "#lib/domain/types";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, t } from "#lib/i18n/index";
import { cardName, cardPanel } from "#lib/ui/card-label";
import {
	actionBarStyles,
	base,
	cardBits,
	controls,
	listLayout,
} from "#styles/shared";

/** One line's answer: unanswered, made or not, the real amount and the note as typed. */
type Answer = { made: boolean | undefined; text: string; note: string };

/**
 * The spender's reply to a sent list: Made or Not made per line, with the real amount of a
 * made one. Saving waits until every line is answered and every real amount is money; a
 * not-made line can move to tomorrow's draft. The `side` slot takes the page's own actions,
 * after Save (Cancel list).
 */
@customElement("cc-list-reply")
export class CcListReply extends LitElement {
	static override styles = [
		base,
		cardBits,
		controls,
		listLayout,
		actionBarStyles,
		css`
			:host {
				display: block;
			}

			.note {
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-sm);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			.line {
				display: grid;
				gap: var(--cc-space-3);
				padding: var(--cc-space-4);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
			}

			.top {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: var(--cc-space-2);
			}

			.top b {
				flex: 1;
				min-inline-size: 0;
			}

			.planned {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				font-variant-numeric: tabular-nums;
			}

			.pair {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: var(--cc-space-2);
			}

			.pair button {
				align-self: stretch;
				text-align: center;
			}

			.pair button[data-variant="danger"][aria-pressed="true"] {
				color: var(--cc-accent-text);
				background: var(--cc-danger);
			}

			input[data-field="actual"] {
				font-variant-numeric: tabular-nums;
			}

			.diff {
				color: var(--cc-warning);
				font-weight: 600;
			}

			.error {
				font-size: var(--cc-text-sm);
				color: var(--cc-danger);
			}

			.line-note {
				gap: var(--cc-space-1);
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.line-note input {
				min-inline-size: 0;
				color: var(--cc-text);
			}

			/* The reply bar stacks its one button under the note, so it keeps a roomier padding. */
			.action-bar {
				display: grid;
				padding-block: var(--cc-space-3);
				align-items: normal;
				justify-content: normal;
			}


			.action-bar button {
				align-self: stretch;
			}
		`,
	];

	/** The sent list being answered; read once, as the starting answers. */
	@property({ attribute: false }) list: PurchaseList = {
		id: "",
		date: "",
		status: "sent",
		lines: [],
	};
	@property({ attribute: false }) cards: Card[] = [];
	/** The stored limit groups, in order: a card's chip takes its group's colour. */
	@property({ attribute: false }) groups: LimitGroup[] = [];

	// The answers live here, not in the buttons or inputs, so a re-render keeps them.
	@state() private answers: Answer[] = [];
	@state() private moveUnmade = true;
	private started = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	override willUpdate(changed: PropertyValues<this>) {
		super.willUpdate(changed);
		if (!this.started) {
			this.started = true;
			this.answers = this.list.lines.map((line) => ({
				made: line.made,
				text: formatAmountInput(line.actual ?? line.amount),
				note: line.note ?? "",
			}));
		}
	}

	private setAnswer(index: number, change: Partial<Answer>) {
		this.answers = this.answers.map((answer, i) =>
			i === index ? { ...answer, ...change } : answer,
		);
	}

	/** The real amount in satang; null when it is blank or not money. */
	private real(index: number): number | null {
		const amount = lineAmount(this.answers[index]?.text ?? "");
		return amount === null || amount === 0 ? null : amount;
	}

	private save() {
		const lines = this.list.lines.map((line, i): ListLine => {
			const made = this.answers[i]?.made === true;
			const real = this.real(i);
			const answered: ListLine =
				made && real !== null && real !== line.amount
					? { cardId: line.cardId, amount: line.amount, made, actual: real }
					: { cardId: line.cardId, amount: line.amount, made };
			return withNote(answered, this.answers[i]?.note);
		});
		this.dispatchEvent(
			new CustomEvent("save-reply", {
				detail: { lines, moveUnmade: this.moveUnmade },
				bubbles: true,
				composed: true,
			}),
		);
	}

	private section(line: ListLine, index: number, byId: Map<string, Card>) {
		const answer = this.answers[index] ?? {
			made: undefined,
			text: "",
			note: "",
		};
		const real = this.real(index);
		const diff = real === null ? 0 : real - line.amount;
		const made = answer.made === true;
		const notMade = answer.made === false;
		return html`
			<section class="line" data-card=${line.cardId}>
				<div class="top" row>
					<b>${cardPanel(line.cardId, byId.get(line.cardId), this.groups)}</b>
					<span class="planned">${t("reply.planned", { amount: formatAmount(line.amount) })}</span>
				</div>
				<div class="pair" role="group" aria-label=${t("reply.wasMade")}>
					<button data-answer="made" aria-pressed=${made ? "true" : "false"}
						data-variant=${ifDefined(made ? undefined : "quiet")}
						@click=${() => this.setAnswer(index, { made: true })}
					>${t("reply.made")}</button>
					<button data-answer="not-made" aria-pressed=${notMade ? "true" : "false"}
						data-variant=${notMade ? "danger" : "quiet"}
						@click=${() => this.setAnswer(index, { made: false })}
					>${t("reply.notMade")}</button>
				</div>
				${
					made
						? html`
							<label>${t("reply.actual")}
								<input inputmode="decimal" data-field="actual"
									.value=${live(answer.text)}
									@input=${(e: Event) =>
										this.setAnswer(index, {
											text: (e.target as HTMLInputElement).value,
										})} />
							</label>
							${
								real === null
									? html`<p class="error">${t("quickAdd.error.badAmount")}</p>`
									: diff !== 0
										? html`<p class="diff">${t("reply.diff", {
												diff: `${diff > 0 ? "+" : ""}${formatAmount(diff)}`,
											})}</p>`
										: nothing
							}
						`
						: nothing
				}
				<label class="line-note">${t("purchaseList.noteLabel")}
					<input data-field="note" placeholder=${t("purchaseList.notePlaceholder")}
						aria-label=${t("purchaseList.noteFor", { card: cardName(line.cardId, byId.get(line.cardId)) })}
						.value=${live(answer.note)}
						@input=${(e: Event) =>
							this.setAnswer(index, {
								note: (e.target as HTMLInputElement).value,
							})} />
				</label>
			</section>
		`;
	}

	override render() {
		const lines = this.list.lines;
		const byId = new Map(this.cards.map((card) => [card.id, card]));
		const answered = this.answers.filter((a) => a.made !== undefined).length;
		const allAnswered = answered === lines.length;
		const madeIndexes = lines.flatMap((_, i) =>
			this.answers[i]?.made === true ? [i] : [],
		);
		const allMoney = madeIndexes.every((i) => this.real(i) !== null);
		const total = madeIndexes.reduce((sum, i) => sum + (this.real(i) ?? 0), 0);
		const unmade = lines.filter((_, i) => this.answers[i]?.made === false);

		const label = !allAnswered
			? t("reply.answerAll", { answered, count: lines.length })
			: madeIndexes.length === 1
				? t("reply.save.one", { total: formatAmount(total) })
				: t("reply.save.many", {
						count: madeIndexes.length,
						total: formatAmount(total),
					});

		return html`<div class="list-layout">
			<div class="list-layout__main">
				<p class="note">${t("reply.hint")}</p>
				<div class="lines">${lines.map((line, i) => this.section(line, i, byId))}</div>
			</div>
			<div class="list-layout__side">
			<div class="action-bar">
				${
					unmade.length > 0
						? html`<label>
							<input type="checkbox" data-field="move" .checked=${live(this.moveUnmade)}
								@change=${(e: Event) => {
									this.moveUnmade = (e.target as HTMLInputElement).checked;
								}} />
							${t("reply.move", {
								cards: unmade
									.map((line) =>
										cardName(
											line.cardId,
											this.cards.find((card) => card.id === line.cardId),
										),
									)
									.join(", "),
								date: headerDate(
									addDays(this.list.date, 1),
									getLocale(),
									false,
								),
							})}
						</label>`
						: nothing
				}
				<button data-action="save-reply" ?disabled=${!allAnswered || !allMoney}
					@click=${() => this.save()}>${label}</button>
			</div>
			<slot name="side"></slot>
			</div>
		</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-list-reply": CcListReply;
	}
}
