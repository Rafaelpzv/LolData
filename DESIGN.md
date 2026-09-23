---
name: LolData
description: League of Legends and Teamfight Tactics player statistics, ranked progress and match history.
colors:
  background: "hsl(240 10% 3.9%)"
  foreground: "hsl(0 0% 98%)"
  surface: "hsl(240 5.9% 10%)"
  surface-raised: "hsl(240 5.5% 12%)"
  surface-sunken: "hsl(240 8% 6.5%)"
  accent: "hsl(240 3.7% 15.9%)"
  muted-foreground: "hsl(240 5% 64.9%)"
  subtle-foreground: "hsl(240 4% 54%)"
  border: "hsl(240 3.7% 15.9%)"
  border-strong: "hsl(240 5.3% 26.1%)"
  ring: "hsl(240 4.9% 83.9%)"
  destructive: "hsl(0 84% 67%)"
  warning: "hsl(38 92% 56%)"
  win: "hsl(151 83% 55%)"
  loss: "hsl(0 100% 67%)"
  place-top4: "hsl(213 94% 68%)"
  tier-iron: "hsl(24 8% 58%)"
  tier-bronze: "hsl(22 45% 56%)"
  tier-silver: "hsl(210 14% 72%)"
  tier-gold: "hsl(43 74% 58%)"
  tier-platinum: "hsl(175 45% 55%)"
  tier-emerald: "hsl(150 60% 48%)"
  tier-diamond: "hsl(220 80% 72%)"
  tier-master: "hsl(270 95% 75%)"
  tier-grandmaster: "hsl(0 91% 71%)"
  tier-challenger: "hsl(50 96% 53%)"
  trait-bronze: "hsl(25 80% 70%)"
  trait-silver: "hsl(240 5% 75%)"
  trait-gold: "hsl(45 93% 62%)"
  trait-prismatic: "hsl(292 84% 72%)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.27
    letterSpacing: "0.025em"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
    fontFeature: "\"tnum\" 1"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-default-hover:
    backgroundColor: "{colors.accent}"
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
  search-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge-win:
    textColor: "{colors.win}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
    typography: "{typography.label}"
  badge-loss:
    textColor: "{colors.loss}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
    typography: "{typography.label}"
  segment-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "32px"
  popover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
---

# Design System: LolData

## Overview

**Creative North Star: "The Scouting Report"**

LolData reads like a scout's dossier on a player: dense, factual, numbers first. The page is a dark, quiet sheet laid over a blurred, darkened League wallpaper, and the only things that light up are the facts a player cares about: win or loss, rank tier, placement. The interface stays out of the way so the data carries the weight; the game's identity shows up in the details (tier colors, crests, champion art), not in chrome.

This is an operate-mode product. Players arrive with a Riot ID, scan a profile or a leaderboard, and leave. Familiar controls, consistent affordances and fast scanning beat expression every time. Density is a feature: tables and match cards pack information, spaced on a 4px grid so it still breathes.

Components are precise and understated: flat surfaces, a hairline border that brightens on hover, no shadows at rest, no scaling on hover. The one signature shape is the rounded search pill, the product's front door.

**Key Characteristics:**
- Dark-only, translucent surfaces over a pre-blurred backdrop (`public/backdrop.webp`)
- Neutral zinc UI; color reserved for game meaning (win/loss, tiers, placements, trait tiers)
- Inter for interface text, Geist Mono tabular numerals for every number
- Flat by default; shadows only on floating layers
- One component vocabulary for LoL and TFT, fully localized (EN and PT-BR)

## Colors

A neutral zinc scale for everything structural, with saturated color held back for game semantics.

### Primary
- **Chalk White** (`foreground`): primary text, the primary button fill and the active page in pagination. Inverted (white on near-black) is the single high-emphasis treatment.

### Neutral
- **Midnight Zinc** (`background`): the page and the base under the backdrop.
- **Slate Panel** (`surface`): cards, used translucent (`/70`) so the backdrop shows through.
- **Raised Panel** (`surface-raised`): opaque; menus, listboxes and tooltips.
- **Recess** (`surface-sunken`): inputs, empty item slots and icon placeholders.
- **Hairline** (`border`) and **Edge** (`border-strong`): resting and hover/emphasis borders.
- **Fog** (`muted-foreground`): secondary text, labels and metadata. **Ash** (`subtle-foreground`): placeholders and tertiary metadata only (still ≥4.5:1 on the page).
- **Accent** (`accent`): hover fills and the selected segment. It is a neutral, not a brand color.

