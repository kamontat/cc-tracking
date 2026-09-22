import { expect, test } from "bun:test";
import { MessageError } from "#lib/i18n/error";
import { setLocale } from "#lib/i18n/index";
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
