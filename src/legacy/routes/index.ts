import "#legacy/components/cc-error-banner"
import "#legacy/components/cc-needs-you"
import "#legacy/components/cc-ready-panel"
import type { CardPayment, PurchaseList } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { html, render } from "lit"

import { bootstrap } from "#legacy/lib/ui/page"
import { canPurchase } from "#lib/domain/card"
import { today } from "#lib/domain/date"
import { needsYou, type ReadyRow, readyRows } from "#lib/domain/home"
import { unassignedCards } from "#lib/domain/limit"
import { plannedOf } from "#lib/domain/pay"
import { purchasePlaces } from "#lib/i18n/format"
import { subscribe, t } from "#lib/i18n/index"
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data"
import { createPageState } from "#lib/ui/page-state"
import { confirmWaitingList, deleteDraftList, deletePlannedPayment, markPlanPaid } from "#lib/ui/row-actions"
import { pageSignal } from "#lib/ui/spa"

export type HomeOptions = {
	/** The page's only clock reading: today's date. */
	clock?: () => Date
	/** How often the page re-reads the clock, so a tab left open past midnight moves on. */
	tickMs?: number
}

/**
 * Renders Home into `root`, wiring it to `repo`: what needs the reader first, then a short
 * *Ready to use* that leads to the new-list picker (DD-103). From 900px the two sit side by
 * side, *Ready to use* on the left (DD-152).
 */
export function renderHomePage(
	repo: Repository,
	root: HTMLElement,
	{ clock = () => new Date(), tickMs = 60_000 }: HomeOptions = {},
): void {
	let now = today(clock())
	let data: MoneyData | null = null

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now)
		},
		fallbackKey: "home.error.read",
		paint: () => paint(),
	})

	// What a Needs you row's buttons write: the same calls and errors as Transactions. The
	// guard reloads after, so a done item goes and a failed one stays, with the banner.
	const mark = (payment: CardPayment) =>
		state.guard(async () => {
			if (data) await markPlanPaid(repo, data, payment, now)
		}, "tx.error.markPaid")
	const removePlan = (payment: CardPayment) => state.guard(() => deletePlannedPayment(repo, payment), "tx.error.delete")
	const confirmList = (list: PurchaseList) =>
		state.guard(() => confirmWaitingList(repo, list.id, clock()), "tx.error.confirmList")
	const removeDraft = (list: PurchaseList) =>
		state.guard(() => deleteDraftList(repo, list.id), "purchaseList.error.delete")

	const paint = () => {
		let rows: ReadyRow[] = []
		let unassigned = 0
		if (data) {
			rows = readyRows(data, now)
			const locations = data.locations
			unassigned = unassignedCards(data.cards, data.groups).filter((card) => canPurchase(card, locations)).length
		}
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<div class="home-grid">
					<cc-needs-you .items=${data ? needsYou(data, now, plannedOf(data.payments)) : []}
						.cards=${data?.cards ?? []} .groups=${data?.groups ?? []} .today=${now}
						@mark-paid=${(e: CustomEvent<{ payment: CardPayment }>) => mark(e.detail.payment)}
						@delete-payment=${(e: CustomEvent<{ payment: CardPayment }>) => removePlan(e.detail.payment)}
						@confirm-list=${(e: CustomEvent<{ list: PurchaseList }>) => confirmList(e.detail.list)}
						@delete-draft=${(e: CustomEvent<{ list: PurchaseList }>) => removeDraft(e.detail.list)}></cc-needs-you>
					<cc-ready-panel
						.rows=${rows}
						.places=${data ? purchasePlaces(data.locations) : []}
						.groups=${data?.groups ?? []}
						.today=${now}
						.unassigned=${unassigned}
					></cc-ready-panel>
				</div>
			`,
			root,
		)
	}

	// Re-reads the clock now and then, so a tab left open past midnight moves on to the new day.
	// A new day reloads, since every ledger is worked out against today. Stops once the page is gone.
	const timer = setInterval(() => {
		if (!root.isConnected) {
			clearInterval(timer)
			return
		}
		const next = today(clock())
		if (next === now) return
		now = next
		void state.load()
	}, tickMs)

	subscribe(() => paint(), { signal: pageSignal() })
	void state.load()
}

export const start = () =>
	bootstrap("title.home", (repo) => {
		const root = document.querySelector<HTMLElement>("#page")
		if (root) renderHomePage(repo, root)
	})