### Game semantics
- **Victory Green** (`win`) and **Defeat Red** (`loss`): results, KDA deaths, win rate ≥50% / <50%. Always paired with text or an icon.
- **Placement** (`place-first` = win, `place-top4`, `place-bottom` = loss): TFT placement badges.
- **Tier ladder** (`tier-iron` … `tier-challenger`): tier names in rankings and profiles, via `tierTextClass()`.
- **Trait tiers** (`trait-bronze`, `trait-silver`, `trait-gold`, `trait-prismatic`): TFT trait chips.
- **Warning** and **Destructive**: stale data, hot streak, and errors.

### Named Rules
**The Earned Color Rule.** Color means something in the game or it doesn't appear. No decorative gradients, no brand tints on inactive states; a screen with no results or tiers is grayscale.

**The Never Alone Rule.** Win, loss, placement and trait tier are never communicated by color alone: a label, count or icon always travels with it.

## Typography

**Interface font:** Inter (`--font-sans`), with a system sans fallback.
**Data font:** Geist Mono (`--font-geist-mono`) via the `.num` utility, tabular numerals.

**Character:** A plain, highly legible sans for words, and a crisp mono for numbers, so columns of LP, KDA and win rate line up digit for digit.

### Hierarchy
- **Display** (600, 3rem, tight tracking): the wordmark on the home hero only.
- **Headline** (600, 1.5rem, `text-2xl`): page titles (`h1`: player name, "High Elo rankings").
- **Title** (600, 1.125rem, `text-lg`): section headings (`h2`: Match history, Champion mastery).
- **Body** (400, 0.875rem, `text-sm`): default interface text, table cells, controls.
- **Label** (500, 0.6875rem, `text-2xs`, uppercase, +0.025em): stat labels, table headers, group labels. 11px is the floor; nothing smaller ships.
- **Data** (Geist Mono 600, `.num`): every number (LP, KDA, CS, damage, gold, win rate, placement, counts).

### Named Rules
**The Tabular Rule.** If it is a number, it is `.num`. Numbers are formatted by the locale (`1,432` / `1.432`) through next-intl.

**The Fixed Scale Rule.** Fixed rem sizes only (Tailwind scale plus `2xs`). No fluid type and no `text-[Npx]`.

## Layout

A single centered column: `container` capped at 1280px with 16/24/32px side padding (mobile/sm/lg). Pages use `PageShell` (section rhythm `space-y-6`, `sm:space-y-8`, vertical padding 24/32px) and `PageHeader` (title and description on the left, controls on the right, stacking on mobile).

The app shell is global: a sticky header (wordmark, player search, rankings nav, language switch) and a footer with the Riot disclaimer. Pages never render their own header, back links or footer.

Responsive behavior is structural: secondary table columns hide below `sm`/`md`, profile identity and ranked cards stack below `md`, filters scroll horizontally, and the header search drops to its own row on mobile. No horizontal page scroll at 390px.

Spacing follows the 4px grid. Tight groups (4–8px) sit inside components; 16–24px separate components; 24–32px separate sections.

## Elevation & Depth

Flat by default. Depth comes from tone (sunken < page < surface < raised) and hairline borders, not shadows. The backdrop gives the page its depth; translucent surfaces (`surface/70`) sit on it.

### Shadow Vocabulary
- **Float** (`shadow-lg shadow-black/40`): menus, listboxes, the region picker and search suggestions. Nothing else casts a shadow.

### Named Rules
**The Flat-At-Rest Rule.** Resting surfaces never cast shadows, and cards never lift or scale on hover. Hover changes border and fill, plus a faint cursor-following light (`data-glow`, 3% foreground, 220px); only images inside rows may scale (1.05).

**The One Layer Rule.** Never nest a card inside a card. A section holding cards has no card wrapper; inside a card, structure comes from dividers and spacing.

## Shapes

Softly squared: `rounded-md` (6px) for controls, `rounded-lg` (8px) for cards and popovers, `rounded-sm` (4px) for badges, chips and segments, `rounded-xs` (2px) for flags, and `rounded-full` for avatars, the level pill and the search pill. Borders are 1px hairlines; `border-2 border-border-strong` rings only the profile icon. No other radii exist.

## Components

### Buttons
Precise and understated.
- **Shape:** gently squared (6px). Heights 32 / 40 / 48px (`sm` / `md` / `lg`), plus square icon sizes.
- **Default:** translucent surface fill with a hairline border; hover brightens the border and fills with accent.
- **Primary:** inverted (white fill, near-black text). One per view.
- **Outline / Ghost / Link:** for secondary actions, pagination and inline navigation.
- **States:** a 2px focus-visible ring with offset on every button; `loading` shows a spinner and sets `aria-busy`; disabled drops to 50% opacity. Use `asChild` to render a `next/link` with button styling.

