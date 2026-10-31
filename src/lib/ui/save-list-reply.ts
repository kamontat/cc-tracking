import { sequentialIds } from "#lib/domain/list-entry";
import { saveReply } from "#lib/domain/purchase-list";
import type { ListLine, Purchase, PurchaseList } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import type { Repository } from "#lib/storage/repository";

/**
 * A failed save may already have written purchases and a moved draft under this list's ids,
 * for answers that have changed since (a line now not made, say). Each purchase would count
 * twice and the draft would linger, so anything named `<list id>-<n>` that this save does
 * not write again is removed first. A longer name (`<list id>-2-0`, the moved draft's own
 * purchase) or any other id is not this save's and is left alone.
 */
async function dropStale(
	repo: Repository,
	list: PurchaseList,
	keep: Purchase[],
	keepDraft: string | undefined,
): Promise<void> {
	const kept = new Set(keep.map((p) => `${p.cardId}/${p.id}`));
	const prefix = `${list.id}-`;
	const ours = (id: string) =>
		id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length));
	for (const cardId of new Set(list.lines.map((line) => line.cardId))) {
		for (const purchase of await repo.listPurchases(cardId)) {
			if (ours(purchase.id) && !kept.has(`${cardId}/${purchase.id}`))
				await repo.deletePurchase(cardId, purchase.id);
		}
	}
	for (const other of await repo.listPurchaseLists()) {
		if (ours(other.id) && other.id !== keepDraft)
			await repo.deletePurchaseList(other.id);
	}
}

/**
 * Writes a waiting list's reply against the list as stored now, not a copy a page loaded: a
 * list saved since (in another tab, say) is refused, so its purchases are never written twice,
 * and so is one no longer waiting. `lines` are the answered lines; left out, every stored line
 * counts as made at its planned amount (Upcoming's *Confirm*, DD-108). The ids come from the
 * list's own id, so a retry after a failed write overwrites what that write left. Purchases go
 * first and the saved list last: until the list says saved, the reply can be tried again.
 */
export async function writeListReply(
	repo: Repository,
	listId: string,
	{
		lines,
		moveUnmade = false,
		now,
	}: { lines?: ListLine[]; moveUnmade?: boolean; now: Date },
): Promise<PurchaseList> {
	const stored = (await repo.listPurchaseLists()).find((l) => l.id === listId);
	if (!stored) throw new MessageError("purchaseList.missing");
	if (stored.status === "saved")
		throw new MessageError("reply.error.alreadySaved");
	if (stored.status !== "sent")
		throw new MessageError("reply.error.notWaitingSave");
	const answered =
		lines ??
		stored.lines.map(({ actual: _actual, ...line }) => ({
			...line,
			made: true,
		}));
	const result = saveReply(
		{ ...stored, lines: answered },
		{
			now: now.toISOString(),
			newId: sequentialIds(stored.id),
			moveUnmade,
		},
	);
	if (!result.ok) throw new MessageError("reply.error.unanswered");
	await dropStale(repo, stored, result.purchases, result.draft?.id);
	for (const purchase of result.purchases) await repo.savePurchase(purchase);
	if (result.draft) await repo.savePurchaseList(result.draft);
	await repo.savePurchaseList(result.saved);
	return result.saved;
}
