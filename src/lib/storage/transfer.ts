import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";

export const BACKUP_VERSION = 1;

export type Backup = {
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	cards: Card[];
	purchases: Purchase[];
	payments: StatementPayment[];
};

export async function exportBackup(repo: Repository, now: Date = new Date()): Promise<Backup> {
	const cards = await repo.listCards();
	const purchases: Purchase[] = [];
	const payments: StatementPayment[] = [];

	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		payments.push(...(await repo.listPayments(card.id)));
	}

	return { version: BACKUP_VERSION, exportedAt: now.toISOString(), cards, purchases, payments };
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

export function parseBackup(text: string): Backup {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw new Error("That file is not a readable backup.", { cause });
	}

	const backup = value as Partial<Backup>;
	if (typeof backup?.version === "number" && backup.version > BACKUP_VERSION) {
		throw new Error(
			`That backup is version ${backup.version}, and this app reads version ${BACKUP_VERSION}.`,
		);
	}
	if (!isList(backup?.cards) || !isList(backup?.purchases) || !isList(backup?.payments)) {
		throw new Error("That file is not a readable backup.");
	}
	return backup as Backup;
}

/** Additive: writes every record over whatever shares its key, and deletes nothing. */
export async function importBackup(repo: Repository, backup: Backup): Promise<void> {
	for (const card of backup.cards) await repo.saveCard(card);
	for (const purchase of backup.purchases) await repo.savePurchase(purchase);
	for (const payment of backup.payments) await repo.savePayment(payment);
}
