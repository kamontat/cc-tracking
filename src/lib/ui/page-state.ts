/**
 * The load / guard / paint trio shared by every page.
 *
 * A page fetches its own data (cards, purchases, whatever it needs) and renders its own
 * markup; this helper only owns the error string, the guarded write, and the paint trigger
 * around those two page-owned pieces. In particular:
 *
 * - `load` runs the page's `fetch`, catches a failure into `error`, then paints.
 * - `guard` runs a write; on failure it prefixes `message` onto the error. Either way it
 *   reloads afterwards, passing `preserveError` so a failed write's message survives the
 *   successful read that follows it instead of being silently wiped.
 */
export type PageState = {
	/** The current error message, or "" when there is none. */
	readonly error: string;
	load(preserveError?: boolean): Promise<void>;
	guard(action: () => Promise<void>, message: string): Promise<void>;
};

export function createPageState(options: {
	/** Fetches this page's data into its own state. Its return value is ignored; its
	 * rejection becomes `error`. */
	fetch: () => Promise<void>;
	/** Shown when `fetch` rejects with something that isn't an `Error`. */
	fallbackMessage: string;
	/** Called after every `load`. Reads `error` (and whatever else the page owns) to render. */
	paint: () => void;
}): PageState {
	let error = "";

	const load = async (preserveError = false): Promise<void> => {
		try {
			await options.fetch();
			if (!preserveError) error = "";
		} catch (failure) {
			error =
				failure instanceof Error ? failure.message : options.fallbackMessage;
		}
		options.paint();
	};

	const guard = async (
		action: () => Promise<void>,
		message: string,
	): Promise<void> => {
		let failed = false;
		try {
			await action();
			error = "";
		} catch (failure) {
			error =
				failure instanceof Error ? `${message} ${failure.message}` : message;
			failed = true;
		}
		// Refresh from storage either way, but keep a failure's message on screen
		// instead of letting a successful read silently wipe it.
		await load(failed);
	};

	return {
		get error() {
			return error;
		},
		load,
		guard,
	};
}
