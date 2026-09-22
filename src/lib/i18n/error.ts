import type { MessageKey, Params } from "#lib/i18n/catalog";
import { t } from "#lib/i18n/index";

/**
 * A failure that names a catalog key instead of a finished sentence.
 *
 * Validation runs in the storage layer, far from anything that knows the reader's language.
 * Carrying the key lets the one place that renders the banner do the translating, so the
 * storage layer never imports a catalog. `message` holds the key so a stack trace is still
 * readable by whoever is debugging.
 */
export class MessageError extends Error {
	constructor(
		readonly key: MessageKey,
		readonly params?: Params,
	) {
		super(key);
		this.name = "MessageError";
	}
}

/** A single indexed read, so callers never write a literal computed member biome would
 * rather see as dot access -- `params` is typed as a total `Record`, but `problem` may not
 * actually be one of its keys. */
const paramValue = (params: Params, key: string): string | number | undefined =>
	params[key];

/** The sentence to show for `failure`, in the current language. */
export function messageOf(failure: unknown, fallback: MessageKey): string {
	if (failure instanceof MessageError) {
		const params = failure.params;
		const problem = params && paramValue(params, "problem");
		const resolved =
			typeof problem === "string"
				? { ...params, problem: t(problem as MessageKey) }
				: params;
		return t(failure.key, resolved);
	}
	if (failure instanceof Error) return failure.message;
	return t(fallback);
}
