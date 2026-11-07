/**
 * One button in the `MoreMenu` island. `ask` makes it ask twice: the question, then *Delete* and
 * *Keep* (UI-09). `onselect` runs once it is chosen (after the second step for one that asks),
 * before the menu's own `onselect`.
 */
export type MoreItem = {
	action: string
	label: string
	variant?: "danger" | undefined
	ask?: string | undefined
	onselect?: (() => void) | undefined
}
