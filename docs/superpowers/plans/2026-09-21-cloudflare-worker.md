# Cloudflare Worker and KV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The application runs as a Cloudflare Worker that serves the static build and an `/api/*` surface backed by KV, so the data lives outside one browser and the site is reachable from any device.

**Architecture:** The Worker holds a `KvRepository` implementing the same `Repository` interface the browser already uses, over the KV key shapes phase 1 was written to match. `handleApi` turns the nine documented routes into repository calls; everything else falls through to the assets binding. In the browser, `HttpRepository` implements `Repository` over `fetch`, and `createRepository` picks it when `BUN_PUBLIC_CC_STORAGE` is `http`. No component, route, or domain module changes. Both new implementations are proven against `repositoryContract`, the suite `local` and `memory` already pass.

**Tech Stack:** Bun 1.4.2, TypeScript, Wrangler 4.135.0, Cloudflare Workers KV and the static assets binding, `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-21-location-i18n-cloudflare-design.md`, which builds on §"Phase 2 — Cloudflare Worker and KV" of `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`.

**Depends on:** `docs/superpowers/plans/2026-09-21-location-choices.md` and `docs/superpowers/plans/2026-09-21-english-thai.md` should both be complete. Neither is a hard blocker — this plan touches no interface text — but running them concurrently produces avoidable conflicts.

## Global Constraints

- Bun only for local work. `bun test`, `bun run`, `bun install`, `bunx`. Wrangler runs through `bunx wrangler` or a `package.json` script.
- The Worker is named `cc-tracking`. It already exists in the account. No KV namespace exists yet.
- KV keys are the phase 1 shapes **without** the `cc:` prefix: `card:<id>`, `purchase:<cardId>:<date>:<uuid>`, `payment:<cardId>:<period>`. Every segment is `encodeURIComponent`-encoded, exactly as `src/lib/storage/local.ts` encodes it. A mismatch breaks export/import round-tripping between the two stores.
- **Prefix scans always include the trailing colon** — `purchase:<encoded cardId>:`, never `purchase:<encoded cardId>`. Card ids can be prefixes of one another; `src/lib/storage/contract.ts` already tests that deleting `abc` spares `abc:def`.
- KV `list` pages at 1000 keys. Every prefix scan follows `cursor` until `list_complete`.
- No new runtime dependency. The KV and assets bindings are described by hand-written structural interfaces rather than pulling in `@cloudflare/workers-types`.
- Authentication is Cloudflare Access in front of the whole Worker, configured in the dashboard. No authentication code in this plan.
- Money stays satang integers, dates stay `YYYY-MM-DD`, and `Repository` keeps exactly the methods it has today.
- Commit after every task, using Conventional Commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).
- `bun run typecheck` and `bun test` must both pass at every commit.
- Secrets and namespace ids are not invented. Where a real id is needed, the plan writes a placeholder and the README says which command produces the real one.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `worker/bindings.ts` | **New.** Hand-written `KvNamespace`, `AssetsBinding`, and `Env` interfaces. |
| `worker/kv.ts` | **New.** `KvRepository` — `Repository` over a KV namespace. |
| `worker/kv.test.ts` | **New.** `repositoryContract` against `KvRepository` with an in-memory KV. |
| `worker/fake-kv.ts` | **New.** In-memory `KvNamespace` used by tests, including its paging behaviour. |
| `worker/api.ts` | **New.** `handleApi` — the nine routes, plus the one-card read, as repository calls. |
| `worker/api.test.ts` | **New.** Status codes, parameter handling, and encoded ids. |
| `worker/index.ts` | **New.** The Worker entry: `/api/*` to `handleApi`, everything else to the assets binding. |
| `src/lib/storage/http.ts` | **New.** `HttpRepository` — `Repository` over `fetch`. |
| `src/lib/storage/http.test.ts` | **New.** `repositoryContract` against `HttpRepository` wired to `handleApi`. |
| `src/lib/storage/index.ts` | `createRepository` picks `http` or `local` from the build-time flag. |
| `wrangler.toml` | **New.** Worker name, assets binding, KV binding. |
| `package.json` | Build, deploy, and local Worker scripts. |
| `README.md` | The deployment section: the commands to run, in order. |

