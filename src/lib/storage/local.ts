import { type Settings, toSettings } from "#lib/domain/settings";
import type {
	Card,
	CardPayment,
	LimitGroup,
	LocationRecord,
	Purchase,
	PurchaseList,
	StatementDates,
	StatementPayment,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { type Repository, StorageError } from "#lib/storage/repository";

const PREFIX = "cc:";
const CARD = `${PREFIX}card:`;
const PURCHASE = `${PREFIX}purchase:`;
const PAYMENT = `${PREFIX}payment:`;
const LIMIT_GROUP = `${PREFIX}limitgroup:`;
const CARD_PAYMENT = `${PREFIX}cardpayment:`;
const STATEMENT_DATES = `${PREFIX}statementdates:`;
const LIST = `${PREFIX}list:`;
const LOCATION = `${PREFIX}location:`;
const SETTINGS = `${PREFIX}settings`;
const BATCH_START = `${PREFIX}batch-start`;
/** One-off notices a data migration leaves for the next page load; see `migrate-locations`. */
const MIGRATION = `${PREFIX}migration:`;

export const cardKey = (cardId: string): string =>
	`${CARD}${encodeURIComponent(cardId)}`;
export const purchaseKey = (p: Purchase): string =>
	`${PURCHASE}${encodeURIComponent(p.cardId)}:${encodeURIComponent(p.date)}:${encodeURIComponent(p.id)}`;
export const paymentKey = (cardId: string, period: string): string =>
	`${PAYMENT}${encodeURIComponent(cardId)}:${encodeURIComponent(period)}`;
export const limitGroupKey = (id: string): string =>
	`${LIMIT_GROUP}${encodeURIComponent(id)}`;

export const cardPaymentKey = (cardId: string, id: string): string =>
	`${CARD_PAYMENT}${encodeURIComponent(cardId)}:${encodeURIComponent(id)}`;
export const statementDatesKey = (cardId: string, period: string): string =>
	`${STATEMENT_DATES}${encodeURIComponent(cardId)}:${encodeURIComponent(period)}`;
export const listKey = (id: string): string =>
	`${LIST}${encodeURIComponent(id)}`;
export const locationKey = (id: string): string =>
	`${LOCATION}${encodeURIComponent(id)}`;

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
		const encodedCardId = encodeURIComponent(id);
		if (this.keysWithPrefix(`${PURCHASE}${encodedCardId}:`).length > 0) {
			throw new MessageError("guard.cardHasPurchases");
		}
		this.storage.removeItem(cardKey(id));
		// Cascade: delete the card's payments, card payments and statement dates.
		// The trailing colon keeps a card whose id merely starts the same untouched.
		for (const kind of [PAYMENT, CARD_PAYMENT, STATEMENT_DATES]) {
			for (const key of this.keysWithPrefix(`${kind}${encodedCardId}:`)) {
				this.storage.removeItem(key);
			}
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
		if ((await this.listCards()).some((card) => card.limitGroupId === id)) {
			throw new MessageError("guard.groupInUse");
		}
		this.storage.removeItem(limitGroupKey(id));
	}

	async listCardPayments(cardId: string): Promise<CardPayment[]> {
		return this.readAll<CardPayment>(
			`${CARD_PAYMENT}${encodeURIComponent(cardId)}:`,
		).sort((a, b) =>
			a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
		);
	}

	async saveCardPayment(payment: CardPayment): Promise<void> {
		this.write(cardPaymentKey(payment.cardId, payment.id), payment);
	}

	async deleteCardPayment(cardId: string, id: string): Promise<void> {
		this.storage.removeItem(cardPaymentKey(cardId, id));
	}

	async listStatementDates(cardId: string): Promise<StatementDates[]> {
		return this.readAll<StatementDates>(
			`${STATEMENT_DATES}${encodeURIComponent(cardId)}:`,
		);
	}

	async saveStatementDates(dates: StatementDates): Promise<void> {
		this.write(statementDatesKey(dates.cardId, dates.period), dates);
	}

	async deleteStatementDates(cardId: string, period: string): Promise<void> {
		this.storage.removeItem(statementDatesKey(cardId, period));
	}

	async listPurchaseLists(): Promise<PurchaseList[]> {
		return this.readAll<PurchaseList>(LIST).sort((a, b) =>
			a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
		);
	}

	async savePurchaseList(list: PurchaseList): Promise<void> {
		this.write(listKey(list.id), list);
	}

	async deletePurchaseList(id: string): Promise<void> {
		this.storage.removeItem(listKey(id));
	}

	async listLocations(): Promise<LocationRecord[]> {
		return this.readAll<LocationRecord>(LOCATION);
	}

	async saveLocation(location: LocationRecord): Promise<void> {
		this.write(locationKey(location.id), location);
	}

	async deleteLocation(id: string): Promise<void> {
		if ((await this.listCards()).some((card) => String(card.location) === id)) {
			throw new MessageError("guard.locationInUse");
		}
		this.storage.removeItem(locationKey(id));
	}

	async getSettings(): Promise<Settings> {
		// Narrowed rather than trusted: this key can hold anything a past version wrote, and
		// an unrecognised location in it must not reach the rest of the app as a `Location`.
		return toSettings(this.read<unknown>(SETTINGS));
	}

	async saveSettings(settings: Settings): Promise<void> {
		this.write(SETTINGS, settings);
	}

	async getBatchStart(): Promise<string | null> {
		const value = this.read<unknown>(BATCH_START);
		return typeof value === "string" ? value : null;
	}

	async saveBatchStart(at: string): Promise<void> {
		this.write(BATCH_START, at);
	}

	/**
	 * Names each kind of record rather than sweeping every `cc:` key: the language choice
	 * (`cc:lang`) is the reader's, not the data's, and a reset must not flip the page they are
	 * reading into another language. A pending migration notice goes too -- it names cards that
	 * no longer exist -- and so does the batch start, which would otherwise outlive its entries.
	 */
	async clearAll(): Promise<void> {
		for (const prefix of [
			CARD,
			PURCHASE,
			PAYMENT,
			LIMIT_GROUP,
			CARD_PAYMENT,
			STATEMENT_DATES,
			LIST,
			LOCATION,
			MIGRATION,
		]) {
			for (const key of this.keysWithPrefix(prefix)) {
				this.storage.removeItem(key);
			}
		}
		this.storage.removeItem(SETTINGS);
		this.storage.removeItem(BATCH_START);
	}
}
