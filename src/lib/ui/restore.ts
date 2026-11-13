import type { V4Counts } from "#lib/storage/transfer-v4"

import { MessageError, messageOf } from "#lib/i18n/error"
import { t } from "#lib/i18n/index"

/** Where *Restore a copy* is: picking a source, typing text or a link in, or asking merge or replace. */
export type RestoreStep = "start" | "paste" | "link" | "question"

/** What the restore sheet hands back: what the copy held, and the file's name when it came from one. */
export type RestoredDetail = { file?: string } & V4Counts

/** Whether the browser lets the page read the clipboard; older Firefox and plain-http pages do not. */
export const canReadClipboard = (): boolean =>
	typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function"

/**
 * `link` with a scheme: as typed when it names one (`ftp:`, `javascript:` and the like are left
 * for `webAddress` to refuse), else read over https, so `pastefox.com/206br1` needs nothing more.
 * A host with a port (`localhost:4321`) is not a scheme.
 */
const withScheme = (link: string): string => {
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(link)) return link
	if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(link)) return link
	return `https://${link.replace(/^\/\//, "")}`
}

/** `link` as an http or https address on a host with a dot (or `localhost`), else `undefined`. */
const webAddress = (link: string): URL | undefined => {
	const trimmed = link.trim()
	if (trimmed === "") return undefined
	try {
		const url = new URL(withScheme(trimmed))
		if (url.protocol !== "https:" && url.protocol !== "http:") return undefined
		return url.hostname.includes(".") || url.hostname === "localhost" ? url : undefined
	} catch {
		return undefined
	}
}

/** Whether `link` is a web address *From a link* may fetch. */
export const isWebAddress = (link: string): boolean => webAddress(link) !== undefined

/** A site *From a link* knows: it reads the site's share links from their raw address. */
export type Platform = "gist" | "pastefox"

/** The site's name, for the hint and the messages. */
const PLATFORM_LABEL = { gist: "backup.linkHint.gist", pastefox: "backup.linkHint.pastefox" } as const

/** What *From a link* fetches for a link: the raw address, the site it is on, and what to call the copy. */
export type ResolvedLink = { url: string; platform?: Platform; name: string }

/** PasteFox's own pages, which share the address shape of a paste. */
const PASTEFOX_PAGES = new Set(["create", "docs", "legal", "privacy", "api", "login", "register", "dashboard"])

/** `part` decoded, or as it is when it is not valid percent-encoding. */
const decoded = (part: string): string => {
	try {
		return decodeURIComponent(part)
	} catch {
		return part
	}
}

/** The path's parts, without the empty ones a leading or trailing slash leaves. */
const segments = (url: URL): string[] => url.pathname.split("/").filter((part) => part !== "")

/**
 * A gist's file from its page's anchor: GitHub writes `gistfile1.json` as `#file-gistfile1-json`,
 * so the last dash goes back to the dot. A name with a dot elsewhere does not come back; the
 * site then answers 404, and the message says to check the link.
 */
const gistFile = (hash: string): string | undefined => {
	const anchor = /^#file-(.+)-([^-]+)$/.exec(hash)
	return anchor ? `${anchor[1]}.${anchor[2]}` : undefined
}

/**
 * Where `link` is read from. A gist's page (`gist.github.com/<user>/<id>`) is read from its raw
 * file, the one its `#file-` anchor names or else its first; a PasteFox paste
 * (`pastefox.com/<code>`) from `pastefox.com/api/pastes/<code>/raw`. Raw links on either site,
 * and every other site, are read as they are, named by the file they end in, else the host.
 */