### Inputs / Fields
- **Style:** recessed fill (`surface-sunken`), hairline border, 6px radius, 40px tall.
- **Focus:** the shared focus ring; `aria-invalid` turns the border destructive.
- **Select:** native `<select>` with a lucide chevron (accessible, with native mobile pickers).

### Search pill (signature)
The front door. A full-radius pill (44px in the header, 56px on the home hero) combining a Riot ID combobox (autocomplete listbox, arrow keys, Enter, Esc) with the `RegionPicker` (SVG flags grouped by continent). Invalid input shows an inline, localized error under the pill.

### Cards / Containers
- **Corner style:** 8px.
- **Background:** `surface/70` (default), `surface/85` on hover (`interactive`); `win`/`loss` variants use a soft horizontal gradient of the result color with a matching border.
- **Border:** hairline `border/70`; `border-strong` on hover.
- **Padding:** 12 / 16 / 16–24px (`sm` / `md` / `lg`).

### Chips & Badges
- **Style:** 4px radius, `text-2xs` medium, 15% tinted fill in the semantic color (win, loss, placements, warning), or neutral/outline.
- **Trait chips:** trait-tier text and border with the unit count visible.

### Navigation
- **Header nav:** 32px items; the active item is filled with accent and has `aria-current`. On mobile it shows the short "LoL/TFT" labels while keeping the full accessible name.
- **SegmentedNav / SegmentedControl:** a recessed group with 32px segments; the active segment is filled with accent. SegmentedNav uses links (queues, games); SegmentedControl uses buttons (local toggles).
- **Pagination:** ghost icon buttons; the current page is inverted.

### Data display
- **Table:** uppercase 11px headers, 1px row dividers, subtle accent hover, numeric cells right-aligned in `.num`.
- **Stat:** an uppercase label over a `.num` value (sm/md/lg/xl), toned default/muted/win/loss.
- **IconFrame:** the frame for all game art (profile icons, champions, items, runes, units): 20/32/40/64/96px, square/rounded/circle, recessed placeholder, bottom badge slot. **TierCrest:** fixed-box ranked crests.
- **Floating layers:** every menu, listbox and suggestion list uses `Floating` / `FloatingContent` (Radix Popover): rendered in a portal above all sections, anchored to its trigger, flipped and shifted to stay inside the viewport, capped to the available height. Never position a dropdown with `absolute` inside a section.
- **Feedback:** `Skeleton`/`SkeletonList` shaped like the content, `EmptyState` (icon, title, hint, action), and `Alert` (destructive/warning/info).

### Motion
Motion is part of the system, not decoration per screen. Pages fade and rise in (`app/template.tsx`); sections `Reveal` in sequence; lists cascade (`Stagger`, first ~20 items); numbers count up (`AnimatedNumber`); selections slide (`ActivePill` shared `layoutId`); disclosures animate height (`Collapse`); charts draw in. Global touches from ObsidianUI (adapted): Lenis smooth scroll, click sparks, the flip-text wordmark and Radix tooltips. Scrollable popovers carry `data-lenis-prevent`.

## Do's and Don'ts

### Do:
- **Do** build every screen from `src/components/ui` primitives and `src/lib` helpers (`cdn`, `regions`, `tiers`, `queues`, `format`, `riot-id`).
- **Do** use tokens only (`bg-surface/70`, `text-muted-foreground`, `text-win`, `text-tier-gold`); add a token to `globals.css` before inventing a color.
- **Do** render every number with `.num` and format it with next-intl.
- **Do** translate every visible string and `aria-label` in both `messages/en` and `messages/pt-BR`.
- **Do** animate with the shared motion system: tokens in `src/lib/motion.ts` (150–250ms states, 450ms reveals, springs for indicators) and primitives in `src/components/motion` (`Reveal`, `Stagger`, `AnimatedNumber`, `Collapse`, `ActivePill`, `FlipText`, `Tip`). Everything turns off under `prefers-reduced-motion`.
- **Do** give every interactive element a real `<button>`/`<Link>` with a visible focus ring.

### Don't:
- **Don't** use raw palette classes (zinc-, slate-, gray-, red-…), hex colors, or `text-[Npx]` in components.
- **Don't** use neon/RGB "gamer" styling: no glow, no colored gradients or light effects as decoration.
- **Don't** nest cards, scale or shadow cards on hover, add shadows to resting surfaces, or write one-off keyframes/durations outside the motion tokens.
- **Don't** use unicode glyphs or emoji as icons (←, ⟳, ▾, 🔥); use lucide-react.
- **Don't** convey win/loss, placement or tier by color alone.
- **Don't** render page-level headers, back links or footers; the app shell owns them.
