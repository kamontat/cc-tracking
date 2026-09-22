import { expect, test } from "bun:test";
import { MessageError, messageOf } from "#lib/i18n/error";
import { setLocale } from "#lib/i18n/index";

test("translates a MessageError in the current language", () => {
	setLocale("th");
	const failure = new MessageError("cards.error.save");
	expect(messageOf(failure, "cards.error.read")).toBe("บันทึกบัตรไม่สำเร็จ");
	setLocale("en");
	expect(messageOf(failure, "cards.error.read")).toBe(
		"Could not save the card.",
	);
});

test("substitutes a MessageError's parameters", () => {
	setLocale("en");
	const failure = new MessageError("card.error.notFound", { id: "kbank" });
	expect(messageOf(failure, "card.error.read")).toBe(
		"No card with the id kbank.",
	);
});

test("passes an ordinary Error's own message through untouched", () => {
	expect(messageOf(new Error("localStorage is full"), "cards.error.read")).toBe(
		"localStorage is full",
	);
});

test("falls back for anything that is not an Error", () => {
	setLocale("en");
	expect(messageOf("nope", "cards.error.read")).toBe(
		"Could not read the card list.",
	);
});

test("resolves a nested problem key inside the parameters", () => {
	setLocale("en");
	const failure = new MessageError("backup.card", {
		index: 1,
		problem: "backup.problem.missingName",
	});
	expect(messageOf(failure, "cards.error.import")).toBe(
		"That backup's card #1 is missing a name.",
	);
});
