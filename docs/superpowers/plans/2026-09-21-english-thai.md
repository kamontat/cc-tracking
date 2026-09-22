# English and Thai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every word the application shows is available in English and Thai, switchable from the nav without a reload and remembered across visits.

**Architecture:** A hand-written catalog — `en.ts` defines the key set, `th.ts` is typed as `Record<MessageKey, string>` so a missing key fails the typechecker. A module-level locale store resolves the language once (saved choice, then browser language, then Thai) and notifies subscribers on change; Lit components subscribe through a small `LocaleController`, and the three routes re-run their existing `paint()`. Error messages thrown far from the interface — backup validation, storage failures — carry a `MessageError` with a key rather than a finished English sentence, and are translated at the one place that renders them.

**Tech Stack:** Bun 1.4.2, TypeScript, Lit 3.3.3 (`ReactiveController`), `bun test` with `@happy-dom/global-registrator`.

**Spec:** `docs/superpowers/specs/2026-09-21-location-i18n-cloudflare-design.md`

**Depends on:** `docs/superpowers/plans/2026-09-21-location-choices.md` must be complete. This plan assumes `Card.location` is a `Location` and that `locationLabel` exists to be replaced by a catalog lookup.

## Corrections During Execution

This plan was written before implementation, and several of its own instructions turned out
to be wrong once code met reality. Recorded here so a future reader — or anyone re-running
this plan — does not have to rediscover them:

- **Test environment.** happy-dom hardcodes `navigator.languages` to `["en-US", "en"]`, so an
  unstubbed `getLocale()` always resolves to `"en"` in tests, never `"th"`. Task 1's own test
  ("the resolved locale survives a storage that throws") called the unstubbed `getLocale()`
  and asserted `"th"`, which contradicts that default and would fail as written. The test now
  explicitly stubs `navigator.languages` to `[]` for the duration of that one test, so the
  assertion exercises the storage-throwing path in isolation from browser-language detection.
