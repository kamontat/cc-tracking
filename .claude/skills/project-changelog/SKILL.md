---
name: project-changelog
description: Create or update CHANGELOG.md and its Thai twin CHANGELOG_TH.md for this project in their fixed format (`## YYYY-MM-DD: <summary>` with BREAKING CHANGES, Features, Improvements, Bug fixes, Decisions and Technical sections), written for the app's users. Use this whenever the user asks to add, write, update, fix up or reformat a changelog entry, record what shipped, summarise recent commits or a merged PR into the changelog, or says things like "log this change", "add release notes", or "update the changelog" -- even if they don't name the file.
---

# Changelog

`CHANGELOG.md` at the repo root is the history of what changed in the app and why, written for
the people who use it. About's _Changelog_ link (_What's new_) opens it, so its reader is
someone who tracks cards in the app, not a developer. Each entry says what they will now see or
do differently, in their words; the developer detail goes in the entry's last section,
_Technical_, where a developer can still find it.

## Who reads it, and how to write for them

- Name things as the app names them: the page, tab, button or field label the reader sees, in
  _italics_ (_Owed_, _Soonest due_, _Filter_ > _Shows_). Take labels from
  `src/lib/i18n/en.ts` and `th.ts`.
- Say what the reader notices and why it helps: "Owed now shows bills and planned payments
  only; pick _Open statements_ in _Filter_ to see estimates too." Not the mechanism.
- Plain words. Outside _Technical_ there are no code names (`cardShownDates`), no file paths,
  no PRD IDs (DD-216, RD-29), no query keys (`f.shows=...`), no component, test, build, CI or
  framework talk (Astro, Svelte, Lit, island, refactor, localStorage). Say "the address" or
  "a saved link" instead of a query key, "saved in this browser" instead of localStorage.
- Backticks outside _Technical_ only for text the reader sees or types exactly as written: an
  amount `฿90,000.00`, a card line `46) UOB Preferred Platinum · Dad`, a page address `/owed`.
- `tests/changelog.test.ts` rejects a PRD ID or a camelCase code name outside _Technical_.
- A change with nothing a user can see (a rewrite, a test, CI) goes in _Technical_ only. An
  entry that is all technical still gets a one-line user section when there is any visible
  effect ("Pages open faster"); otherwise it has _Technical_ alone.

## The Thai twin

`CHANGELOG_TH.md` is the same history in Thai: the same entries, dates and order, and the same
bullets in the same sections. About's link opens it for a Thai reader (PRD DD-218). Every entry
you add or change in `CHANGELOG.md` is added or changed in `CHANGELOG_TH.md` in the same commit.

- Headings keep `## YYYY-MM-DD: ` and translate the summary. Sections map exactly:
  BREAKING CHANGES `### การเปลี่ยนแปลงที่ต้องรู้`, Features `### ฟีเจอร์ใหม่`,
  Improvements `### การปรับปรุง`, Bug fixes `### แก้ไขข้อผิดพลาด`, Decisions `### การตัดสินใจ`,
  Technical `### รายละเอียดทางเทคนิค`.
- Plain, everyday Thai for the user sections, as the app's own Thai copy reads. A UI label in
  _italics_ uses the Thai label from `src/lib/i18n/th.ts`; other terms follow `PRD_TH.md`.
  Backticks, IDs, dates and amounts stay as written.
- One line per bullet (Thai is not hard-wrapped), with a space between Thai and English or code.

## Entry format

Entries are newest first, directly under the file's intro paragraph.

```markdown
## YYYY-MM-DD: <short summary>

### BREAKING CHANGES

- ...

### Features

- ...

### Improvements

- ...

### Bug fixes

- ...

### Decisions

- ...

### Technical

- ...
```

- **Heading**: `## ` + ISO date + `: ` + a short summary in sentence case, no trailing period,
  in the reader's words ("Owed shows each card's holder", not "OwedLines titles"). The summary
  names the theme of the entry, not a list of every change. Use today's date for new work
  unless the user gives one or the changes clearly landed on another day (check
  `git log --date=short`).
- **Sections** always appear in the order above, with exactly these headings. Leave out any
  section that has nothing in it -- don't write `- None`.
- **Nothing else** goes at the `###` level. If a big entry has phases or parts, say so inside
  the bullets (e.g. "Phase B: ...") rather than inventing new headings.

## Which section a change belongs in

Decide by asking how the change relates to the behaviour *before* this entry:

| Section | Ask | Examples |
|---|---|---|
| BREAKING CHANGES | Does something the reader relied on now work differently, so they have to act: an old backup, a saved link, a habit? | old backups no longer restore, a page moved so bookmarks break, a default filter changed |
| Features | Is this a new thing the reader can use? | a new page, panel, setting, filter, sort |
| Improvements | Did something the reader uses get better without breaking anything? | clearer layout, faster pages, better wording |
| Bug fixes | Did something the reader could see not work as meant, and now it does? | wrong total, button shown when it shouldn't be, a crash on empty input |
| Decisions | Why does it work this way, and what was turned down, as far as the reader cares? | why a default, why one option over another |
| Technical | What would a developer need: code names, addresses and query keys, PRD IDs, data and backup format details, refactors, tests, build and deploy? | `cardShownDates` over `nextBill` (DD-217); `f.shows` written only when not the default; Lit removed |

BREAKING CHANGES is an extra flag on top: a change that breaks something appears there **and**
in its own section. Write the two bullets from their own angle: BREAKING CHANGES says what
stops working and what to do; the other says what the change gives. A break that only touches
code (a removed message key, a renamed prop) is not the reader's to act on: it goes in
_Technical_ alone.

Technical keeps every fact the old developer-facing entries had: code identifiers, addresses
and query keys, PRD IDs, storage keys and backup format versions, refactors and why. Write it
in the same plain sentences, one idea per bullet. Decisions whose reason is only technical
(a library, a file layout) go in Technical too.

## Writing the bullets

- Plain, complete sentences. Say what changed and, briefly, the effect or reason.
- One idea per bullet; wrap English lines at about 95 characters with a two-space continuation
  indent.
- Put the *why* in Decisions when it's a real choice between options (and name the rejected
  option). A short "because ..." inside the bullet is fine for small things.

## Workflow

### Adding an entry for new work

1. Read `CHANGELOG.md` to find the newest entry's date and see the current voice.
2. Gather the changes. If the user described them, use that. Otherwise look at what landed
   since the last entry: `git log --date=short --format='%h %ad %s' <since>..HEAD` and, for
   anything unclear, `git show --stat <sha>` or the diff. Merged PR bodies often hold the
   reasons -- read them for the Decisions section.
3. Group related commits into one bullet. Several commits that together fold three panels are
   one improvement, not three.
4. Sort each change by the table above, then ask separately whether it also breaks anything
   for the reader and, if so, add it to BREAKING CHANGES too. Put its code-level detail in
   Technical.
5. If an entry for the same date already exists, extend it instead of adding a second heading
   with that date: add bullets to its sections and extend its title with `, and <this
   change>`.
6. Insert the entry above the current newest entry in both files and show the user the result.

### Updating an existing entry

Edit in place, in both files. Keep the date unless the user asks to change it. If you move an
item between sections, keep the section order and drop any section that becomes empty.

## Don'ts

- Don't rewrite the file's intro paragraph or reorder existing entries.
- Don't invent reasons. If the why isn't in the conversation, commits, PR or code, leave the
  Decisions section out or ask the user.
- Don't pad sections with trivia to make them look full.
- Don't drop a technical fact to make an entry read plainly: move it to Technical.