---

### Task 1: `KvRepository` against the shared contract

**Files:**
- Create: `worker/bindings.ts`, `worker/fake-kv.ts`, `worker/kv.ts`
- Test: `worker/kv.test.ts`

**Interfaces:**
- Consumes: `Repository`, `StorageError` from `#lib/storage/repository`; `repositoryContract` from `#lib/storage/contract`.
- Produces:
  - `interface KvNamespace` — `get`, `put`, `delete`, `list`
  - `interface AssetsBinding` — `fetch(request: Request): Promise<Response>`
  - `interface Env` — `{ CC_KV: KvNamespace; ASSETS: AssetsBinding }`
  - `class FakeKv implements KvNamespace` — in-memory, pages at a configurable size
  - `class KvRepository implements Repository`
  - `cardKey`, `purchaseKey`, `paymentKey` — the KV key builders

- [ ] **Step 1: Write the failing test**

Create `worker/kv.test.ts`:

```ts
import { expect, test } from "bun:test";
import { repositoryContract, samplePurchase } from "#lib/storage/contract";
import { FakeKv } from "./fake-kv";
import { KvRepository, purchaseKey } from "./kv";

repositoryContract("kv", () => new KvRepository(new FakeKv()));

test("uses the documented key shapes, without the cc: prefix", () => {
	expect(
		purchaseKey(samplePurchase({ cardId: "kbank", date: "2026-09-05", id: "p1" })),
	).toBe("purchase:kbank:2026-09-05:p1");
});

test("percent-encodes every segment, so a colon in an id cannot shift a boundary", () => {
	expect(
		purchaseKey(samplePurchase({ cardId: "abc:def", date: "2026-09-05", id: "p1" })),
	).toBe("purchase:abc%3Adef:2026-09-05:p1");
});

test("reads across more than one page of keys", async () => {
	// Two keys per page forces the cursor loop that KV's 1000-key limit needs.
	const repo = new KvRepository(new FakeKv(2));
	for (let index = 0; index < 5; index += 1) {
		await repo.savePurchase(
			samplePurchase({ id: `p${index}`, date: `2026-09-0${index + 1}` }),
		);
	}

	expect(await repo.listPurchases("kbank")).toHaveLength(5);
});
```

`repositoryContract` brings the cascade and prefix-collision cases with it; that is the point of running it here.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test worker/kv.test.ts`
Expected: FAIL — none of `./fake-kv`, `./kv` resolve.

- [ ] **Step 3: Describe the bindings**

Create `worker/bindings.ts`:

```ts
/**
 * The slice of the Cloudflare runtime this Worker uses, written by hand.
 *
 * `@cloudflare/workers-types` would describe far more surface than is needed and would be a
 * second source of truth for the three methods that actually matter here.
 */
export interface KvListResult {
	keys: { name: string }[];
	list_complete: boolean;
	cursor?: string;
}

export interface KvNamespace {
	get(key: string): Promise<string | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: { prefix: string; cursor?: string }): Promise<KvListResult>;
}

export interface AssetsBinding {
	fetch(request: Request): Promise<Response>;
}

export interface Env {
	CC_KV: KvNamespace;
	ASSETS: AssetsBinding;
}
```

- [ ] **Step 4: Write the in-memory KV**

Create `worker/fake-kv.ts`:

```ts
import type { KvListResult, KvNamespace } from "./bindings";

/** An in-memory `KvNamespace` for tests. `pageSize` exists to force the cursor loop. */
export class FakeKv implements KvNamespace {
	private readonly values = new Map<string, string>();

	constructor(private readonly pageSize = 1000) {}

	async get(key: string): Promise<string | null> {
		return this.values.get(key) ?? null;
	}

	async put(key: string, value: string): Promise<void> {
		this.values.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.values.delete(key);
	}

