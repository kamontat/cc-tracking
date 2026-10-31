import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-list-index";
import "#components/cc-owed-list";
import "#components/cc-tx-filter";
import "#components/cc-tx-ledger";
import { html, nothing, render } from "lit";
import { type FilterPill, filterControls } from "#components/list-controls";
import { displayDate, monthName, today } from "#lib/domain/date";
import { formatAmount, MINUS } from "#lib/domain/money";
import { markPaid, plannedOf } from "#lib/domain/pay";
import {
	byDay,
	filterEntries,
	ledgerEntries,
	monthSummary,
	owedRows,
	sortEntries,
	type TxFilter,
	type TxSort,
} from "#lib/domain/transactions";
import type { CardPayment, ListStatus, PurchaseList } from "#lib/domain/types";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { cardLine, cardLineHtml } from "#lib/ui/card-label";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import { deletePayment, savePayment } from "#lib/ui/record-payment";
import { writeListReply } from "#lib/ui/save-list-reply";
import { readTxView, type TxView, writeTxView } from "#lib/ui/tx-query";

export type TransactionsOptions = {
	/** The page's only clock reading: today's date. */
	clock?: () => Date;
	/** The address's query; `location.search` unless a test passes its own. */
	search?: string;
	/** Writes the new query into the address; `history.replaceState` unless a test records it. */
	replace?: (query: string) => void;
};

const VIEWS = ["ledger", "lists", "owed"] as const;

/**
 * Renders Transactions into `root`: a switch between the ledger, the purchase lists and what
 * is owed, with the view kept in the address so a reload (or a shared link) lands in the same
 * place. From 900px the owed list sits beside the ledger.
 */
