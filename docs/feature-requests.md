# Feature requests / backlog

A running list of ideas for Racha de Segunda. Nothing here is committed work —
it's the place to park an idea with enough detail that whoever picks it up
(human or AI) doesn't have to re-derive the thinking.

**Status vocabulary:** `idea` (just captured) → `shaping` (being fleshed out,
open questions listed) → `planned` (has a design doc / agreed approach) →
`building` → `done` (move the entry out, into the CHANGELOG).

When an entry grows past a screen of text, give it its own `docs/plan-*.md` and
leave a one-paragraph stub here that links to it — that's what
[Payments & finance](#payments--finance-tab) does.

## Index

| # | Feature | Status | Depends on |
|---|---------|--------|------------|
| 1 | [Payments & finance tab](#payments--finance-tab) | planned | SSO |
| 2 | [SSO / real accounts](#sso--real-accounts) | shaping | — |
| 3 | [No-show alerts](#no-show-alerts) | shaping | WhatsApp |
| 4 | [Player profile & skill web](#player-profile--skill-web) | shaping | SSO, WhatsApp |
| 5 | [WhatsApp integration](#whatsapp-integration) | shaping | — |

---

## Payments & finance tab

**Status:** planned — full design in [plan-payments.md](plan-payments.md).

Know who has paid without turning the app into a paywall: drop-ins pay per game,
season players pay a season fee, admins get a finance tab with totals and
outstanding, players get a soft reminder and their own history. Phase 1 is
e-Transfer + manual confirm; a card processor is optional and later.

---

## SSO / real accounts

**Status:** shaping. Also the foundation for payments — the tradeoffs are
argued in [plan-payments.md](plan-payments.md#why-sso-first); this entry tracks
the parts that aren't about money.

**Why:** identity today is honor-system (tap your name, remembered on the
device). Anything personal — your own payment status, your own skill profile,
"is this really you cancelling?" — needs a real account behind it.

**Sketch:**
- Google Sign-In as the primary provider; email magic-link as the fallback for
  anyone without a Google account.
- On first sign-in, link the account to an existing player row (match by name,
  admin approves the link) so stats and history stay attached.
- Honor-system check-in stays for anyone who doesn't sign in. Signing in unlocks
  the personal features; it never becomes a requirement to play.
- **SSO retires every per-player private link.** The unguessable
  emergency-contact URLs exist because there's no login; once there is one, that
  whole mechanism goes away — emergency details are edited behind your account,
  and the tokens can be dropped from the schema. Anything else tempted to mint a
  private link (e.g. [the skill web](#player-profile--skill-web)) should wait for
  SSO instead of adding another token to retire.
- Admin login (name + password) stays as-is, or an admin flag rides on the linked
  player record — decide before building.

**Open questions:**
1. Google only, magic-link only, or both?
2. What happens to a device that's signed out — does check-in still remember the
   tapped name?

---

## No-show alerts

**Status:** shaping.

**Why:** the draw is built from the check-in board. Someone who confirmed and
then doesn't show breaks a balanced 10/15/18 split at the worst possible moment,
and today nobody finds out until the teams are being drawn.

**Sketch:**
- **Un-checking-in late is the signal.** When a confirmed player flips to "not
  playing" after a cutoff (e.g. game-day, or the last N hours), that's an event,
  not a silent edit: record it and surface it.
- **Who gets alerted:** the admin/operator (someone has to backfill from the
  waitlist), and — if there's a waitlist — the first person on it, since a spot
  just opened.
- **A no-show record** for the player who never un-checked in and never showed:
  the operator marks it after the game (or it's derived — confirmed for the
  session, but absent from every team). Keep a per-player count visible to
  admins.
- **Where it shows:** the check-in board's Manage list (a small badge /
  reliability count), plus the weekly status banner on Home when the confirmed
  count drops below the minimum to play.
- **Delivery is WhatsApp, not the app.** An alert nobody sees isn't an alert —
  people read WhatsApp, they don't open the app to check. In-app badges stay as
  the record; the push goes out over
  [WhatsApp integration](#whatsapp-integration), which this depends on.

**Open questions:**
1. What's the cutoff after which flipping to "not playing" counts as a late drop
   — game-day 00:00 Vancouver, or a fixed number of hours before kickoff?
2. Is a no-show count purely informational, or does it cost check-in priority
   next week? (Same question as unpaid — see the payments plan.)
3. Guests have no account — do late guest drops count against the person who
   added them?

---

## Player profile & skill web

**Status:** shaping.

**Why:** the eight skills already exist — `SKILLS` in
`packages/shared/src/types.ts` (Speed, Position, Stamina, Teamwork, Passing,
Shooting, Defend, Dribble), each 1–5, already bilingual as `skill.*` in
`i18n.tsx`, already averaged into the draw by `calcScore` in `balance.ts`. But
they're only visible as eight rows in the admin's Players editor, and only an
admin can touch them. Two things are missing: a screen that makes a player's
shape worth looking at, and a way for players to have a say in their own
numbers.

### Decided

- **The web is private to its owner.** A player's own tab shows the full
  spider/radar of their eight skills. Everyone else sees **one number** — the
  `calcScore` average the draw already uses — never the shape, never the
  per-axis breakdown. Admins see everything (they already edit the roster).
- **One number, one formula: `calcScore`.** No second aggregate. The public
  number, the Players list and team balance all read the same mean of the eight
  skills from `balance.ts`.
- **Skills are frozen once a match can start.** All editing and approving
  happens *before* a session is drawn — the moment a session opens for play, the
  numbers are settled for the night. This is the same freeze the app already
  applies to finished/past-dated sessions, extended to skills.
- **Approved changes take effect immediately.** No deferred application, no
  "next week" — the freeze above is what keeps that from re-balancing a draw
  underway.
- **Two admins must approve, and only admins.** A pending change needs sign-off
  from at least two distinct admins before it lands; one is not enough, and the
  requester never counts toward the two even if they are an admin themselves.
  `is_admin` is already a per-player flag, so multiple admins exist today — note
  this means an admin editing their own skills needs two *other* admins, so the
  group needs three admins before that case can clear.
- **No peer ratings.** The group tried an app that asked everyone to rate each
  other after a game; it died of effort — people are there to play, not to fill
  in forms. Any design that adds post-game taps for everybody is off the table.
  Accuracy comes from match data (below) plus two-admin approval instead.
- **A pending change never expires.** It sits in the queue until two admins
  approve or someone rejects it — no timeout, no silent drop.
- **Admins get alerted over WhatsApp**, not just in-app. Nobody opens the app to
  check a queue; everyone reads WhatsApp. Same channel as
  [no-show alerts](#no-show-alerts) — one outbound path serves both, see
  [WhatsApp integration](#whatsapp-integration). An in-app badge still exists,
  but it's the backup, not the alert.
- **Long labels get truncated, not wrapped.** If an axis label (or a name) is too
  wide for the screen, shorten it to fit — the web keeps its shape at phone
  width rather than reflowing.
- **Editing your own web is gated on [SSO](#sso--real-accounts)** — that's the
  identity this feature needs, and private per-player links are going away with
  it. Building the profile before SSO would mean a throwaway link to retire
  later; cleanest is SSO first.

### Sketch

- A **player profile screen** built around a **radar web of the existing eight
  skills** — one axis per `SKILLS` entry, rings at 1–5. Nothing new to model:
  it's the `skills: number[]` already on every player, drawn instead of listed.
  Alongside it: season vs drop-in, their stats, and their `calcScore` average.
- Axis labels come free from `t('skill.' + label)`, so the web is bilingual on
  day one. Eight axes is busy on a phone: truncate to fit (*Posicionamento* is
  the longest PT label), full text on tap/title.
- **Self-service editing, two-admin approval.** A player edits their own web →
  the change lands as `pending` → admins review. The first approval records who
  approved; the second lands the change into `players.skills_json` immediately.
  Either admin can edit the requested values before approving, or reject
  outright. Until it lands, `calcScore` keeps using the approved array, so a
  self-inflated rating can never reach a draw.
- While a change is pending, plot the requested shape ghosted over the approved
  one — a diff you can read at a glance — visible to the owner and to admins.
- Admins get a "pending skill changes" queue, same shape as the audit log: who
  asked for what, when, which admin has already approved, approve/edit/reject.
  Every decision writes an audit entry like other admin actions. A submitted
  request alerts the admins; requests stay in the queue until resolved, and the
  queue carries a count badge so a backlog is visible without opening it.
- Draw the web as hand-rolled inline SVG (a polygon over a few rings): one
  screen doesn't justify a chart library, and inline SVG themes and scales down
  for free. The same component can shrink beside a name in the Players list.

### Deriving skills from match data

The app already logs `goal`, `assist`, `beautiful`, `silly`, `bad`, `save`,
`caneta`, `quasegol`, `sub_in`/`sub_out` per player per match. That's a free,
zero-effort signal — nobody has to fill in anything — so let it move the axes it
can honestly support, and leave the rest to humans.

| Axis | Signal | Derive? |
|------|--------|---------|
| Shooting | `goal`, `quasegol` (volume + conversion `goals / (goals + quasegol)`) | **yes** — the cleanest one |
| Passing | `assist` per game | **yes** |
| Dribble | `caneta`, `beautiful` | **yes** |
| Defend | `save` — but there's no fixed keeper, so saves say "was in net", not "defends well" | partial / leave human |
| Stamina | time on pitch from `sub_in`/`sub_out` | no — winner-stays means staying on measures your *team* winning, not your legs |
| Speed, Position, Teamwork | nothing logged maps to these | no — stay human-set |

`silly` / `bad` are the negative events; they could dent a derived axis, but
they're a judgement call by whoever is logging, so treat them as colour on the
recap rather than input to a rating.

**Rules that keep it fair:**
- **Rates, not totals** — per game played, or a regular out-ranks a good player
  who shows up half the season.
- **Rank, then map** — a raw rate isn't a 1–5. Take the player's percentile
  across the roster over the window and map that onto 1–5, so the scale keeps
  its meaning as the group's level drifts.
- **Warm-up period** — until a player has enough games, the derived value stays
  pulled toward their current number instead of swinging on one lucky night.
- **Recompute between sessions only.** Never mid-session — which the freeze rule
  above already guarantees.
- **Derived axes need no approval.** Match data isn't self-reported, so there's
  nothing to inflate: it applies on its own. Only the human-set axes go through
  the two-admin queue. That's the point — most of the numbers maintain
  themselves, and admins only rule on the handful a player can actually claim.
- **Admin override still wins.** An admin can pin an axis to a fixed value if
  the data is telling a silly story.

### Open questions

1. Which window feeds the derived axes — the season, or a rolling last-N games?
   (Rolling tracks form; season is steadier and matches the leaderboard toggle.)
2. How many games before a derived axis is trusted enough to move on its own?
3. Do derived axes show on the web as a different colour/line from the
   human-set ones, so a player can see which numbers they can actually argue
   with?
4. Does a player see *why* an axis moved (“3 goals in 4 games”), or just the new
   value?

---

## WhatsApp integration

**Status:** shaping — and now load-bearing: it's the delivery channel for
[no-show alerts](#no-show-alerts) and
[skill-approval requests](#player-profile--skill-web). Both of those wait on it.

**Why:** the group already lives in WhatsApp. Today the app only helps by
generating text for a "copy reminder" button someone pastes by hand. Anything
the app needs a human to *notice* — a late drop, a pending approval — has to
arrive where people already look.

**Sketch (cheapest → most involved):**
- **Today:** copy-to-clipboard reminders. Already shipped.
- **Deep links:** `https://wa.me/?text=…` buttons that open WhatsApp with the
  message pre-filled — still a human tap, but no copy/paste. Small, no backend.
- **Outbound API:** WhatsApp Business (Cloud API) or a bridge, posting the weekly
  reminder, the confirmed count, cancellations and
  [no-show alerts](#no-show-alerts) into the group automatically. Needs a phone
  number, a business account, message templates, and a token that must live in
  the operator's `.env` — never in this repo.
- **Inbound (a bot that reads "in"/"out" from the group)** is the big one:
  message-level permissions, mapping a phone number to a player, spam handling.
  Probably not worth it while the check-in screen exists.

**The catch, now that alerts depend on it:** deep links (`wa.me`) only *open*
WhatsApp with a message pre-filled — a human still has to tap send. That's fine
for a weekly reminder someone posts anyway, but it cannot deliver an alert the
app raises on its own. Pushing "player X just dropped out" or "a skill change
needs your approval" requires the **outbound Cloud API**, which means a business
account, a sender number, and pre-approved message templates for anything sent
outside a 24-hour reply window. That's the real cost of putting alerts on
WhatsApp, and it should be understood before either alert feature is scheduled.

**Open questions:**
1. Do admin alerts go to a **1:1 message per admin** (needs each admin's number,
   quieter) or into the **group** (simpler, but everyone sees the queue noise)?
2. Whose number / business account, and who owns the token? It lives in the
   operator's `.env`, never in this repo.
3. Group posting is noisy by nature — what's the message budget per week?
4. Is there a cheaper stopgap worth doing first — e.g. an emailed alert, or a
   plain push notification from the PWA — while the Cloud API is set up?

---

## Template for a new entry

```markdown
## <Feature name>

**Status:** idea | shaping | planned | building

**Why:** the problem in the group's terms — what goes wrong today.

**Sketch:** how it might work, and which parts of the app it touches
(check-in board, draw, clock, stats, settings, schedule…).

**Open questions:** the decisions that must be made before anyone writes code.
```
