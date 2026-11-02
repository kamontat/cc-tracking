import { html, nothing, render } from "lit";
import { addDays, headerDate, today } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import type { PurchaseList } from "#lib/domain/types";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { cardLines, cardPanel } from "#lib/ui/card-label";
import { listPageAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import {
	banner,
	elsewhereView,
	type ListPageOptions,
	listId,
	listPageDefaults,
	markListPage,
} from "./common";

/**
 * Renders the saved list named by the address's `id` into `root`, read-only: what was bought,
 * at what real amount, and a link to the draft its unmade lines moved to. A list in any other
 * state (or none) says so and links to where it can be opened.
 */
export function renderSavedPage(
	repo: Repository,
	root: HTMLElement,
	options: ListPageOptions = {},
): void {
	const { clock, search } = listPageDefaults(options);
	markListPage(root);
	const now = today(clock());
	const id = listId(search);
	let data: MoneyData | null = null;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "purchaseList.error.read",
		paint: () => paint(),
	});

	const savedView = (list: PurchaseList, from: MoneyData) => {
		const locale = getLocale();
		const byId = new Map(from.cards.map((card) => [card.id, card]));
		const made = list.lines.filter((line) => line.made).length;
		const total = formatAmount(listTotal(list));
		const moved = cardLines(
			list.lines.filter((line) => !line.made).map((line) => line.cardId),
			from.cards,
			{ short: true },
		);
		return html`
			${backHeader({
				title: headerDate(list.date, locale, true),
				detail: t("saved.detail"),
				back: "/",
			})}
			${banner(state)}
			<div class="list-layout">
				<div class="list-layout__main">
					<ul class="saved-lines">
						${list.lines.map((line) => {
							const real = line.actual ?? line.amount;
							const planned =
								line.made && real !== line.amount
									? html`<small>${t("reply.planned", { amount: formatAmount(line.amount) })}</small>`
									: nothing;
							return html`<li data-card=${line.cardId}>
								<span class="what"><b>${cardPanel(line.cardId, byId.get(line.cardId), from.groups)}</b>${planned}${
									line.note
										? html`<small class="line-note">${line.note}</small>`
										: nothing
								}</span>
								${
									line.made
										? html`<b class="amount">${formatAmount(real)}</b>`
										: html`<span class="tag">${t("reply.notMade")}</span>`
								}
							</li>`;
						})}
					</ul>
				</div>
				<div class="list-layout__side">
					<p class="note" data-tone="ok" data-place="start">${
						made === 1
							? t("saved.summary.one", { total })
							: t("saved.summary.many", { count: made, total })
					}</p>
					${
						list.movedTo
							? html`<a data-action="open-draft" href=${listPageAddress({ id: list.movedTo, status: "draft" })}>
								<b>${t("saved.moved", {
									cards: moved,
									date: headerDate(addDays(list.date, 1), locale, false),
								})}</b>
								<small>${t("saved.openDraft")}</small>
							</a>`
							: nothing
					}
				</div>
			</div>
		`;
	};

	const paint = () => {
		let body: unknown = banner(state);
		if (data) {
			const list = data.lists.find((l) => l.id === id);
			body =
				list?.status === "saved"
					? savedView(list, data)
					: elsewhereView(list, state);
		}
		render(body, root);
	};

	subscribe(() => paint());
	void state.load();
}
