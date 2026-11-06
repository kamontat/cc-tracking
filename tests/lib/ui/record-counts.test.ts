import { expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { countsText } from "#lib/ui/record-counts"

const each = (count: number) => ({
	cards: count,
	purchases: count,
	payments: count,
	limitGroups: count,
	lists: count,
})

test("one of each kind reads singular in English", () => {
	setLocale("en")
	expect(countsText(each(1))).toBe("1 card, 1 purchase, 1 payment, 1 limit group, 1 list")
})

test("two of each kind, or none, reads plural in English", () => {
	setLocale("en")
	expect(countsText(each(2))).toBe("2 cards, 2 purchases, 2 payments, 2 limit groups, 2 lists")
	expect(countsText(each(0))).toBe("0 cards, 0 purchases, 0 payments, 0 limit groups, 0 lists")
})

test("Thai names each kind with its classifier, one or many alike", () => {
	setLocale("th")
	expect(countsText(each(1))).toBe("บัตร 1 ใบ, รายการซื้อ 1 รายการ, การชำระ 1 รายการ, กลุ่มวงเงิน 1 กลุ่ม, ใบรายการซื้อ 1 ใบ")
	expect(countsText(each(2))).toBe("บัตร 2 ใบ, รายการซื้อ 2 รายการ, การชำระ 2 รายการ, กลุ่มวงเงิน 2 กลุ่ม, ใบรายการซื้อ 2 ใบ")
	setLocale("en")
})
