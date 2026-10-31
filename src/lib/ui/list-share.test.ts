import { afterEach, expect, test } from "bun:test";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import {
	type CanvasLike,
	canDrawImage,
	deliverImage,
	downloadBlob,
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

test("the text reads as plain chat lines, one card each", () => {
	setLocale("en");
	expect(shareText(shareTable(list, cards))).toBe(
		[
			"Purchase list · Sat, 31 Oct 2026",
			"",
			"KB-F) KBank Fuel (4412) — ฿12,500.00",
			"UOB-K) UOB Krabi (7765) — ฿4,800.00",
			"",
			"Total · 2 cards — ฿17,300.00",
		].join("\n"),
	);
});

test("the text reads in Thai", () => {
	setLocale("th");
	const lines = shareText(shareTable(list, cards)).split("\n");
	expect(lines[0]?.startsWith("ใบรายการซื้อ · ")).toBe(true);
	expect(lines[1]).toBe("");
	expect(lines[2]).toBe("KB-F) KBank Fuel (4412) — ฿12,500.00");
	expect(lines[5]).toBe("รวม · 2 ใบ — ฿17,300.00");
	expect(shareText(shareTable(list, cards))).not.toContain("|");
});

test("a card no longer stored keeps its line", () => {
	setLocale("en");
	const table = shareTable(list, [cards[0] as Card]);
	expect(table.rows[1]).toEqual(["UOB-K", "—", "฿4,800.00"]);
	expect(shareText(table).split("\n")[3]).toBe("UOB-K) — ฿4,800.00");
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

test("a saved list totals only what was made, at the real amount", () => {
	setLocale("en");
	const saved = {
		date: "2026-10-31",
		status: "saved" as const,
		lines: [
			{ cardId: "KB-F", amount: 12_500_00, made: true, actual: 13_000_00 },
			{ cardId: "UOB-K", amount: 4_800_00, made: false },
		],
	};
	expect(shareText(shareTable(saved, cards))).toBe(
		[
			"Purchase list · Sat, 31 Oct 2026",
			"",
			"KB-F) KBank Fuel (4412) — ฿13,000.00",
			"UOB-K) UOB Krabi (7765) — Not made",
			"",
			"Total · 1 card — ฿13,000.00",
		].join("\n"),
	);
});

test("a sent list keeps its planned amounts", () => {
	setLocale("en");
	const table = shareTable({ ...list, status: "sent" }, cards);
	expect(table.total[1]).toBe("฿17,300.00");
});

test("the total counts one card or many", () => {
	setLocale("en");
	const one = { ...list, lines: list.lines.slice(0, 1) };
	expect(shareTable(one, cards).total[0]).toBe("Total · 1 card");
	expect(shareTable(list, cards).total[0]).toBe("Total · 2 cards");
});

const png = () => new Blob(["png"], { type: "image/png" });

/** A share sheet that records what it was handed, and a download that records its calls. */
const fakes = (
	canShare: boolean,
	share: () => Promise<void> = async () => {},
) => {
	const shared: File[][] = [];
	const downloads: string[] = [];
	return {
		shared,
		downloads,
		deps: {
			share: {
				canShare: () => canShare,
				share: async (data: ShareData) => {
					shared.push(data.files ?? []);
					await share();
				},
			},
			download: (_blob: Blob, filename: string) => {
				downloads.push(filename);
			},
		},
	};
};

test("a phone that can share files gets the image in its share sheet", async () => {
	const { shared, downloads, deps } = fakes(true);
	expect(await deliverImage(png(), "purchase-list-2026-10-31.png", deps)).toBe(
		"shared",
	);
	expect(shared).toHaveLength(1);
	expect(shared[0]?.[0]?.name).toBe("purchase-list-2026-10-31.png");
	expect(shared[0]?.[0]?.type).toBe("image/png");
	expect(downloads).toEqual([]);
});

test("a browser that cannot share files downloads the image", async () => {
	const { shared, downloads, deps } = fakes(false);
	expect(await deliverImage(png(), "a.png", deps)).toBe("saved");
	expect(shared).toEqual([]);
	expect(downloads).toEqual(["a.png"]);

	const none: string[] = [];
	expect(
		await deliverImage(png(), "b.png", {
			share: {},
			download: (_b, name) => none.push(name),
		}),
	).toBe("saved");
	expect(none).toEqual(["b.png"]);
});

test("a cancelled share is not an error and downloads nothing", async () => {
	const { downloads, deps } = fakes(true, () =>
		Promise.reject(new DOMException("closed", "AbortError")),
	);
	expect(await deliverImage(png(), "a.png", deps)).toBe("cancelled");
	expect(downloads).toEqual([]);
});

test("a share that fails otherwise falls back to the download", async () => {
	const { downloads, deps } = fakes(true, () =>
		Promise.reject(new DOMException("no gesture", "NotAllowedError")),
	);
	expect(await deliverImage(png(), "a.png", deps)).toBe("saved");
	expect(downloads).toEqual(["a.png"]);
});

test("the download link's address is revoked only after a delay", () => {
	const original = {
		create: URL.createObjectURL,
		revoke: URL.revokeObjectURL,
	};
	const revoked: string[] = [];
	const scheduled: [() => void, number][] = [];
	URL.createObjectURL = () => "blob:fake";
	URL.revokeObjectURL = (url: string) => {
		revoked.push(url);
	};
	try {
		downloadBlob(png(), "a.png", {
			schedule: (run, ms) => scheduled.push([run, ms]),
		});
		expect(revoked).toEqual([]);
		expect(scheduled.map(([, ms]) => ms)).toEqual([1000]);
		scheduled[0]?.[0]();
		expect(revoked).toEqual(["blob:fake"]);
		expect(document.querySelector("a[download]")).toBeNull();
	} finally {
		URL.createObjectURL = original.create;
		URL.revokeObjectURL = original.revoke;
	}
});
