# Design rules: Duma SDV

The rules for every screen, derived from `SAAS-Design.md`. If a change breaks a rule, the change is wrong. The checklist at the bottom is how a view passes.

## 1. Principles

- **Inform, don't decorate.** Every element must help the judge finish the job they came to that view for. If it's decoration, delete it.
- **Each view answers one question** (§7). No KPI cards repeated across views.
- **One subject per screen.** The subject is loud; everything around it is turned down.
- **Colour means something.** The chrome is neutral. Colour appears only for data and status (§3).
- **Motion must tell the user something** (§6).

## 2. Surfaces and shape

- Light, near-white UI. It reads well on venue projectors and matches Attio/Stripe-style restraint.
- Borders: 1 px `--line`. No drop shadows, except for **popovers/menus/modals** (one soft shadow token) and the single **"Start here"** card.
- **Radius: 8 px on every control, card and panel.** 999 px only for status dots and toggle knobs. Never mix square and round buttons.
- No gradients, glows, glassmorphism or background images in the UI. (The 3D stage has its own soft studio lighting.)

## 3. Colour tokens

Tokens are defined once on `:root` in `src/ui/tokens.css`. Hex values are never written in components.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAF9` | App background |
| `--surface` | `#FFFFFF` | Panels, cards |
| `--surface-2` | `#F4F4F2` | Hover, table stripes, stage floor tint |
| `--line` | `#E6E5E1` | Borders, dividers |
| `--ink` | `#17181A` | Primary text, primary button fill |
| `--ink-2` | `#5C5F66` | Secondary text |
| `--ink-3` | `#8E9199` | Tertiary text, disabled, axis labels |
| `--accent` | `#1F6F8B` | The one accent: selection, focus ring, active nav, "Start here", links |
| `--ok` | `#2E7D4F` | Regen, charging, READY, healthy |
| `--warn` | `#B7791F` | Derate, warnings, stored DTCs |
| `--fault` | `#B3261E` | Active faults, limp mode, confirmation of destructive actions |
| `--*-soft` | same hue at ~10% on white | Status backgrounds (badges, highlighted rows) |

- Status is **never shown by colour alone**. It always comes with an icon or a word.
- Chart series use dedicated data colours, separate from UI accent and status colours. The Charge curve uses `--data-ac` for AC (`#0072B2`, blue) and `--data-dc` for DC (`#C65300`, orange). Both are legible against the white chart surface; series must also be identified in words. Add new data series colours here before using them in another chart.
- The 3D highlight colours for faults and energy flow use `--warn`, `--fault`, `--ok` and `--accent`, and nothing else.

## 4. Type

- Font: **Geist** (UI) and **Geist Mono** (numbers in tables, CAN IDs, DTCs, the bus trace), self-hosted via `@fontsource-variable` so they work offline. Every number uses `font-variant-numeric: tabular-nums`.

| Step | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 72/72 | 600 | The one hero number (speed on Drive, SOC on Charge) |
| `h1` | 20/28 | 600 | View title |
| `h2` | 15/22 | 600 | Panel title |
| `body` | 14/20 | 400 | Default |
| `small` | 13/18 | 400 | Secondary values, captions |
| `label` | 11/16 | 500, uppercase, +0.04em | Section labels only ("BATTERY", "RECENT FAULTS") |

No other sizes. Text is sentence case everywhere except `label`.

## 5. Spacing, sizing, layout

- Spacing steps (px): **4, 8, 12, 16, 24, 32, 48**. Nothing in between.
- Control height: **32 px** by default, **40 px** for a view's single primary action. Icon-only buttons are square (32×32). Icons are **16 px**, or 20 px in the nav.
- Shell: a left **icon nav rail** (56 px, with tooltips) holds the views. The **3D stage** takes the main area. A **right panel** (360 px) shows the current view's content. A top bar has the power state, the guided demo button and the author line. The dashboard strip sits under the stage on Drive.
- Minimum viewport: 1366×768 with no horizontal scroll.
- Truncate long strings with an ellipsis and show the full text in a tooltip. Icons that sit on the 3D stage get a solid circular backdrop.

## 6. Motion

