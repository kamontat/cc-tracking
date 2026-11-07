import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { type CycleInput, cycleModel, fitCycle, fitLabels } from "#lib/ui/cycle-line"

/** A statement's billing cycle line as data (DD-165). Ported from the legacy `cycleLine` tests. */
afterEach(() => setLocale("en"))

const marks = (input: CycleInput) =>
	cycleModel(input).markers.map((m) => ({
		mark: m.kind,
		text: m.label,
		quiet: m.quiet,
		at: m.at,
		edge: m.edge ?? null,
		late: m.late,
	}))

test("a purchase's cycle line puts each marker on one scale from the statement's start to its due date", () => {
	// 26 Oct = 0, bought 29 Oct = 3, today 3 Nov = 8, closes 25 Nov = 30, due 15 Dec = 50.
	const input: CycleInput = {
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-29" },
			{ kind: "closes", date: "2026-11-25" },
			{ kind: "due", date: "2026-12-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
	}
	const model = cycleModel(input)
	expect(model.spoken).toBe("Bought 29 Oct, closes 25 Nov, due 15 Dec, today 3 Nov")
	expect(model.fill).toBe("16%")
	expect(model.late).toBe(false)
	expect(marks(input)).toEqual([
		{ mark: "buy", text: "Bought 29 Oct", quiet: false, at: "6%", edge: "start", late: false },
		{ mark: "now", text: "Today", quiet: false, at: "16%", edge: null, late: false },
		{ mark: "closes", text: "Closes 25 Nov", quiet: false, at: "60%", edge: null, late: false },
		{ mark: "due", text: "Due 15 Dec", quiet: false, at: "100%", edge: "end", late: false },
	])
})

test("an overdue bill's cycle line is late to today, its due marker late, and markers near an end align to it", () => {
	// 26 Aug = 0, closed 25 Sep = 30, due 15 Oct = 50, today 3 Nov = 69, end 6 Nov = 72.
	const input: CycleInput = {
		start: "2026-08-26",
		end: "2026-11-06",
		marks: [
			{ kind: "closed", date: "2026-09-25" },
			{ kind: "due", date: "2026-10-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
		late: true,
	}
	const model = cycleModel(input)
	expect(model.spoken).toBe("Closed 25 Sep, due 15 Oct (19 days late), today 3 Nov")
	expect(model.fill).toBe("95.83%")
	expect(model.late).toBe(true)
	expect(marks(input).map((m) => [m.mark, m.at, m.edge, m.late])).toEqual([
		["closed", "41.67%", null, false],
		["due", "69.44%", null, true],
		["now", "95.83%", "end", false],
	])
})

test("markers clamp to the line, and one within 10% of an end aligns its label to that end", () => {
	expect(
		marks({
			start: "2026-10-26",
			end: "2026-12-15",
			marks: [
				{ kind: "buy", date: "2026-10-01" },
				{ kind: "due", date: "2027-01-01" },
			],
			fillTo: "2026-10-26",
		}).map((m) => [m.at, m.edge]),
	).toEqual([
		["0%", "start"],
		["100%", "end"],
	])
	expect(
		marks({
			start: "2026-09-19",
			end: "2026-11-03",
			marks: [
				{ kind: "closed", date: "2026-09-23" },
				{ kind: "due", date: "2026-10-30" },
				{ kind: "now", date: "2026-10-31" },
			],
			fillTo: "2026-10-31",
			late: true,
		}).map((m) => [m.mark, m.at, m.edge]),
	).toEqual([
		["closed", "8.89%", "start"],
		["due", "91.11%", "end"],
		["now", "93.33%", "end"],
	])
})

test("the cycle line reads in Thai", () => {
	setLocale("th")
	const late = cycleModel({
		start: "2026-08-26",
		end: "2026-11-06",
		marks: [
			{ kind: "closed", date: "2026-09-25" },
			{ kind: "due", date: "2026-10-15" },
			{ kind: "now", date: "2026-11-03" },
		],
		fillTo: "2026-11-03",
		late: true,
	})
	expect(late.markers.map((m) => m.label)).toEqual(["สรุปยอดแล้ว 25 ก.ย.", "ครบกำหนด 15 ต.ค.", "วันนี้"])
	expect(late.spoken).toBe("สรุปยอดแล้ว 25 ก.ย. ครบกำหนด 15 ต.ค. (เลยกำหนดมา 19 วัน) วันนี้ 3 พ.ย.")
})

test("on first paint the less important of two close labels keeps only its dot", () => {
	// 26 Oct = 0 .. 15 Dec = 50: bought 24 Nov = 29 (58%), closes 25 Nov = 30 (60%), due 100%.
	const near = marks({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-11-24" },
			{ kind: "closes", date: "2026-11-25" },
			{ kind: "due", date: "2026-12-15" },
			{ kind: "now", date: "2026-11-24" },
		],
		fillTo: "2026-11-24",
	})
	expect(near.map((m) => [m.mark, m.quiet])).toEqual([
		["buy", true],
		["now", false],
		["closes", false],
		["due", false],
	])
	// Due outranks a close: 9 Dec is 88%, 6 days (12%) from due at 100%.
	const late = marks({
		start: "2026-10-26",
		end: "2026-12-15",
		marks: [
			{ kind: "buy", date: "2026-10-27" },
			{ kind: "closes", date: "2026-12-09" },
			{ kind: "due", date: "2026-12-15" },
		],
		fillTo: "2026-10-27",
	})
	expect(late.map((m) => m.quiet)).toEqual([false, true, false])
})

const box = (kind: string, left: number, right: number) => ({
	kind: kind as "buy" | "closes" | "closed" | "due" | "now",
	left,
	right,
})

test("measured labels: one overlapping a kept label goes quiet, in the order due, close, bought", () => {
	expect(fitLabels([box("buy", 0, 125), box("closed", 50, 140), box("due", 120, 200), box("now", 100, 130)])).toEqual([
		true,
		true,
		false,
		false,
	])
	// A label that only overlapped a quiet one keeps its words.
	expect(fitLabels([box("buy", 0, 70), box("closed", 50, 140), box("due", 120, 200)])).toEqual([false, true, false])
	// A gap under 4px counts as touching.
	expect(fitLabels([box("closes", 0, 50), box("due", 52, 100)])).toEqual([true, false])
	// Today is above the track: never quiet, never in the way.
	expect(fitLabels([box("now", 0, 500), box("buy", 0, 500)])).toEqual([false, false])
})

test("fitting a drawn line sets data-quiet from the labels' boxes; an unlaid-out line keeps its guess", () => {
	const line = document.createElement("div")
	line.innerHTML = ["buy", "closes", "due"]
		.map((kind) => `<span class="a-mk" data-mark="${kind}"><i></i><span class="a-lbl">x</span></span>`)
		.join("")
	const rects: Record<string, [number, number]> = { buy: [0, 90], closes: [80, 170], due: [160, 250] }
	for (const mark of line.querySelectorAll<HTMLElement>(".a-mk")) {
		const label = mark.querySelector(".a-lbl") as HTMLElement
		const [left, right] = rects[mark.dataset["mark"] as string] as [number, number]
		label.getBoundingClientRect = () => ({ left, right, width: right - left }) as DOMRect
	}
	fitCycle(line)
	expect([...line.querySelectorAll(".a-mk")].map((m) => m.hasAttribute("data-quiet"))).toEqual([false, true, false])
	const unlaid = document.createElement("div")
	unlaid.innerHTML = `<span class="a-mk" data-mark="buy" data-quiet><span class="a-lbl">x</span></span>`
	fitCycle(unlaid)
	expect(unlaid.querySelector("[data-quiet]")).not.toBeNull()
})