- **Locale reset belongs in the preload, not per file.** `tests/setup-happydom.ts` (wired via
  `bunfig.toml`'s `[test] preload`) carries a global `beforeEach` that calls `resetLocale()`
  and clears `localStorage` once for the whole suite. The plan's per-file `beforeEach` blocks
  shown in Tasks 1-7 were redundant boilerplate and were removed except where a file needs a
  stronger reset than the preload's -- this was not done everywhere: `src/lib/i18n/index.test.ts:13-16`
  still carries one that merely duplicates the preload, and `src/components/cc-lang-switch.test.ts:4-8`
  still carries one that goes further, also forcing a starting locale (`setLocale("en")`) the
  preload's re-detection alone does not guarantee.
- **Register `LocaleController` in a constructor, not a field.** The plan's
  `private readonly locale = new LocaleController(this);` produces a field nothing reads,
  which both `tsc` (`noUnusedLocals`) and Biome flag, needing two suppression comments whose
  order was silently load-bearing — Biome's autofix deleted the field outright when they were
  ordered wrongly. `constructor() { super(); new LocaleController(this); }` needs neither and
  is what every component and `cc-lang-switch` actually use.
- **`locationText` (the plan's `locationLabel`) had five call sites, not three.** Task 6 names
  `cc-card-table`, `cc-due-list`, and `cc-location-groups`; it also lives in `cc-card-form.ts`
  (the location `<select>`'s options) and `routes/card.ts` (the summary line under the card
  heading).
- **Task 5 had to convert the routes' error call sites.** The plan left the 3 `fallbackMessage`
  sites and 10 `guard` sites in `src/routes/*.ts` for Task 7, but Task 5 changes
  `createPageState`'s and `guard`'s signatures from a string to a `MessageKey`, so the repo
  would not compile between Task 5's commit and Task 7's without converting those call sites
  early.
- **The dashboard confirmation is re-rendered, not cleared.** The plan's Task 7 said to clear
  `answer` to `""` on a language change. It instead stores the source data
  (`confirmedPurchase: { card, period } | null`) and rebuilds the sentence *and* both dates
  inside `paint()`, consistent with how every other string on the page works, so switching
  language mid-confirmation shows the same fact in the new language instead of erasing it.
- **`applyChrome` moved into `bootstrap`.** The plan's Task 7 called `applyChrome` from inside
  each route's `bootstrap` render callback. That callback never runs when storage is
  unavailable, which would leave a translated error banner sitting inside an untranslated
  English page frame. `applyChrome` now runs at the top of `bootstrap` itself, before the
  storage check, so the title and nav are correct in every case, including that one.
- **`cc-lang-switch` dropped the plan's `<label>` wrapper.** Task 2's snippet wraps the
  `<select>` in a `<label>` holding a `class="visually-hidden"` span, relying on `aria-label`
  on the `<select>` too. The implementation keeps only the `aria-label` and drops the `<label>`
  and the span, because `visually-hidden` is not a class this codebase's CSS defines anywhere
  -- it would have rendered as plain visible text next to the picker, not hidden anything. The
  `aria-label` alone gives the same accessible name without a class the app has no styles for.
- **Task 8 Step 3 (the Thai copy review) is pending the repository owner**, not yet done as of
  this plan update. The terms flagged in Task 1 Step 5 -- `statement`, `billing cycle`,
  `close date`, `due date`, the `backup.problem.*` fragments -- are now marked with comments
  in `src/lib/i18n/th.ts` at their first appearance, including one concrete collision a review
  found: `backup.problem.noCycle` and `backup.problem.missingPeriod` render identical Thai
  text ("ไม่มีรอบบิล") for two different English problems. No wording has been changed pending
  that review.

## Global Constraints

- Bun only. `bun test`, `bun run`, `bun install`, `bunx`. Never npm, node, jest, vitest, or ts-node.
- Two locales, exactly: `"en"` and `"th"`. Thai is the fallback when nothing else decides.
- **Never `Intl`.** Locale data is not needed and `th-TH` would default to the Buddhist calendar, which this app must not use.
- Dates display as `dd MMM yyyy` with a **zero-padded day** and a **Gregorian year**: `05 Sep 2026`, `05 ก.ย. 2026`. Never `2569`.
- Money is never translated. `formatAmount` produces `฿1,234.56` in both languages and `src/lib/domain/money.ts` is not touched by this plan.
- User-entered text — card names, comments, purchase notes — is never translated.
- `src/lib/domain/**` may import **types only** from `#lib/i18n/*`. It must not call `t` or read the locale store; the locale arrives as a parameter.
- Every user-visible string lives in the catalog. A string literal in a component or route that a user can read is a bug.
- Commit after every task, using Conventional Commit prefixes (`feat:`, `test:`, `refactor:`, `docs:`).
- `bun run typecheck` and `bun test` must both pass at every commit.
- This plan covers **phase B only**. The Cloudflare Worker gets its own plan; do not start it here.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/i18n/catalog.ts` | **New.** `MessageKey`, `Catalog`, `Locale`, `Params` types. |
| `src/lib/i18n/en.ts` | **New.** The English catalog — the source of truth for the key set. |
| `src/lib/i18n/th.ts` | **New.** The Thai catalog, typed so a missing key fails to compile. |
| `src/lib/i18n/index.ts` | **New.** `detectLocale`, `getLocale`, `setLocale`, `subscribe`, `t`, `resetLocale`. |
| `src/lib/i18n/error.ts` | **New.** `MessageError` — a failure that names a key instead of a sentence. |
| `src/lib/i18n/controller.ts` | **New.** `LocaleController`, the Lit `ReactiveController` that re-renders on a switch. |
| `src/lib/i18n/format.ts` | **New.** `describeCycleText` — the cycle rule as a sentence in the current language. |
| `src/components/cc-lang-switch.ts` | **New.** The nav's language picker. |
| `src/lib/domain/date.ts` | `displayDate(date, locale)` — padded day, per-locale month names. |
| `src/lib/domain/cycle.ts` | `describeCycle` returns a key and parameters instead of English. |
| `src/lib/ui/page-state.ts` | Translates failures, including `MessageError`, at the single point they are rendered. |
| `src/lib/ui/page.ts` | Applies `document.documentElement.lang` and translates the startup failure. |
| `src/lib/storage/index.ts` | `StorageUnavailableError` carries a key. |
| `src/lib/storage/transfer.ts` | Validation problems are keys and parameters, not sentences. |
| `src/components/*.ts` | Every literal becomes `t(...)`; each installs `LocaleController`. |
| `src/routes/*.ts` | Every literal becomes `t(...)`; each subscribes and repaints. |
| `src/routes/*.html` | Nav, title, and the language picker mount point. |

---

### Task 1: The catalogs and the locale store

**Files:**
- Create: `src/lib/i18n/catalog.ts`, `src/lib/i18n/en.ts`, `src/lib/i18n/th.ts`, `src/lib/i18n/index.ts`
- Test: `src/lib/i18n/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Locale = "en" | "th"`
  - `type MessageKey = keyof typeof en`
  - `type Catalog = Record<MessageKey, string>`
  - `type Params = Record<string, string | number>`
  - `detectLocale(saved: string | null, languages: readonly string[]): Locale`
  - `getLocale(): Locale`
  - `setLocale(locale: Locale): void`
  - `subscribe(listener: () => void): () => void` — returns an unsubscribe function
  - `t(key: MessageKey, params?: Params): string`
  - `resetLocale(): void` — test-only; forgets the resolved locale

Both catalogs land in this task. Splitting them would leave `th.ts` incomplete and the repository unbuildable between commits.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/i18n/index.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { en } from "#lib/i18n/en";
import { th } from "#lib/i18n/th";
import {
	detectLocale,
	getLocale,
	resetLocale,
	setLocale,
	subscribe,
	t,
} from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
});

test("the Thai catalog covers exactly the English key set", () => {
	expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
});

test("no catalog entry is left empty", () => {
	for (const [key, value] of Object.entries(th)) {
		expect(value.length, `th.${key} is empty`).toBeGreaterThan(0);
	}
	for (const [key, value] of Object.entries(en)) {
		expect(value.length, `en.${key} is empty`).toBeGreaterThan(0);
	}
});

test("a saved choice wins over the browser's languages", () => {
	expect(detectLocale("en", ["th-TH"])).toBe("en");
	expect(detectLocale("th", ["en-GB"])).toBe("th");
});

test("an English browser gets English when nothing is saved", () => {
	expect(detectLocale(null, ["en-GB", "th-TH"])).toBe("en");
});

test("everything else falls back to Thai", () => {
	expect(detectLocale(null, ["th-TH"])).toBe("th");
	expect(detectLocale(null, ["ja-JP"])).toBe("th");
	expect(detectLocale(null, [])).toBe("th");
	expect(detectLocale("de", ["ja-JP"])).toBe("th");
});

test("setting a locale persists it and notifies subscribers", () => {
	let notified = 0;
	const unsubscribe = subscribe(() => {
		notified += 1;
	});

	setLocale("en");
	expect(getLocale()).toBe("en");
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("en");
	expect(notified).toBe(1);

	unsubscribe();
	setLocale("th");
	expect(notified).toBe(1);
});

test("the resolved locale survives a storage that throws", () => {
	const original = globalThis.localStorage.getItem;
	try {
		globalThis.localStorage.getItem = () => {
			throw new Error("blocked");
		};
		expect(getLocale()).toBe("th");
	} finally {
		globalThis.localStorage.getItem = original;
	}
});

test("translates a key", () => {
	setLocale("en");
	expect(t("cards.title")).toBe("Cards");
	setLocale("th");
	expect(t("cards.title")).toBe("บัตร");
});

test("substitutes named parameters", () => {
	setLocale("en");
	expect(t("cards.purchaseCount", { count: 3 })).toBe("3 purchases");
	expect(t("cards.edit", { name: "KBank Visa" })).toBe("Edit KBank Visa");
});

test("leaves an unsupplied placeholder alone rather than printing undefined", () => {
	setLocale("en");
	expect(t("cards.edit")).toBe("Edit {name}");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/i18n/index.test.ts`
Expected: FAIL — none of the `#lib/i18n/*` modules resolve.

- [ ] **Step 3: Write the types**

Create `src/lib/i18n/catalog.ts`:

```ts
import type { en } from "#lib/i18n/en";

export type Locale = "en" | "th";

export type MessageKey = keyof typeof en;

/** Every catalog holds exactly the English key set. A missing key is a type error. */
export type Catalog = Record<MessageKey, string>;

export type Params = Record<string, string | number>;
```

- [ ] **Step 4: Write the English catalog**

Create `src/lib/i18n/en.ts`. This file defines the key set; every other catalog follows it.

```ts
export const en = {
	"nav.brand": "cc-tracking",
	"nav.dashboard": "Dashboard",
	"nav.cards": "Cards",
	"title.dashboard": "Dashboard — cc-tracking",
	"title.cards": "Card registry — cc-tracking",
	"title.card": "Card — cc-tracking",
	"lang.label": "Language",
	"lang.en": "English",
	"lang.th": "ไทย",

	"common.reload": "Reload",
	"common.retry": "Try again",
	"common.cancel": "Cancel",
	"common.edit": "Edit",
	"common.delete": "Delete",
	"common.dismiss": "Dismiss",
	"common.none": "—",

	"location.bangkok": "Bangkok",
	"location.phichit": "Phichit",
	"location.krabi": "Krabi",

	"dashboard.title": "Dashboard",
	"dashboard.dueNext": "Due next",
	"dashboard.addPurchase": "Add a purchase",
	"dashboard.answer": "Lands on the statement closing {close} — pay by {due}.",
	"dashboard.error.read": "Could not read your cards.",
	"dashboard.error.markPaid": "Could not record the payment.",
	"dashboard.error.addPurchase": "Could not save the purchase.",

	"due.empty": "No cards yet.",
	"due.emptyAction": "Add one on the Cards page.",
	"due.column.card": "Card",
	"due.column.where": "Where",
	"due.column.closes": "Closes",
	"due.column.due": "Due",
	"due.column.total": "Total",
	"due.overdue": "{days} days overdue",
	"due.today": "due today",
	"due.inDays": "in {days} days",
	"due.stillOpen": "still open",
	"due.markPaid": "Mark paid",

	"groups.title": "Cards by location",
	"groups.nextDue": "Next due {date}",

	"quickAdd.card": "Card",
	"quickAdd.date": "Date",
	"quickAdd.amount": "Amount (THB)",
	"quickAdd.amountPlaceholder": "1234.56",
	"quickAdd.note": "Note",
	"quickAdd.notePlaceholder": "office supplies",
	"quickAdd.submit": "Add purchase",
	"quickAdd.error.noCard": "Choose a card first.",
	"quickAdd.error.badDate": "That date does not exist. Use YYYY-MM-DD.",
	"quickAdd.error.futureDate":
		"That date is in the future. A credit-card purchase cannot be dated ahead.",
	"quickAdd.error.badAmount": "Enter the amount in baht, like 1234.56.",

	"cards.title": "Cards",
	"cards.add": "Add a card",
	"cards.edit": "Edit {name}",
	"cards.empty": "No cards yet. Add the first one with the form above.",
	"cards.column.id": "Id",
	"cards.column.name": "Name",
	"cards.column.last4": "Last 4",
	"cards.column.location": "Location",
	"cards.column.cycle": "Cycle",
	"cards.column.comment": "Comment",
	"cards.archived": "(archived)",
	"cards.archive": "Archive",
	"cards.unarchive": "Unarchive",
	"cards.purchaseCount": "{count} purchases",
	"cards.backup": "Backup",
	"cards.backupWarning":
		"Data lives in this browser only. Export regularly; clearing site data erases everything.",
	"cards.export": "Export JSON",
	"cards.import": "Import JSON",
	"cards.locationReset":
		"These cards were kept somewhere this app no longer recognises, so their location was set to Bangkok: {names}. Edit each one to pick the right place.",
	"cards.error.read": "Could not read the card list.",
	"cards.error.save": "Could not save the card.",
	"cards.error.delete": "Could not delete the card.",
	"cards.error.archive": "Could not archive the card.",
	"cards.error.export": "Could not export a backup.",
	"cards.error.import": "Could not import that backup.",
	"cards.error.duplicateId":
		'A card with id "{id}" already exists. Card ids must be unique.',

	"form.id": "Id",
	"form.idImmutable": "(cannot change)",
	"form.idPlaceholder": "kbank-visa",
	"form.name": "Name",
	"form.last4": "Last 4",
	"form.location": "Location",
	"form.cycle": "Billing cycle",
	"form.cycleOffset": "Due a number of days after closing",
	"form.cycleFixed": "Due on a fixed day of the month",
	"form.closeDay": "Closing day",
	"form.dueOffsetDays": "Days until due",
	"form.dueDay": "Due day",
	"form.comment": "Comment",
	"form.save": "Save changes",
	"form.add": "Add card",
	"form.error.id": "Give the card an id you will recognise.",
	"form.error.name": "Give the card a name.",
	"form.error.last4": "Last 4 must be exactly four digits.",
	"form.error.location": "Choose where the card is kept.",
	"form.error.closeDay": "Closing day must be between 1 and 31.",
	"form.error.dueOffsetDays": "Days until due must be between 1 and 60.",
	"form.error.dueDay": "Due day must be between 1 and 31.",

	"card.showOlder": "Show older statements",
	"card.back": "Back to cards",
	"card.error.noSelection": "No card was selected.",
	"card.error.notFound": "No card with the id {id}.",
	"card.error.read": "Could not read this card.",
	"card.error.markPaid": "Could not record the payment.",
	"card.error.unmarkPaid": "Could not undo the payment.",
	"card.error.deletePurchase": "Could not delete the purchase.",

	"statements.empty": "No statements yet. Add a purchase from the dashboard.",
	"statements.header": "closes {close}, due {due}",
	"statements.paid": "Paid {date}",
	"statements.unmark": "Unmark",
	"statements.markPaid": "Mark paid",
	"statements.noPurchases": "No purchases in this period.",
	"statements.total": "Total {amount}",

	"cycle.offset": "closes {closeDay}, due {days} days later",
	"cycle.fixed": "closes {closeDay}, due on the {dueDay}",

	"storage.unavailable":
		"This browser is not letting the page store data. Private windows and blocked site data both cause this.",
	"startup.failed": "Something went wrong starting the page.",

	"backup.unreadable": "That file is not a readable backup.",
	"backup.version":
		"That backup is version {found}, and this app reads version {expected}.",
	"backup.card": "That backup's card #{index} {problem}.",
	"backup.purchase": "That backup's purchase #{index} {problem}.",
	"backup.payment": "That backup's payment #{index} {problem}.",
	"backup.problem.notObject": "is not an object",
	"backup.problem.missingId": "is missing an id",
	"backup.problem.missingName": "is missing a name",
	"backup.problem.missingLast4": "is missing last4",
	"backup.problem.badLocation":
		"has a location that is not bangkok, phichit, or krabi",
	"backup.problem.noCycle": "has no cycle",
	"backup.problem.badOffsetCycle":
		"has an offset cycle with a non-integer day field",
	"backup.problem.badFixedCycle":
		"has a fixed cycle with a non-integer day field",
	"backup.problem.badCycleKind":
		'has a cycle whose kind is neither "offset" nor "fixed"',
	"backup.problem.missingCardId": "is missing a cardId",
	"backup.problem.badDate": "has an invalid date",
	"backup.problem.badAmount": "has a non-integer amount",
	"backup.problem.missingPeriod": "is missing a period",
	"backup.problem.badPaidAt": "has an invalid paidAt date",
	"backup.problem.badCloseDate": "has an invalid closeDate",
	"backup.problem.badDueDate": "has an invalid dueDate",
} as const;
```

- [ ] **Step 5: Write the Thai catalog**

Create `src/lib/i18n/th.ts`. Typing it as `Catalog` is what makes a forgotten key a compile error rather than a blank space on the page.

```ts
import type { Catalog } from "#lib/i18n/catalog";

export const th: Catalog = {
	"nav.brand": "cc-tracking",
	"nav.dashboard": "หน้ารวม",
	"nav.cards": "บัตร",
	"title.dashboard": "หน้ารวม — cc-tracking",
	"title.cards": "ทะเบียนบัตร — cc-tracking",
	"title.card": "บัตร — cc-tracking",
	"lang.label": "ภาษา",
	"lang.en": "English",
	"lang.th": "ไทย",

	"common.reload": "โหลดใหม่",
	"common.retry": "ลองอีกครั้ง",
	"common.cancel": "ยกเลิก",
	"common.edit": "แก้ไข",
	"common.delete": "ลบ",
	"common.dismiss": "ปิด",
	"common.none": "—",

	"location.bangkok": "กรุงเทพฯ",
	"location.phichit": "พิจิตร",
	"location.krabi": "กระบี่",

	"dashboard.title": "หน้ารวม",
	"dashboard.dueNext": "ครบกำหนดถัดไป",
	"dashboard.addPurchase": "เพิ่มรายการใช้จ่าย",
	"dashboard.answer": "อยู่ในใบแจ้งยอดที่ปิดยอดวันที่ {close} — ชำระภายใน {due}",
	"dashboard.error.read": "อ่านข้อมูลบัตรไม่สำเร็จ",
	"dashboard.error.markPaid": "บันทึกการชำระเงินไม่สำเร็จ",
	"dashboard.error.addPurchase": "บันทึกรายการใช้จ่ายไม่สำเร็จ",

	"due.empty": "ยังไม่มีบัตร",
	"due.emptyAction": "เพิ่มบัตรได้ที่หน้าบัตร",
	"due.column.card": "บัตร",
	"due.column.where": "ที่เก็บ",
	"due.column.closes": "ปิดยอด",
	"due.column.due": "ครบกำหนด",
	"due.column.total": "รวม",
	"due.overdue": "เกินกำหนด {days} วัน",
	"due.today": "ครบกำหนดวันนี้",
	"due.inDays": "อีก {days} วัน",
	"due.stillOpen": "ยังไม่ปิดยอด",
	"due.markPaid": "บันทึกว่าชำระแล้ว",

	"groups.title": "บัตรแยกตามที่เก็บ",
	"groups.nextDue": "ครบกำหนดถัดไป {date}",

	"quickAdd.card": "บัตร",
	"quickAdd.date": "วันที่",
	"quickAdd.amount": "จำนวนเงิน (บาท)",
	"quickAdd.amountPlaceholder": "1234.56",
	"quickAdd.note": "หมายเหตุ",
	"quickAdd.notePlaceholder": "เครื่องเขียนสำนักงาน",
	"quickAdd.submit": "เพิ่มรายการ",
	"quickAdd.error.noCard": "เลือกบัตรก่อน",
	"quickAdd.error.badDate": "ไม่มีวันที่นี้ ใช้รูปแบบ YYYY-MM-DD",
	"quickAdd.error.futureDate":
		"วันที่อยู่ในอนาคต รายการบัตรเครดิตลงวันที่ล่วงหน้าไม่ได้",
	"quickAdd.error.badAmount": "กรอกจำนวนเงินเป็นบาท เช่น 1234.56",

	"cards.title": "บัตร",
	"cards.add": "เพิ่มบัตร",
	"cards.edit": "แก้ไข {name}",
	"cards.empty": "ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มด้านบน",
	"cards.column.id": "รหัส",
	"cards.column.name": "ชื่อ",
	"cards.column.last4": "เลข 4 ตัวท้าย",
	"cards.column.location": "ที่เก็บ",
	"cards.column.cycle": "รอบบิล",
	"cards.column.comment": "หมายเหตุ",
	"cards.archived": "(เก็บเข้าคลัง)",
	"cards.archive": "เก็บเข้าคลัง",
	"cards.unarchive": "นำออกจากคลัง",
	"cards.purchaseCount": "{count} รายการ",
	"cards.backup": "สำรองข้อมูล",
	"cards.backupWarning":
		"ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น ส่งออกเป็นประจำ การล้างข้อมูลเว็บไซต์จะลบทั้งหมด",
	"cards.export": "ส่งออก JSON",
	"cards.import": "นำเข้า JSON",
	"cards.locationReset":
		"บัตรเหล่านี้เคยเก็บไว้ในที่ที่แอปไม่รู้จักแล้ว จึงตั้งที่เก็บเป็นกรุงเทพฯ: {names} แก้ไขแต่ละใบเพื่อเลือกที่เก็บที่ถูกต้อง",
	"cards.error.read": "อ่านรายการบัตรไม่สำเร็จ",
	"cards.error.save": "บันทึกบัตรไม่สำเร็จ",
	"cards.error.delete": "ลบบัตรไม่สำเร็จ",
	"cards.error.archive": "เก็บบัตรเข้าคลังไม่สำเร็จ",
	"cards.error.export": "ส่งออกข้อมูลสำรองไม่สำเร็จ",
	"cards.error.import": "นำเข้าข้อมูลสำรองไม่สำเร็จ",
	"cards.error.duplicateId": 'มีบัตรรหัส "{id}" อยู่แล้ว รหัสบัตรต้องไม่ซ้ำกัน',

	"form.id": "รหัส",
	"form.idImmutable": "(เปลี่ยนไม่ได้)",
	"form.idPlaceholder": "kbank-visa",
	"form.name": "ชื่อ",
	"form.last4": "เลข 4 ตัวท้าย",
	"form.location": "ที่เก็บ",
	"form.cycle": "รอบบิล",
	"form.cycleOffset": "ครบกำหนดหลังปิดยอดกี่วัน",
	"form.cycleFixed": "ครบกำหนดวันที่แน่นอนของเดือน",
	"form.closeDay": "วันปิดยอด",
	"form.dueOffsetDays": "จำนวนวันจนครบกำหนด",
	"form.dueDay": "วันครบกำหนด",
	"form.comment": "หมายเหตุ",
	"form.save": "บันทึกการแก้ไข",
	"form.add": "เพิ่มบัตร",
	"form.error.id": "ตั้งรหัสบัตรที่จำได้",
	"form.error.name": "ตั้งชื่อบัตร",
	"form.error.last4": "เลข 4 ตัวท้ายต้องเป็นตัวเลขสี่หลัก",
	"form.error.location": "เลือกที่เก็บบัตร",
	"form.error.closeDay": "วันปิดยอดต้องอยู่ระหว่าง 1 ถึง 31",
	"form.error.dueOffsetDays": "จำนวนวันจนครบกำหนดต้องอยู่ระหว่าง 1 ถึง 60",
	"form.error.dueDay": "วันครบกำหนดต้องอยู่ระหว่าง 1 ถึง 31",

	"card.showOlder": "ดูใบแจ้งยอดเก่ากว่านี้",
	"card.back": "กลับไปหน้าบัตร",
	"card.error.noSelection": "ยังไม่ได้เลือกบัตร",
	"card.error.notFound": "ไม่พบบัตรรหัส {id}",
	"card.error.read": "อ่านข้อมูลบัตรนี้ไม่สำเร็จ",
	"card.error.markPaid": "บันทึกการชำระเงินไม่สำเร็จ",
	"card.error.unmarkPaid": "ยกเลิกการชำระเงินไม่สำเร็จ",
	"card.error.deletePurchase": "ลบรายการใช้จ่ายไม่สำเร็จ",

	"statements.empty": "ยังไม่มีใบแจ้งยอด เพิ่มรายการใช้จ่ายจากหน้ารวม",
	"statements.header": "ปิดยอด {close} ครบกำหนด {due}",
	"statements.paid": "ชำระแล้ว {date}",
	"statements.unmark": "ยกเลิกเครื่องหมาย",
	"statements.markPaid": "บันทึกว่าชำระแล้ว",
	"statements.noPurchases": "ไม่มีรายการใช้จ่ายในรอบนี้",
	"statements.total": "รวม {amount}",

	"cycle.offset": "ปิดยอดวันที่ {closeDay} ครบกำหนดอีก {days} วัน",
	"cycle.fixed": "ปิดยอดวันที่ {closeDay} ครบกำหนดวันที่ {dueDay}",

	"storage.unavailable":
		"เบราว์เซอร์นี้ไม่อนุญาตให้หน้าเว็บเก็บข้อมูล หน้าต่างส่วนตัวและการบล็อกข้อมูลเว็บไซต์ทำให้เกิดปัญหานี้",
	"startup.failed": "เริ่มหน้าเว็บไม่สำเร็จ",

	"backup.unreadable": "ไฟล์นี้ไม่ใช่ข้อมูลสำรองที่อ่านได้",
	"backup.version": "ข้อมูลสำรองนี้เป็นเวอร์ชัน {found} แต่แอปอ่านเวอร์ชัน {expected}",
	"backup.card": "บัตรลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.purchase": "รายการใช้จ่ายลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.payment": "การชำระเงินลำดับที่ {index} ในข้อมูลสำรอง {problem}",
	"backup.problem.notObject": "ไม่ใช่ออบเจ็กต์",
	"backup.problem.missingId": "ไม่มีรหัส",
	"backup.problem.missingName": "ไม่มีชื่อ",
	"backup.problem.missingLast4": "ไม่มีเลข 4 ตัวท้าย",
	"backup.problem.badLocation": "มีที่เก็บที่ไม่ใช่ bangkok, phichit หรือ krabi",
	"backup.problem.noCycle": "ไม่มีรอบบิล",
	"backup.problem.badOffsetCycle": "มีรอบบิลแบบ offset ที่ค่าวันไม่ใช่จำนวนเต็ม",
	"backup.problem.badFixedCycle": "มีรอบบิลแบบ fixed ที่ค่าวันไม่ใช่จำนวนเต็ม",
	"backup.problem.badCycleKind": 'มีรอบบิลที่ kind ไม่ใช่ "offset" หรือ "fixed"',
	"backup.problem.missingCardId": "ไม่มี cardId",
	"backup.problem.badDate": "วันที่ไม่ถูกต้อง",
	"backup.problem.badAmount": "จำนวนเงินไม่ใช่จำนวนเต็ม",
	"backup.problem.missingPeriod": "ไม่มีรอบบิล",
	"backup.problem.badPaidAt": "วันที่ paidAt ไม่ถูกต้อง",
	"backup.problem.badCloseDate": "วันที่ closeDate ไม่ถูกต้อง",
	"backup.problem.badDueDate": "วันที่ dueDate ไม่ถูกต้อง",
};
```

**Flag for review after this task lands:** `statement` (ใบแจ้งยอด), `billing cycle` (รอบบิล), `close date` (ปิดยอด), `due date` (ครบกำหนด), and the `backup.card` / `backup.problem.*` pairs, which are assembled into one sentence and so depend on Thai word order matching English. Raise these with the repository owner before the final commit of this plan.

- [ ] **Step 6: Write the locale store**

Create `src/lib/i18n/index.ts`:

```ts
import type { Catalog, Locale, MessageKey, Params } from "#lib/i18n/catalog";
import { en } from "#lib/i18n/en";
import { th } from "#lib/i18n/th";

export type { Catalog, Locale, MessageKey, Params };

const STORAGE_KEY = "cc:lang";

const CATALOGS: Record<Locale, Catalog> = { en, th };

const listeners = new Set<() => void>();

let current: Locale | null = null;

/**
 * Thai is the fallback, not English: the cards are Thai company cards in baht on
 * Asia/Bangkok dates, so Thai is the likely daily language and English is opted into.
 */
export function detectLocale(
	saved: string | null,
	languages: readonly string[],
): Locale {
	if (saved === "en" || saved === "th") return saved;
	return languages.some((language) => language.toLowerCase().startsWith("en"))
		? "en"
		: "th";
}

function readSaved(): string | null {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
	} catch {
		// A blocked or full store must not decide the language for the user.
		return null;
	}
}

export function getLocale(): Locale {
	if (current === null) {
		current = detectLocale(readSaved(), globalThis.navigator?.languages ?? []);
	}
	return current;
}

export function setLocale(locale: Locale): void {
	current = locale;
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, locale);
	} catch (failure) {
		console.error(failure);
	}
	if (typeof document !== "undefined") {
		document.documentElement.lang = locale;
	}
	for (const listener of [...listeners]) listener();
}

