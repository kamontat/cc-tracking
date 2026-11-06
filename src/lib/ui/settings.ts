import type { LocationRecord } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { purchasePlaces } from "#lib/i18n/format"
import { t } from "#lib/i18n/index"
import { exportBackupV3 } from "#lib/storage/transfer-v3"

/** The name a backup file saved at `now` gets: the UTC date it was exported on. */
export const backupFilename = (now: Date): string => `cc-tracking-${now.toISOString().slice(0, 10)}.json`

/**
 * Turns a repository's contents into a backup file's text and filename. Split out from the
 * click handler because `URL.createObjectURL` and a synthetic `<a>` click aren't meaningfully
 * testable outside a browser; this half is, and it's the half with logic worth covering.
 */
export async function prepareBackupFile(
	repo: Repository,
	now: Date = new Date(),
): Promise<{ filename: string; text: string }> {
	const backup = await exportBackupV3(repo, now)
	return {
		text: JSON.stringify(backup, null, 2),
		filename: backupFilename(new Date(backup.exportedAt)),
	}
}

/** The Locations row's muted line: how many places, and which of them take purchases. */
export function locationsSummary(records: LocationRecord[]): string {
	const places = purchasePlaces(records)
	const count =
		records.length === 1
			? t("settings.locations.count.one")
			: t("settings.locations.count.many", { count: records.length })
	const takers =
		places.length === 0
			? t("settings.locations.takes.none")
			: t(places.length === 1 ? "settings.locations.takes.one" : "settings.locations.takes.many", {
					places: places.join(", "),
				})
	return t("settings.locations.summary", { count, takers })
}
