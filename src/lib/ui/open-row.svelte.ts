import { tick } from "svelte"

/*
 * Keeps at most one row open in a component (Needs you, the ledger, the Lists view): opening a
 * row closes the one before, a second tap on it closes it, and `prune` forgets a row that is
 * gone (a plan marked paid), so a repaint keeps the open row only while it exists. Nothing of it
 * goes in the address. `onChange` hears every change of the open row, so the owner can end a
 * half-done two-step swap (`TwoStep.reset`) when its row closes.
 *
 * A row id must be unique within the component across every kind of row it draws: a payment's
 * id repeats across cards (`PaymentRef` is `{ cardId, id }`), so callers namespace them by kind
 * and, where needed, card: `plan:<card>:<id>`, `buy:<card>:<id>`, `list:<id>`.
 */

/** The row heads directly in a panel, in order. */
const panelHeads = (panel: Element) => [...panel.querySelectorAll<HTMLElement>(":scope > .a-wrap button.a-hit")]

/**
 * Where focus goes once a pruned row, which held it, has left the screen: its panel and its
 * place in it, the heads beside it, nearest first (after it, then before it), and the headings
 * after and before it.
 */
type Landing = {
	panel: Element | null
	at: number
	heads: string[]
	after: string | null
	before: string | null
}

export class OpenRows {
	#open = $state<string | undefined>(undefined)

	/**
	 * @param prefix names the component in every details id, so two lists on a page never share one.
	 * @param root the component's element, where heads and `data-refocus` headings are found.
	 */
	constructor(
		private readonly prefix: string,
		private readonly root: () => ParentNode | null | undefined,
		private readonly onChange: () => void = () => {},
	) {}

	isOpen(id: string): boolean {
		return this.#open === id
	}

	toggle(id: string): void {
		this.#open = this.#open === id ? undefined : id
		this.onChange()
	}

	/**
	 * Forgets the open row when `ids` (the rows drawn now) no longer holds it; call it before the
	 * DOM updates (`$effect.pre`). A row that goes while it holds focus hands it on once the
	 * repaint is done: to the head of the row that took its place, else the row before it, else
	 * the section's heading (`data-refocus`, `tabindex="-1"`).
	 */
	prune(ids: string[]): void {
		const open = this.#open
		if (open === undefined || ids.includes(open)) return
		const landing = this.landingFor(open)
		this.#open = undefined
		this.onChange()
		if (landing) void tick().then(() => this.land(landing))
	}

	/** The id of a row's details region: `${prefix}-${id}`, each run of whitespace made `_`. */
	detailsId(id: string): string {
		return `${this.prefix}-${id.replace(/\s+/g, "_")}`
	}

	private landingFor(id: string): Landing | null {
		const root = this.root()
		if (!root) return null
		const head = root.querySelector(`[id="${CSS.escape(`${this.detailsId(id)}-head`)}"]`)
		const wrap = head?.closest(".a-wrap")
		const active = document.activeElement
		if (!wrap || !active || !wrap.contains(active)) return null
		const panel = wrap.parentElement
		const ids = panel ? panelHeads(panel).map((b) => b.id) : []
		const at = ids.indexOf(head?.id ?? "")
		const marks = [...root.querySelectorAll<HTMLElement>("[data-refocus]")]
		const follows = (el: Element) => el.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING
		return {
			panel,
			at,
			heads: [...ids.slice(at + 1), ...ids.slice(0, at).reverse()],
			after: marks.find((el) => !follows(el))?.getAttribute("data-refocus") ?? null,
			before: marks.filter(follows).at(-1)?.getAttribute("data-refocus") ?? null,
		}
	}

	private land(landing: Landing): void {
		const root = this.root()
		if (!root) return
		const byId = (id: string) => root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
		const near = landing.heads.map(byId).filter((el) => el !== null)
		// The row that slid into the gone row's place: in a folded list (Needs you, the ledger's
		// page) it was not drawn before. Only while the panel still holds the same list.
		const { panel } = landing
		const slid = panel?.isConnected && near.some((el) => panel.contains(el)) ? panelHeads(panel)[landing.at] : undefined
		const headings = [...root.querySelectorAll<HTMLElement>("[data-refocus]")]
		const heading = (name: string | null) => headings.find((el) => el.getAttribute("data-refocus") === name)
		const target = slid ?? near[0] ?? heading(landing.after) ?? heading(landing.before) ?? headings[0]
		target?.focus()
	}
}
