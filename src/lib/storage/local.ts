import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import { type Repository, StorageError } from "#lib/storage/repository.ts";

const PREFIX = "cc:";
const CARD = `${PREFIX}card:`;
const PURCHASE = `${PREFIX}purchase:`;
const PAYMENT = `${PREFIX}payment:`;

export const cardKey = (cardId: string): string => `${CARD}${cardId}`;
export const purchaseKey = (p: Purchase): string => `${PURCHASE}${p.cardId}:${p.date}:${p.id}`;
export const paymentKey = (cardId: string, period: string): string => `${PAYMENT}${cardId}:${period}`;

/** Phase 1 store. Key shapes match the Cloudflare KV layout so phase 2 is a drop-in. */
export class LocalStorageRepository implements Repository {
	constructor(private readonly storage: Storage) {}

	private read<T>(key: string): T | null {
		const raw = this.storage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch (cause) {
			throw new StorageError(`Stored value at ${key} is not readable`, { cause });
		}
	}

	private write(key: string, value: unknown): void {
		try {
			this.storage.setItem(key, JSON.stringify(value));
		} catch (cause) {
			throw new StorageError(`Could not save ${key}. Storage may be full or blocked.`, { cause });
		}
	}

	/** Every key under `prefix`, sorted — the localStorage equivalent of a KV prefix list. */
	private keysWithPrefix(prefix: string): string[] {
		const keys: string[] = [];
		for (let index = 0; index < this.storage.length; index += 1) {
			const key = this.storage.key(index);
			if (key?.startsWith(prefix)) keys.push(key);
		}
		return keys.sort();
	}

	private readAll<T>(prefix: string): T[] {
		return this.keysWithPrefix(prefix)
			.map((key) => this.read<T>(key))
			.filter((value): value is T => value !== null);
	}

	async listCards(): Promise<Card[]> {
		return this.readAll<Card>(CARD);
	}

	async getCard(id: string): Promise<Card | null> {
		return this.read<Card>(cardKey(id));
	}

	async saveCard(card: Card): Promise<void> {
		this.write(cardKey(card.id), card);
	}

	async deleteCard(id: string): Promise<void> {
		this.storage.removeItem(cardKey(id));
	}

	async listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]> {
		// Keys sort by date because the date sits before the id in the key.
		return this.readAll<Purchase>(`${PURCHASE}${cardId}:`)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		this.write(purchaseKey(purchase), purchase);
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		const suffix = `:${id}`;
		for (const key of this.keysWithPrefix(`${PURCHASE}${cardId}:`)) {
			if (key.endsWith(suffix)) this.storage.removeItem(key);
		}
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return this.readAll<StatementPayment>(`${PAYMENT}${cardId}:`);
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.write(paymentKey(payment.cardId, payment.period), payment);
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.storage.removeItem(paymentKey(cardId, period));
	}
}
