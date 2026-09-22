import { expect, test } from "bun:test";
import { MessageError } from "#lib/i18n/error";
import { setLocale } from "#lib/i18n/index";
import { StorageError } from "#lib/storage/repository";
import { createPageState } from "#lib/ui/page-state";

test("load clears the error on success and repaints", async () => {
	let paints = 0;
	const state = createPageState({
		fetch: async () => {},
		fallbackKey: "cards.error.read",
		paint: () => {
			paints += 1;
		},
	});

	await state.load();

	expect(state.error).toBe("");
	expect(paints).toBe(1);
});

test("load translates a MessageError's key and substitutes its parameters", async () => {
	setLocale("en");
	const state = createPageState({
		fetch: async () => {
			throw new MessageError("card.error.notFound", { id: "kbank" });
		},
		fallbackKey: "cards.error.read",
		paint: () => {},
	});

	await state.load();

	expect(state.error).toBe("No card with the id kbank.");
});

test("load falls back to the translated fallbackKey for a non-Error rejection", async () => {
	setLocale("en");
	const state = createPageState({
		fetch: () => Promise.reject("nope"),
		fallbackKey: "cards.error.read",
		paint: () => {},
	});

	await state.load();

	expect(state.error).toBe("Could not read the card list.");
});

test("guard prefixes the translated message key onto a failed action's own message", async () => {
	setLocale("en");
	const state = createPageState({
		fetch: async () => {},
		fallbackKey: "cards.error.read",
		paint: () => {},
	});

	await state.guard(async () => {
		throw new Error("disk is full");
	}, "cards.error.save");

	expect(state.error).toBe("Could not save the card. disk is full");
});

test("guard clears the error and reloads after a successful action", async () => {
	setLocale("en");
	let fetched = 0;
	const state = createPageState({
		fetch: async () => {
			fetched += 1;
		},
		fallbackKey: "cards.error.read",
		paint: () => {},
	});

	await state.guard(async () => {}, "cards.error.save");

	expect(state.error).toBe("");
	expect(fetched).toBe(1);
});

test("guard's composed prefix renders in Thai, not just English", async () => {
	setLocale("th");
	const state = createPageState({
		fetch: async () => {},
		fallbackKey: "cards.error.read",
		paint: () => {},
	});

	await state.guard(async () => {
		throw new Error("disk is full");
	}, "cards.error.save");

	expect(state.error).toBe("บันทึกบัตรไม่สำเร็จ disk is full");
});

test("load prefixes the translated fallback onto a StorageError's own message, so a Thai reader is never shown an English-only banner", async () => {
	setLocale("th");
	const state = createPageState({
		fetch: async () => {
			throw new StorageError("Stored value at cc:card:scb is not readable");
		},
		fallbackKey: "dashboard.error.read",
		paint: () => {},
	});

	await state.load();

	expect(state.error).toBe(
		"อ่านข้อมูลบัตรไม่สำเร็จ Stored value at cc:card:scb is not readable",
	);
});

test("the error follows a locale switch instead of freezing in whatever language it failed in", async () => {
	setLocale("en");
	const state = createPageState({
		fetch: async () => {},
		fallbackKey: "dashboard.error.read",
		paint: () => {},
	});

	await state.guard(async () => {
		throw new Error("localStorage is full");
	}, "dashboard.error.markPaid");

	expect(state.error).toBe(
		"Could not record the payment. localStorage is full",
	);

	// No further guard/load call: reading `error` again after the switch is the whole
	// point -- it must re-translate from the failure it kept, not replay a cached sentence.
	setLocale("th");

	expect(state.error).toBe("บันทึกการชำระเงินไม่สำเร็จ localStorage is full");
});
