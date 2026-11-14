<script lang="ts">
	import type { CardsGlance } from "#lib/domain/cards-glance"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The Cards tab's glance panels (DD-210), under its control row: one small panel each for how
	 * many cards are shown, what they owe, what is due on them in 7 days (and on how many cards), and
	 * the share of their limit groups in use. Two to a row on a phone, four from 900px.
	 */
	interface Props {
		glance: CardsGlance
	}

	const { glance }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const cardsCount = (count: number) =>
		count === 1 ? tr("cards.page.count.one") : tr("cards.page.count.many", { count })

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<section class="cards-glance" aria-label={tr("cards.glance.label")}>
	<div data-field="count">
		<small>{tr("cards.glance.count")}</small>
		<b data-numeric>{glance.count}</b>
	</div>
	<div data-field="owed">
		<small>{tr("cards.glance.owed")}</small>
		<b data-numeric>{formatAmount(glance.owed)}</b>
	</div>
	<div data-field="soon">
		<small>{tr("cards.glance.soon")}</small>
		<b data-numeric>{formatAmount(glance.soon.amount)}</b>
		<small>{cardsCount(glance.soon.count)}</small>
	</div>
	<div data-field="used">
		<small>{tr("cards.glance.used")}</small>
		<b data-numeric>{glance.usedPct === null ? "—" : `${glance.usedPct}%`}</b>
	</div>
</section>

<style>
	.cards-glance {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.cards-glance {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.cards-glance > div {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		padding: var(--cc-space-3);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.cards-glance small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.cards-glance b {
		font-size: var(--cc-text-lg);
		font-weight: 700;
		overflow-wrap: anywhere;
	}
</style>
