import { isValidDate } from "#lib/domain/date";
import { toLocation } from "#lib/domain/location";
import { toOwner } from "#lib/domain/owner";
import { type Settings, toSettings } from "#lib/domain/settings";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";
import type { MessageKey } from "#lib/i18n/catalog";
import { MessageError } from "#lib/i18n/error";
import type { Repository } from "#lib/storage/repository";

export const BACKUP_VERSION = 2;

export type Backup = {
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	limitGroups: LimitGroup[];
	cards: Card[];
	purchases: Purchase[];
	payments: StatementPayment[];
	/**
	 * Absent in files written before settings existed. The version stays 2 rather than
	 * bumping to 3 for a field whose absence means "leave what is already stored alone":
	 * a bump would reject every backup already sitting in someone's downloads folder.
	 */
	settings?: Settings;
};

export async function exportBackup(
	repo: Repository,
	now: Date = new Date(),
): Promise<Backup> {
	const limitGroups = await repo.listLimitGroups();
	const cards = await repo.listCards();
	const settings = await repo.getSettings();
	const purchases: Purchase[] = [];
	const payments: StatementPayment[] = [];

	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		payments.push(...(await repo.listPayments(card.id)));
	}

	return {
		version: BACKUP_VERSION,
		exportedAt: now.toISOString(),
		limitGroups,
		cards,
		purchases,
		payments,
		settings,
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

/** `null` when the cycle is well-formed, otherwise which catalog key names what's wrong. */
function cycleProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.noCycle";
	const kind = prop(value, "kind");
	if (kind === "offset") {
		return isInteger(prop(value, "closeDay")) &&
			isInteger(prop(value, "dueOffsetDays"))
			? null
			: "backup.problem.badOffsetCycle";
	}
	if (kind === "fixed") {
		return isInteger(prop(value, "closeDay")) &&
			isInteger(prop(value, "dueDay"))
			? null
			: "backup.problem.badFixedCycle";
	}
	return "backup.problem.badCycleKind";
}

/** `null` when the card is well-formed, otherwise which catalog key names what's wrong. */
function cardProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name")))
		return "backup.problem.missingName";
	if (!isNonEmptyString(prop(value, "last4")))
		return "backup.problem.missingLast4";
	if (toLocation(prop(value, "location")) === null)
		return "backup.problem.badLocation";
	return cycleProblem(prop(value, "cycle"));
}

/** `null` when the purchase is well-formed, otherwise which catalog key names what's wrong. */
function purchaseProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "cardId")))
		return "backup.problem.missingCardId";
	if (!isPlainDate(prop(value, "date"))) return "backup.problem.badDate";
	if (!isInteger(prop(value, "amount"))) return "backup.problem.badAmount";
	return null;
}

/** `null` when the payment is well-formed, otherwise which catalog key names what's wrong. */
function paymentProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "cardId")))
		return "backup.problem.missingCardId";
	if (!isNonEmptyString(prop(value, "period")))
		return "backup.problem.missingPeriod";
	if (!isPlainDate(prop(value, "paidAt"))) return "backup.problem.badPaidAt";
	if (!isPlainDate(prop(value, "closeDate")))
		return "backup.problem.badCloseDate";
	if (!isPlainDate(prop(value, "dueDate"))) return "backup.problem.badDueDate";
	return null;
}

/** `null` when the limit group is well-formed, otherwise which catalog key names what's wrong. */
function limitGroupProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name")))
		return "backup.problem.missingName";
	if (!isInteger(prop(value, "limit"))) return "backup.problem.badLimit";
	// Absent is fine -- groups written before the field existed read as the default owner.
	// A value that is present but unknown is not: that is a file claiming something the
	// closed set cannot honour, and silently rewriting it would lose whose account it is.
	const owner = prop(value, "owner");
	if (owner !== undefined && toOwner(owner) === null)
		return "backup.problem.badOwner";
	return null;
}

export function parseBackup(text: string): Backup {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		const failure = new MessageError("backup.unreadable");
		failure.cause = cause;
		throw failure;
	}

	if (!isPlainObject(value)) {
		throw new MessageError("backup.unreadable");
	}

	const version = prop(value, "version");
	if (version !== BACKUP_VERSION) {
		throw new MessageError("backup.version", {
			found: JSON.stringify(version),
			expected: BACKUP_VERSION,
		});
	}

	const limitGroups = prop(value, "limitGroups");
	const cards = prop(value, "cards");
	const purchases = prop(value, "purchases");
	const payments = prop(value, "payments");
	if (
		!isList(limitGroups) ||
		!isList(cards) ||
		!isList(purchases) ||
		!isList(payments)
	) {
		throw new MessageError("backup.unreadable");
	}

	for (const [index, group] of limitGroups.entries()) {
		const problem = limitGroupProblem(group);
		if (problem) {
			throw new MessageError("backup.limitGroup", {
				index: index + 1,
				problem,
			});
		}
	}
	for (const [index, card] of cards.entries()) {
		const problem = cardProblem(card);
		if (problem) {
			throw new MessageError("backup.card", { index: index + 1, problem });
		}
	}
	for (const [index, purchase] of purchases.entries()) {
		const problem = purchaseProblem(purchase);
		if (problem) {
			throw new MessageError("backup.purchase", { index: index + 1, problem });
		}
	}
	for (const [index, payment] of payments.entries()) {
		const problem = paymentProblem(payment);
		if (problem) {
			throw new MessageError("backup.payment", { index: index + 1, problem });
		}
	}

	// Narrowed rather than trusted, and left absent when the file carries nothing usable, so
	// that importing an older backup leaves the settings already stored alone.
	const settings = prop(value, "settings");
	const parsed = value as unknown as Backup;
	if (isPlainObject(settings)) parsed.settings = toSettings(settings);
	else delete parsed.settings;
	return parsed;
}

/** Additive: writes every record over whatever shares its key, and deletes nothing. */
export async function importBackup(
	repo: Repository,
	backup: Backup,
): Promise<void> {
	for (const group of backup.limitGroups) await repo.saveLimitGroup(group);
	for (const card of backup.cards) await repo.saveCard(card);
	for (const purchase of backup.purchases) await repo.savePurchase(purchase);
	for (const payment of backup.payments) await repo.savePayment(payment);
	if (backup.settings) await repo.saveSettings(backup.settings);
}