Allowed, because each one tells the user something:
- Wheels spinning with speed. Energy-flow dashes moving in the direction and at the rate of the power flow. Gauge needles and bars tracking values.
- The startup sequence stepping through its states.
- Skeleton placeholders while the 3D stage loads.
- A tick/check for a completed action (charge complete, update installed, fault cleared).

Not allowed: fade-ins on scroll, elements flying in, parallax, hover bounces, idle spinning of the car, confetti.
Every transition is ≤ 150 ms and ease-out. Honour `prefers-reduced-motion` by showing values without animating them.

## 7. Views: one question each

| View | Icon (Lucide) | Question it answers | The subject |
|---|---|---|---|
| Drive | `gauge` | What is the car doing right now? | Speed |
| Charge | `plug-zap` | How full is it and how long until it's ready? | SOC % and time to target |
| Energy | `activity` | Where is the energy going, and how hot is it? | Live power-flow diagram |
| Diagnostics | `stethoscope` | Is anything wrong, and where? | Active faults list |
| Architecture | `network` | How do the modules talk? | ECU diagram + CAN trace |
| Cycles | `route` | How efficient is it over a standard trip? | Wh/km result + chart |
| Software | `cloud-download` | What version is running, and what's new? | Update card |

## 8. Words: use these exact verbs

| Action | Say | Never say |
|---|---|---|
| Turn the car on/off | **Power on** / **Power off** | Start, Ignite, Boot, Turn on |
| Connect/disconnect charger | **Plug in** / **Unplug** | Connect, Attach |
| Charging session | **Start charging** / **Stop charging** | Begin, End, Halt |
| Faults | **Inject fault** / **Clear fault** / **Clear all faults** | Trigger, Simulate, Remove, Reset, Delete |
| OTA | **Check for updates** / **Install update** | Upgrade, Flash, Apply |
| Trace | **Pause** / **Resume** / **Clear trace** | Stop, Freeze, Reset |
| Telemetry | **Export CSV** | Download, Save, Save as |
| Drive cycle | **Run cycle** / **Stop cycle** | Start test, Play |
| Guided demo | **Start demo** / **Exit demo** | Tour, Walkthrough, Play demo |

The car is "the car" in UI text, never "the vehicle", "the EV" or "the model".

## 9. States and friction

- Every data area has a designed **empty state** (one line plus the next action, e.g. "No faults. Inject fault to see how the car responds."), a **loading state** (skeleton), and an **error state** (what happened and what to do).
- **Confirm before destructive or final actions**, using a centred modal with a title, one line of consequence and a primary button that repeats the verb: **Clear all faults**, **Install update**, **Power off while driving**. After the action, show completion with a tick and a toast.
- Buttons have three levels: **primary** (ink fill, at most one per view), **secondary** (surface + border), **quiet** (text only; used for cancel and for less-wanted choices).
- Rows and cards collapse extra actions into a kebab menu. The number that matters sits on the right.

## 10. Onboarding

- First visit: the only highlighted element is the **"Start here → Power on"** card, which gets the accent border and the one allowed shadow. After READY, the card changes to the next suggested step (Take a drive → Plug in → Inject fault → Check for updates) and shows a small progress indicator (n of 5).
- No forced tour. The guided demo is always one click away and never auto-starts.

## 11. Icons

- **Lucide only** (`lucide-react`), with 1.5 px stroke. No emojis anywhere: UI, captions, commit messages or the paper.

## Checklist: a view passes when every box is true

- [ ] It answers exactly the one question in §7, and nothing on it serves a different question.
- [ ] The subject is the only element at `display` or `h1` weight in the content area.
- [ ] Only tokens from §3 are used. Colour appears only on data or status, and every status also has an icon or word.
- [ ] Only the type steps in §4 and the spacing steps in §5 are used.
- [ ] Every control is 32 or 40 px high with an 8 px radius, and there is at most one primary button.
- [ ] Action labels match §8 exactly.
- [ ] Empty, loading and error states exist for every data area.
- [ ] Destructive or final actions confirm first and show completion.
- [ ] No motion outside §6. Reduced motion is respected.
- [ ] Lucide icons only, no emojis.
- [ ] It works at 1366×768 with no horizontal scroll, and everything can be reached by keyboard with a visible focus ring.