	async list(options: {
		prefix: string;
		cursor?: string;
	}): Promise<KvListResult> {
		const matching = [...this.values.keys()]
			.filter((key) => key.startsWith(options.prefix))
			.sort();
		const start = options.cursor ? Number(options.cursor) : 0;
		const page = matching.slice(start, start + this.pageSize);
		const next = start + page.length;
		const complete = next >= matching.length;
		return {
			keys: page.map((name) => ({ name })),
			list_complete: complete,
			...(complete ? {} : { cursor: String(next) }),
		};
	}
}
```

- [ ] **Step 5: Write the repository**

Create `worker/kv.ts`:

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import { type Repository, StorageError } from "#lib/storage/repository";
import type { KvNamespace } from "./bindings";

const CARD = "card:";
const PURCHASE = "purchase:";
const PAYMENT = "payment:";

export const cardKey = (cardId: string): string =>
	`${CARD}${encodeURIComponent(cardId)}`;
export const purchaseKey = (p: Purchase): string =>
	`${PURCHASE}${encodeURIComponent(p.cardId)}:${encodeURIComponent(p.date)}:${encodeURIComponent(p.id)}`;
export const paymentKey = (cardId: string, period: string): string =>
	`${PAYMENT}${encodeURIComponent(cardId)}:${encodeURIComponent(period)}`;

/**
 * Phase 2 store. The key shapes are the phase 1 shapes minus the `cc:` prefix, with the same
 * per-segment encoding, so a backup exported from one store imports into the other unchanged.
 */
export class KvRepository implements Repository {
	constructor(private readonly kv: KvNamespace) {}

	private async read<T>(key: string): Promise<T | null> {
		const raw = await this.kv.get(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch (cause) {
			throw new StorageError(`Stored value at ${key} is not readable`, { cause });
		}
	}

	/** Every key under `prefix`, following the cursor: KV pages `list` at 1000 keys. */
	private async keysWithPrefix(prefix: string): Promise<string[]> {
		const keys: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await this.kv.list({ prefix, cursor });
			for (const key of page.keys) keys.push(key.name);
			cursor = page.list_complete ? undefined : page.cursor;
		} while (cursor);
		return keys.sort();
	}

	private async readAll<T>(prefix: string): Promise<T[]> {
		const keys = await this.keysWithPrefix(prefix);
		const values = await Promise.all(keys.map((key) => this.read<T>(key)));
		return values.filter((value): value is T => value !== null);
	}

	async listCards(): Promise<Card[]> {
		return this.readAll<Card>(CARD);
	}

	async getCard(id: string): Promise<Card | null> {
		return this.read<Card>(cardKey(id));
	}

	async saveCard(card: Card): Promise<void> {
		await this.kv.put(cardKey(card.id), JSON.stringify(card));
	}

	async deleteCard(id: string): Promise<void> {
		await this.kv.delete(cardKey(id));
		// The trailing colon is load-bearing: without it, deleting card "abc" would also
		// match every key belonging to "abc:def".
		const encoded = encodeURIComponent(id);
		for (const key of await this.keysWithPrefix(`${PURCHASE}${encoded}:`)) {
			await this.kv.delete(key);
		}
		for (const key of await this.keysWithPrefix(`${PAYMENT}${encoded}:`)) {
			await this.kv.delete(key);
		}
	}

	async listPurchases(
		cardId: string,
		from?: string,
		to?: string,
	): Promise<Purchase[]> {
		// Keys sort by date because the date sits before the id in the key.
		const purchases = await this.readAll<Purchase>(
			`${PURCHASE}${encodeURIComponent(cardId)}:`,
		);
		return purchases
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		// The date is part of the key, so a re-dated purchase would otherwise appear twice.
		await this.deletePurchase(purchase.cardId, purchase.id);
		await this.kv.put(purchaseKey(purchase), JSON.stringify(purchase));
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		const encodedId = encodeURIComponent(id);
		for (const key of await this.keysWithPrefix(
			`${PURCHASE}${encodeURIComponent(cardId)}:`,
		)) {
			const segments = key.split(":");
			if (segments[segments.length - 1] === encodedId) await this.kv.delete(key);
		}
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return this.readAll<StatementPayment>(
			`${PAYMENT}${encodeURIComponent(cardId)}:`,
		);
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		await this.kv.put(
			paymentKey(payment.cardId, payment.period),
			JSON.stringify(payment),
		);
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		await this.kv.delete(paymentKey(cardId, period));
	}
}
```

- [ ] **Step 6: Make sure the typechecker and test runner see `worker/`**

Run: `bun run typecheck`
Expected: PASS, with `worker/*.ts` included. If `tsc` does not pick the directory up, add it to `tsconfig.json`:

