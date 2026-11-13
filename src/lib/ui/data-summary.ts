import type { PlainDate } from "#lib/domain/types"
import type { BackupV4 } from "#lib/storage/transfer-v4"

import { compareDates, displayDate } from "#lib/domain/date"
import { formatAmount, sumAmounts } from "#lib/domain/money"
import { getLocale, t } from "#lib/i18n/index"

/** What the browser holds, kind by kind: the Settings page's _Your data_ panel, opened from its row (RD-31). */
export type DataSummary = {
	cards: { active: number; archived: number }
	limitGroups: number
	purchases: { count: number; total: number; first: PlainDate | null; last: PlainDate | null }
	payments: { paid: number; paidTotal: number; planned: number }
	lists: { draft: number; sent: number; saved: number }
	locations: number
	owners: number
	bytes: number
}

/** One fact row: its label, its figure on the right, and the detail under the label ("" for none). */
export type SummaryRow = { row: string; label: string; value: string; sub: string }

/** Every key the app writes starts with this, the reader's language and theme included. */
const PREFIX = "cc:"

/**
 * Roughly what the app's keys take in `storage`: a browser keeps localStorage as UTF-16, so two
 * bytes per character of each key and its value. Other sites' keys on the same origin don't count.
 */
export function storedBytes(storage: Storage): number {
	let chars = 0
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i)
		if (key?.startsWith(PREFIX)) chars += key.length + (storage.getItem(key)?.length ?? 0)
	}
	return chars * 2
}

/** `512 B`, `1.5 KB`, `5.3 MB`: the same in every language. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const countOf = <T>(items: readonly T[], keep: (item: T) => boolean): number => items.filter(keep).length

export function summariseData(backup: BackupV4, bytes: number): DataSummary {
	const dates = backup.purchases.map((purchase) => purchase.date).sort(compareDates)
	const paid = backup.payments.filter((payment) => payment.status === "paid")
	return {
		cards: {
			active: countOf(backup.cards, (card) => !card.archived),
			archived: countOf(backup.cards, (card) => card.archived),
		},
		limitGroups: backup.limitGroups.length,
		purchases: {
			count: backup.purchases.length,
			total: sumAmounts(backup.purchases.map((purchase) => purchase.amount)),
			first: dates[0] ?? null,
			last: dates.at(-1) ?? null,
		},
		payments: {
			paid: paid.length,
			paidTotal: sumAmounts(paid.map((payment) => payment.amount)),
			planned: backup.payments.length - paid.length,
		},
		lists: {
			draft: countOf(backup.lists, (list) => list.status === "draft"),
			sent: countOf(backup.lists, (list) => list.status === "sent"),
			saved: countOf(backup.lists, (list) => list.status === "saved"),
		},
		locations: backup.locations.length,
		owners: backup.owners.length,
		bytes,
	}
}

/** The _Data summary_ button's muted line: "3 cards · 66 purchases · 17.5 KB". */
export function summaryLine(summary: DataSummary): string {
	const cards = summary.cards.active + summary.cards.archived
	const purchases = summary.purchases.count
	return [
		t(cards === 1 ? "counts.cards.one" : "counts.cards.many", { count: cards }),
		t(purchases === 1 ? "counts.purchases.one" : "counts.purchases.many", { count: purchases }),
		formatBytes(summary.bytes),
	].join(" · ")
}

/** The panel's rows, in the reader's language; a kind with no records says so under its label. */
export function summaryRows(summary: DataSummary): SummaryRow[] {
	const locale = getLocale()
	const none = t("settings.data.none")
	const { cards, purchases, payments, lists } = summary
	const cardCount = cards.active + cards.archived
	const paymentCount = payments.paid + payments.planned
	const listCount = lists.draft + lists.sent + lists.saved
	return [
		{
			row: "cards",
			label: t("settings.data.cards"),
			value: String(cardCount),
			sub: cardCount === 0 ? none : t("settings.data.cardsSub", { ...cards }),
		},
		{ row: "limit-groups", label: t("settings.data.limitGroups"), value: String(summary.limitGroups), sub: "" },
		{
			row: "purchases",
			label: t("settings.data.purchases"),
			value: String(purchases.count),
			sub:
				purchases.first === null || purchases.last === null
					? none
					: t("settings.data.purchasesSub", {
							total: formatAmount(purchases.total),
							from: displayDate(purchases.first, locale),
							to: displayDate(purchases.last, locale),
						}),
		},
		{
			row: "payments",
			label: t("settings.data.payments"),
			value: String(paymentCount),
			sub:
				paymentCount === 0
					? none
					: t("settings.data.paymentsSub", {
							paid: payments.paid,
							total: formatAmount(payments.paidTotal),
							planned: payments.planned,
						}),
		},
		{
			row: "lists",
			label: t("settings.data.lists"),
			value: String(listCount),
			sub: listCount === 0 ? none : t("settings.data.listsSub", { ...lists }),
		},
		{ row: "locations", label: t("settings.data.locations"), value: String(summary.locations), sub: "" },
		{ row: "owners", label: t("settings.data.owners"), value: String(summary.owners), sub: "" },
		// The panel's own line says where: _In this browser only_.
		{ row: "storage", label: t("settings.data.storage"), value: formatBytes(summary.bytes), sub: "" },
	]
}
