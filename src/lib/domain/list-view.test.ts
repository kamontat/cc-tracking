import type { LimitGroup } from "#lib/domain/types"

import { expect, test } from "vitest"

import { byGroupName } from "#lib/domain/list-view"

const ids = (list: { id: string }[]) => list.map(({ id }) => id)

const group = (id: string, name: string, owner?: LimitGroup["owner"]) =>
	({ id, name, limit: 100_000, ...(owner ? { owner } : {}) }) as LimitGroup

test("byGroupName orders groups A to Z by name, then by id", () => {
	const groups = [
		group("c", "Bravo", "RI"),
		group("a", "Zulu", "KC"),
		group("e", "Alpha", "NT"),
		group("d", "Alpha", "KC"),
	]
	expect(ids([...groups].sort(byGroupName))).toEqual(["d", "e", "c", "a"])
})