```json
	"include": ["src", "worker", "tests"]
```

and run it again.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test worker/kv.test.ts`
Expected: PASS — the whole `repositoryContract` suite plus the three key tests.

- [ ] **Step 8: Commit**

```bash
git add worker tsconfig.json
git commit -m "feat: implement the repository over Cloudflare KV"
```

---

### Task 2: The API surface

**Files:**
- Create: `worker/api.ts`
- Test: `worker/api.test.ts`

**Interfaces:**
- Consumes: `Repository` from `#lib/storage/repository`; `KvRepository`, `FakeKv` from Task 1.
- Produces: `handleApi(request: Request, repo: Repository): Promise<Response | null>` — `null` when the path is not under `/api/`, so the caller falls through to the assets binding.

Routes, matching §"Phase 2" of the 2026-09-15 spec:

| Method and path | Repository call |
| --- | --- |
| `GET /api/cards` | `listCards()` |
| `GET /api/cards/:id` | `getCard(id)` |
| `PUT /api/cards/:id` | `saveCard(body)` |
| `DELETE /api/cards/:id` | `deleteCard(id)` |
| `GET /api/cards/:id/purchases?from&to` | `listPurchases(id, from, to)` |
| `POST /api/cards/:id/purchases` | `savePurchase(body)` |
| `DELETE /api/cards/:id/purchases/:purchaseId` | `deletePurchase(id, purchaseId)` |
| `GET /api/cards/:id/payments` | `listPayments(id)` |
| `PUT /api/cards/:id/payments/:period` | `savePayment(body)` |
| `DELETE /api/cards/:id/payments/:period` | `deletePayment(id, period)` |

`GET /api/cards/:id` is not in the 2026-09-15 list. It is added because `Repository.getCard` exists and the contract exercises it; fetching the whole list to find one card would be the only alternative.

- [ ] **Step 1: Write the failing test**

Create `worker/api.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sampleCard, samplePurchase } from "#lib/storage/contract";
import { handleApi } from "./api";
import { FakeKv } from "./fake-kv";
import { KvRepository } from "./kv";

const setup = () => new KvRepository(new FakeKv());

const call = (repo: KvRepository, method: string, path: string, body?: unknown) =>
	handleApi(
		new Request(`https://example.com${path}`, {
			method,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
		repo,
	);

test("ignores anything outside /api/", async () => {
	expect(await call(setup(), "GET", "/cards")).toBeNull();
	expect(await call(setup(), "GET", "/")).toBeNull();
});

test("round-trips a card through PUT, GET, and DELETE", async () => {
	const repo = setup();

	const put = await call(repo, "PUT", "/api/cards/kbank", sampleCard());
	expect(put?.status).toBe(204);

	const get = await call(repo, "GET", "/api/cards/kbank");
	expect(get?.status).toBe(200);
	expect(await get?.json()).toEqual(sampleCard());

	const list = await call(repo, "GET", "/api/cards");
	expect(await list?.json()).toEqual([sampleCard()]);

	expect((await call(repo, "DELETE", "/api/cards/kbank"))?.status).toBe(204);
	expect((await call(repo, "GET", "/api/cards/kbank"))?.status).toBe(404);
});

test("limits purchases by the from and to parameters", async () => {
	const repo = setup();
	await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-08-31" }));
	await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-15" }));
	await repo.savePurchase(samplePurchase({ id: "p3", date: "2026-10-01" }));

	const response = await call(
		repo,
		"GET",
		"/api/cards/kbank/purchases?from=2026-09-01&to=2026-09-30",
	);
	const purchases = (await response?.json()) as { id: string }[];

	expect(purchases.map((p) => p.id)).toEqual(["p2"]);
});

test("handles a card id that needs encoding", async () => {
	const repo = setup();
	await call(repo, "PUT", "/api/cards/abc%3Adef", sampleCard({ id: "abc:def" }));

	const response = await call(repo, "GET", "/api/cards/abc%3Adef");
	expect(response?.status).toBe(200);
	expect(((await response?.json()) as { id: string }).id).toBe("abc:def");
});

