import { isValidDate } from "#lib/domain/date";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

export const BACKUP_VERSION = 1;

export type Backup = {
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	cards: Card[];
	purchases: Purchase[];
	payments: StatementPayment[];
};

export async function exportBackup(
	repo: Repository,
	now: Date = new Date(),
): Promise<Backup> {
	const cards = await repo.listCards();
	const purchases: Purchase[] = [];
	const payments: StatementPayment[] = [];

	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		payments.push(...(await repo.listPayments(card.id)));
	}

	return {
		version: BACKUP_VERSION,
		exportedAt: now.toISOString(),
		cards,
		purchases,
		payments,
	};
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A single indexed read, so callers never write a literal computed member biome would rather see as dot access -- `value` is untrusted JSON and may not have `key` at all. */
const prop = (value: Record<string, unknown>, key: string): unknown =>
	value[key];

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

const isInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value);

const isPlainDate = (value: unknown): value is string =>
	typeof value === "string" && isValidDate(value);

/** `null` when the cycle is well-formed, otherwise what's wrong with it. */
function cycleProblem(value: unknown): string | null {
	if (!isPlainObject(value)) return "has no cycle";
	const kind = prop(value, "kind");
	if (kind === "offset") {
		return isInteger(prop(value, "closeDay")) &&
			isInteger(prop(value, "dueOffsetDays"))
			? null
			: "has an offset cycle with a non-integer day field";
	}
	if (kind === "fixed") {
		return isInteger(prop(value, "closeDay")) &&
			isInteger(prop(value, "dueDay"))
			? null
			: "has a fixed cycle with a non-integer day field";
	}
	return 'has a cycle whose kind is neither "offset" nor "fixed"';
}

/** `null` when the card is well-formed, otherwise what's wrong with it. */
function cardProblem(value: unknown): string | null {
	if (!isPlainObject(value)) return "is not an object";
	if (!isNonEmptyString(prop(value, "id"))) return "is missing an id";
	if (!isNonEmptyString(prop(value, "name"))) return "is missing a name";
	if (!isNonEmptyString(prop(value, "last4"))) return "is missing last4";
	if (!isNonEmptyString(prop(value, "location")))
		return "is missing a location";
	return cycleProblem(prop(value, "cycle"));
}

/** `null` when the purchase is well-formed, otherwise what's wrong with it. */
function purchaseProblem(value: unknown): string | null {
	if (!isPlainObject(value)) return "is not an object";
	if (!isNonEmptyString(prop(value, "id"))) return "is missing an id";
	if (!isNonEmptyString(prop(value, "cardId"))) return "is missing a cardId";
	if (!isPlainDate(prop(value, "date"))) return "has an invalid date";
	if (!isInteger(prop(value, "amount"))) return "has a non-integer amount";
	return null;
}

/** `null` when the payment is well-formed, otherwise what's wrong with it. */
function paymentProblem(value: unknown): string | null {
	if (!isPlainObject(value)) return "is not an object";
	if (!isNonEmptyString(prop(value, "cardId"))) return "is missing a cardId";
	if (!isNonEmptyString(prop(value, "period"))) return "is missing a period";
	if (!isPlainDate(prop(value, "paidAt"))) return "has an invalid paidAt date";
	if (!isPlainDate(prop(value, "closeDate"))) return "has an invalid closeDate";
	if (!isPlainDate(prop(value, "dueDate"))) return "has an invalid dueDate";
	return null;
}

export function parseBackup(text: string): Backup {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw new Error("That file is not a readable backup.", { cause });
	}

	if (!isPlainObject(value)) {
		throw new Error("That file is not a readable backup.");
	}

	const version = prop(value, "version");
	if (version !== BACKUP_VERSION) {
		throw new Error(
			`That backup is version ${JSON.stringify(version)}, and this app reads version ${BACKUP_VERSION}.`,
		);
	}

	const cards = prop(value, "cards");
	const purchases = prop(value, "purchases");
	const payments = prop(value, "payments");
	if (!isList(cards) || !isList(purchases) || !isList(payments)) {
		throw new Error("That file is not a readable backup.");
	}

	for (const [index, card] of cards.entries()) {
		const problem = cardProblem(card);
		if (problem) {
			throw new Error(`That backup's card #${index + 1} ${problem}.`);
		}
	}
	for (const [index, purchase] of purchases.entries()) {
		const problem = purchaseProblem(purchase);
		if (problem) {
			throw new Error(`That backup's purchase #${index + 1} ${problem}.`);
		}
	}
	for (const [index, payment] of payments.entries()) {
		const problem = paymentProblem(payment);
		if (problem) {
			throw new Error(`That backup's payment #${index + 1} ${problem}.`);
		}
	}

	return value as unknown as Backup;
}

/** Additive: writes every record over whatever shares its key, and deletes nothing. */
export async function importBackup(
	repo: Repository,
	backup: Backup,
): Promise<void> {
	for (const card of backup.cards) await repo.saveCard(card);
	for (const purchase of backup.purchases) await repo.savePurchase(purchase);
	for (const payment of backup.payments) await repo.savePayment(payment);
}
