import { expect, test } from "bun:test";
import { afterExit, EXIT_TIMEOUT_MS } from "#lib/ui/motion";

const animated = (finished: Promise<unknown>[]) =>
	({
		getAnimations: () => finished.map((p) => ({ finished: p })),
	}) as unknown as Element;

test("runs at once, in the same turn, when nothing is animating", () => {
	let done = 0;
	afterExit(document.createElement("div"), () => done++);
	expect(done).toBe(1);
});

test("runs at once when the element cannot list its animations", () => {
	let done = 0;
	afterExit({} as Element, () => done++);
	expect(done).toBe(1);
});

test("waits for every running animation to finish, then runs once", async () => {
	let finishA!: () => void;
	let finishB!: () => void;
	const a = new Promise<void>((r) => {
		finishA = r;
	});
	const b = new Promise<void>((r) => {
		finishB = r;
	});
	let done = 0;
	afterExit(animated([a, b]), () => done++);
	expect(done).toBe(0);
	finishA();
	await a;
	await Promise.resolve();
	expect(done).toBe(0);
	finishB();
	await new Promise((r) => setTimeout(r, 0));
	expect(done).toBe(1);
});

test("a cancelled animation still lets it run", async () => {
	let done = 0;
	afterExit(animated([Promise.reject(new Error("abort"))]), () => done++);
	await new Promise((r) => setTimeout(r, 0));
	expect(done).toBe(1);
});

test("falls back to a timeout when an animation never finishes", async () => {
	let done = 0;
	afterExit(animated([new Promise(() => {})]), () => done++, 5);
	expect(done).toBe(0);
	await new Promise((r) => setTimeout(r, 20));
	expect(done).toBe(1);
	expect(EXIT_TIMEOUT_MS).toBeGreaterThan(240);
});
