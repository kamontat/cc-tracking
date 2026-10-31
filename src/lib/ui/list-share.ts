import { headerDate } from "#lib/domain/date";
import { formatAmount } from "#lib/domain/money";
import { listTotal } from "#lib/domain/purchase-list";
import type {
	Card,
	ListStatus,
	PlainDate,
	PurchaseList,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { getLocale, t } from "#lib/i18n/index";

type Cells = [card: string, name: string, amount: string];

export type ShareTable = {
	title: string;
	date: string;
	headers: Cells;
	rows: Cells[];
	total: [label: string, amount: string];
};

/**
 * The list as words, in the current locale: the table, the text and the image all read it. A
 * saved list shows what was really bought: a made line at its real amount, a not-made line
 * marked so, and a total of the made lines only. Any other list shows its planned amounts.
 */
export function shareTable(
	list: Pick<PurchaseList, "date" | "lines"> & { status?: ListStatus },
	cards: Card[],
): ShareTable {
	const saved = list.status === "saved";
	const byId = new Map(cards.map((card) => [card.id, card]));
	const rows = list.lines.map((line): Cells => {
		const card = byId.get(line.cardId);
		const name = card ? `${card.name} (${card.last4})` : t("common.none");
		const amount = !saved
			? formatAmount(line.amount)
			: line.made
				? formatAmount(line.actual ?? line.amount)
				: t("reply.notMade");
		return [line.cardId, name, amount];
	});
	const total = listTotal({ ...list, id: "", status: list.status ?? "draft" });
	const count = saved
		? list.lines.filter((line) => line.made).length
		: list.lines.length;
	return {
		title: t("purchaseList.title"),
		date: headerDate(list.date, getLocale(), true),
		headers: [
			t("purchaseList.column.card"),
			t("purchaseList.column.name"),
			t("purchaseList.column.amount"),
		],
		rows,
		total: [
			t(count === 1 ? "purchaseList.total.one" : "purchaseList.total.many", {
				count,
			}),
			formatAmount(total),
		],
	};
}

export function shareText(table: ShareTable): string {
	return [
		`${table.title} · ${table.date}`,
		table.headers.join(" | "),
		...table.rows.map((row) => row.join(" | ")),
		table.total.join(" | "),
	].join("\n");
}

export const imageName = (date: PlainDate): string =>
	`purchase-list-${date}.png`;

export type CanvasLike = {
	width: number;
	height: number;
	getContext(kind: "2d"): CanvasRenderingContext2D | null;
	toBlob(done: (blob: Blob | null) => void, type: string): void;
};

export type DrawDeps = { createCanvas?: () => CanvasLike };

/**
 * The image is always drawn light, whatever theme the app is in: it is sent to other people in
 * a chat, who see white paper, not this reader's dark mode. A canvas cannot read CSS tokens, so
 * these fixed colours are the one place the drawing's palette lives.
 */
const PAPER = {
	surface: "#ffffff",
	text: "#1d2420",
	muted: "#5f6b65",
	rule: "#e1e6de",
	font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif',
} as const;

/** CSS pixels. The canvas is drawn at `SCALE` times this for a sharp image. */
const SCALE = 2;
const PAD = 24;
const GAP = 24;
const TITLE_SIZE = 18;
const TEXT_SIZE = 14;
const ROW = 32;

const defaultCanvas = (): CanvasLike => document.createElement("canvas");

export function canDrawImage(deps: DrawDeps = {}): boolean {
	try {
		const canvas = (deps.createCanvas ?? defaultCanvas)();
		return canvas.getContext("2d") !== null;
	} catch {
		return false;
	}
}

export function drawTablePng(
	table: ShareTable,
	deps: DrawDeps = {},
): Promise<Blob | null> {
	const canvas = (deps.createCanvas ?? defaultCanvas)();
	const context = canvas.getContext("2d");
	if (!context) return Promise.resolve(null);

	const font = (size: number, weight = 400) =>
		`${weight} ${size}px ${PAPER.font}`;
	const measure = (text: string, size: number, weight = 400) => {
		context.font = font(size, weight);
		return context.measureText(text).width;
	};
	const column = (index: 0 | 1 | 2) =>
		Math.ceil(
			Math.max(
				measure(table.headers[index], TEXT_SIZE, 600),
				...table.rows.map((row) => measure(row[index], TEXT_SIZE)),
			),
		);
	const cardWidth = column(0);
	const nameWidth = column(1);
	const amountWidth = Math.max(
		column(2),
		Math.ceil(measure(table.total[1], TEXT_SIZE, 700)),
	);
	const tableWidth = cardWidth + nameWidth + amountWidth + GAP * 2;
	const headWidth = Math.ceil(
		Math.max(
			measure(table.title, TITLE_SIZE, 700),
			measure(table.date, TEXT_SIZE),
			measure(table.total[0], TEXT_SIZE, 700) + GAP + amountWidth,
		),
	);
	const width = Math.max(tableWidth, headWidth) + PAD * 2;
	const height = PAD * 2 + 56 + ROW * (table.rows.length + 2);

	canvas.width = width * SCALE;
	canvas.height = height * SCALE;
	context.scale(SCALE, SCALE);
	context.fillStyle = PAPER.surface;
	context.fillRect(0, 0, width, height);
	context.textBaseline = "middle";

	const right = width - PAD;
	const text = (
		value: string,
		x: number,
		y: number,
		options: { size?: number; weight?: number; muted?: boolean; end?: boolean },
	) => {
		context.font = font(options.size ?? TEXT_SIZE, options.weight ?? 400);
		context.fillStyle = options.muted ? PAPER.muted : PAPER.text;
		context.textAlign = options.end ? "right" : "left";
		context.fillText(value, x, y);
	};
	const rule = (y: number, color: string) => {
		context.strokeStyle = color;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(PAD, y);
		context.lineTo(right, y);
		context.stroke();
	};
	const cells = (cellsOf: Cells, y: number, weight: number, muted: boolean) => {
		text(cellsOf[0], PAD, y, { weight, muted });
		text(cellsOf[1], PAD + cardWidth + GAP, y, { weight, muted });
		text(cellsOf[2], right, y, { weight, muted, end: true });
	};

	text(table.title, PAD, PAD + 12, { size: TITLE_SIZE, weight: 700 });
	text(table.date, PAD, PAD + 36, { muted: true });
	let y = PAD + 56 + ROW / 2;
	cells(table.headers, y, 600, true);
	rule(PAD + 56 + ROW, PAPER.text);
	for (const row of table.rows) {
		y += ROW;
		cells(row, y, 400, false);
		rule(y + ROW / 2, PAPER.rule);
	}
	y += ROW;
	text(table.total[0], PAD, y, { weight: 700 });
	text(table.total[1], right, y, { weight: 700, end: true });

	return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Hands `blob` to the browser as a file download. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

export type ShareApi = {
	copy?: (text: string) => Promise<void>;
	saveImage?: (table: ShareTable, filename: string) => Promise<void>;
};

/** Only what this browser can do: a button for an absent function is not offered. */
export function browserShare(): ShareApi {
	const api: ShareApi = {};
	if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
		api.copy = (text) => navigator.clipboard.writeText(text);
	}
	if (canDrawImage()) {
		api.saveImage = async (table, filename) => {
			const blob = await drawTablePng(table);
			if (!blob) throw new MessageError("purchaseList.error.image");
			downloadBlob(blob, filename);
		};
	}
	return api;
}
