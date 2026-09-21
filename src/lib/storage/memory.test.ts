import { repositoryContract } from "#lib/storage/contract";
import { InMemoryRepository } from "#lib/storage/repository";

repositoryContract("in-memory", () => new InMemoryRepository());