test("rejects an unknown path and an unsupported method", async () => {
	expect((await call(setup(), "GET", "/api/nope"))?.status).toBe(404);
	expect((await call(setup(), "PATCH", "/api/cards/kbank"))?.status).toBe(405);
});

test("rejects a body that is not JSON", async () => {
	const response = await handleApi(
		new Request("https://example.com/api/cards/kbank", {
			method: "PUT",
			body: "{not json",
		}),
		setup(),
	);

	expect(response?.status).toBe(400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test worker/api.test.ts`
Expected: FAIL — `./api` does not resolve.

- [ ] **Step 3: Write the handler**

Create `worker/api.ts`:

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

const json = (value: unknown, status = 200): Response =>
	new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});

const empty = (): Response => new Response(null, { status: 204 });

const problem = (status: number, detail: string): Response =>
	json({ error: detail }, status);

async function body<T>(request: Request): Promise<T | null> {
	try {
		return (await request.json()) as T;
	} catch {
		return null;
	}
}

/**
 * The `/api/*` surface, as repository calls.
 *
 * Returns `null` — not a 404 — when the path is not under `/api/`, so the caller can fall
 * through to the static assets binding. Every path segment is decoded, because a card id may
 * contain characters that have to travel percent-encoded.
 */
export async function handleApi(
	request: Request,
	repo: Repository,
): Promise<Response | null> {
	const url = new URL(request.url);
	if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") return null;

	const segments = url.pathname
		.split("/")
		.filter((segment) => segment.length > 0)
		.map((segment) => decodeURIComponent(segment));

	// segments[0] is "api".
	if (segments[1] !== "cards") return problem(404, "No such resource.");

	const method = request.method.toUpperCase();
	const cardId = segments[2];
	const collection = segments[3];
	const member = segments[4];

	if (cardId === undefined) {
		if (method !== "GET") return problem(405, "Method not allowed.");
		return json(await repo.listCards());
	}

	if (collection === undefined) {
		switch (method) {
			case "GET": {
				const card = await repo.getCard(cardId);
				return card ? json(card) : problem(404, "No such card.");
			}
			case "PUT": {
				const card = await body<Card>(request);
				if (!card) return problem(400, "Body is not JSON.");
				await repo.saveCard(card);
				return empty();
			}
			case "DELETE": {
				await repo.deleteCard(cardId);
				return empty();
			}
			default:
				return problem(405, "Method not allowed.");
		}
	}

	if (collection === "purchases") {
		if (member === undefined) {
			switch (method) {
				case "GET": {
					const from = url.searchParams.get("from") ?? undefined;
					const to = url.searchParams.get("to") ?? undefined;
					return json(await repo.listPurchases(cardId, from, to));
				}
				case "POST": {
					const purchase = await body<Purchase>(request);
					if (!purchase) return problem(400, "Body is not JSON.");
					await repo.savePurchase(purchase);
					return empty();
				}
				default:
					return problem(405, "Method not allowed.");
			}
		}
		if (method !== "DELETE") return problem(405, "Method not allowed.");
		await repo.deletePurchase(cardId, member);
		return empty();
	}

	if (collection === "payments") {
		if (member === undefined) {
			if (method !== "GET") return problem(405, "Method not allowed.");
			return json(await repo.listPayments(cardId));
		}
		switch (method) {
			case "PUT": {
				const payment = await body<StatementPayment>(request);
				if (!payment) return problem(400, "Body is not JSON.");
				await repo.savePayment(payment);
				return empty();
			}
			case "DELETE": {
				await repo.deletePayment(cardId, member);
				return empty();
			}
			default:
				return problem(405, "Method not allowed.");
		}
	}

	return problem(404, "No such resource.");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test worker/api.test.ts`
Expected: PASS, 6 tests.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/api.ts worker/api.test.ts
git commit -m "feat: add the Worker's /api surface over the repository"
```

---

### Task 3: `HttpRepository`, proven against the same contract

**Files:**
- Create: `src/lib/storage/http.ts`
- Test: `src/lib/storage/http.test.ts`

**Interfaces:**
- Consumes: `Repository`, `StorageError`; `handleApi` and the KV fake, in tests only.
- Produces: `class HttpRepository implements Repository`, constructed as `new HttpRepository(baseUrl?, fetcher?)` — both parameters exist so the test can point it at `handleApi` without a network.

Running `repositoryContract` against `HttpRepository` wired to the real `handleApi` over a real `KvRepository` is what proves the browser and the Worker agree — including the cascade and prefix-collision cases.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/http.test.ts`:

```ts
import { expect, test } from "bun:test";
import { repositoryContract } from "#lib/storage/contract";
import { HttpRepository } from "#lib/storage/http";
import { handleApi } from "../../../worker/api";
import { FakeKv } from "../../../worker/fake-kv";
import { KvRepository } from "../../../worker/kv";

/** Sends the request straight to the Worker's handler: same code path, no network. */
const shim = () => {
	const repo = new KvRepository(new FakeKv());
	return async (request: Request): Promise<Response> => {
		const response = await handleApi(request, repo);
		return response ?? new Response(null, { status: 404 });
	};
};

repositoryContract(
	"http",
	() => new HttpRepository("https://example.com", shim()),
);

test("turns a failed request into a StorageError naming the status", async () => {
	const repo = new HttpRepository(
		"https://example.com",
		async () => new Response("nope", { status: 500 }),
	);

	expect(repo.listCards()).rejects.toThrow("500");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/storage/http.test.ts`
Expected: FAIL — `#lib/storage/http` does not resolve.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/http.ts`:

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import { type Repository, StorageError } from "#lib/storage/repository";

type Fetcher = (request: Request) => Promise<Response>;

const defaultFetcher: Fetcher = (request) => fetch(request);

/**
 * Phase 2's browser-side store: the same `Repository` the pages already use, over `/api`.
 *
 * `baseUrl` and `fetcher` are injectable so the contract suite can run this against the
 * Worker's own handler, which is the only way to prove the two halves agree.
 */
export class HttpRepository implements Repository {
	constructor(
		private readonly baseUrl = "",
		private readonly fetcher: Fetcher = defaultFetcher,
	) {}

	private url(path: string, query?: Record<string, string | undefined>): string {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined) search.set(key, value);
		}
		const suffix = search.size > 0 ? `?${search.toString()}` : "";
		return `${this.baseUrl}${path}${suffix}`;
	}

	private async send(
		method: string,
		path: string,
		options: { query?: Record<string, string | undefined>; body?: unknown } = {},
	): Promise<Response> {
		const request = new Request(this.url(path, options.query), {
			method,
			...(options.body === undefined
				? {}
				: {
						body: JSON.stringify(options.body),
						headers: { "content-type": "application/json" },
					}),
		});

		let response: Response;
		try {
			response = await this.fetcher(request);
		} catch (cause) {
			throw new StorageError(`Could not reach ${method} ${path}.`, { cause });
		}
		// 404 is a legitimate "not found" for a single card; every caller of `send` that can
		// see one handles it before this point.
		if (!response.ok) {
			throw new StorageError(
				`${method} ${path} failed with status ${response.status}.`,
			);
		}
		return response;
	}

	private async readJson<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
		const response = await this.send("GET", path, { query });
		return (await response.json()) as T;
	}

	private card(id: string): string {
		return `/api/cards/${encodeURIComponent(id)}`;
	}

	async listCards(): Promise<Card[]> {
		return this.readJson<Card[]>("/api/cards");
	}

	async getCard(id: string): Promise<Card | null> {
		const request = new Request(this.url(this.card(id)), { method: "GET" });
		const response = await this.fetcher(request);
		if (response.status === 404) return null;
		if (!response.ok) {
			throw new StorageError(
				`GET ${this.card(id)} failed with status ${response.status}.`,
			);
		}
		return (await response.json()) as Card;
	}

	async saveCard(card: Card): Promise<void> {
		await this.send("PUT", this.card(card.id), { body: card });
	}

	async deleteCard(id: string): Promise<void> {
		await this.send("DELETE", this.card(id));
	}

	async listPurchases(
		cardId: string,
		from?: string,
		to?: string,
	): Promise<Purchase[]> {
		return this.readJson<Purchase[]>(`${this.card(cardId)}/purchases`, {
			from,
			to,
		});
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		await this.send("POST", `${this.card(purchase.cardId)}/purchases`, {
			body: purchase,
		});
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		await this.send(
			"DELETE",
			`${this.card(cardId)}/purchases/${encodeURIComponent(id)}`,
		);
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return this.readJson<StatementPayment[]>(`${this.card(cardId)}/payments`);
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		await this.send(
			"PUT",
			`${this.card(payment.cardId)}/payments/${encodeURIComponent(payment.period)}`,
			{ body: payment },
		);
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		await this.send(
			"DELETE",
			`${this.card(cardId)}/payments/${encodeURIComponent(period)}`,
		);
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/storage/http.test.ts`
Expected: PASS — the full contract suite against the Worker's own handler, plus the failure test.

If the contract's "returned objects are copies, not live references" test fails, the cause is a shared object rather than a serialised one; JSON round-tripping satisfies it, so check the shim is not short-circuiting.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/http.ts src/lib/storage/http.test.ts
git commit -m "feat: implement the repository over the /api surface"
```

---

### Task 4: Wire it together and deploy-ready

**Files:**
- Create: `worker/index.ts`, `wrangler.toml`
- Modify: `src/lib/storage/index.ts`, `package.json`
- Test: `src/lib/storage/index.test.ts`

**Interfaces:**
- Consumes: `HttpRepository` from Task 3; `handleApi`, `KvRepository`, `Env` from Tasks 1 and 2.
- Produces: `createRepository` returns an `HttpRepository` when `BUN_PUBLIC_CC_STORAGE` is `"http"`, and the Worker's `default` export.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/storage/index.test.ts`:

```ts
test("returns the HTTP repository when the build selects it", () => {
	const original = process.env.BUN_PUBLIC_CC_STORAGE;
	try {
		process.env.BUN_PUBLIC_CC_STORAGE = "http";
		expect(createRepository()).toBeInstanceOf(HttpRepository);
	} finally {
		process.env.BUN_PUBLIC_CC_STORAGE = original;
	}
});

test("returns the localStorage repository by default", () => {
	const original = process.env.BUN_PUBLIC_CC_STORAGE;
	try {
		delete process.env.BUN_PUBLIC_CC_STORAGE;
		expect(createRepository()).toBeInstanceOf(LocalStorageRepository);
	} finally {
		process.env.BUN_PUBLIC_CC_STORAGE = original;
	}
});
```

Add `HttpRepository` to that file's imports.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/storage/index.test.ts`
Expected: FAIL — `createRepository` always returns a `LocalStorageRepository`.

- [ ] **Step 3: Switch on the build-time flag**

In `src/lib/storage/index.ts`:

```ts
import { HttpRepository } from "#lib/storage/http";
```

```ts
/**
 * The one place the two stores differ. `@kctools/bun-server` passes `env: "BUN_PUBLIC_*"` to
 * `Bun.build`, so this comparison is substituted at build time and the unused implementation
 * is dropped from the bundle.
 */
export function createRepository(
	storage: Storage | undefined = globalThis.localStorage,
): Repository {
	if (process.env.BUN_PUBLIC_CC_STORAGE === "http") return new HttpRepository();
	if (!storage) throw new StorageUnavailableError();
	assertUsable(storage);
	return new LocalStorageRepository(storage);
}
```

and add it to the re-exports at the bottom:

```ts
export { HttpRepository } from "#lib/storage/http";
```

- [ ] **Step 4: Write the Worker entry**

Create `worker/index.ts`:

```ts
import { handleApi } from "./api";
import type { Env } from "./bindings";
import { KvRepository } from "./kv";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const response = await handleApi(request, new KvRepository(env.CC_KV));
		// `handleApi` returns null for anything outside /api/, which is every page and asset.
		return response ?? env.ASSETS.fetch(request);
	},
};
```

- [ ] **Step 5: Write the Wrangler configuration**

Create `wrangler.toml`:

```toml
name = "cc-tracking"
main = "worker/index.ts"
compatibility_date = "2026-09-21"

[assets]
directory = "./dist"
binding = "ASSETS"
# The build emits index.html, cards.html, and card.html, so /cards must resolve to
# cards.html. This is a three-page static site, not a single-page application.
html_handling = "auto-trailing-slash"
not_found_handling = "none"

[[kv_namespaces]]
binding = "CC_KV"
# Replace with the id printed by: bunx wrangler kv namespace create cc-tracking
id = "REPLACE_WITH_NAMESPACE_ID"
```

- [ ] **Step 6: Add the scripts**

In `package.json`, alongside the existing scripts:

```json
		"build:cf": "BUN_PUBLIC_CC_STORAGE=http bun-server build",
		"cf:dev": "bun run build:cf && wrangler dev",
		"deploy": "bun run build:cf && wrangler deploy",
```

`bun run build` keeps building the localStorage version, so nothing about local development changes.

- [ ] **Step 7: Verify the flag actually reaches the bundle**

Run: `bun run build:cf`
Then: `grep -rl "api/cards" dist/*.js`

Expected: at least one chunk matches, and `grep -rl "cc:card:" dist/*.js` matches nothing — the localStorage implementation was dropped.

If both appear, the substitution did not happen. Do not proceed with a runtime workaround silently: stop, and report that `env: "BUN_PUBLIC_*"` did not inline the value, so the selection mechanism needs rethinking.

Run: `bun run build` and confirm the reverse — `cc:card:` present, `api/cards` absent.

- [ ] **Step 8: Run the gates**

Run: `bun run typecheck && bun test && bun run check`
Expected: PASS on all three.

- [ ] **Step 9: Commit**

```bash
git add worker/index.ts wrangler.toml package.json src/lib/storage/index.ts src/lib/storage/index.test.ts
git commit -m "feat: serve the app and its API from a Cloudflare Worker"
```

---

### Task 5: The deployment runbook

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

The commands below are run by the repository owner against their own Cloudflare account. Do not run them as part of implementation, and do not invent a namespace id.

- [ ] **Step 1: Write the deployment section**

Add to `README.md`:

````markdown
## Deploying

The app runs as a Cloudflare Worker named `cc-tracking`: the Worker serves the static
build through its assets binding and handles `/api/*` against a KV namespace. The
browser build talks to that API instead of `localStorage` when
`BUN_PUBLIC_CC_STORAGE=http`, which the `deploy` script sets.

First time only:

```bash
bunx wrangler login
bunx wrangler kv namespace create cc-tracking
# Copy the printed id into the [[kv_namespaces]] block in wrangler.toml
```

Then, to deploy:

```bash
bun run deploy        # builds with the HTTP repository, then wrangler deploy
```

To run the Worker locally against a local KV:

```bash
bun run cf:dev
```

Access is handled by Cloudflare Access in front of the whole Worker, including `/api/*`
— configure it in the Cloudflare dashboard, not in this repository. There is no
authentication code here, and the Worker trusts whatever reaches it.

Two KV behaviours are accepted deliberately: writes are eventually consistent within
seconds, so two devices editing at the same moment can overwrite each other; and prefix
listing pages at 1000 keys, which the repository handles by following the cursor.

Data written by the Worker and data written by the browser build use the same key shapes
— `card:<id>`, `purchase:<cardId>:<date>:<uuid>`, `payment:<cardId>:<period>`, with each
segment percent-encoded — apart from the `cc:` prefix that only `localStorage` uses. A
backup exported from one imports into the other unchanged.
````

- [ ] **Step 2: Final gates**

Run: `bun run typecheck && bun test && bun run check && bun run build && bun run build:cf`
Expected: PASS on all five.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe deploying to the Cloudflare Worker"
```

---

## Done when

- `KvRepository` and `HttpRepository` both pass `repositoryContract`, the suite `local` and `memory` already pass.
- `HttpRepository` is tested against the Worker's own `handleApi`, so the two halves are proven to agree rather than assumed to.
- A prefix scan never takes a neighbouring card's records with it, and a `list` longer than one page is read whole.
- `bun run build` produces the localStorage build; `bun run build:cf` produces the API build, verified by what is and is not in `dist/`.
- `wrangler.toml` is complete apart from the namespace id, and the README says exactly which command produces it.
- `bun run typecheck`, `bun test`, and `bun run check` all pass.

## Left for the owner to run

- `bunx wrangler login`
- `bunx wrangler kv namespace create cc-tracking`, then pasting the id into `wrangler.toml`
- `bun run deploy`
- Adding the Cloudflare Access policy in the dashboard
