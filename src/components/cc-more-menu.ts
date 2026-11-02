import { css, html, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

/** One button in the menu. `ask` makes it ask twice: the question, then *Delete* and *Keep*. */
export type MoreItem = {
	action: string;
	label: string;
	variant?: "danger";
	ask?: string;
};

const MENU_ID = "more-menu";

/**
 * A *More* (`⋯`) button that opens a small list of buttons under it (prototype `subHead`'s
 * actions). Opening focuses the first; Escape or a click outside closes it. Escape and a choice
 * hand focus back to `⋯`; a click outside leaves it with what was clicked. An item with `ask` swaps the list for the question with *Delete* (danger) and *Keep*
 * (UI-09), focus following each swap. Emits `menu-select` with `{ action }` and closes.
 */
@customElement("cc-more-menu")
export class CcMoreMenu extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				position: relative;
				display: inline-block;
			}

			button.more {
				min-inline-size: calc(var(--cc-icon-size) + 2 * var(--cc-space-2));
				font-size: var(--cc-text-md);
				line-height: 1;
			}

			.more-menu {
				position: absolute;
				inset-block-start: calc(100% + var(--cc-space-1));
				inset-inline-end: 0;
				z-index: 1;
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				min-inline-size: var(--cc-menu-min);
				padding: var(--cc-space-2);
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-lg);
			}

			.more-menu[hidden] {
				display: none;
			}

			.more-menu button {
				align-self: stretch;
				text-align: start;
			}

			.ask {
				padding: var(--cc-space-1) var(--cc-space-2);
				font-size: var(--cc-text-sm);
				font-weight: 600;
			}

			.answers {
				display: flex;
				flex-direction: row;
				gap: var(--cc-space-2);
			}

			.answers button {
				flex: 1 1 0;
				text-align: center;
			}
		`,
	];

	@property({ attribute: false }) items: MoreItem[] = [];
	/** Greys every button while the page writes. */
	@property({ type: Boolean }) busy = false;

	@state() private open = false;
	/** The item whose question is showing, by action. */
	@state() private asking: string | null = null;

	@query("button.more") private toggleButton!: HTMLButtonElement;

	/** The button to focus once the next render lands. */
	private refocus: string | null = null;

	private readonly onDocumentClick = (event: Event) => {
		if (this.open && !event.composedPath().includes(this)) this.close(false);
	};

	constructor() {
		super();
		new LocaleController(this);
		this.addEventListener("keydown", (event) => this.onKeydown(event));
	}

	override connectedCallback() {
		super.connectedCallback();
		this.ownerDocument.addEventListener("click", this.onDocumentClick);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		this.ownerDocument.removeEventListener("click", this.onDocumentClick);
	}

	protected override updated() {
		const want = this.refocus;
		if (!want) return;
		this.refocus = null;
		this.renderRoot
			.querySelector<HTMLElement>(`[data-action="${CSS.escape(want)}"]`)
			?.focus();
	}

	private show() {
		this.asking = null;
		this.open = true;
		this.refocus = this.items[0]?.action ?? null;
	}

	/**
	 * Closes the list and forgets any question. `refocus` hands focus back to `⋯` (Escape, a
	 * choice); a click outside leaves it with whatever was clicked.
	 */
	private close(refocus = true) {
		this.open = false;
		this.asking = null;
		if (refocus) this.toggleButton?.focus();
	}

	private pick(item: MoreItem) {
		if (item.ask) {
			this.asking = item.action;
			this.refocus = "confirm";
			return;
		}
		this.select(item.action);
	}

	private select(action: string) {
		this.close();
		this.dispatchEvent(new CustomEvent("menu-select", { detail: { action } }));
	}

	private onKeydown(event: KeyboardEvent) {
		if (!this.open || event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		this.close();
	}

	private body() {
		const asking = this.items.find((item) => item.action === this.asking);
		if (asking)
			return html`<span class="ask">${asking.ask}</span>
				<span class="answers">
					<button type="button" data-variant="danger" data-action="confirm"
						?disabled=${this.busy}
						@click=${() => this.select(asking.action)}>${t("common.delete")}</button>
					<button type="button" data-variant="quiet" data-action="keep"
						@click=${() => {
							this.asking = null;
							this.refocus = asking.action;
						}}>${t("form.keep")}</button>
				</span>`;
		return this.items.map(
			(item) => html`<button type="button" data-action=${item.action}
				data-variant=${item.variant ?? "quiet"} ?disabled=${this.busy}
				@click=${() => this.pick(item)}>${item.label}</button>`,
		);
	}

	override render() {
		return html`<button type="button" class="more" data-variant="quiet"
				aria-label=${t("common.more")} aria-controls=${MENU_ID}
				aria-expanded=${this.open ? "true" : "false"}
				@click=${() => (this.open ? this.close() : this.show())}>⋯</button>
			<div class="more-menu" id=${MENU_ID} role="group" aria-label=${t("common.more")}
				?hidden=${!this.open}>${this.body()}</div>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-more-menu": CcMoreMenu;
	}
}
