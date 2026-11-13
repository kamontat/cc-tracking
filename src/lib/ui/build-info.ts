import type { Locale } from "#lib/i18n/index"

import { displayDate, formatDate } from "#lib/domain/date"

/** The repository these pages are built from, and the root of every link About makes. */
export const REPO_URL = "https://github.com/kamontat/cc-tracking"

export type Environment = "development" | "local" | "preview" | "production"

const ENVIRONMENTS: readonly string[] = ["development", "local", "preview", "production"]

function toEnvironment(value: string): Environment {
	return ENVIRONMENTS.includes(value) ? (value as Environment) : "local"
}

export type BuildInfo = {
	/** The full commit sha the bundle was built from, or `""` when nothing was inlined. */
	commit: string
	/** An ISO timestamp of the build, or `""` when nothing was inlined. */
	builtAt: string
	/** The pull request number a preview was built from, or `""` on any other build. */
	pr: string
	/** Where the bundle runs: `development` on a dev server, `local` for an unknown stamp. */
	environment: Environment
	/** The branch the bundle was built from, or `""` when nothing was inlined. */
	branch: string
}

const EMPTY: BuildInfo = {
	commit: "",
	builtAt: "",
	pr: "",
	environment: "development",
	branch: "",
}

/** The stamps `astro.config.ts` puts in the environment, as `import.meta.env` carries them. */
export type BuildStamps = {
	/** True on `astro dev` (and in tests), where the stamps say nothing about the page. */
	DEV?: boolean
	PUBLIC_COMMIT_SHA?: string
	PUBLIC_BUILT_AT?: string
	PUBLIC_PR_NUMBER?: string
	PUBLIC_ENVIRONMENT?: string
	PUBLIC_BRANCH?: string
}

/**
 * The commit and build time `astro build` inlined, empty on a dev server.
 *
 * Vite replaces each `import.meta.env.PUBLIC_*` with a string literal at build time; `DEV`
 * marks the dev server, which shows the dev fallback whatever the environment carries.
 */
export function buildInfo(env: BuildStamps = import.meta.env): BuildInfo {
	if (env.DEV) return EMPTY
	return {
		commit: env.PUBLIC_COMMIT_SHA ?? "",
		builtAt: env.PUBLIC_BUILT_AT ?? "",
		pr: env.PUBLIC_PR_NUMBER ?? "",
		environment: toEnvironment(env.PUBLIC_ENVIRONMENT ?? ""),
		branch: env.PUBLIC_BRANCH ?? "",
	}
}

/**
 * What the tab title and brand carry after the app name, so no environment is mistaken for
 * production. Not translated: the marks read the same in either language.
 */
export function titleMark(environment: Environment, pr: string): string {
	switch (environment) {
		case "development":
			return " (dev)"
		case "local":
			return " (local)"
		case "preview":
			return pr ? ` (pr-${pr})` : " (preview)"
		case "production":
			return ""
	}
}

/** The seven-character prefix GitHub itself shows for a commit. */
export function shortCommit(sha: string): string {
	return sha.slice(0, 7)
}

/** The changelog as it stands on main, rather than as of the built commit. */
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`

export function commitUrl(sha: string): string {
	return `${REPO_URL}/commit/${sha}`
}

/** The build timestamp, or null when it is missing or unreadable. */
export function parseBuiltAt(value: string): Date | null {
	const at = Date.parse(value)
	return Number.isNaN(at) ? null : new Date(at)
}

const pad = (value: number): string => String(value).padStart(2, "0")

/**
 * The build's mark after the brand in the header: the tab title's mark without its leading
 * space, so the two always say the same thing. Null on production, where nothing is shown.
 */
export function envMark(environment: Environment, pr: string): string | null {
	return titleMark(environment, pr).trim() || null
}

/**
 * `dd MMM yyyy, HH:mm (GMT±H)` on a clock `offset` minutes east of GMT, the viewer's own unless
 * one is given. `Intl` is not used to format the date, so the year stays Gregorian in Thai.
 */
export function formatBuiltLocal(when: Date, locale: Locale, offset = viewerOffset(when)): string {
	const local = new Date(when.getTime() + offset * 60_000)
	const date = displayDate(formatDate(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()), locale)
	const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
	return `${date}, ${time} (${gmtOffset(offset)})`
}

/** `GMT+7`, `GMT+5:30`, `GMT-3`: a zone named by its offset, `offset` minutes east of GMT. */
export function gmtOffset(offset: number): string {
	const sign = offset < 0 ? "-" : "+"
	const hours = Math.floor(Math.abs(offset) / 60)
	const minutes = Math.abs(offset) % 60
	return `GMT${sign}${hours}${minutes ? `:${pad(minutes)}` : ""}`
}

/** How far east of GMT the viewer's clock stood at `when`, in minutes. */
export function viewerOffset(when: Date): number {
	return -when.getTimezoneOffset()
}

/** Where the build came from: `#<pr> · <branch>` on a preview, else the branch, else the repo. */
export function sourceLabel(build: BuildInfo): string {
	if (!build.branch) return new URL(REPO_URL).pathname.slice(1)
	return build.environment === "preview" && build.pr ? `#${build.pr} · ${build.branch}` : build.branch
}
