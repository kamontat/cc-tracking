import type { PlainDate } from "#lib/domain/types"

import { dayMonth, daysBetween } from "#lib/domain/date"
import { getLocale, type MessageKey, t } from "#lib/i18n/index"

/*
 * A statement's billing cycle drawn to scale (DD-165), as data for `CycleLine`: a track from
 * `start` to `end`, filled up to `fillTo` (red when `late`), and a marker for each mark in date
 * order. Every position comes from one scale, `daysBetween(start, d) / daysBetween(start, end)`,
 * clamped to the line. *Today* is a tick with its label above the track; the rest are circles
 * with the label under, and where two of those would overlap the less important one keeps only
 * its dot (`RANK`): a guess from `CROWD` here, then measured on screen (`fitLabels`). The line is
 * one image to a screen reader: its label says every date in words, how late a late due date
 * is, and today last.
 */

/** A marker on the billing cycle line: bought, the close (to come or past), due, or today. */
export type CycleMark = {
	kind: "buy" | "closes" | "closed" | "due" | "now"
	date: PlainDate
}

export type CycleInput = {
	start: PlainDate
	end: PlainDate
	marks: CycleMark[]
	fillTo: PlainDate
	late?: boolean
}

/** One drawn marker: where it sits, which end its label aligns to, and its words. */
export type CycleMarker = {
	kind: CycleMark["kind"]
	/** `inset-inline-start`, as a percent. */
	at: string
	edge: "start" | "end" | undefined
	late: boolean
	/** The first paint's guess that this label would overlap a more important one. */
	quiet: boolean
	label: string
}

export type CycleModel = {
	/** Every date in words, today last: the line's `aria-label`. */
	spoken: string
	/** The fill's `inline-size`, as a percent. */
	fill: string
	late: boolean
	markers: CycleMarker[]
}

const MARK_WORDS: Record<CycleMark["kind"], MessageKey> = {
	buy: "row.cycle.bought",
	closes: "row.cycle.closes",
	closed: "row.cycle.closed",
	due: "row.cycle.due",
	now: "row.cycle.spoken.today",
}

/** Within this share of an end, a marker's label aligns to that end, so it never clips. */
const EDGE = 10

/** The first paint's guess at crowding: labels under the track closer than this share of it. */
const CROWD = 18

/** The least room, in px, between two labels under the track that both keep their words. */
const LABEL_GAP = 4

/** Which of two crowded labels under the track keeps its words: due, then the close, then bought. */
const RANK: Record<CycleMark["kind"], number> = {
	due: 3,
	closes: 2,
	closed: 2,
	buy: 1,
	now: 0,
}

/** How many days past today a late bill's cycle line runs, so today sits inside it. */
export const PAST_TODAY = 3

export function cycleModel({ start, end, marks, fillTo, late = false }: CycleInput): CycleModel {
	const span = Math.max(1, daysBetween(start, end))
	const at = (date: PlainDate) => Math.min(100, Math.max(0, (daysBetween(start, date) / span) * 100))
	const percent = (value: number) => `${Number(value.toFixed(2))}%`
	const locale = getLocale()
	const ordered = marks
		.map((mark, i) => ({ mark, i }))
		.sort((a, b) => at(a.mark.date) - at(b.mark.date) || a.i - b.i)
		.map(({ mark }) => mark)
	const today = ordered.find((m) => m.kind === "now")?.date ?? fillTo
	const words = (mark: CycleMark) => {
		const date = dayMonth(mark.date, locale)
		if (!late || mark.kind !== "due") return t(MARK_WORDS[mark.kind], { date })
		const days = daysBetween(mark.date, today)
		return t("row.cycle.dueLate", {
			date,
			late: days === 1 ? t("row.say.late.one") : t("row.say.late.many", { days }),
		})
	}
	// The labels under the track that keep their words, most important first.
	const labelled: number[] = []
	const quiet = new Set<CycleMark>()
	for (const mark of ordered.filter((m) => m.kind !== "now").sort((a, b) => RANK[b.kind] - RANK[a.kind])) {
		const p = at(mark.date)
		if (labelled.some((q) => Math.abs(q - p) < CROWD)) quiet.add(mark)
		else labelled.push(p)
	}
	const spoken = [...ordered.filter((m) => m.kind !== "now"), ...ordered.filter((m) => m.kind === "now")].map(
		(mark, i) => {
			const said = words(mark)
			return i === 0 ? said : said.charAt(0).toLocaleLowerCase(locale) + said.slice(1)
		},
	)
	return {
		spoken: spoken.join(t("row.cycle.join")),
		fill: percent(at(fillTo)),
		late,
		markers: ordered.map((mark) => {
			const p = at(mark.date)
			return {
				kind: mark.kind,
				at: percent(p),
				edge: p < EDGE ? "start" : p > 100 - EDGE ? "end" : undefined,
				late: late && mark.kind === "due",
				quiet: quiet.has(mark),
				label:
					mark.kind === "now" ? t("row.cycle.today") : t(MARK_WORDS[mark.kind], { date: dayMonth(mark.date, locale) }),
			}
		}),
	}
}

/**
 * Which labels go quiet, given each one's box on screen: walking the labels under the track in
 * `RANK` order (due, the close, bought; ties in order given), one keeps its words only if it
 * clears every label kept before it by `gap` px. Today's label is above the track: it is never
 * quiet and never in the way. Returns a flag per label, in the order given.
 */
export function fitLabels(
	labels: { kind: CycleMark["kind"]; left: number; right: number }[],
	gap = LABEL_GAP,
): boolean[] {
	const quiet = labels.map(() => false)
	const kept: { left: number; right: number }[] = []
	const order = labels
		.map((label, i) => ({ label, i }))
		.filter(({ label }) => label.kind !== "now")
		.sort((a, b) => RANK[b.label.kind] - RANK[a.label.kind] || a.i - b.i)
	for (const { label, i } of order) {
		const clash = kept.some((k) => label.left < k.right + gap && k.left < label.right + gap)
		if (clash) quiet[i] = true
		else kept.push(label)
	}
	return quiet
}

/**
 * Measures a drawn cycle line's labels and sets `data-quiet` where one would overlap a more
 * important one (`fitLabels`). A line not laid out (its row closed) keeps what it has.
 */
export function fitCycle(line: Element): void {
	const marks = [...line.querySelectorAll<HTMLElement>(".a-mk")]
	const boxes = marks.map((mark) => {
		const rect = mark.querySelector(".a-lbl")?.getBoundingClientRect()
		return {
			kind: (mark.getAttribute("data-mark") ?? "now") as CycleMark["kind"],
			left: rect?.left ?? 0,
			right: rect?.right ?? 0,
			width: rect?.width ?? 0,
		}
	})
	if (boxes.some((b) => b.width <= 0)) return
	fitLabels(boxes).forEach((quiet, i) => {
		marks[i]?.toggleAttribute("data-quiet", quiet)
	})
}
