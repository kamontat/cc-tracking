import { afterEach, expect, test } from "bun:test";
import type { GroupRoom } from "#lib/domain/room";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { roomLevel, roomNote, roomShare } from "#lib/ui/room-note";

afterEach(() => setLocale("en"));

const group: LimitGroup = { id: "g", name: "G", limit: 100_000_00 };
const room = (used: number, held = 0): GroupRoom => ({
	group,
	used,
	available: group.limit - used,
	held,
	room: group.limit - used - held,
	level: "within",
	sharedWith: 0,
});

test("the level counts what is held: within, from 80% high, past the limit over", () => {
	expect(roomLevel(room(79_000_00))).toBe("within");
	expect(roomLevel(room(70_000_00, 10_000_00))).toBe("high");
	expect(roomLevel(room(100_000_00))).toBe("high");
	expect(roomLevel(room(100_000_00, 1))).toBe("over");
});

test("the rail's share is used and held of the limit, never past the full width", () => {
	expect(roomShare(room(13_000_00))).toBe(13);
	expect(roomShare(room(40_000_00, 10_000_00))).toBe(50);
	expect(roomShare(room(121_065_00))).toBe(100);
});

test("the word: over limit in the danger tone, N% used in the warn tone, credit, else room", () => {
	expect(roomNote(room(121_065_00), 0)).toEqual({
		text: "over limit",
		tone: "bad",
	});
	expect(roomNote(room(92_000_00), 500_00)).toEqual({
		text: "92% used",
		tone: "warn",
	});
	expect(roomNote(room(10_000_00), 500_00)).toEqual({
		text: "credit ฿500.00",
		tone: null,
	});
	expect(roomNote(room(10_000_00), 0)).toEqual({
		text: "room",
		tone: null,
		plain: true,
	});
	setLocale("th");
	expect(roomNote(room(121_065_00), 0).text).toBe("เกินวงเงิน");
});
