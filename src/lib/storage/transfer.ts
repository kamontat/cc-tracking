import { isValidDate } from "#lib/domain/date";
import { toLocation } from "#lib/domain/location";
import { toOwner } from "#lib/domain/owner";
import type { MessageKey } from "#lib/i18n/catalog";

export const isList = (value: unknown): value is unknown[] =>
	Array.isArray(value);

export const isPlainObject = (
	value: unknown,
): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A single indexed read, so callers never write a literal computed member biome would rather see as dot access -- `value` is untrusted JSON and may not have `key` at all. */
export const prop = (value: Record<string, unknown>, key: string): unknown =>
	value[key];

export const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.length > 0;

export const isInteger = (value: unknown): value is number =>
	typeof value === "number" && Number.isInteger(value);

export const isPlainDate = (value: unknown): value is string =>
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
export function cardProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name")))
		return "backup.problem.missingName";
	if (!isNonEmptyString(prop(value, "last4")))
		return "backup.problem.missingLast4";
	if (toLocation(prop(value, "location")) === null)
		return "backup.problem.badLocation";
	// The same rule a limit group's owner follows: absent is a card from before the field, and
	// present-but-unknown is a claim about whose card it is that the closed set cannot keep.
	const owner = prop(value, "owner");
	if (owner !== undefined && toOwner(owner) === null)
		return "backup.problem.badOwner";
	return cycleProblem(prop(value, "cycle"));
}

/** `null` when the purchase is well-formed, otherwise which catalog key names what's wrong. */
export function purchaseProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "cardId")))
		return "backup.problem.missingCardId";
	if (!isPlainDate(prop(value, "date"))) return "backup.problem.badDate";
	if (!isInteger(prop(value, "amount"))) return "backup.problem.badAmount";
	const addedAt = prop(value, "addedAt");
	if (
		addedAt !== undefined &&
		(typeof addedAt !== "string" || Number.isNaN(Date.parse(addedAt)))
	)
		return "backup.problem.badAddedAt";
	return null;
}

/** `null` when the payment is well-formed, otherwise which catalog key names what's wrong. */
export function paymentProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "cardId")))
		return "backup.problem.missingCardId";
	if (!isNonEmptyString(prop(value, "period")))
		return "backup.problem.missingPeriod";
	if (!isPlainDate(prop(value, "paidAt"))) return "backup.problem.badPaidAt";
	if (!isPlainDate(prop(value, "closeDate")))
		return "backup.problem.badCloseDate";
	if (!isPlainDate(prop(value, "dueDate"))) return "backup.problem.badDueDate";
	// Absent is a payment from before partial payments, which paid the whole statement.
	const parts = prop(value, "parts");
	if (
		parts !== undefined &&
		!(
			isList(parts) &&
			parts.length > 0 &&
			parts.every(
				(part) =>
					isPlainObject(part) &&
					isPlainDate(prop(part, "paidAt")) &&
					isInteger(prop(part, "amount")) &&
					(prop(part, "amount") as number) > 0,
			)
		)
	)
		return "backup.problem.badParts";
	return null;
}

/** `null` when the limit group is well-formed, otherwise which catalog key names what's wrong. */
export function limitGroupProblem(value: unknown): MessageKey | null {
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
