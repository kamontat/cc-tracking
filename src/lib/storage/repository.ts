import { defaultSettings, type Settings } from "#lib/domain/settings";
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

/** Thrown when the underlying store refuses a read or a write. */
export class StorageError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "StorageError";
	}
}

export interface Repository {
	listCards(): Promise<Card[]>;
	getCard(id: string): Promise<Card | null>;
	saveCard(card: Card): Promise<void>;
	/** Removes the card with its card payments and statement dates. Throws `guard.cardHasPurchases` while it has purchases. */
	deleteCard(id: string): Promise<void>;

	/** Purchases for one card, sorted by date ascending, optionally limited to `[from, to]`. */
	listPurchases(
		cardId: string,
		from?: string,
		to?: string,
	): Promise<Purchase[]>;
	savePurchase(purchase: Purchase): Promise<void>;
	deletePurchase(cardId: string, id: string): Promise<void>;

	listPayments(cardId: string): Promise<StatementPayment[]>;
	savePayment(payment: StatementPayment): Promise<void>;
	deletePayment(cardId: string, period: string): Promise<void>;

	listLimitGroups(): Promise<LimitGroup[]>;
	saveLimitGroup(group: LimitGroup): Promise<void>;
	/** Throws `guard.groupInUse` while a card has this `limitGroupId`. */
	deleteLimitGroup(id: string): Promise<void>;

	/** By date, then id. */
	listCardPayments(cardId: string): Promise<CardPayment[]>;
	saveCardPayment(payment: CardPayment): Promise<void>;
	deleteCardPayment(cardId: string, id: string): Promise<void>;

	/** By period. */
	listStatementDates(cardId: string): Promise<StatementDates[]>;
	saveStatementDates(dates: StatementDates): Promise<void>;
	deleteStatementDates(cardId: string, period: string): Promise<void>;

	/** By date, then id. */
	listPurchaseLists(): Promise<PurchaseList[]>;
	savePurchaseList(list: PurchaseList): Promise<void>;
	deletePurchaseList(id: string): Promise<void>;

	/** In stored order, by id. */
	listLocations(): Promise<LocationRecord[]>;
	saveLocation(location: LocationRecord): Promise<void>;
	/** Throws `guard.locationInUse` while a card is kept there. */
	deleteLocation(id: string): Promise<void>;

	/** The stored settings, or `DEFAULT_SETTINGS` when nothing has been saved yet. */
	getSettings(): Promise<Settings>;
	saveSettings(settings: Settings): Promise<void>;

	/** Forgets every card, purchase, payment, limit group and setting. Cannot be undone. */
	clearAll(): Promise<void>;
}

const byDateThenId = <T extends { date: string; id: string }>(a: T, b: T) =>
	a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1;

const clone = <T>(value: T): T => structuredClone(value);

/**
 * A map key for a record owned by a card. Each part is encoded so a ':' inside an id cannot
 * make card `a:b` + `c` and card `a` + `b:c` share a key.
 */
const pairKey = (cardId: string, part: string): string =>
	`${encodeURIComponent(cardId)}:${encodeURIComponent(part)}`;

/** Reference implementation. Used by tests and as the contract's baseline. */
export class InMemoryRepository implements Repository {
	private cards = new Map<string, Card>();
	private purchases = new Map<string, Purchase>();
	private payments = new Map<string, StatementPayment>();
	private limitGroups = new Map<string, LimitGroup>();
	private cardPayments = new Map<string, CardPayment>();
	private statementDates = new Map<string, StatementDates>();
	private purchaseLists = new Map<string, PurchaseList>();
	private locations = new Map<string, LocationRecord>();
	private settings: Settings | null = null;

