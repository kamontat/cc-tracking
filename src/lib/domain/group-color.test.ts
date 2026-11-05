import { describe, expect, test } from "vitest";
import {
	assignColors,
	GROUP_COLORS,
	type GroupColor,
	pickColor,
	toGroupColor,
} from "#lib/domain/group-color";
import type { LimitGroup } from "#lib/domain/types";

function group(id: string, color?: unknown): LimitGroup {
	return { id, name: id, limit: 100, color } as LimitGroup;
}

describe("toGroupColor", () => {
	test("accepts a palette name", () => {
		expect(toGroupColor("teal")).toBe("teal");
	});

	test("rejects anything else", () => {
		expect(toGroupColor("Teal")).toBeNull();
		expect(toGroupColor(3)).toBeNull();
		expect(toGroupColor(undefined)).toBeNull();
	});
});

describe("pickColor", () => {
	test("takes the only free colour whatever the random draw", () => {
		const used = GROUP_COLORS.filter((c) => c !== "cyan").map((c) =>
			group(c, c),
		);
		for (const r of [0, 0.5, 0.999]) {
			expect(pickColor(used, () => r)).toBe("cyan");
		}
	});

	test("falls back to the whole palette when none is free", () => {
		const used = GROUP_COLORS.map((c) => group(c, c));
		expect(pickColor(used, () => 0.999)).toBe(GROUP_COLORS[11]);
		expect(pickColor(used, () => 0)).toBe(GROUP_COLORS[0]);
	});

	test("clamps a draw of 1 into range", () => {
		expect(pickColor([], () => 1)).toBe(GROUP_COLORS[11]);
	});
});

describe("assignColors", () => {
	test("colourless groups take the first four in order, then pick free ones", () => {
		const groups = ["a", "b", "c", "d", "e"].map((id) => group(id));
		const out = assignColors(groups, () => 0);
		expect(out.map((g) => g.color)).toEqual([
			"blue",
			"green",
			"purple",
			"orange",
			"teal",
		]);
	});

	test("a group does not take its positional colour when another holds it", () => {
		const groups = [
			group("a"),
			group("b", "green"),
			group("c", "red"),
			group("d", "blue"),
		];
		const out = assignColors(groups, () => 0);
		const a = out.find((g) => g.id === "a");
		expect(a?.color).toBeDefined();
		expect(a?.color).not.toBe("blue");
	});

	test("returns nothing when every group already has a valid colour", () => {
		const groups = [group("a", "blue"), group("b", "rose")];
		expect(assignColors(groups)).toEqual([]);
	});

	test("repairs an invalid colour", () => {
		const out = assignColors([group("a", "nope")]);
		expect(out).toHaveLength(1);
		expect(toGroupColor(out[0]?.color)).not.toBeNull();
	});

	test("two new groups never draw the same free colour", () => {
		const groups = Array.from({ length: 6 }, (_, i) => group(`g${i}`));
		const colors: GroupColor[] = assignColors(groups, () => 0).map(
			(g) => g.color as GroupColor,
		);
		expect(new Set(colors).size).toBe(6);
	});
});
