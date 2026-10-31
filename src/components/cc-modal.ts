import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

/**
 * A modal dialog around whatever is slotted into it. It opens itself the moment it is placed on
 * the page, so a page shows one by rendering it and hides it by rendering it away -- there is no
 * `open` to keep in step. Escape, the backdrop and the close button never close it directly;
 * each only emits `close`, leaving the page to decide, so the dialog can never be shut while the
 * page still believes it is showing.
 */
@customElement("cc-modal")
export class CcModal extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			dialog {
				width: min(100% - 2 * var(--cc-space-4), var(--cc-modal-max));
				max-height: calc(100dvh - 2 * var(--cc-space-4));
				padding: 0;
				color: inherit;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-md);
				box-shadow: var(--cc-shadow-lg);
			}

			dialog::backdrop {
				background: var(--cc-backdrop);
			}

			/* The padding lives here, not on the dialog, so a click anywhere inside the visible box
			   lands on this element and only a click on the backdrop lands on the dialog itself. */
			.body {
				gap: var(--cc-space-4);
				padding: var(--cc-space-5);
			}

			header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: var(--cc-space-3);
			}

			h2 {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.grab {
				display: none;
			}

			/* A sheet: on a phone it rises from the bottom edge, the screen's full width, with a
			   grab handle; from 900px it is a centred dialog the sheet's width. */
			:host([sheet]) dialog {
				inline-size: 100%;
				max-inline-size: 100%;
				max-block-size: calc(100dvh - var(--cc-space-7));
				margin: auto 0 0;
				background: var(--cc-bg);
				border: 0;
				border-radius: var(--cc-radius-md) var(--cc-radius-md) 0 0;
			}

			:host([sheet]) .body {
				gap: var(--cc-space-4);
				padding: var(--cc-space-2) var(--cc-space-4)
					calc(var(--cc-space-5) + env(safe-area-inset-bottom, 0px));
			}

			:host([sheet]) .grab {
				display: block;
				align-self: center;
				inline-size: calc(var(--cc-space-7) - var(--cc-space-1));
				block-size: var(--cc-space-1);
				background: var(--cc-border);
				border-radius: var(--cc-radius-pill);
			}

			:host([sheet]) h2 {
				font-weight: 700;
			}

			/* The sheet rises into view, and its backdrop fades in under it. */
			@keyframes sheet-rise {
				from {
					transform: translateY(100%);
				}
			}

			@keyframes sheet-grow {
				from {
					opacity: 0;
					transform: scale(var(--cc-sheet-scale-from));
				}
			}

			@keyframes backdrop-in {
				from {
					opacity: 0;
				}
			}

			:host([sheet]) dialog[open] {
				animation: sheet-rise var(--cc-sheet-motion) var(--cc-sheet-ease);
			}

			:host([sheet]) dialog[open]::backdrop {
				animation: backdrop-in var(--cc-sheet-motion) var(--cc-sheet-ease);
			}

			@media (min-width: 900px) {
				:host([sheet]) dialog[open] {
					animation-name: sheet-grow;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				:host([sheet]) dialog[open],
				:host([sheet]) dialog[open]::backdrop {
					animation: none;
				}
			}

			@media (min-width: 900px) {
				:host([sheet]) dialog {
					inline-size: min(100% - 2 * var(--cc-space-4), var(--cc-sheet-max));
					max-block-size: calc(100dvh - 2 * var(--cc-space-4));
					margin: auto;
					border-radius: var(--cc-radius-md);
					box-shadow: var(--cc-shadow-lg);
				}

				:host([sheet]) .body {
					padding: var(--cc-space-4) var(--cc-space-4) var(--cc-space-5);
				}

				:host([sheet]) .grab {
					display: none;
				}
			}
		`,
	];

	@property() heading = "";
	/** Draw as a sheet (bottom sheet on a phone, centred from 900px) with a worded Close. */
	@property({ type: Boolean, reflect: true }) sheet = false;

	@query("dialog") private dialog!: HTMLDialogElement;

	// Whatever had focus when this opened. A dialog that is close()d hands focus back itself, but
	// this one is rendered away instead, which skips that step and drops focus onto <body>.
	private opener: HTMLElement | null = null;

	constructor() {
		super();
		new LocaleController(this);
	}

	override connectedCallback() {
		super.connectedCallback();
		// Walked down through shadow roots: `document.activeElement` names only the outermost
		// host, and focusing a host does not focus the button inside it.
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) {
			active = active.shadowRoot.activeElement;
		}
		this.opener = active instanceof HTMLElement ? active : null;
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		if (this.opener?.isConnected) this.opener.focus();
		this.opener = null;
	}

	override firstUpdated() {
		this.dialog.showModal();
	}

	private requestClose() {
		this.dispatchEvent(new CustomEvent("close"));
	}

	override render() {
		return html`
			<dialog
				aria-labelledby="heading"
				@cancel=${(event: Event) => {
					event.preventDefault();
					this.requestClose();
				}}
				@click=${(event: Event) => {
					if (event.target === this.dialog) this.requestClose();
				}}
			>
				<div class="body">
					<span class="grab" aria-hidden="true"></span>
					<header>
						<h2 id="heading">${this.heading}</h2>
						${
							this.sheet
								? html`<button type="button" data-variant="quiet" data-action="close"
										@click=${() => this.requestClose()}>${t("common.close")}</button>`
								: html`<button type="button" data-variant="quiet" data-action="close"
										aria-label=${t("common.close")} @click=${() => this.requestClose()}>×</button>`
						}
					</header>
					<slot></slot>
				</div>
			</dialog>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-modal": CcModal;
	}
}
