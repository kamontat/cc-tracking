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

/** `link` as an http or https address, or `undefined` when it is neither. */
const webAddress = (link: string): URL | undefined => {
	try {
		const url = new URL(link.trim())
		return url.protocol === "https:" || url.protocol === "http:" ? url : undefined
	} catch {
		return undefined
	}
}

/** Whether `link` is an http or https address, so *From a link* may fetch it. */
export const isWebAddress = (link: string): boolean => webAddress(link) !== undefined

/**
 * The text at `link`, for *From a link*. Refuses anything but an http or https address before
 * fetching. A fetch that never answers is most often a site that does not let other sites read
 * it (CORS), which the browser does not tell apart from being offline, so the message names both.
 */
export const fetchBackupText = async (
	link: string,
	fetcher: (input: string) => Promise<Response> = (input) => fetch(input),
): Promise<string> => {
	const url = webAddress(link)
	if (!url) throw new MessageError("backup.link.notAddress")
	let response: Response
	try {
		response = await fetcher(url.href)
	} catch {
		throw new MessageError("backup.link.unreachable")
	}
	if (!response.ok) throw new MessageError("backup.link.status", { status: response.status })
	return response.text()
}

/** What a restore from `link` is called: the file it ends in, else its host. */
export const linkName = (link: string): string => {
	const url = webAddress(link)
	if (!url) return link.trim()
	const last = url.pathname.split("/").findLast((part) => part !== "")
	if (!last) return url.host
	try {
		return decodeURIComponent(last)
	} catch {
		return last
	}
}

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
