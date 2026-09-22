import { MessageError } from "#lib/i18n/error";
import { LocalStorageRepository } from "#lib/storage/local";
import type { Repository } from "#lib/storage/repository";

/** Thrown at startup when the browser gives the page no usable storage. */
export class StorageUnavailableError extends MessageError {
	constructor(options?: { cause?: unknown }) {
		super("storage.unavailable");
		this.name = "StorageUnavailableError";
		if (options?.cause !== undefined) this.cause = options.cause;
	}
}

/** Probe rather than trust: some browsers expose localStorage and throw on use. */
function assertUsable(storage: Storage): void {
	const probe = "cc:probe";
	try {
		storage.setItem(probe, "1");
		storage.removeItem(probe);
	} catch (cause) {
		throw new StorageUnavailableError({ cause });
	}
}

export function createRepository(
	storage: Storage | undefined = globalThis.localStorage,
): Repository {
	if (!storage) throw new StorageUnavailableError();
	assertUsable(storage);
	return new LocalStorageRepository(storage);
}

export { LocalStorageRepository } from "#lib/storage/local";
export {
	InMemoryRepository,
	type Repository,
	StorageError,
} from "#lib/storage/repository";
