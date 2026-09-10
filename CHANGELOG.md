# Changelog

A timeline of notable changes to Racha de Segunda. Newest first. Dates are the
day the change landed on `main`.

## 2026-09-10

- **The day's code no longer reveals who the admins are** — `GET /api/players`
  gated the `is_admin` flag on "is there any authenticated caller", which quietly
  started including the operator once the 4-digit code became an identity. The
  code is handed to whoever is running the game, so that let a non-admin list the
  admin accounts — enough to turn a blind login guess into a targeted one. It now
  uses `isRealAdmin`, like every other admin check. Found in a security review of
  everything since the last OWASP pass; the rest of that review came back clean
  (the operator tier and the frozen-session guard both hold, no PII path, no SQL
  injection). The two parked items ride on
  [SSO](docs/feature-requests.md#sso--real-accounts).

## 2026-09-08

- **Green "season" tag on the check-in board** — drop-ins and guests already
  carried a tag, so a season regular was the only row readable by the _absence_ of
  a badge. They now get their own pill in the accent green.
- **Phone numbers in one format, from any country** — emergency contact numbers
  are normalized as they're typed, on save, in the admin sheet and in the CSV
  export (`formatPhone` in `@racha/shared`, backed by `libphonenumber-js`).
  North American numbers render as `+1 604-555-1234`; a number from anywhere else
  keeps its own plan's grouping (`+55 11 91234 5678`, `+61 2 1234 5678`) as long
  as it starts with `+` and its country code. A number that can't be verified is
  stored exactly as typed — never relabelled `+1`, which digit-counting alone
  would have done to a São Paulo mobile. Extensions are kept. Contacts saved
  before this are rewritten once on boot; the admin sheet's numbers are
  tap-to-dial.

## 2026-09-02

- **Home game calendar** — a month view marking each Monday green ✓ (game) or
  red ✗ (no game: a listed holiday _or_ an admin cancellation); tap a day for the
  reason; month nav within the season.
- **Weekly status banner** — "Game on this Monday" with the confirmed count and,
  when a skip falls later in the same month, a "heads-up: no game … (reason)"
  line; turns red "No game this Monday — reason · Next racha …" for holidays and
  cancellations. Always shown, including before the season opener.
- **Admin "Cancel a game"** — call off a one-off Monday (gym unavailable,
  weather, low numbers) with a reason everyone sees; un-cancel any time. Holidays
  stay automatic (in `NO_GAME_DATES`). `nextGameDateISO` and check-in roll past a
  cancelled Monday like a holiday. New `game_cancellations` table + public GET /
  admin write at `/api/cancellations`.
- **Guest removal is creator-or-admin** — adding a guest stamps an anonymous
  per-device tag (`players.added_by_device`, additive migration); removing one
  needs that same tag or a real admin, so a passing viewer can't clear someone
  else's guest. Still public and login-free for the person who added them, and
  guarded so it only ever deletes a guest, never a real player; a guest already
  drawn into a session/team/match returns a clean 409 instead of orphaning stats.
  Honor-system by design — the tag lives in `localStorage`, a soft owner check
  until there's a login.
- **Missing emergency contacts flagged on check-in** — a red "No emergency
  contact" line under any confirmed or waitlisted player who hasn't filled theirs
  in, plus a count above the list. Admin-only (the endpoint reveals a gap about a
  person, so the query never runs for anyone else); guests are excluded, since
  they never have one by design. Pairs with the "Copy WhatsApp message" button for
  chasing them.
- **Admin "Finish the night"** — end the session straight from the post-match
  panel, so the last game doesn't need a trip back to the session's danger zone.
  Tucked below "Back to session" behind a divider, well away from "Start next
  game", and it confirms first.
- **Emergency "Copy WhatsApp message"** — copies a ready-to-forward note with the
  player's personal form link and context.
- **Match cleanup** — ending a session drops an empty, never-started pending
  match; strays on frozen sessions are deletable; no more duplicate matches.
- **UI/polish** — brand moved into the top bar to reclaim vertical space; bigger
  match countdown; past sessions show "Month D, YYYY"; "Weeks" → "Past sessions";
  Home lists only the current season (older games live on Stats); read-only team
  cards no longer show an edit affordance; roster icon → 📋.
- **Rotation & timer** — winner keeps their exact side (the borrow/return rule
  was removed entirely); full-house (6-a-side) runs a 3+3 timer with a loud,
  full-screen rotation alarm that blinks the color of the team that must rotate,
  and a 20-second break before the second half; reopen a match to undo an
  accidental "end".

## 2026-09-01

- **Per-session 4-digit code** — the admin opens a session; anyone with the day's
  code can then run the live game (draw, clock, stats). Finished/past sessions are
  frozen (read-only) except for admin stat fixes.
- **Weekly check-in (RSVP)** — public, honor-system, tied to the next scheduled
  game and rolling over automatically. Season players are always confirmed (cap
  stretches to 18); drop-ins fill by time up to 15; the rest waitlist. Admin
  Manage list with season/drop-in filter and clear-all.
- **Guests** — one-off external players anyone can add by name (lowest priority,
  per-game cap, rate-limited); admins can promote a guest to a drop-in after the
  game, or turn self-add off.
- **Team balance** — full house (16–18) makes three teams of up to 6 (one sub
  each), so 18 is 6/6/6; a short incoming team tops up from the losers.
- **Rules** — updated for app check-in (replacing the WhatsApp poll); added "The
  Resenha" post-game section.
- **Security** — OWASP hardening pass, HSTS, non-root container.
- **Settings** — Rules contact/payment copy and vest colors moved out of source
  into the database, edited in-app.

## 2026-08-24 – 08-25

- Mobile redesign across Home, Stats, Players, Session, and Match screens; in-app
  splash; configurable vest colors.
- Removed the fixed goalkeeper role (saves still tracked for whoever is in net).

## 2026-08-12

- Per-user auth (name + password login, server sessions, admin flag), audit log +
  History screen, DB-driven season roster.
- Security hardening: PII retention, rate limiting, emergency-link rotation, log
  redaction, security headers.

---

For the full commit-level history: `git log`.