/** Returns the function that removes this listener again. */
export function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function t(key: MessageKey, params?: Params): string {
	const template = CATALOGS[getLocale()][key];
	if (!params) return template;
	// An unsupplied placeholder is left as written: a visible {name} is a bug worth seeing,
	// where "undefined" reads like a broken sentence nobody can trace.
	return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
		name in params ? String(params[name]) : whole,
	);
}

/** Tests only: forget the resolved locale so the next read re-detects it. */
export function resetLocale(): void {
	current = null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun test src/lib/i18n/index.test.ts`
Expected: PASS, 10 tests.

Run: `bun run typecheck`
Expected: PASS. A missing Thai key surfaces here, not at runtime.

- [ ] **Step 8: Commit**

```bash
git add src/lib/i18n
git commit -m "feat: add the English and Thai catalogs and the locale store"
```

---

### Task 2: Switching language without a reload

**Files:**
- Create: `src/lib/i18n/controller.ts`, `src/components/cc-lang-switch.ts`
- Test: `src/components/cc-lang-switch.test.ts`

**Interfaces:**
- Consumes: `getLocale`, `setLocale`, `subscribe`, `t` from Task 1.
- Produces:
  - `class LocaleController implements ReactiveController` — constructed as `new LocaleController(this)` in a component's field initialiser
  - `<cc-lang-switch>` — renders the picker, needs no properties

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-lang-switch.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import "#components/cc-lang-switch";
import { getLocale, resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
	setLocale("en");
});

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-lang-switch");
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("offers both languages and shows the current one", async () => {
	const element = await mount();
	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");

	expect(
		[...(select?.options ?? [])].map((option) => option.value),
	).toEqual(["en", "th"]);
	expect(select?.value).toBe("en");
});

test("switching the picker changes the locale and persists it", async () => {
	const element = await mount();
	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");
	if (!select) throw new Error("no select");

	select.value = "th";
	select.dispatchEvent(new Event("change", { bubbles: true }));

	expect(getLocale()).toBe("th");
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("th");
});

test("a subscribed component re-renders when the locale changes elsewhere", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;

	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");
	expect(select?.value).toBe("th");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-lang-switch.test.ts`
Expected: FAIL — `#components/cc-lang-switch` does not resolve.

- [ ] **Step 3: Write the controller**

Create `src/lib/i18n/controller.ts`:

```ts
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { subscribe } from "#lib/i18n/index";

/**
 * Re-renders its host when the language changes.
 *
 * A component reads `t(...)` during `render`, so Lit has no way to know a locale change
 * affects it — nothing the component owns has changed. This closes that gap without
 * reloading the page, which would discard a half-filled form.
 */
export class LocaleController implements ReactiveController {
	private unsubscribe: (() => void) | null = null;

	constructor(private readonly host: ReactiveControllerHost) {
		host.addController(this);
	}

	hostConnected(): void {
		this.unsubscribe = subscribe(() => this.host.requestUpdate());
	}

	hostDisconnected(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}
}
```

- [ ] **Step 4: Write the picker**

Create `src/components/cc-lang-switch.ts`:

```ts
import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { getLocale, setLocale, t } from "#lib/i18n/index";
import type { Locale } from "#lib/i18n/index";

const LOCALES: readonly Locale[] = ["en", "th"];

@customElement("cc-lang-switch")
export class CcLangSwitch extends LitElement {
	private readonly locale = new LocaleController(this);

	private onChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		if (value === "en" || value === "th") setLocale(value);
	}

	override render() {
		const current = getLocale();
		return html`
			<label>
				<span class="visually-hidden">${t("lang.label")}</span>
				<select aria-label=${t("lang.label")} @change=${this.onChange}>
					${LOCALES.map(
						(locale) =>
							html`<option value=${locale} ?selected=${locale === current}>
								${t(locale === "en" ? "lang.en" : "lang.th")}
							</option>`,
					)}
				</select>
			</label>
		`;
	}

	override updated() {
		// Keep the DOM selection in step when the locale changes from somewhere else: an
		// option's `selected` binding sets defaultSelected, which a re-render will not reapply.
		const select = this.renderRoot.querySelector<HTMLSelectElement>("select");
		if (select) select.value = getLocale();
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-lang-switch": CcLangSwitch;
	}
}
```

Referencing `this.locale` is unnecessary at runtime — constructing the controller registers it — but the field must exist for the controller to be created. Biome may flag it as unused; keep it and add `// biome-ignore lint/correctness/noUnusedPrivateClassMembers: constructing the controller is the point` if `bun run check` complains.

- [ ] **Step 5: Put it in the nav on all three pages**

In each of `src/routes/index.html`, `src/routes/cards.html`, and `src/routes/card.html`, give the nav's text nodes ids so the boot code can fill them, and add the picker:

```html
  <nav class="container">
    <ul><li><strong id="nav-brand">cc-tracking</strong></li></ul>
    <ul>
      <li><a href="/" id="nav-dashboard">Dashboard</a></li>
      <li><a href="/cards" id="nav-cards">Cards</a></li>
      <li><cc-lang-switch></cc-lang-switch></li>
    </ul>
  </nav>
```

The English words stay in the HTML as what shows before the module runs; the boot code replaces them.

- [ ] **Step 6: Run the gates**

Run: `bun test src/components/cc-lang-switch.test.ts`
Expected: PASS, 3 tests.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n/controller.ts src/components/cc-lang-switch.ts src/components/cc-lang-switch.test.ts src/routes/*.html
git commit -m "feat: switch between English and Thai from the nav"
```

---

### Task 3: Dates in both languages, with a padded day

**Files:**
- Modify: `src/lib/domain/date.ts:5-17,96-99`
- Test: `src/lib/domain/date.test.ts`
- Modify: every caller of `displayDate` — `src/components/cc-due-list.ts`, `src/components/cc-location-groups.ts`, `src/components/cc-statement-list.ts`, `src/routes/index.ts`

**Interfaces:**
- Consumes: `type Locale` from Task 1.
- Produces: `displayDate(date: PlainDate, locale: Locale): string` — the locale is required, not defaulted, so `date.ts` never reads the locale store and stays free of the i18n runtime.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/domain/date.test.ts`:

```ts
test("renders a date as dd MMM yyyy in English", () => {
	expect(displayDate("2026-09-21", "en")).toBe("21 Sep 2026");
});

test("pads a single-digit day", () => {
	expect(displayDate("2026-09-05", "en")).toBe("05 Sep 2026");
	expect(displayDate("2026-09-05", "th")).toBe("05 ก.ย. 2026");
});

test("renders Thai months with a Gregorian year, never Buddhist Era", () => {
	expect(displayDate("2026-09-21", "th")).toBe("21 ก.ย. 2026");
	expect(displayDate("2026-01-01", "th")).toBe("01 ม.ค. 2026");
	expect(displayDate("2026-12-31", "th")).toBe("31 ธ.ค. 2026");
});
```

Update the existing `displayDate` expectations in that file: each call gains a `"en"` argument, and any single-digit day in an expected string gains its leading zero.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/domain/date.test.ts`
Expected: FAIL — `displayDate` takes one argument and does not pad the day.

- [ ] **Step 3: Write the implementation**

In `src/lib/domain/date.ts`, replace the single `MONTH_NAMES` array with one per locale, and add the type-only import:

```ts
import type { Locale } from "#lib/i18n/catalog";
```

```ts
const MONTH_NAMES: Record<Locale, readonly string[]> = {
	en: [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	],
	th: [
		"ม.ค.",
		"ก.พ.",
		"มี.ค.",
		"เม.ย.",
		"พ.ค.",
		"มิ.ย.",
		"ก.ค.",
		"ส.ค.",
		"ก.ย.",
		"ต.ค.",
		"พ.ย.",
		"ธ.ค.",
	],
};
```

```ts
/**
 * `dd MMM yyyy` with a padded day and a Gregorian year in both languages.
 *
 * `Intl` is deliberately not used: it carries locale data this needs nothing of, and
 * `th-TH` renders Buddhist Era years, which would print 2569 against a bank statement
 * that says 2026.
 */
export function displayDate(date: PlainDate, locale: Locale): string {
	const { year, month, day } = parseDate(date);
	return `${pad(day, 2)} ${MONTH_NAMES[locale][month - 1]} ${year}`;
}
```

The import is type-only, so `src/lib/domain/` gains no runtime dependency on the i18n layer — the locale arrives as an argument.

- [ ] **Step 4: Pass the locale at every call site**

In `src/components/cc-due-list.ts`, `src/components/cc-location-groups.ts`, and `src/components/cc-statement-list.ts`, import `getLocale` and pass it:

```ts
import { getLocale } from "#lib/i18n/index";
```

```ts
${displayDate(statement.closeDate, getLocale())}
```

In `src/routes/index.ts`, the same for the two calls inside the purchase answer.

Task 6 gives these components their `LocaleController`, so reading the locale during render is correct: a switch re-renders them.

- [ ] **Step 5: Run the gates**

Run: `bun test src/lib/domain/date.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun test`
Expected: PASS. Component tests asserting an unpadded date need their expected strings updated — read each failure before changing it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/date.ts src/lib/domain/date.test.ts src/components src/routes
git commit -m "feat: render dates as dd MMM yyyy in English and Thai"
```

---

### Task 4: The cycle rule as a translated sentence

**Files:**
- Modify: `src/lib/domain/cycle.ts:52-57`
- Create: `src/lib/i18n/format.ts`
- Test: `src/lib/domain/cycle.test.ts`, `src/lib/i18n/format.test.ts`
- Modify: `src/components/cc-card-table.ts`, `src/routes/card.ts`

**Interfaces:**
- Consumes: `t`, `getLocale` from Task 1.
- Produces:
  - `describeCycle(rule: CycleRule): CycleDescription` where `type CycleDescription = { key: "cycle.offset"; params: { closeDay: number; days: number } } | { key: "cycle.fixed"; params: { closeDay: number; dueDay: number } }`
  - `describeCycleText(rule: CycleRule): string` in `#lib/i18n/format`

English writes an ordinal — "closes 18th" — and Thai writes a plain number. That difference is presentation, so the ordinal moves out of the domain and into the i18n layer.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describeCycle` tests in `src/lib/domain/cycle.test.ts` with:

```ts
test("describes an offset rule as a key and its parameters", () => {
	expect(
		describeCycle({ kind: "offset", closeDay: 18, dueOffsetDays: 15 }),
	).toEqual({ key: "cycle.offset", params: { closeDay: 18, days: 15 } });
});

test("describes a fixed rule as a key and its parameters", () => {
	expect(describeCycle({ kind: "fixed", closeDay: 18, dueDay: 5 })).toEqual({
		key: "cycle.fixed",
		params: { closeDay: 18, dueDay: 5 },
	});
});
```

Create `src/lib/i18n/format.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { describeCycleText } from "#lib/i18n/format";
import { resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
});