export const resolveLink = (link: string): ResolvedLink | undefined => {
	const url = webAddress(link)
	if (!url) return undefined
	const parts = segments(url)
	const host = url.hostname.replace(/^www\./, "")
	if (host === "gist.github.com" && parts.length >= 2 && parts[2] === undefined) {
		const [user, id] = parts as [string, string]
		const file = gistFile(url.hash)
		const raw = `https://gist.githubusercontent.com/${user}/${id}/raw`
		return { url: file ? `${raw}/${file}` : raw, platform: "gist", name: file ?? id }
	}
	if (host === "gist.githubusercontent.com") {
		const last = parts.at(-1)
		const name = last === undefined || last === "raw" ? (parts[1] ?? url.host) : decoded(last)
		return { url: url.href, platform: "gist", name }
	}
	if (host === "pastefox.com") {
		const [first, second, code, raw] = parts
		if (first === "api" && second === "pastes" && code && raw === "raw" && parts.length === 4)
			return { url: url.href, platform: "pastefox", name: code }
		if (first && parts.length === 1 && !PASTEFOX_PAGES.has(first.toLowerCase()))
			return { url: `https://pastefox.com/api/pastes/${first}/raw`, platform: "pastefox", name: first }
	}
	const last = parts.at(-1)
	return { url: url.href, name: last === undefined ? url.host : decoded(last) }
}

/** The site's name for `platform`, in the reader's language. */
const platformName = (platform: Platform): string => t(PLATFORM_LABEL[platform])

/**
 * The text at `link`, for *From a link*, read from its raw address (`resolveLink`). Refuses
 * anything but a web address before fetching. On a site it knows, a failure names the site and
 * what to check. Elsewhere a fetch that never answers is most often a site that does not let
 * other sites read it (CORS), which the browser does not tell apart from being offline, so the
 * message names both.
 */
export const fetchBackupText = async (
	link: string,
	fetcher: (input: string) => Promise<Response> = (input) => fetch(input),
): Promise<string> => {
	const resolved = resolveLink(link)
	if (!resolved) throw new MessageError("backup.link.notAddress")
	const { platform } = resolved
	let response: Response
	try {
		response = await fetcher(resolved.url)
	} catch {
		if (platform) throw new MessageError("backup.link.platform.unreachable", { platform: platformName(platform) })
		throw new MessageError("backup.link.unreachable")
	}
	if (response.ok) return response.text()
	const { status } = response
	if (!platform) throw new MessageError("backup.link.status", { status })
	const site = platformName(platform)
	if (status === 404 || status === 410) throw new MessageError("backup.link.platform.missing", { platform: site })
	if (status === 401 || status === 403) throw new MessageError("backup.link.platform.private", { platform: site })
	throw new MessageError("backup.link.platform.status", { platform: site, status })
}

/**
 * `failure` from restoring what `link` held: on a site it knows, text that is not a backup at all
 * names the site and says what to save there. Any other failure stays as it is.
 */
export const linkedFailure = (failure: unknown, link: string): unknown => {
	const platform = resolveLink(link)?.platform
	if (!platform || !(failure instanceof MessageError) || failure.key !== "backup.unreadable") return failure
	return new MessageError("backup.link.platform.notBackup", { platform: platformName(platform) })
}

/** What a restore from `link` is called: the gist's file, the paste's code, else the file it ends in or its host. */
export const linkName = (link: string): string => resolveLink(link)?.name ?? link.trim()

/** A run of the link hint: plain text, or a link to a site that serves a raw file other sites can read. */
export type HintPart = { text: string; href?: string }

/** Where to keep a copy *From a link* can fetch; both serve raw files any site may read. */
const HINT_SITES = [
	{ slot: "gist", label: "backup.linkHint.gist", href: "https://gist.github.com/" },
	{ slot: "pastefox", label: "backup.linkHint.pastefox", href: "https://pastefox.com/create" },
] as const

/**
 * The link step's hint as runs of text and links, in the reader's language. Each site's name
 * fills its slot through a marker, so a translation may put the slots in any order.
 */
export const linkHintParts = (): HintPart[] => {
	const marker = (index: number) => `\u0001${index}\u0001`
	const params = Object.fromEntries(HINT_SITES.map((site, index) => [site.slot, marker(index)]))
	return t("backup.linkHint", params)
		.split("\u0001")
		.map((run, index): HintPart => {
			if (index % 2 === 0) return { text: run }
			const site = HINT_SITES[Number(run)]
			return site ? { text: t(site.label), href: site.href } : { text: run }
		})
		.filter((part) => part.text !== "")
}

/** The restore failure's lead sentence, then why, unless the reason is that same sentence again. */
export const restoreFailureText = (failure: unknown): string => {
	const lead = t("backup.error.import")
	const reason = messageOf(failure, "backup.error.import")
	return reason === lead ? lead : `${lead} ${reason}`
}
