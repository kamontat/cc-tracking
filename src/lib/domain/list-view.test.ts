import { expect, test } from "bun:test";
import { byOwnerThenName } from "#lib/domain/list-view";
import type { LimitGroup } from "#lib/domain/types";

const ids = (list: { id: string }[]) => list.map(({ id }) => id);

const group = (id: string, name: string, owner?: LimitGroup["owner"]) =>
	({ id, name, limit: 100_000, ...(owner ? { owner } : {}) }) as LimitGroup;

test("byOwnerThenName orders groups by owner, then by name within one owner", () => {
	const groups = [
		group("c", "Bravo", "RI"),
		group("a", "Zulu", "KC"),
		group("b", "Alpha", "NT"),
		group("d", "Alpha", "KC"),
	];
	expect(ids([...groups].sort(byOwnerThenName))).toEqual(["d", "a", "b", "c"]);
});

test("byOwnerThenName reads a group without an owner as the default owner", () => {
	const groups = [group("nt", "Alpha", "NT"), group("legacy", "Zulu")];
	expect(ids([...groups].sort(byOwnerThenName))).toEqual(["legacy", "nt"]);
});
