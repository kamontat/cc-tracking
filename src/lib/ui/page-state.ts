import type { MessageKey } from "#lib/i18n/catalog";
import { MessageError, messageOf } from "#lib/i18n/error";
import { t } from "#lib/i18n/index";

/**
 * The load / guard / paint trio shared by every page.
 *
 * A page fetches its own data (cards, purchases, whatever it needs) and renders its own
 * markup; this helper only owns the error string, the guarded write, and the paint trigger
 * around those two page-owned pieces. In particular:
 *
 * - `load` runs the page's `fetch`, catches a failure into `error`, then paints.
 * - `guard` runs a write; on failure it prefixes the translated `messageKey` onto the error.
 *   Either way it reloads afterwards, passing `preserveError` so a failed write's message
 *   survives the successful read that follows it instead of being silently wiped.
 *
 * What actually failed is kept as a `failure` (plus the key it should be read against), not a
 * resolved sentence -- `error` re-translates it from scratch on every access, so a page that
 * re-paints after a language switch (every page does, via `subscribe`) shows the banner in the
 * new language instead of freezing it in whatever language it failed in.
 */
export type PageState = {
	/** The current error message, translated into the current locale, or "" when there is
	 * none. Re-resolved on every read -- never cache this across a locale switch. */
	readonly error: string;
	load(preserveError?: boolean): Promise<void>;
	guard(action: () => Promise<void>, messageKey: MessageKey): Promise<void>;
};

/** What `load` failed on, kept raw so it can be re-translated on every read of `error`. */
type LoadFailure = { kind: "load"; failure: unknown; fallbackKey: MessageKey };
/** What `guard` failed on, same reason. */
type GuardFailure = { kind: "guard"; failure: unknown; messageKey: MessageKey };

/**
 * Resolves a `load` failure into the reader's language. A `MessageError` is already a
 * complete, correctly localized sentence -- its own key names the right fallback, so it is
 * used as-is. A plain `Error` (a `StorageError` from a read path, say) carries only an
 * untranslated technical detail, so the translated `fallbackKey` is prefixed onto it, the
 * same way `guard` prefixes its `messageKey` -- a Thai reader must never see a banner that is
 * entirely in English. Anything else (a non-Error rejection) has no detail worth appending,
 * so it is just the translated fallback alone.
 */
function describeLoadFailure(
	failure: unknown,
	fallbackKey: MessageKey,
): string {
	if (failure instanceof MessageError) return messageOf(failure, fallbackKey);
	if (failure instanceof Error) return `${t(fallbackKey)} ${failure.message}`;
	return t(fallbackKey);
}

export function createPageState(options: {
	/** Fetches this page's data into its own state. Its return value is ignored; its
	 * rejection becomes `error`. */
	fetch: () => Promise<void>;
	/** Shown when `fetch` rejects with something that carries no message of its own. */
	fallbackKey: MessageKey;
	/** Called after every `load`. Reads `error` (and whatever else the page owns) to render. */
	paint: () => void;
}): PageState {
	let source: LoadFailure | GuardFailure | null = null;

	const load = async (preserveError = false): Promise<void> => {
		try {
			await options.fetch();
			if (!preserveError) source = null;
		} catch (failure) {
			source = { kind: "load", failure, fallbackKey: options.fallbackKey };
		}
		options.paint();
	};

	const guard = async (
		action: () => Promise<void>,
		messageKey: MessageKey,
	): Promise<void> => {
		let failed = false;
		try {
			await action();
			source = null;
		} catch (failure) {
			source = { kind: "guard", failure, messageKey };
			failed = true;
		}
		// Refresh from storage either way, but keep a failure's message on screen
		// instead of letting a successful read silently wipe it.
		await load(failed);
	};

	return {
		get error() {
			if (source === null) return "";
			if (source.kind === "load")
				return describeLoadFailure(source.failure, source.fallbackKey);
			return `${t(source.messageKey)} ${messageOf(source.failure, source.messageKey)}`;
		},
		load,
		guard,
	};
}
