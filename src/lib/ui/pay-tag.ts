import { displayDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import type { PayChoice } from "#lib/domain/pay";
import { getLocale, t } from "#lib/i18n/index";

export type PayTag = {
	urgency: "overdue" | "soon" | "due" | "credit" | "none";
	text: string;
};

/** The words under a card's owed figure: how late, how soon, its credit, or nothing owed. */
export function payTag(choice: PayChoice): PayTag | null {
	if (choice.urgency === "overdue")
		return {
			urgency: "overdue",
			text: t(
				choice.days === 1 ? "pay.tag.overdue.one" : "pay.tag.overdue.many",
				{ days: choice.days },
			),
		};
	if (choice.urgency === "soon")
		return {
			urgency: "soon",
			text: t(choice.days === 1 ? "pay.tag.soon.one" : "pay.tag.soon.many", {
				days: choice.days,
			}),
		};
	if (choice.urgency === "due" && choice.bill)
		return {
			urgency: "due",
			text: t("pay.tag.due", {
				date: displayDate(choice.bill.dueDate, getLocale()),
			}),
		};
	if (choice.owed <= 0 && choice.credit > 0)
		return {
			urgency: "credit",
			text: t("pay.tag.credit", { amount: formatAmount(choice.credit) }),
		};
	if (choice.owed <= 0) return { urgency: "none", text: t("pay.tag.nothing") };
	return null;
}
