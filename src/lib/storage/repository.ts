import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";

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
	deleteCard(id: string): Promise<void>;

	/** Purchases for one card, sorted by date ascending, optionally limited to `[from, to]`. */
	listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]>;
	savePurchase(purchase: Purchase): Promise<void>;
	deletePurchase(cardId: string, id: string): Promise<void>;

	listPayments(cardId: string): Promise<StatementPayment[]>;
	savePayment(payment: StatementPayment): Promise<void>;
	deletePayment(cardId: string, period: string): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Reference implementation. Used by tests and as the contract's baseline. */
export class InMemoryRepository implements Repository {
	private cards = new Map<string, Card>();
	private purchases = new Map<string, Purchase>();
	private payments = new Map<string, StatementPayment>();

	async listCards(): Promise<Card[]> {
		return [...this.cards.values()].map(clone).sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async getCard(id: string): Promise<Card | null> {
		const card = this.cards.get(id);
		return card ? clone(card) : null;
	}

	async saveCard(card: Card): Promise<void> {
		this.cards.set(card.id, clone(card));
	}

	async deleteCard(id: string): Promise<void> {
		this.cards.delete(id);
	}

	async listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]> {
		return [...this.purchases.values()]
			.filter((p) => p.cardId === cardId)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true))
			.map(clone)
			.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		this.purchases.set(`${purchase.cardId}:${purchase.id}`, clone(purchase));
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		this.purchases.delete(`${cardId}:${id}`);
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return [...this.payments.values()]
			.filter((p) => p.cardId === cardId)
			.map(clone)
			.sort((a, b) => (a.period < b.period ? -1 : 1));
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.payments.set(`${payment.cardId}:${payment.period}`, clone(payment));
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.payments.delete(`${cardId}:${period}`);
	}
}
