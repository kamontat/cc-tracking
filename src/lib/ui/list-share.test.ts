import { afterEach, expect, test } from "bun:test";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import {
	type CanvasLike,
	canDrawImage,
	drawTablePng,
	imageName,
	shareTable,
	shareText,
} from "#lib/ui/list-share";

const card = (id: string, name: string, last4: string): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});
const cards = [
	card("KB-F", "KBank Fuel", "4412"),
	card("UOB-K", "UOB Krabi", "7765"),
];
const list = {
	date: "2026-10-31",
	lines: [
		{ cardId: "KB-F", amount: 12_500_00 },
		{ cardId: "UOB-K", amount: 4_800_00 },
	],
};

afterEach(() => setLocale("en"));

test("the text follows the table", () => {
	setLocale("en");
	expect(shareText(shareTable(list, cards))).toBe(
		[
			"Purchase list · Sat, 31 Oct 2026",
			"Card | Name (last 4) | Amount",
			"KB-F | KBank Fuel (4412) | ฿12,500.00",
			"UOB-K | UOB Krabi (7765) | ฿4,800.00",
			"Total · 2 cards | ฿17,300.00",
		].join("\n"),
	);
});

test("the text reads in Thai", () => {
	setLocale("th");
	const lines = shareText(shareTable(list, cards)).split("\n");
	expect(lines[0]?.startsWith("ใบรายการซื้อ · ")).toBe(true);
	expect(lines[1]).toBe("บัตร | ชื่อ (4 หลักท้าย) | จำนวนเงิน");
});

test("a card no longer stored keeps its line", () => {
	setLocale("en");
	const table = shareTable(list, [cards[0] as Card]);
	expect(table.rows[1]).toEqual(["UOB-K", "—", "฿4,800.00"]);
});

test("images are named by the list date", () => {
	expect(imageName("2026-10-31")).toBe("purchase-list-2026-10-31.png");
});

const fakeCanvas = (context: unknown, blob: Blob | null = null) => {
	const canvas: CanvasLike = {
		width: 0,
		height: 0,
		getContext: () => context as CanvasRenderingContext2D | null,
		toBlob: (done) => done(blob),
	};
	return () => canvas;
};

test("no 2D canvas means no image", async () => {
	const deps = { createCanvas: fakeCanvas(null) };
	expect(canDrawImage(deps)).toBe(false);
	expect(await drawTablePng(shareTable(list, cards), deps)).toBeNull();
});

test("the image draws every cell, always on white paper", async () => {
	setLocale("en");
	const table = shareTable(list, cards);
	const drawn: string[] = [];
	const fills = new Set<string>();
	let fillStyle = "";
	const context = {
		set fillStyle(value: string) {
			fillStyle = value;
			fills.add(value);
		},
		get fillStyle() {
			return fillStyle;
		},
		strokeStyle: "",
		font: "",
		textAlign: "left",
		textBaseline: "alphabetic",
		lineWidth: 1,
		scale() {},
		fillRect() {},
		beginPath() {},
		moveTo() {},
		lineTo() {},
		stroke() {},
		measureText: (text: string) => ({ width: text.length * 8 }),
		fillText: (text: string) => drawn.push(text),
	};
	const blob = new Blob(["png"]);
	const result = await drawTablePng(table, {
		createCanvas: fakeCanvas(context, blob),
	});
	expect(result).toBe(blob);
	for (const text of [
		table.title,
		table.date,
		...table.headers,
		...table.rows.flat(),
		...table.total,
	]) {
		expect(drawn).toContain(text);
	}
	expect(fills.has("#ffffff")).toBe(true);
});
