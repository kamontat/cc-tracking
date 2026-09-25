import { expect, test } from "bun:test";
import {
	DEFAULT_CARD_VIEW,
	DEFAULT_GROUP_VIEW,
	UNASSIGNED,
} from "#lib/domain/list-view";
import { readViews, writeViews } from "#lib/ui/list-view-query";

test("reads the defaults from an empty query", () => {
	expect(readViews(new URLSearchParams())).toEqual({
		cards: DEFAULT_CARD_VIEW,
		groups: DEFAULT_GROUP_VIEW,
	});
});

test("round-trips both views through the query", () => {
	const views = {
		cards: {
			q: "visa",
			owner: "NT" as const,
			location: "krabi" as const,
			group: UNASSIGNED,
			sort: "closeDay" as const,
			dir: "desc" as const,
		},
		groups: {
			q: "kbank",
			owner: "RI" as const,
			sort: "available" as const,
			dir: "desc" as const,
		},
	};
	const params = writeViews(new URLSearchParams(), views);
	expect(readViews(params)).toEqual(views);
});

test("leaves defaults out of the query and keeps keys it does not own", () => {
	const params = writeViews(new URLSearchParams("edit=kbank&q=old"), {
		cards: { ...DEFAULT_CARD_VIEW, sort: "name" },
		groups: DEFAULT_GROUP_VIEW,
	});
	expect(params.toString()).toBe("edit=kbank&sort=name");
});

test("drops values it does not recognise", () => {
	const views = readViews(
		new URLSearchParams(
			"owner=ZZ&loc=mars&sort=weird&dir=up&gowner=x&gsort=cards&gdir=down",
		),
	);
	expect(views).toEqual({
		cards: DEFAULT_CARD_VIEW,
		groups: DEFAULT_GROUP_VIEW,
	});
});
