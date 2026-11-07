<script lang="ts">
	import type { Card, ListStatus, PurchaseList } from "#lib/domain/types"

	import { onMount } from "svelte"

	import { getLocale, subscribe } from "#lib/i18n/index"
	import { shareTable } from "#lib/ui/list-share"

	/**
	 * The purchase list as a document, on the review step: what Copy text and Save image also say
	 * (`shareTable`). A heading and the date, then the table in one row panel: a muted header row,
	 * a hairline between the body rows and a bold total row. Under 640px each row stacks, every
	 * cell led by its column's name.
	 */
	interface Props {
		list: Pick<PurchaseList, "date" | "lines"> & { status?: ListStatus }
		cards: Card[]
	}

	const { list, cards }: Props = $props()

	/** The reader's language; reading it makes the table's words follow a switch. */
	let lang = $state(getLocale())

	const table = $derived.by(() => {
		void lang
		return shareTable(list, cards)
	})
	const heads = $derived(table.headers)

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="doc">
	<div>
		<h3>{table.title}</h3>
		<p>{table.date}</p>
	</div>
	<div class="row-panel" block>
		<table>
			<thead>
				<tr>
					<th>{heads[0]}</th>
					<th>{heads[1]}</th>
					<th data-numeric>{heads[2]}</th>
				</tr>
			</thead>
			<tbody>
				{#each table.rows as [card, name, amount], i (i)}
					<tr>
						<td data-label={heads[0]}>{card}</td>
						<td data-label={heads[1]}>{name}</td>
						<td data-label={heads[2]} data-numeric>{amount}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td colspan="2">{table.total[0]}</td>
					<td data-numeric>{table.total[1]}</td>
				</tr>
			</tfoot>
		</table>
	</div>
</div>

<style>
	.doc {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	h3 {
		margin: 0;
		font-size: var(--cc-text-lg);
	}

	p {
		margin: 0;
		color: var(--cc-text-muted);
	}

	/* app.css's `.row-panel` draws the surface; the table inside it is clipped at its corners. */
	.row-panel {
		display: block;
		overflow: clip;
	}

	/* The legacy `dataTable` look, with no side padding: the panel has its own. */
	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--cc-text-sm);
	}

	th {
		padding: var(--cc-space-2) 0;
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-align: start;
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-label);
	}

	td {
		padding: var(--cc-space-3) 0;
		vertical-align: top;
	}

	th[data-numeric],
	td[data-numeric] {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	/* A row list: a hairline above every body row (the first one under the header) and the total. */
	tfoot tr,
	tbody tr + tr,
	tbody tr:first-child {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	tfoot td {
		font-weight: 700;
	}

	@media (max-width: 639px) {
		thead {
			display: none;
		}

		tr {
			display: flex;
			flex-direction: column;
			gap: var(--cc-space-2);
			padding: var(--cc-space-3) 0;
		}

		tfoot tr {
			flex-direction: row;
			justify-content: space-between;
		}

		td {
			display: flex;
			flex-direction: row;
			gap: var(--cc-space-3);
			align-items: baseline;
			justify-content: space-between;
			padding: 0;
		}

		/* An unlabelled cell is a lone flex item, so it is placed at the end of the row instead. */
		td[data-numeric]:not([data-label]) {
			justify-content: flex-end;
		}

		td[data-label]::before {
			content: attr(data-label);
			flex: none;
			font-size: var(--cc-text-xs);
			color: var(--cc-text-muted);
			text-transform: uppercase;
			letter-spacing: var(--cc-tracking-label);
		}
	}
</style>