export function renderTransactionsPage(
	repo: Repository,
	root: HTMLElement,
	{
		clock = () => new Date(),
		search = location.search,
		replace = (query) =>
			history.replaceState(null, "", `${location.pathname}${query}`),
	}: TransactionsOptions = {},
): void {
	const now = today(clock());
	let view: TxView = readTxView(search);
	let data: MoneyData | null = null;
	// A fresh object each time the sheet opens, so the sheet's draft starts from the view.
	let sheet: TxFilter | null = null;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "home.error.read",
		paint: () => paint(),
	});

	const change = (next: Partial<TxView>) => {
		view = { ...view, ...next };
		replace(writeTxView(view));
		paint();
	};
	const setFilter = (patch: Partial<TxFilter>) =>
		change({ filter: { ...view.filter, ...patch } });

	const mark = (payment: CardPayment) =>
		state.guard(async () => {
			if (data) await savePayment(repo, data, markPaid(payment, now), now);
		}, "tx.error.markPaid");
	/** Upcoming's *Confirm*: the waiting list saved as is, every line made (DD-108). */
	const confirmList = (list: PurchaseList) =>
		state.guard(async () => {
			await writeListReply(repo, list.id, { now: clock() });
		}, "tx.error.confirmList");
	const remove = (payment: CardPayment) =>
		state.guard(async () => {
			await deletePayment(repo, payment);
		}, "tx.error.delete");

	// A card's chip shows its line form with its short form beside it.
	const chips = (): FilterPill[] => {
		if (!data) return [];
		const { filter } = view;
		const cards = data.cards;
		const list: FilterPill[] = [];
		for (const type of filter.types)
			list.push({
				key: `type:${type}`,
				label: t(type === "purchase" ? "tx.type.purchase" : "tx.type.payment"),
				clear: () =>
					setFilter({ types: filter.types.filter((x) => x !== type) }),
			});
		for (const id of filter.cards) {
			const card = cards.find((c) => c.id === id);
			list.push({
				key: `card:${id}`,
				label: cardLine(id, card),
				shown: cardLineHtml(id, card),
				clear: () => setFilter({ cards: filter.cards.filter((x) => x !== id) }),
			});
		}
		if (filter.range)
			list.push({
				key: "range",
				label: t(`tx.range.${filter.range}`),
				clear: () => setFilter({ range: "", from: "", to: "" }),
			});
		if (filter.range === "" && (filter.from || filter.to))
			list.push({
				key: "range",
				label: `${filter.from ? displayDate(filter.from, getLocale()) : "…"} – ${filter.to ? displayDate(filter.to, getLocale()) : "…"}`,
				clear: () => setFilter({ from: "", to: "" }),
			});
		return list;
	};

	const ledgerView = () => {
		if (!data) return nothing;
		const d = data;
		const { filter } = view;
		const narrowed =
			filter.q.trim() !== "" ||
			filter.types.length > 0 ||
			filter.cards.length > 0 ||
			filter.range !== "" ||
			filter.from !== "" ||
			filter.to !== "";
		const all = ledgerEntries(d.cards, d.purchases, d.payments);
		const rows = sortEntries(filterEntries(all, filter, now), view.sort);
		const dated = view.sort === "new" || view.sort === "old";
		const summary = narrowed ? null : monthSummary(all, d.ledgers, now);
		const upcoming = {
			lists: d.lists
				.filter((l) => l.status === "sent")
				.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
			planned: plannedOf(d.payments).map((payment) => ({
				payment,
				card: d.cards.find((c) => c.id === payment.cardId),
			})),
			cards: d.cards,
		};
		const active = chips();
		const openSheet = () => {
			sheet = { ...filter };
			paint();
		};
		const figure = (
			field: string,
			label: string,
			text: string,
			tone?: string,
		) =>
			html`<div data-field=${field}><small>${label}</small>
				<b data-numeric data-tone=${tone ?? nothing}>${text}</b></div>`;
		return html`
			${filterControls({
				q: filter.q,
				placeholder: t("tx.search.placeholder"),
				onSearch: (q) => setFilter({ q }),
				onOpen: openSheet,
				count: active.length,
				sort: t(`tx.sort.${view.sort}`),
				chips: active,
			})}
			${
				summary
					? html`<section class="tx-summary" data-testid="summary">
						<div class="tx-summary__head">
							<h2>${t("tx.summary.title", { month: monthName(now, getLocale()) })}</h2>
						</div>
						<div class="tx-summary__figures">
							${figure("purchases", t("tx.summary.purchases"), `${summary.purchases ? MINUS : ""}${formatAmount(summary.purchases)}`, "out")}
							${figure("payments", t("tx.summary.payments"), `${summary.payments ? "+" : ""}${formatAmount(summary.payments)}`, "in")}
							${figure("owed", t("tx.summary.owed"), formatAmount(summary.owed))}
						</div>
					</section>`
					: nothing
			}
			<cc-tx-ledger
				.groups=${dated ? byDay(rows) : null}
				.entries=${rows}
				.lists=${d.lists}
				.limitGroups=${d.groups}
				.today=${now}
				.filtered=${narrowed}
				.upcoming=${narrowed ? null : upcoming}
				@mark-paid=${(e: CustomEvent<{ payment: CardPayment }>) => mark(e.detail.payment)}
				@confirm-list=${(e: CustomEvent<{ list: PurchaseList }>) => confirmList(e.detail.list)}
				@delete-payment=${(e: CustomEvent<{ payment: CardPayment }>) => remove(e.detail.payment)}
			></cc-tx-ledger>
			${
				sheet
					? html`<cc-tx-filter
						.cards=${d.cards.filter(
							(c) => !c.archived || (d.ledgers.get(c.id)?.owed ?? 0) > 0,
						)}
						.filter=${sheet}
						.sort=${view.sort}
						.count=${(f: TxFilter, _s: TxSort) => filterEntries(all, f, now).length}
						@apply=${(e: CustomEvent<{ filter: TxFilter; sort: TxSort }>) => {
							sheet = null;
							change({ filter: e.detail.filter, sort: e.detail.sort });
						}}
						@close=${() => {
							sheet = null;
							paint();
						}}
					></cc-tx-filter>`
					: nothing
			}
		`;
	};

	const paint = () => {
		const d = data;
		render(
			html`
				<div class="tx-grid" data-show=${view.view}>
					<div class="tx-main">
						<div class="tx-head">
							<h1>${t("nav.transactions")}</h1>
							<div class="tx-switch" role="group">${VIEWS.map(
								(name) =>
									html`<button type="button" data-view=${name} data-variant="quiet"
										aria-pressed=${view.view === name}
										data-desktop-current=${name === "ledger" && view.view === "owed" ? "" : nothing}
										@click=${() => {
											change({ view: name });
										}}>${t(`tx.view.${name}`)}</button>`,
							)}</div>
						</div>
						<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
						${
							d
								? html`<div class="tx-body">${
										view.view === "lists"
											? html`<cc-list-index
												.lists=${d.lists}
												.cards=${d.cards}
												.status=${view.status}
												@status=${(e: CustomEvent<{ status: ListStatus[] }>) => change({ status: e.detail.status })}
											></cc-list-index>`
											: ledgerView()
									}</div>`
								: nothing
						}
					</div>
					${
						d
							? html`<aside class="tx-owed">
								<cc-owed-list
									.rows=${owedRows(d.cards, d.ledgers, now, view.owedSort)}
									.groups=${d.groups}
									.sort=${view.owedSort}
									@sort=${(e: CustomEvent<{ sort: TxView["owedSort"] }>) => change({ owedSort: e.detail.sort })}
								></cc-owed-list>
							</aside>`
							: nothing
					}
				</div>
			`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.transactions", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderTransactionsPage(repo, root);
});
