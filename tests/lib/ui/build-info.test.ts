process.env.TZ = "Asia/Bangkok"

import { expect, test } from "vitest"

import { displayDate } from "#lib/domain/date"
import {
	buildInfo,
	commitUrl,
	envMark,
	formatBuiltLocal,
	gmtOffset,
	parseBuiltAt,
	REPO_URL,
	shortCommit,
	sourceLabel,
	titleMark,
} from "#lib/ui/build-info"

const SHA = "7ba698c1d4f0a2b3c4d5e6f708192a3b4c5d6e7f"

test("shortens a commit sha to the seven characters GitHub shows", () => {
	expect(shortCommit(SHA)).toBe("7ba698c")
})

test("shortens nothing when there is no commit", () => {
	expect(shortCommit("")).toBe("")
})

test("links a commit by its full sha under the repository", () => {
	expect(commitUrl(SHA)).toBe(`${REPO_URL}/commit/${SHA}`)
})

test("reads an ISO build timestamp", () => {
	expect(parseBuiltAt("2026-09-24T13:12:00Z")?.getTime()).toBe(Date.UTC(2026, 8, 24, 13, 12))
})

test("reads no timestamp from an empty or unparsable value", () => {
	expect(parseBuiltAt("")).toBeNull()
	expect(parseBuiltAt("last tuesday")).toBeNull()
})

test("carries the commit and build time the build inlined", () => {
	expect(
		buildInfo({
			PUBLIC_COMMIT_SHA: SHA,
			PUBLIC_BUILT_AT: "2026-09-24T13:12:00Z",
			PUBLIC_PR_NUMBER: "42",
			PUBLIC_ENVIRONMENT: "preview",
			PUBLIC_BRANCH: "feat/x",
		}),
	).toEqual({
		commit: SHA,
		builtAt: "2026-09-24T13:12:00Z",
		pr: "42",
		environment: "preview",
		branch: "feat/x",
	})
})

test("carries empty values when nothing was inlined", () => {
	expect(buildInfo({}).commit).toBe("")
	expect(buildInfo({}).builtAt).toBe("")
	expect(buildInfo({}).pr).toBe("")
})

test("dev server reads as development, whatever the environment carries", () => {
	expect(
		buildInfo({
			DEV: true,
			PUBLIC_COMMIT_SHA: SHA,
			PUBLIC_ENVIRONMENT: "local",
		}),
	).toEqual({
		commit: "",
		builtAt: "",
		pr: "",
		environment: "development",
		branch: "",
	})
})

test("unset environment reads as local", () => {
	expect(buildInfo({}).environment).toBe("local")
})

test("unknown environment reads as local", () => {
	expect(buildInfo({ PUBLIC_ENVIRONMENT: "staging" }).environment).toBe("local")
})

test("titleMark marks development", () => {
	expect(titleMark("development", "")).toBe(" (dev)")
})

test("titleMark marks local", () => {
	expect(titleMark("local", "")).toBe(" (local)")
})

test("a preview without a PR number is marked preview", () => {
	expect(titleMark("preview", "")).toBe(" (preview)")
})

test("titleMark marks a preview with its pull request", () => {
	expect(titleMark("preview", "42")).toBe(" (pr-42)")
})

test("titleMark leaves production unmarked", () => {
	expect(titleMark("production", "")).toBe("")
})

test("header mark per environment reads as the title mark", () => {
	expect(envMark("production", "")).toBeNull()
	expect(envMark("development", "")).toBe("(dev)")
	expect(envMark("local", "")).toBe("(local)")
	expect(envMark("preview", "42")).toBe("(pr-42)")
	expect(envMark("preview", "")).toBe("(preview)")
})

test("built time reads on the viewer's clock, its zone as a GMT offset", () => {
	const when = new Date("2026-10-30T07:05:00Z")
	expect(formatBuiltLocal(when, "en", 7 * 60)).toBe("30 Oct 2026, 14:05 (GMT+7)")
	expect(formatBuiltLocal(when, "th", 7 * 60)).toBe(`${displayDate("2026-10-30", "th")}, 14:05 (GMT+7)`)
	// The offset moves the clock across midnight, and the date with it.
	expect(formatBuiltLocal(new Date("2026-10-30T20:05:00Z"), "en", 7 * 60)).toBe("31 Oct 2026, 03:05 (GMT+7)")
	expect(formatBuiltLocal(when, "en", -3 * 60)).toBe("30 Oct 2026, 04:05 (GMT-3)")
})

test("gmtOffset names whole hours, minutes when there are any, and zero as GMT+0", () => {
	expect(gmtOffset(7 * 60)).toBe("GMT+7")
	expect(gmtOffset(5 * 60 + 30)).toBe("GMT+5:30")
	expect(gmtOffset(-(9 * 60 + 30))).toBe("GMT-9:30")
	expect(gmtOffset(-3 * 60)).toBe("GMT-3")
	expect(gmtOffset(0)).toBe("GMT+0")
})

test("source label", () => {
	const base = buildInfo()
	expect(
		sourceLabel({
			...base,
			environment: "preview",
			pr: "31",
			branch: "redesign-phase-2",
		}),
	).toBe("#31 · redesign-phase-2")
	expect(sourceLabel({ ...base, environment: "production", pr: "", branch: "main" })).toBe("main")
	expect(sourceLabel({ ...base, environment: "development", pr: "", branch: "" })).toBe("kamontat/cc-tracking")
})
