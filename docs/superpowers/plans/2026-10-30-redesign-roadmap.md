# Redesign roadmap

The redesign in [`PRD.md`](../../../PRD.md) (decided changes RD-03 to RD-21) is too big for one
plan. It ships in six phases, each its own plan, branch and pull request, each leaving the app
working. Only phase 1 has a detailed plan so far; each later plan is written when the phase
before it lands, so it can build on the real code rather than on guesses.

| Phase | Ships | Decided changes | Plan |
|---|---|---|---|
| 1. Rules and storage | New domain rules and storage for card payments, frozen statement dates, purchase lists, locations and old-purchase deletion; backup version 3; delete guards in storage; build stamps for environment and branch. All additive: the current pages keep using the old code. | RD-06, RD-07, RD-10 (rules), RD-11, RD-12, RD-17 (rules), RD-18 (rules), RD-20 (stamps) | [phase 1](2026-10-30-redesign-phase-1-rules-and-storage.md) |
| 2. Shell and switch-over | New tokens and look, page shell (header, bottom bar with +, desktop tabs, build tint and badge, tab title), theme before first paint, the startup migration that moves stored payments and settings to the phase 1 records, and removal of the footer. Old pages keep working against the new storage through thin adapters until replaced. | RD-03, RD-05, RD-08, RD-20, RD-21 | written after phase 1 |
| 3. Home and purchase lists | Home (*Needs you*, *Ready to use*), entering amounts with warnings, review with copy text and save image, the spender's reply, saved list. Removes the dashboard's purchase form, *This sitting* and the batch start. | RD-09, RD-10, RD-15 | written after phase 2 |
| 4. Transactions and payments | The Transactions ledger with search, filter and sort; *Upcoming*; the payment form with the card picker; planned payments. Removes *Due next*, *Purchases by date* and the old payment dialog. | RD-11 to RD-14 | written after phase 3 |
| 5. Cards | Cards page with grouping, search, filter and sort; card page; full edit screen; limit groups. Removes the registry dialogs and the `/cards` query view. | RD-16 | written after phase 4 |
| 6. Settings | Display, Locations (`/settings/locations`), Backup (v3 download, copy, restore), Reset (delete old purchases, delete all data), About. Then the PRD's acceptance criteria are walked on the preview. | RD-17, RD-18, RD-19, RD-20 | written after phase 5 |

Each phase updates `PRD.md` and `PRD_TH.md` for what it ships (the overridden rows are updated
or retired) and adds a dated changelog entry when it lands.