test("writes an English ordinal for the closing day", () => {
	setLocale("en");
	expect(
		describeCycleText({ kind: "offset", closeDay: 18, dueOffsetDays: 15 }),
	).toBe("closes 18th, due 15 days later");
	expect(describeCycleText({ kind: "fixed", closeDay: 1, dueDay: 22 })).toBe(
		"closes 1st, due on the 22nd",
	);
});

test("writes a plain number in Thai, where an ordinal suffix has no meaning", () => {
	setLocale("th");
	expect(
		describeCycleText({ kind: "offset", closeDay: 18, dueOffsetDays: 15 }),
	).toBe("ปิดยอดวันที่ 18 ครบกำหนดอีก 15 วัน");
	expect(describeCycleText({ kind: "fixed", closeDay: 18, dueDay: 5 })).toBe(
		"ปิดยอดวันที่ 18 ครบกำหนดวันที่ 5",
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/domain/cycle.test.ts src/lib/i18n/format.test.ts`
Expected: FAIL — `describeCycle` returns a string, and `#lib/i18n/format` does not resolve.

- [ ] **Step 3: Return a key from the domain**

In `src/lib/domain/cycle.ts`, replace `describeCycle` and delete the now-unused `ordinal` helper (move its body to Task 4 Step 4):

```ts
export type CycleDescription =
	| { key: "cycle.offset"; params: { closeDay: number; days: number } }
	| { key: "cycle.fixed"; params: { closeDay: number; dueDay: number } };

/** The rule as a catalog key and its parameters. Wording is the i18n layer's business. */
export function describeCycle(rule: CycleRule): CycleDescription {
	return rule.kind === "offset"
		? {
				key: "cycle.offset",
				params: { closeDay: rule.closeDay, days: rule.dueOffsetDays },
			}
		: {
				key: "cycle.fixed",
				params: { closeDay: rule.closeDay, dueDay: rule.dueDay },
			};
}
```

- [ ] **Step 4: Write the formatter**

Create `src/lib/i18n/format.ts`:

```ts
import { describeCycle } from "#lib/domain/cycle";
import type { CycleRule } from "#lib/domain/types";
import { getLocale, t } from "#lib/i18n/index";

/** "1st", "2nd", "3rd", "18th". English only — Thai writes the bare number. */
function ordinalEn(day: number): string {
	const lastTwo = day % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

const day = (value: number): string =>
	getLocale() === "en" ? ordinalEn(value) : String(value);

export function describeCycleText(rule: CycleRule): string {
	const description = describeCycle(rule);
	return description.key === "cycle.offset"
		? t("cycle.offset", {
				closeDay: day(description.params.closeDay),
				days: description.params.days,
			})
		: t("cycle.fixed", {
				closeDay: day(description.params.closeDay),
				dueDay: day(description.params.dueDay),
			});
}
```

- [ ] **Step 5: Use it at both call sites**

In `src/components/cc-card-table.ts` and `src/routes/card.ts`, replace the `describeCycle` import with:

```ts
import { describeCycleText } from "#lib/i18n/format";
```

and the call with `describeCycleText(card.cycle)`.

- [ ] **Step 6: Run the gates**

Run: `bun test src/lib/domain/cycle.test.ts src/lib/i18n/format.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/cycle.ts src/lib/domain/cycle.test.ts src/lib/i18n/format.ts src/lib/i18n/format.test.ts src/components/cc-card-table.ts src/routes/card.ts
git commit -m "feat: describe a billing cycle in the reader's language"
```

---

### Task 5: Errors that name a key, not a sentence

**Files:**
- Create: `src/lib/i18n/error.ts`
- Modify: `src/lib/storage/transfer.ts`, `src/lib/storage/index.ts`, `src/lib/ui/page-state.ts`, `src/lib/ui/page.ts`
- Test: `src/lib/storage/transfer.test.ts`, `src/lib/ui/page-state.test.ts` (create if absent)

**Interfaces:**
- Consumes: `t`, `MessageKey`, `Params` from Task 1.
- Produces:
  - `class MessageError extends Error` with `readonly key: MessageKey` and `readonly params?: Params`
  - `messageOf(failure: unknown, fallback: MessageKey): string`
  - `createPageState({ fetch, fallbackKey, paint })` — `fallbackMessage: string` becomes `fallbackKey: MessageKey`
  - `guard(action, messageKey: MessageKey)`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/i18n/error.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { MessageError, messageOf } from "#lib/i18n/error";
import { resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
	setLocale("th");
});

test("translates a MessageError in the current language", () => {
	const failure = new MessageError("cards.error.save");
	expect(messageOf(failure, "cards.error.read")).toBe("บันทึกบัตรไม่สำเร็จ");
	setLocale("en");
	expect(messageOf(failure, "cards.error.read")).toBe("Could not save the card.");
});

test("substitutes a MessageError's parameters", () => {
	setLocale("en");
	const failure = new MessageError("card.error.notFound", { id: "kbank" });
	expect(messageOf(failure, "card.error.read")).toBe("No card with the id kbank.");
});

test("passes an ordinary Error's own message through untouched", () => {
	expect(messageOf(new Error("localStorage is full"), "cards.error.read")).toBe(
		"localStorage is full",
	);
});

test("falls back for anything that is not an Error", () => {
	setLocale("en");
	expect(messageOf("nope", "cards.error.read")).toBe(
		"Could not read the card list.",
	);
});
```

Rewrite the backup-message assertions in `src/lib/storage/transfer.test.ts` to expect a thrown `MessageError` carrying a key, rather than an English sentence:

```ts
test("names which card is wrong, by key", () => {
	const backup = {
		version: 1,
		exportedAt: "2026-09-21T00:00:00.000Z",
		cards: [{ id: "kbank", name: "KBank Visa", last4: "4821" }],
		purchases: [],
		payments: [],
	};

	try {
		parseBackup(JSON.stringify(backup));
		throw new Error("expected parseBackup to throw");
	} catch (failure) {
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.card");
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badLocation",
		});
	}
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/i18n/error.test.ts src/lib/storage/transfer.test.ts`
Expected: FAIL — `#lib/i18n/error` does not resolve, and `parseBackup` throws a plain `Error`.

- [ ] **Step 3: Write the error type**

Create `src/lib/i18n/error.ts`:

```ts
import type { MessageKey, Params } from "#lib/i18n/catalog";
import { t } from "#lib/i18n/index";

/**
 * A failure that names a catalog key instead of a finished sentence.
 *
 * Validation runs in the storage layer, far from anything that knows the reader's language.
 * Carrying the key lets the one place that renders the banner do the translating, so the
 * storage layer never imports a catalog. `message` holds the key so a stack trace is still
 * readable by whoever is debugging.
 */
export class MessageError extends Error {
	constructor(
		readonly key: MessageKey,
		readonly params?: Params,
	) {
		super(key);
		this.name = "MessageError";
	}
}

/** The sentence to show for `failure`, in the current language. */
export function messageOf(failure: unknown, fallback: MessageKey): string {
	if (failure instanceof MessageError) return t(failure.key, failure.params);
	if (failure instanceof Error) return failure.message;
	return t(fallback);
}
```

- [ ] **Step 4: Make the backup validators return keys**

In `src/lib/storage/transfer.ts`, add:

```ts
import { MessageError } from "#lib/i18n/error";
import type { MessageKey } from "#lib/i18n/catalog";
```

Change every `*Problem` function to return a `MessageKey | null` instead of a sentence fragment. The mapping, one for one with what each function returns today:

| Returned today | Returns now |
| --- | --- |
| `"is not an object"` | `"backup.problem.notObject"` |
| `"is missing an id"` | `"backup.problem.missingId"` |
| `"is missing a name"` | `"backup.problem.missingName"` |
| `"is missing last4"` | `"backup.problem.missingLast4"` |
| `"has a location that is not bangkok, phichit, or krabi"` | `"backup.problem.badLocation"` |
| `"has no cycle"` | `"backup.problem.noCycle"` |
| `"has an offset cycle with a non-integer day field"` | `"backup.problem.badOffsetCycle"` |
| `"has a fixed cycle with a non-integer day field"` | `"backup.problem.badFixedCycle"` |
| `'has a cycle whose kind is neither "offset" nor "fixed"'` | `"backup.problem.badCycleKind"` |
| `"is missing a cardId"` | `"backup.problem.missingCardId"` |
| `"has an invalid date"` | `"backup.problem.badDate"` |
| `"has a non-integer amount"` | `"backup.problem.badAmount"` |
| `"is missing a period"` | `"backup.problem.missingPeriod"` |
| `"has an invalid paidAt date"` | `"backup.problem.badPaidAt"` |
| `"has an invalid closeDate"` | `"backup.problem.badCloseDate"` |
| `"has an invalid dueDate"` | `"backup.problem.badDueDate"` |

So, for example:

```ts
function cardProblem(value: unknown): MessageKey | null {
	if (!isPlainObject(value)) return "backup.problem.notObject";
	if (!isNonEmptyString(prop(value, "id"))) return "backup.problem.missingId";
	if (!isNonEmptyString(prop(value, "name"))) return "backup.problem.missingName";
	if (!isNonEmptyString(prop(value, "last4")))
		return "backup.problem.missingLast4";
	if (toLocation(prop(value, "location")) === null)
		return "backup.problem.badLocation";
	return cycleProblem(prop(value, "cycle"));
}
```

and the throw sites become:

```ts
	if (!isPlainObject(value)) {
		throw new MessageError("backup.unreadable");
	}

	const version = prop(value, "version");
	if (version !== BACKUP_VERSION) {
		throw new MessageError("backup.version", {
			found: JSON.stringify(version),
			expected: BACKUP_VERSION,
		});
	}
```

```ts
	for (const [index, card] of cards.entries()) {
		const problem = cardProblem(card);
		if (problem) {
			throw new MessageError("backup.card", { index: index + 1, problem });
		}
	}
```

The `{problem}` parameter holds a key, so the renderer translates it before substituting. Add that step where the banner is rendered — in `messageOf`, the parameters are passed through as-is, so translate the nested key first at the throw site is not possible; instead handle it in `MessageError` construction by leaving the key and letting the page translate. Concretely, extend `messageOf` to resolve a `problem` parameter that is itself a key:

```ts
export function messageOf(failure: unknown, fallback: MessageKey): string {
	if (failure instanceof MessageError) {
		const params = failure.params;
		const resolved =
			params && typeof params.problem === "string"
				? { ...params, problem: t(params.problem as MessageKey) }
				: params;
		return t(failure.key, resolved);
	}
	if (failure instanceof Error) return failure.message;
	return t(fallback);
}
```

Add a test for that in `src/lib/i18n/error.test.ts`:

```ts
test("resolves a nested problem key inside the parameters", () => {
	setLocale("en");
	const failure = new MessageError("backup.card", {
		index: 1,
		problem: "backup.problem.missingName",
	});
	expect(messageOf(failure, "cards.error.import")).toBe(
		"That backup's card #1 is missing a name.",
	);
});
```

- [ ] **Step 5: Make storage unavailability carry a key**

In `src/lib/storage/index.ts`, `StorageUnavailableError` becomes a `MessageError` subclass so the banner translates it:

```ts
import { MessageError } from "#lib/i18n/error";

/** Thrown at startup when the browser gives the page no usable storage. */
export class StorageUnavailableError extends MessageError {
	constructor(options?: { cause?: unknown }) {
		super("storage.unavailable");
		this.name = "StorageUnavailableError";
		if (options?.cause !== undefined) this.cause = options.cause;
	}
}
```

- [ ] **Step 6: Translate at the one place that renders**

In `src/lib/ui/page-state.ts`, swap the sentence parameters for keys:

```ts
import { messageOf } from "#lib/i18n/error";
import { t } from "#lib/i18n/index";
import type { MessageKey } from "#lib/i18n/catalog";
```

```ts
export type PageState = {
	readonly error: string;
	load(preserveError?: boolean): Promise<void>;
	guard(action: () => Promise<void>, messageKey: MessageKey): Promise<void>;
};

export function createPageState(options: {
	fetch: () => Promise<void>;
	/** Shown when `fetch` rejects with something that carries no message of its own. */
	fallbackKey: MessageKey;
	paint: () => void;
}): PageState {
	let error = "";

	const load = async (preserveError = false): Promise<void> => {
		try {
			await options.fetch();
			if (!preserveError) error = "";
		} catch (failure) {
			error = messageOf(failure, options.fallbackKey);
		}
		options.paint();
	};

	const guard = async (
		action: () => Promise<void>,
		messageKey: MessageKey,
	): Promise<void> => {
		let failed = false;
		try {
			await action();
			error = "";
		} catch (failure) {
			error = `${t(messageKey)} ${messageOf(failure, messageKey)}`;
			failed = true;
		}
		await load(failed);
	};

	return {
		get error() {
			return error;
		},
		load,
		guard,
	};
}
```

In `src/lib/ui/page.ts`, translate the two strings it owns:

```ts
import { messageOf } from "#lib/i18n/error";
import { getLocale } from "#lib/i18n/index";
```

```ts
	// Set before anything renders, so assistive technology and font selection agree with
	// the words on the page.
	document.documentElement.lang = getLocale();
```

```ts
		banner.message = messageOf(error, "startup.failed");
		banner.retryLabel = t("common.reload");
```

- [ ] **Step 7: Run the gates**

Run: `bun test src/lib/i18n/error.test.ts src/lib/storage/transfer.test.ts`
Expected: PASS.

Run: `bun run typecheck && bun test`
Expected: PASS. Route tests passing an English sentence to `guard` or `fallbackMessage` now fail to compile; Task 7 replaces those call sites, so expect to finish this task by updating them to keys.

- [ ] **Step 8: Commit**

```bash
git add src/lib/i18n/error.ts src/lib/i18n/error.test.ts src/lib/storage src/lib/ui
git commit -m "feat: carry a catalog key through failures instead of an English sentence"
```

---

### Task 6: Translate the components

**Files:**
- Modify: `src/components/cc-error-banner.ts`, `cc-card-form.ts`, `cc-card-table.ts`, `cc-due-list.ts`, `cc-location-groups.ts`, `cc-quick-add.ts`, `cc-statement-list.ts`
- Test: the matching `*.test.ts` files

**Interfaces:**
- Consumes: `t`, `getLocale` from Task 1; `LocaleController` from Task 2; `describeCycleText` from Task 4.
- Produces: no new exports. `cc-card-form` emits validation failures as translated text, as before.

Every component in this task follows the same three edits, so do them one component at a time, running its own test file after each.

- [ ] **Step 1: Write the failing test**

Add one test per component asserting it re-renders in Thai. The pattern, shown for `cc-card-table`:

```ts
test("renders its column headings in the chosen language", async () => {
	setLocale("en");
	const element = await mount([]);
	expect(element.shadowRoot?.textContent).toContain(
		"No cards yet. Add the first one with the form above.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มด้านบน",
	);
});
```

Each test file needs the same preamble:

```ts
import { beforeEach } from "bun:test";
import { resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
	setLocale("en");
});
```

Existing assertions in these files that check English text keep working, because `setLocale("en")` runs before each.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/components`
Expected: FAIL — the components render fixed English regardless of locale.

- [ ] **Step 3: Apply the three edits to each component**

For each file: import `t` (and `LocaleController`), add the controller field, and replace every user-visible literal with its key from the Task 1 catalog.

```ts
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
```

```ts
	private readonly locale = new LocaleController(this);
```

The literal-to-key mapping is the catalog itself, grouped by prefix to match its component:

- `cc-error-banner.ts` — the `retryLabel` default becomes `t("common.retry")`. Because a property default is evaluated once at construction, move it into `render`: keep the property defaulting to `""` and render `${this.retryLabel || t("common.retry")}`.
- `cc-card-form.ts` — every `form.*` key. The validation failures use `form.error.*`; `this.fail(t("form.error.last4"))` and so on. Labels, the legend, both radio labels, the two buttons, and the `(cannot change)` note all come from `form.*`.
- `cc-card-table.ts` — `cards.empty`, `cards.column.*`, `cards.archived`, `common.edit`, `cards.archive` / `cards.unarchive`, `common.delete`, `cards.purchaseCount` with `{ count }`.
- `cc-due-list.ts` — `due.*`. The empty state is two keys: `due.empty` as text, `due.emptyAction` as the link's own text. `when()` returns `t("due.overdue", { days })`, `t("due.today")`, or `t("due.inDays", { days })`.
- `cc-location-groups.ts` — `groups.title`, `groups.nextDue` with `{ date }`, `common.none` for a group with no due date, and the heading label becomes `t(\`location.${location}\`)`.
- `cc-quick-add.ts` — `quickAdd.*`, including both placeholders and all four validation failures.
- `cc-statement-list.ts` — `statements.*`, plus `common.delete` on the purchase row.

For the location label, replace the `locationLabel` import from the location plan with a catalog lookup:

```ts
import type { Location } from "#lib/domain/location";
import { t } from "#lib/i18n/index";

const locationText = (location: Location): string =>
	t(`location.${location}` as const);
```

Put that helper in `src/lib/i18n/format.ts` beside `describeCycleText`, export it, and use it from `cc-card-table`, `cc-due-list`, and `cc-location-groups`. Then delete `locationLabel` and its `LABELS` table from `src/lib/domain/location.ts`, along with the label assertion in `src/lib/domain/location.test.ts` — the catalog is the only place a label belongs now.

Sort the location groups on the translated text so the order follows the reader's alphabet:

```ts
		return [...groups.entries()].sort(([a], [b]) =>
			locationText(a) < locationText(b) ? -1 : 1,
		);
```

- [ ] **Step 4: Run the gates**

Run: `bun test src/components`
Expected: PASS.

Run: `bun run typecheck && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components src/lib/i18n/format.ts src/lib/domain/location.ts src/lib/domain/location.test.ts
git commit -m "feat: translate every component"
```

---

### Task 7: Translate the routes and the page chrome

**Files:**
- Modify: `src/routes/index.ts`, `src/routes/cards.ts`, `src/routes/card.ts`
- Create: `src/lib/ui/chrome.ts`
- Test: `src/routes/*.test.ts`, `src/lib/ui/chrome.test.ts`

**Interfaces:**
- Consumes: `t`, `subscribe`, `getLocale` from Task 1.
- Produces: `applyChrome(titleKey: MessageKey, root?: ParentNode): void` — fills the document title and the nav, and re-fills them on a language change.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ui/chrome.test.ts`:

```ts
import { beforeEach, expect, test } from "bun:test";
import { applyChrome } from "#lib/ui/chrome";
import { resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
	setLocale("en");
	document.body.innerHTML = `
		<nav>
			<strong id="nav-brand">cc-tracking</strong>
			<a href="/" id="nav-dashboard">Dashboard</a>
			<a href="/cards" id="nav-cards">Cards</a>
		</nav>`;
});

test("fills the title and the nav in the current language", () => {
	applyChrome("title.cards");

	expect(document.title).toBe("Card registry — cc-tracking");
	expect(document.querySelector("#nav-dashboard")?.textContent).toBe("Dashboard");
	expect(document.querySelector("#nav-cards")?.textContent).toBe("Cards");
});

test("refills them when the language changes", () => {
	applyChrome("title.cards");
	setLocale("th");

	expect(document.title).toBe("ทะเบียนบัตร — cc-tracking");
	expect(document.querySelector("#nav-dashboard")?.textContent).toBe("หน้ารวม");
	expect(document.documentElement.lang).toBe("th");
});
```

Then, in each of `src/routes/index.test.ts`, `src/routes/cards.test.ts`, and `src/routes/card.test.ts`, add the same `beforeEach` preamble used in Task 6, and one test per page asserting a heading switches:

```ts
test("renders its heading in the chosen language", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardsPage(repo, root);
	await settle();
	expect(root.textContent).toContain("Cards");

	setLocale("th");
	await settle();
	expect(root.textContent).toContain("บัตร");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/ui/chrome.test.ts src/routes`
Expected: FAIL — `#lib/ui/chrome` does not resolve, and the pages render fixed English.

- [ ] **Step 3: Write the chrome helper**

Create `src/lib/ui/chrome.ts`:

```ts
import type { MessageKey } from "#lib/i18n/catalog";
import { getLocale, subscribe, t } from "#lib/i18n/index";

const setText = (root: ParentNode, id: string, key: MessageKey): void => {
	const element = root.querySelector(`#${id}`);
	if (element) element.textContent = t(key);
};

/**
 * Fills the parts of the page that live in static HTML rather than in a Lit template —
 * the document title and the nav — and keeps them in step with the language picker.
 */
export function applyChrome(
	titleKey: MessageKey,
	root: ParentNode = document,
): void {
	const apply = () => {
		document.title = t(titleKey);
		document.documentElement.lang = getLocale();
		setText(root, "nav-brand", "nav.brand");
		setText(root, "nav-dashboard", "nav.dashboard");
		setText(root, "nav-cards", "nav.cards");
	};
	apply();
	subscribe(apply);
}
```

- [ ] **Step 4: Translate each route**

In all three routes: import `t` and `subscribe`, call `applyChrome` with the page's title key, repaint on a language change, and replace every literal.

```ts
import { applyChrome } from "#lib/ui/chrome";
import { subscribe, t } from "#lib/i18n/index";
```

At the end of each `render*Page` function, beside the existing `void state.load()`:

```ts
	subscribe(() => paint());
	void state.load();
```

`src/routes/index.ts` — `dashboard.title`, `dashboard.dueNext`, `dashboard.addPurchase`, `common.reload` for the banner's retry label, `dashboard.error.read` as `fallbackKey`, `dashboard.error.markPaid` and `dashboard.error.addPurchase` as the `guard` keys, and the purchase answer:

```ts
			answer = t("dashboard.answer", {
				close: displayDate(closeDateOf(card.cycle, period), getLocale()),
				due: displayDate(dueDateOf(card.cycle, period), getLocale()),
			});
```

The answer is stored as finished text, so it keeps the language it was written in until the next purchase. That is acceptable — it is a transient confirmation, not page furniture. Clear it on a language change so a stale sentence never sits in the wrong language:

```ts
	subscribe(() => {
		answer = "";
		paint();
	});
```

and in `bootstrap`, `applyChrome("title.dashboard")`.

`src/routes/cards.ts` — `cards.title`, `cards.add` / `cards.edit` with `{ name }`, `cards.backup`, `cards.backupWarning`, `cards.export`, `cards.import`, `cards.locationReset` with `{ names }`, `common.dismiss`, `common.reload`, `cards.error.*` for `fallbackKey` and every `guard`, and the duplicate-id failure:

```ts
				if (existing) {
					throw new MessageError("cards.error.duplicateId", { id: card.id });
				}
```

with `applyChrome("title.cards")` in `bootstrap`.

`src/routes/card.ts` — `card.showOlder`, `card.back`, `common.reload`, `card.error.read` as `fallbackKey`, `card.error.markPaid` / `card.error.unmarkPaid` / `card.error.deletePurchase` as the `guard` keys, and the two fetch failures:

```ts
			if (!cardId) {
				throw new MessageError("card.error.noSelection");
			}
			card = await repo.getCard(cardId);
			if (!card) {
				throw new MessageError("card.error.notFound", { id: cardId });
			}
```

with `applyChrome("title.card")` in `bootstrap`.

- [ ] **Step 5: Run the gates**

Run: `bun test src/lib/ui/chrome.test.ts src/routes`
Expected: PASS.

Run: `bun run typecheck && bun test && bun run check`
Expected: PASS on all three.

- [ ] **Step 6: Commit**

```bash
git add src/routes src/lib/ui/chrome.ts src/lib/ui/chrome.test.ts
git commit -m "feat: translate the dashboard, cards, and card pages"
```

---

### Task 8: Prove no English is left, and document it

**Files:**
- Test: `src/lib/i18n/coverage.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code depends on.

- [ ] **Step 1: Write the test that catches a missed literal**

Create `src/lib/i18n/coverage.test.ts`:

```ts
import { expect, test } from "bun:test";
import { Glob } from "bun";
import { en } from "#lib/i18n/en";

/**
 * Catches a user-visible sentence left hard-coded in a template. Not exhaustive — it looks
 * for the shape of English prose inside a Lit template — but it fails loudly on the most
 * common way this regresses: someone adds a feature and forgets the catalog.
 */
test("no component or route renders a hard-coded English sentence", async () => {
	const values = new Set(Object.values(en));
	const offenders: string[] = [];

	for await (const path of new Glob("src/{components,routes}/*.ts").scan(".")) {
		if (path.endsWith(".test.ts")) continue;
		const source = await Bun.file(path).text();
		for (const [, text] of source.matchAll(/>\s*([A-Z][A-Za-z]+(?: [a-z]+){2,})\s*</g)) {
			if (text && !values.has(text)) offenders.push(`${path}: ${text}`);
		}
	}

	expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run it and fix what it finds**

Run: `bun test src/lib/i18n/coverage.test.ts`
Expected: PASS. If it names a file and a phrase, that phrase is a missed literal — add a key to both catalogs and use it, then run again.

- [ ] **Step 3: Review the Thai copy**

Take the terms flagged in Task 1 Step 5 — `statement`, `billing cycle`, `close date`, `due date`, the `backup.problem.*` fragments — to the repository owner, apply any corrections to `src/lib/i18n/th.ts`, and re-run `bun test`.

- [ ] **Step 4: Document it**

In `README.md`, add a short section stating that the interface is available in English and Thai, that the picker sits in the nav and the choice is remembered under `cc:lang`, that Thai is the default when the browser does not ask for English, that dates render `dd MMM yyyy` with Gregorian years in both languages, and that user-entered text is never translated.

- [ ] **Step 5: Final gates**

Run: `bun run typecheck && bun test && bun run check && bun run build`
Expected: PASS on all four.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/coverage.test.ts src/lib/i18n/th.ts README.md
git commit -m "feat: complete the Thai and English interface"
```

---

## Done when

- Every visible word comes from a catalog, in English and Thai.
- The nav picker switches language in place, with no reload and no lost form input.
- The choice persists under `cc:lang`; a first visit gets Thai unless the browser asks for English.
- Dates read `05 Sep 2026` and `05 ก.ย. 2026` — padded day, Gregorian year, never 2569.
- Backup and storage failures appear in the reader's language.
- `bun run typecheck`, `bun test`, `bun run check`, and `bun run build` all pass.
