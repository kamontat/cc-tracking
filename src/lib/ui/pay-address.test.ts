import { expect, test } from "bun:test";
import { payAddress, readPayAddress } from "#lib/ui/pay-address";

test("the payment page address carries the card and the amount, encoded", () => {
	expect(payAddress()).toBe("/pay");
	expect(payAddress({ cardId: "SCB-K" })).toBe("/pay?card=SCB-K");
	expect(payAddress({ cardId: "a b&c", amount: 4123000 })).toBe(
		"/pay?card=a+b%26c&amount=4123000",
	);
	// An amount without a card, or a zero amount, says nothing.
	expect(payAddress({ amount: 100 })).toBe("/pay");
	expect(payAddress({ cardId: "A", amount: 0 })).toBe("/pay?card=A");
});

test("reading the address back keeps only a whole positive amount", () => {
	expect(readPayAddress("")).toEqual({});
	expect(readPayAddress("?amount=100")).toEqual({});
	expect(readPayAddress("?card=a+b%26c&amount=4123000")).toEqual({
		cardId: "a b&c",
		amount: 4123000,
	});
	expect(readPayAddress("?card=A&amount=12.5")).toEqual({ cardId: "A" });
	expect(readPayAddress("?card=A&amount=0")).toEqual({ cardId: "A" });
});
