import { type Settings, toSettings } from "#lib/domain/settings";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";
import { type Repository, StorageError } from "#lib/storage/repository";

const PREFIX = "cc:";
const CARD = `${PREFIX}card:`;
const PURCHASE = `${PREFIX}purchase:`;
const PAYMENT = `${PREFIX}payment:`;
const LIMIT_GROUP = `${PREFIX}limitgroup:`;
const SETTINGS = `${PREFIX}settings`;

export const cardKey = (cardId: string): string =>
	`${CARD}${encodeURIComponent(cardId)}`;
export const purchaseKey = (p: Purchase): string =>
	`${PURCHASE}${encodeURIComponent(p.cardId)}:${encodeURIComponent(p.date)}:${encodeURIComponent(p.id)}`;
export const paymentKey = (cardId: string, period: string): string =>
	`${PAYMENT}${encodeURIComponent(cardId)}:${encodeURIComponent(period)}`;
export const limitGroupKey = (id: string): string =>
	`${LIMIT_GROUP}${encodeURIComponent(id)}`;

/** Phase 1 store. Key shapes match the Cloudflare KV layout so phase 2 is a drop-in. */
export class LocalStorageRepository implements Repository {
	constructor(private readonly storage: Storage) {}

	private read<T>(key: string): T | null {
		const raw = this.storage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch (cause) {
			throw new StorageError(`Stored value at ${key} is not readable`, {
				cause,
			});
		}
	}

	private write(key: string, value: unknown): void {
		try {
			this.storage.setItem(key, JSON.stringify(value));
		} catch (cause) {
			throw new StorageError(
				`Could not save ${key}. Storage may be full or blocked.`,
				{ cause },
			);
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
		// Cascade: delete all purchases and payments for this card
		const encodedCardId = encodeURIComponent(id);
		const purchasePrefix = `${PURCHASE}${encodedCardId}:`;
		const paymentPrefix = `${PAYMENT}${encodedCardId}:`;
		for (const key of this.keysWithPrefix(purchasePrefix)) {
			this.storage.removeItem(key);
		}
		for (const key of this.keysWithPrefix(paymentPrefix)) {
			this.storage.removeItem(key);
		}
	}

	async listPurchases(
		cardId: string,
		from?: string,
		to?: string,
	): Promise<Purchase[]> {
		// Keys sort by date because the date sits before the id in the key.
		return this.readAll<Purchase>(`${PURCHASE}${encodeURIComponent(cardId)}:`)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		// Delete any existing entry with the same cardId:id, regardless of date.
		await this.deletePurchase(purchase.cardId, purchase.id);
		this.write(purchaseKey(purchase), purchase);
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		const encodedId = encodeURIComponent(id);
		for (const key of this.keysWithPrefix(
			`${PURCHASE}${encodeURIComponent(cardId)}:`,
		)) {
			const segments = key.split(":");
			if (segments[segments.length - 1] === encodedId)
				this.storage.removeItem(key);
		}
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return this.readAll<StatementPayment>(
			`${PAYMENT}${encodeURIComponent(cardId)}:`,
		);
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.write(paymentKey(payment.cardId, payment.period), payment);
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.storage.removeItem(paymentKey(cardId, period));
	}

	async listLimitGroups(): Promise<LimitGroup[]> {
		return this.readAll<LimitGroup>(LIMIT_GROUP);
	}

	async saveLimitGroup(group: LimitGroup): Promise<void> {
		this.write(limitGroupKey(group.id), group);
	}

	async deleteLimitGroup(id: string): Promise<void> {
		this.storage.removeItem(limitGroupKey(id));
	}

	async getSettings(): Promise<Settings> {
		// Narrowed rather than trusted: this key can hold anything a past version wrote, and
		// an unrecognised location in it must not reach the rest of the app as a `Location`.
		return toSettings(this.read<unknown>(SETTINGS));
	}

	async saveSettings(settings: Settings): Promise<void> {
		this.write(SETTINGS, settings);
	}
}
