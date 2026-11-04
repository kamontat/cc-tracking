import { markPaid } from "#lib/domain/pay";
import type { CardPayment, PlainDate, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import type { Repository } from "#lib/storage/repository";
import type { MoneyData } from "#lib/ui/money-data";
import { deletePayment, savePayment } from "#lib/ui/record-payment";
import { writeListReply } from "#lib/ui/save-list-reply";

/*
 * The write actions an opened row runs, shared by Home, Transactions and Lists. Each is a
 * plain storage call: the page wraps it in its own `state.guard` with its own error key.
 */

/** Marks a planned payment paid, keeping the statement dates it now reaches (DD-49). */
export async function markPlanPaid(
	repo: Repository,
	data: MoneyData,
	payment: CardPayment,
	now: PlainDate,
): Promise<void> {
	await savePayment(repo, data, markPaid(payment, now), now);
}

/** A waiting list's *Confirm*: saved as is, every line made (DD-108). */
export async function confirmWaitingList(
	repo: Repository,
	listId: string,
	at: Date,
): Promise<void> {
	await writeListReply(repo, listId, { now: at });
}

export function deletePlannedPayment(
	repo: Repository,
	payment: CardPayment,
): Promise<void> {
	return deletePayment(repo, payment);
}

/**
 * The draft as stored now: one sent or saved since (in another tab, say) is not written
 * over, as the reply page refuses a list already saved.
 */
export async function storedDraft(
	repo: Repository,
	id: string,
): Promise<PurchaseList> {
	const current = (await repo.listPurchaseLists()).find((l) => l.id === id);
	if (!current) throw new MessageError("purchaseList.missing");
	if (current.status !== "draft")
		throw new MessageError("purchaseList.error.notDraft");
	return current;
}

/** Deletes a draft at once (DD-74); refuses a list gone or no longer a draft. */
export async function deleteDraftList(
	repo: Repository,
	id: string,
): Promise<void> {
	await storedDraft(repo, id);
	await repo.deletePurchaseList(id);
}
