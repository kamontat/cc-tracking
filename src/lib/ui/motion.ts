/**
 * The longest an exit animation is waited for. The sheet's runs `--cc-sheet-motion` (240ms);
 * past this the closing step goes ahead anyway, so a stalled or throttled animation never
 * leaves a sheet or menu stuck on screen.
 */
export const EXIT_TIMEOUT_MS = 400;

/**
 * Runs `done` once the animations running on `element` and its subtree (its `::backdrop`
 * among them) have finished -- or at once, in the same turn, when none runs: under
 * prefers-reduced-motion, in a test DOM, or on an element with no exit animation. A cancelled
 * animation counts as finished, and `timeout` caps the wait.
 */
export function afterExit(
	element: Element,
	done: () => void,
	timeout: number = EXIT_TIMEOUT_MS,
): void {
	const running =
		typeof element.getAnimations === "function"
			? element.getAnimations({ subtree: true })
			: [];
	if (running.length === 0) {
		done();
		return;
	}
	let called = false;
	const finish = () => {
		if (called) return;
		called = true;
		clearTimeout(timer);
		done();
	};
	const timer = setTimeout(finish, timeout);
	void Promise.allSettled(running.map((animation) => animation.finished)).then(
		finish,
	);
}
