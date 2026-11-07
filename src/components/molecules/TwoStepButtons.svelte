<script lang="ts">
	import type { Card, CardPayment, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { TwoStep } from "#lib/ui/two-step.svelte"

	import { onMount } from "svelte"

	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardName } from "#lib/ui/card-label"
	import { planKey } from "#lib/ui/two-step.svelte"

	/**
	 * The buttons that ask twice before they write (UI-09, DD-110), drawn from a shared `TwoStep`:
	 * a planned payment's *Paid* and *Delete* (`plan`), a paid payment's *Delete* (`paid`), or a
	 * waiting list's *Confirm* (`list`). *Delete* swaps in place for an asking *Delete* (its label
	 * "Delete ฿X to NAME?") and *Cancel*; *Confirm* swaps for *Save* and *Cancel*. Only the second
	 * step calls back. The buttons are bare, for the row's `.a-btns`; a swap's pair sits in a
	 * `.a-swap` span (`display: contents`) that carries `data-confirming`.
	 */
	type Props = { steps: TwoStep } & (
		| { kind: "plan"; payment: CardPayment; card: Card | undefined; onpaid: () => void; onremove: () => void }
		| { kind: "paid"; payment: CardPayment; card: Card | undefined; onremove: () => void }
		| { kind: "list"; list: PurchaseList; onconfirm: () => void }
	)

	const props: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#if props.kind === "list"}
	{@const { steps, list, onconfirm } = props}
	{#if steps.list !== list.id}
		<button
			type="button"
			data-variant="quiet"
			data-action="confirm-list"
			data-for={list.id}
			onclick={() =>
				steps.swap(
					() => {
						steps.list = list.id
					},
					"save-list",
					list.id,
				)}>
			{tr("row.confirm")}
		</button>
	{:else}
		<span class="a-swap" data-confirming={list.id}
			><button
				type="button"
				data-action="save-list"
				data-for={list.id}
				aria-label={list.lines.length === 1
					? tr("row.confirmAsk.one")
					: tr("row.confirmAsk.many", { count: list.lines.length })}
				onclick={() => {
					// If the write fails the row stays: focus then lands on its *Confirm*.
					steps.swap(
						() => {
							steps.list = null
						},
						"confirm-list",
						list.id,
					)
					onconfirm()
				}}>
				{tr("row.save")}
			</button><button
				type="button"
				data-variant="quiet"
				data-action="cancel-confirm"
				onclick={() =>
					steps.swap(
						() => {
							steps.list = null
						},
						"confirm-list",
						list.id,
					)}>
				{tr("common.cancel")}
			</button></span
		>
	{/if}
{:else}
	{@const { steps, payment, card, onremove } = props}
	{@const key = planKey(payment)}
	{#if steps.plan === key}
		<span class="a-swap" data-confirming={key}
			><button
				type="button"
				data-variant="danger"
				data-action="confirm-delete"
				data-for={key}
				aria-label={tr("tx.confirmDelete", {
					amount: formatAmount(payment.amount),
					card: cardName(payment.cardId, card),
				})}
				onclick={() => {
					// If the write fails the row stays: focus then lands on its *Delete*.
					steps.swap(
						() => {
							steps.plan = null
						},
						"delete",
						key,
					)
					onremove()
				}}>
				{tr("common.delete")}
			</button><button
				type="button"
				data-action="cancel-delete"
				onclick={() =>
					steps.swap(
						() => {
							steps.plan = null
						},
						"delete",
						key,
					)}>
				{tr("common.cancel")}
			</button></span
		>
	{:else}
		{#if props.kind === "plan"}
			<button type="button" data-variant="quiet" data-action="mark-paid" onclick={props.onpaid}>
				{tr("row.paid")}
			</button>
		{/if}
		<button
			type="button"
			data-variant="danger"
			data-action="delete"
			data-for={key}
			onclick={() =>
				steps.swap(
					() => {
						steps.plan = key
					},
					"confirm-delete",
					key,
				)}>
			{tr("common.delete")}
		</button>
	{/if}
{/if}

<style>
	/* A swap's pair of buttons adds no box: they stay the row's buttons. */
	.a-swap {
		display: contents;
	}
</style>
