import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-list-index";
import "#components/cc-owed-list";
import "#components/cc-tx-filter";
import "#components/cc-tx-ledger";
import { html, nothing, render } from "lit";
import { searchBox } from "#components/list-controls";
import { today } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
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
import type { CardPayment, ListStatus } from "#lib/domain/types";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { cardLabelText } from "#lib/ui/card-label";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import { deletePayment, savePayment } from "#lib/ui/record-payment";
import {
	DEFAULT_TX_VIEW,
	readTxView,
	type TxView,
	writeTxView,
} from "#lib/ui/tx-query";

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
	let open: string | null = null;
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
			open = null;
		}, "pay.error.save");
	const remove = (payment: CardPayment) =>
		state.guard(async () => {
			await deletePayment(repo, payment);
			open = null;
		}, "pay.error.save");

	const chips = (): { key: string; label: string; clear: () => void }[] => {
		if (!data) return [];
		const { filter } = view;
		const cards = data.cards;
		const list: { key: string; label: string; clear: () => void }[] = [];
		for (const type of filter.types)
			list.push({
				key: `type:${type}`,
				label: t(type === "purchase" ? "tx.type.purchase" : "tx.type.payment"),
				clear: () =>
					setFilter({ types: filter.types.filter((x) => x !== type) }),
			});
		for (const id of filter.cards)
			list.push({
				key: `card:${id}`,
				label: cardLabelText(
					id,
					cards.find((c) => c.id === id),
				),
				clear: () => setFilter({ cards: filter.cards.filter((x) => x !== id) }),
			});
		if (filter.range)
			list.push({
				key: "range",
				label: t(`tx.range.${filter.range}`),
				clear: () => setFilter({ range: "", from: "", to: "" }),
			});
		if (filter.range === "" && (filter.from || filter.to))
			list.push({
				key: "range",
				label: `${filter.from || "…"} – ${filter.to || "…"}`,
				clear: () => setFilter({ from: "", to: "" }),
			});
		if (view.sort !== DEFAULT_TX_VIEW.sort)
			list.push({
				key: "sort",
				label: t(`tx.sort.${view.sort}`),
				clear: () => change({ sort: DEFAULT_TX_VIEW.sort }),
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
		};
		const active = chips();
		const figure = (field: string, label: string, text: string) =>
			html`<div data-field=${field}><span class="figure__label">${label}</span>
				<b data-numeric>${text}</b></div>`;
		return html`
			<div class="tx-toolbar">
				${searchBox(filter.q, t("tx.search.placeholder"), (q) => setFilter({ q }))}
				<button type="button" data-variant="quiet" data-action="filter"
					@click=${() => {
						sheet = { ...filter };
						paint();
					}}>${t("tx.filter.open")}${active.length ? ` · ${active.length}` : ""}</button>
			</div>
			${
				active.length
					? html`<div class="tx-chips">${active.map(
							(chip) =>
								html`<button type="button" data-variant="quiet" data-chip=${chip.key}
									aria-label=${t("tx.chip.remove", { filter: chip.label })}
									@click=${chip.clear}>${chip.label} ×</button>`,
						)}</div>`
					: nothing
			}
			${
				summary
					? html`<div class="tx-summary" data-testid="summary">
						${figure("purchases", t("tx.summary.purchases"), formatAmount(summary.purchases))}
						${figure("payments", t("tx.summary.payments"), formatAmount(summary.payments))}
						${figure("owed", t("tx.summary.owed"), formatAmount(summary.owed))}
					</div>`
					: nothing
			}
			<cc-tx-ledger
				.groups=${dated ? byDay(rows) : null}
				.entries=${rows}
				.lists=${d.lists}
				.today=${now}
				.open=${open}
				.filtered=${narrowed}
				.upcoming=${narrowed ? null : upcoming}
				@toggle=${(e: CustomEvent<{ id: string }>) => {
					open = open === e.detail.id ? null : e.detail.id;
					paint();
				}}
				@mark-paid=${(e: CustomEvent<{ payment: CardPayment }>) => mark(e.detail.payment)}
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
		const showMain = view.view === "ledger" || view.view === "owed";
		render(
			html`
				<h1>${t("nav.transactions")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<div class="tx-switch" role="group">${VIEWS.map(
					(name) =>
						html`<button type="button" data-view=${name}
							data-variant=${view.view === name ? nothing : "quiet"}
							aria-pressed=${view.view === name}
							@click=${() => {
								open = null;
								change({ view: name });
							}}>${t(`tx.view.${name}`)}</button>`,
				)}</div>
				${
					d
						? html`<div class="tx-grid" data-view=${view.view}>
							${
								showMain
									? html`<div class="tx-main">${ledgerView()}</div>`
									: nothing
							}
							${
								view.view === "lists"
									? html`<cc-list-index
										.lists=${d.lists}
										.cards=${d.cards}
										.status=${view.status}
										@status=${(e: CustomEvent<{ status: ListStatus[] }>) => change({ status: e.detail.status })}
									></cc-list-index>`
									: html`<aside class="tx-owed">
										<cc-owed-list
											.rows=${owedRows(d.cards, d.ledgers, now, view.owedSort)}
											.sort=${view.owedSort}
											@sort=${(e: CustomEvent<{ sort: TxView["owedSort"] }>) => change({ owedSort: e.detail.sort })}
										></cc-owed-list>
									</aside>`
							}
						</div>`
						: nothing
				}
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
