import type { V4Counts } from "#lib/storage/transfer-v4"

import { messageOf } from "#lib/i18n/error"
import { t } from "#lib/i18n/index"

/** Where *Restore a copy* is: picking a source, typing text in, or asking merge or replace. */
export type RestoreStep = "start" | "paste" | "question"

/** What the restore sheet hands back: what the copy held, and the file's name when it came from one. */
export type RestoredDetail = { file?: string } & V4Counts

/** Whether the browser lets the page read the clipboard; older Firefox and plain-http pages do not. */
export const canReadClipboard = (): boolean =>
	typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function"

/** The restore failure's lead sentence, then why, unless the reason is that same sentence again. */
export const restoreFailureText = (failure: unknown): string => {
	const lead = t("backup.error.import")
	const reason = messageOf(failure, "backup.error.import")
	return reason === lead ? lead : `${lead} ${reason}`
}
