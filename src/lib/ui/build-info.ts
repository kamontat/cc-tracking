/** The repository these pages are built from, and the root of every link the footer makes. */
export const REPO_URL = "https://github.com/kamontat/cc-tracking";

export type BuildInfo = {
	/** The full commit sha the bundle was built from, or `""` when nothing was inlined. */
	commit: string;
	/** An ISO timestamp of the build, or `""` when nothing was inlined. */
	builtAt: string;
};

const EMPTY: BuildInfo = { commit: "", builtAt: "" };

/**
 * The commit and build time the bundler inlined, empty on a dev server.
 *
 * `bun-server build` bundles with `env: "BUN_PUBLIC_*"`, which rewrites each of these
 * member expressions into a string literal, so `process` itself is never evaluated in a
 * built page. A page served without that rewrite -- the dev server -- evaluates it and
 * throws `ReferenceError` in the browser, which is what the catch is for: the caller then
 * gets the empty pair and shows the dev fallback rather than losing the whole footer.
 */
export function buildInfo(): BuildInfo {
	try {
		return {
			commit: process.env.BUN_PUBLIC_COMMIT_SHA ?? "",
			builtAt: process.env.BUN_PUBLIC_BUILT_AT ?? "",
		};
	} catch {
		return EMPTY;
	}
}

/** The seven-character prefix GitHub itself shows for a commit. */
export function shortCommit(sha: string): string {
	return sha.slice(0, 7);
}

export function commitUrl(sha: string): string {
	return `${REPO_URL}/commit/${sha}`;
}

/** The build timestamp, or null when it is missing or unreadable. */
export function parseBuiltAt(value: string): Date | null {
	const at = Date.parse(value);
	return Number.isNaN(at) ? null : new Date(at);
}

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * `yyyy-MM-dd HH:mm UTC`. Deliberately not localised: a deploy time is read against other
 * deploys rather than against the reader's day, so it should say the same thing everywhere.
 */
export function formatBuiltAt(when: Date): string {
	const date = `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())}`;
	return `${date} ${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())} UTC`;
}