	async listCards(): Promise<Card[]> {
		return [...this.cards.values()]
			.map(clone)
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async getCard(id: string): Promise<Card | null> {
		const card = this.cards.get(id);
		return card ? clone(card) : null;
	}

	async saveCard(card: Card): Promise<void> {
		this.cards.set(card.id, clone(card));
	}

	async deleteCard(id: string): Promise<void> {
		for (const purchase of this.purchases.values()) {
			if (purchase.cardId === id) {
				throw new MessageError("guard.cardHasPurchases");
			}
		}
		this.cards.delete(id);
		// Cascade: delete the card's payments, card payments and statement dates
		for (const [key, payment] of [...this.cardPayments.entries()]) {
			if (payment.cardId === id) this.cardPayments.delete(key);
		}
		for (const [key, dates] of [...this.statementDates.entries()]) {
			if (dates.cardId === id) this.statementDates.delete(key);
		}
		for (const [key, payment] of [...this.payments.entries()]) {
			if (payment.cardId === id) this.payments.delete(key);
		}
	}

	async listPurchases(
		cardId: string,
		from?: string,
		to?: string,
	): Promise<Purchase[]> {
		return [...this.purchases.values()]
			.filter((p) => p.cardId === cardId)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true))
			.map(clone)
			.sort((a, b) =>
				a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
			);
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		this.purchases.set(pairKey(purchase.cardId, purchase.id), clone(purchase));
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		this.purchases.delete(pairKey(cardId, id));
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return [...this.payments.values()]
			.filter((p) => p.cardId === cardId)
			.map(clone)
			.sort((a, b) => (a.period < b.period ? -1 : 1));
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.payments.set(pairKey(payment.cardId, payment.period), clone(payment));
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.payments.delete(pairKey(cardId, period));
	}

	async listLimitGroups(): Promise<LimitGroup[]> {
		return [...this.limitGroups.values()]
			.map(clone)
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async saveLimitGroup(group: LimitGroup): Promise<void> {
		this.limitGroups.set(group.id, clone(group));
	}

	async deleteLimitGroup(id: string): Promise<void> {
		for (const card of this.cards.values()) {
			if (card.limitGroupId === id) throw new MessageError("guard.groupInUse");
		}
		this.limitGroups.delete(id);
	}

	async listCardPayments(cardId: string): Promise<CardPayment[]> {
		return [...this.cardPayments.values()]
			.filter((p) => p.cardId === cardId)
			.map(clone)
			.sort(byDateThenId);
	}

	async saveCardPayment(payment: CardPayment): Promise<void> {
		this.cardPayments.set(pairKey(payment.cardId, payment.id), clone(payment));
	}

	async deleteCardPayment(cardId: string, id: string): Promise<void> {
		this.cardPayments.delete(pairKey(cardId, id));
	}

	async listStatementDates(cardId: string): Promise<StatementDates[]> {
		return [...this.statementDates.values()]
			.filter((d) => d.cardId === cardId)
			.map(clone)
			.sort((a, b) => (a.period < b.period ? -1 : 1));
	}

	async saveStatementDates(dates: StatementDates): Promise<void> {
		this.statementDates.set(pairKey(dates.cardId, dates.period), clone(dates));
	}

	async deleteStatementDates(cardId: string, period: string): Promise<void> {
		this.statementDates.delete(pairKey(cardId, period));
	}

	async listPurchaseLists(): Promise<PurchaseList[]> {
		return [...this.purchaseLists.values()].map(clone).sort(byDateThenId);
	}

	async savePurchaseList(list: PurchaseList): Promise<void> {
		this.purchaseLists.set(list.id, clone(list));
	}

	async deletePurchaseList(id: string): Promise<void> {
		this.purchaseLists.delete(id);
	}

	async listLocations(): Promise<LocationRecord[]> {
		return [...this.locations.values()]
			.map(clone)
			.sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async saveLocation(location: LocationRecord): Promise<void> {
		this.locations.set(location.id, clone(location));
	}

	async deleteLocation(id: string): Promise<void> {
		for (const card of this.cards.values()) {
			if (String(card.location) === id) {
				throw new MessageError("guard.locationInUse");
			}
		}
		this.locations.delete(id);
	}

	async getSettings(): Promise<Settings> {
		return this.settings ? clone(this.settings) : defaultSettings();
	}

	async saveSettings(settings: Settings): Promise<void> {
		this.settings = clone(settings);
	}

	async clearAll(): Promise<void> {
		this.cards.clear();
		this.purchases.clear();
		this.payments.clear();
		this.limitGroups.clear();
		this.cardPayments.clear();
		this.statementDates.clear();
		this.purchaseLists.clear();
		this.locations.clear();
		this.settings = null;
	}
}
