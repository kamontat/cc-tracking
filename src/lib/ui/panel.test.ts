import { expect, test } from "bun:test";
import { panelOpen, rememberPanel } from "#lib/ui/panel";

function toggled(open: boolean): Event {
	const details = document.createElement("details");
	details.open = open;
	const event = new Event("toggle");
	Object.defineProperty(event, "currentTarget", { value: details });
	return event;
}

test("falls back to the default until a state is saved", () => {
	expect(panelOpen("due", false)).toBe(false);
	expect(panelOpen("due", true)).toBe(true);
});

test("remembers a panel the reader opened or closed", () => {
	rememberPanel("due")(toggled(true));
	expect(panelOpen("due", false)).toBe(true);
	rememberPanel("due")(toggled(false));
	expect(panelOpen("due", true)).toBe(false);
});

test("keeps each panel's state apart", () => {
	rememberPanel("due")(toggled(true));
	expect(panelOpen("spendable", false)).toBe(false);
});

test("falls back to the default when the store cannot be read", () => {
	const original = globalThis.localStorage.getItem;
	globalThis.localStorage.getItem = () => {
		throw new Error("blocked");
	};
	try {
		expect(panelOpen("due", true)).toBe(true);
	} finally {
		globalThis.localStorage.getItem = original;
	}
});
