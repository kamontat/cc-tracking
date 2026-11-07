import type { CardPayment } from "#lib/domain/types"

import { tick } from "svelte"

/*
 * The buttons that ask twice before they write (UI-09, DD-110), shared by every list of rows
 * that offers them (Needs you, the ledger, the Lists view). *Delete* on a payment swaps in place
 * for an asking *Delete* and *Cancel*; *Confirm* on a waiting list swaps for *Save* and *Cancel*.
 * Nothing is written until the second step. Focus follows each swap, so the keyboard never drops
 * to the page. `TwoStepButtons` draws the buttons from this state.
 */

/** A payment's key: its id repeats across cards (`PaymentRef` is `{ cardId, id }`). */
export const planKey = (payment: CardPayment): string => `${payment.cardId}:${payment.id}`

export class TwoStep {
	/** The payment (`planKey`) whose *Delete* asks its second step. */
	plan = $state<string | null>(null)
	/** The waiting list whose *Confirm* asks its second step. */
	list = $state<string | null>(null)

	/** @param root the component's element, where the next button to focus is found. */
	constructor(private readonly root: () => ParentNode | null | undefined) {}

	/** Ends any half-done swap: its row closed or went (`OpenRows`'s `onChange`). */
	reset(): void {
		this.plan = null
		this.list = null
	}

	/** Changes a swap, then focuses the button `action` of row `id` once it has drawn. */
	swap(change: () => void, action: string, id: string): void {
		change()
		void tick().then(() => {
			const root = this.root()
			const button = [...(root?.querySelectorAll<HTMLElement>(`[data-action="${action}"]`) ?? [])].find(
				(b) => b.getAttribute("data-for") === id,
			)
			button?.focus()
		})
	}
}
