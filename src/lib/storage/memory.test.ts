import { repositoryContract } from "#lib/storage/contract.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";

repositoryContract("in-memory", () => new InMemoryRepository());
