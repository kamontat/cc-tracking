import { LocalStorageRepository } from "#lib/storage/local.ts";
import type { Repository } from "#lib/storage/repository.ts";

/** Thrown at startup when the browser gives the page no usable storage. */
export class StorageUnavailableError extends Error {
	constructor(options?: { cause?: unknown }) {
		super(
			"This browser is not letting the page store data. " +
				"Private windows and blocked site data both cause this.",
			options,
		);
		this.name = "StorageUnavailableError";
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

export function createRepository(storage: Storage | undefined = globalThis.localStorage): Repository {
	if (!storage) throw new StorageUnavailableError();
	assertUsable(storage);
	return new LocalStorageRepository(storage);
}

export { LocalStorageRepository } from "#lib/storage/local.ts";
export { InMemoryRepository, type Repository, StorageError } from "#lib/storage/repository.ts";
