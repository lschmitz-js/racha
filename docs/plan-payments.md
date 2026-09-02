# Plan — SSO, payments & a finance tab

Status: **proposal / not started.** This is a design to react to before any code.

## Goal

Know who has paid, without turning the app into a paywall:

- **Drop-ins** pay per game they play.
- **Season players** pay a season fee.
- Keep a **history of payments** per person.
- A **Finance tab** for the organizer: how much came in, who still owes.
- A gentle **"please pay" reminder** for anyone who hasn't — never a block.

## Why SSO first

Today a player's identity on the app is honor-system (tap your name, remembered
on the device). To attach money to a real person and let people see *their own*
status, each player needs a real account. SSO gives that with no passwords to
manage.

- **Recommended: Google Sign-In (OAuth).** Most players already have a Google
  account; lowest friction; nothing to remember.
- **Alternative/fallback: email magic-link.** No third-party dependency, works for
  anyone with email, but we'd run an email sender.
- On first sign-in, link the account to an existing player record (match by name,
  admin-approved) so history and stats stay attached. Honor-system check-in can
  remain for anyone who doesn't sign in — payments simply require an account.

## Data model (SQLite, additive)

- `payments` — `id`, `player_id`, `amount`, `currency` (CAD), `kind`
  (`dropin_game` | `season_fee` | `other`), `game_date` (for drop-in) or `season`
  (for the fee), `method` (`etransfer` | `cash` | `other`), `status`
  (`paid` | `pending` | `waived`), `note`, `recorded_by`, `created_at`.
- Fees in **settings** (already DB-driven): drop-in price, season fee, currency,
  e-Transfer address (the app already stores this).
- **"Who owes" is derived**, not stored: for a game, confirmed drop-ins with no
  matching `paid` `dropin_game`; for the season, season players with no `paid`
  `season_fee`.

## How money moves (kept simple)

- **Phase 1 = e-Transfer + confirm** (matches the current payment method). No card
  processor. A player taps **"I sent it"** → the payment goes `pending`; the admin
  taps **"Mark paid"** to confirm. Small group, so manual reconciliation is fine.
- **Later (optional) = a processor (e.g. Stripe)** for card payments, with a
  webhook that auto-marks `paid`. Adds fees, accounts, and compliance — only worth
  it if manual e-Transfer becomes a chore.

## Screens

- **Finance tab (admin)** — collected totals (season / this month), outstanding
  (who owes, how much), a searchable/filterable payment log, CSV export.
- **Player self-view** — "You owe $X for tonight" / "Season fee: $Y", the
  e-Transfer address, a **"Mark as sent"** button (pending → admin confirms), and
  their own payment history. A player only ever sees their own amounts.
- **Reminder** — an unpaid, signed-in player sees a soft banner on Home/Check-in;
  optionally the admin sees a "who hasn't paid" list to nudge in WhatsApp. Always a
  reminder, never a gate on checking in.

## Suggested phases

1. **SSO (Google)** + link accounts to player records. Foundation.
2. **Payments core**: model + admin "Mark paid" + Finance tab (totals /
   outstanding / history) + fee settings.
3. **Self-service**: player self-view, "Mark as sent", unpaid reminder banner.
4. **(Optional) card processor** with webhook auto-marking.

## Decisions needed before building

1. SSO: Google only, magic-link only, or both?
2. Payment capture: manual e-Transfer + confirm now, or integrate a processor?
3. Amounts: drop-in price, season fee, currency (CAD assumed).
4. Should unpaid ever affect check-in priority, or always just a reminder?
5. Visibility: admins see everyone; players see only their own — confirm.
