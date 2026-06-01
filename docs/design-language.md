# Zaparoo App Design Language

This document describes how the app already looks and behaves. It is not a wishlist and not a place to invent new UI. When changing UI, match the nearest real pattern first.

## Non-negotiable rule

Existing app UI wins. Nearby screens win over generic preference. If no existing pattern fits, stop and ask before introducing a new visual treatment.

Do not add decorative icons, new card styles, helper text, descriptions, badges, stat blocks, progress styles, loading treatments, spacing systems, or typography treatments unless the same context already uses them or the user explicitly asks.

## Source-of-truth files

Use these before creating or changing UI:

- App shell: `src/components/PageFrame.tsx`, `src/components/ResponsiveContainer.tsx`, `src/components/BottomNav.tsx`, `BackToTop.tsx`, `ReconnectingIndicator.tsx`
- WUI primitives: `src/components/wui/Button.tsx`, `HeaderButton.tsx`, `Card.tsx`, `ToggleSwitch.tsx`, `TextInput.tsx`, `Badge.tsx`, `EmptyState.tsx`, `Segmented.tsx`, `ToggleChip.tsx`, `SettingHelp.tsx`
- Modals: `src/components/SlideModal.tsx`, `ConfirmClearModal.tsx`, `PairingModal.tsx`, `WriteModal.tsx`, `RequirementsModal.tsx`, `ProPurchase.tsx`, `home/StopConfirmModal.tsx`, `home/StagedTokenModal.tsx`
- Settings screens: `src/routes/settings.index.tsx`, `settings.readers.tsx`, `settings.advanced.tsx`, `settings.accessibility.tsx`, `settings.scraper.tsx`, `settings.play-controls.tsx`, `settings.about.tsx`, `settings.help.tsx`, `settings.online.tsx`, `src/routes/-pages/Devices.tsx`, `DeviceDetail.tsx`, `Logs.tsx`
- Create/search flows: `src/routes/create.index.tsx`, `create.custom.tsx`, `create.nfc.tsx`, `create.mappings.tsx`, `src/routes/-pages/Search.tsx`, `MappingEditor.tsx`, `ZapScriptInput.tsx`
- Home: `src/routes/-pages/Index.tsx`, `src/components/home/*`
- Lists/selectors: `MappingRow.tsx`, `VirtualSearchResults.tsx`, `SystemSelector.tsx`, `TagSelector.tsx`, `SimpleSystemSelect.tsx`, `DeviceRow.tsx`, `NetworkScanModal.tsx`, `InboxModal.tsx`
- Foundations: `src/index.css`

## Visual foundations

### Theme

Zaparoo App is dark, high-contrast, mobile-first UI.

Use existing tokens/classes from `src/index.css`:

- background: `var(--color-background)` / `bg-background`
- foreground: `text-foreground`, usually white
- muted text: `text-muted-foreground`
- disabled text: `text-foreground-disabled`
- primary/accent: cyan/blue via `text-primary`, `bg-button-pattern`
- status colors: `text-success`, `text-error`, `text-warning`
- borders: `border-bd-filled`, `border-bd-outline`, `border-bd-input`
- cards/buttons: `bg-card-pattern`, `bg-button-pattern`

Do not hardcode new colors unless matching a nearby existing hardcoded pattern. Prefer app tokens and WUI components.

### Typography

Font is Open Sans from `src/index.css`. Use existing Tailwind classes; do not introduce custom font families.

Common hierarchy:

- Page title in header: `text-foreground text-xl`.
  - Seen across settings, create, search, logs, devices.
- Slide modal title: centered `text-lg` inside `SlideModal`.
- Home section labels: `font-bold text-gray-400 capitalize`.
  - Used by `LastScannedInfo` and `NowPlayingInfo`.
- Card/list primary text: usually `font-semibold` or `font-medium` depending sibling row.
  - Create landing card titles use `font-semibold`.
  - Connection status title uses `font-medium`.
  - Mapping row primary label uses `font-medium`.
- Settings field labels: match sibling label treatment exactly, commonly `text-sm font-medium`, `mb-1 block`, or `text-white` depending screen.
- Help page section labels use centered `text-lg font-semibold`.
- About page has its own credits layout: centered `text-2xl font-bold` app title and centered `text-lg font-bold` credit headings.
- NFC read/tools panels use `text-lg font-semibold` headings inside rounded panels.
- Muted supporting text: `text-muted-foreground text-sm`.
- Tiny hints: `text-muted-foreground text-xs`, only where nearby UI already uses that pattern.

Hierarchy must be obvious. Section headings should not look less important than field labels in the same area.

## Layout system

### App shell

Use `PageFrame` for pages. It owns:

- full-height column layout
- safe-area padding from `useStatusStore().safeInsets`
- sticky top header
- scrollable content
- `ResponsiveContainer`

`ResponsiveContainer` constrains content on larger screens:

- app content: `sm:mx-auto sm:max-w-2xl`
- nav content: `sm:mx-auto sm:max-w-lg`

Do not add page-level max widths or safe-area padding manually when `PageFrame` already handles it.

### Page stacks

Common page content stacks:

- Simple settings pages: `flex flex-col gap-5`
  - Settings index, Advanced, Accessibility, Scraper.
- Dense settings/control pages: `flex flex-col gap-3`
  - Readers, Play Controls, Create landing.
- Form/editor pages: `flex flex-col gap-4`
  - Mapping editor, Help, Online auth flows.
- About page: `flex flex-col gap-8` with smaller inner `gap-2` / `gap-3` groups.
- Search form groups: `space-y-3`, with nested `flex flex-col gap-3 md:flex-row` where filters become columns on desktop.
- NFC tabs: tab content uses `space-y-4 px-2 pt-4/pt-6`; inner NFC panels use rounded background blocks, not WUI Card.
- Modal content: selector/search headers use `p-2 pt-3`; confirmation modals vary between `py-4` and `p-4` based on the existing modal being matched.

Use the nearest screen’s spacing. Do not mix gap systems inside one section unless sibling code does.

### Header pattern

Subpages use:

- `HeaderButton` with `BackIcon size="24"` on left
- centered `<h1 className="text-foreground text-xl">...` title
- optional right `HeaderButton` or small `flex gap-2` group of `HeaderButton`s for page actions
- `useSmartSwipe({ onSwipeRight: goBack })` when nearby routes use swipe-back

Root tab pages can omit back button and use centered title or branded content.

### Bottom navigation and floating app chrome

Bottom nav is its own pattern in `BottomNav`:

- fixed-height nav area: `calc(80px + safeInsets.bottom)`
- translucent dark background `bg-[#111928bf]` with backdrop blur
- top border `border-t-[#ffffff21]`
- three equal nav buttons with 48px minimum hit height
- active state cyan `#3faeec` with matching drop-shadow glow
- attention state uses `attention-throb` amber halo

Global reconnecting/connecting status uses `ReconnectingIndicator`, a fixed rounded pill above bottom nav:

- connecting: `bg-muted/90 text-muted-foreground`
- reconnecting: amber background/text
- inline `Loader2 h-4 w-4 animate-spin`

Do not use these styles for ordinary page content.

## Components

### Button

Use `src/components/wui/Button.tsx`.

Variants:

- `fill` default: primary gradient button, border, white text
- `outline`: border-only action
- `text`: icon/text action without filled treatment

Sizes:

- default: normal app action
- `sm`: compact secondary action
- `lg`: rare large action

Shape is owned by Button:

- icon-only buttons are round
- labeled buttons use rounded pill-like corners
- haptics derive from `intent`: default light, primary medium, destructive heavy

Use `className="w-full"` for full-width primary page actions. Use `className="flex-1"` for equal-width modal footer buttons.

Do not build custom buttons with raw `<button>` unless implementing a specialized primitive already present in the codebase, such as selector rows or segmented radio buttons.

### HeaderButton

Use `HeaderButton` only for header actions: back, history, reload, close-like header controls.

Pattern:

- 32px square (`h-8 w-8`)
- round hit target
- icon-only
- accessible name should come from `aria-label`; some existing log actions use `title`, but new icon-only header actions should include `aria-label`
- active state cyan, disabled gray

Do not use `HeaderButton` inside page body.

### Card

Use `src/components/wui/Card.tsx` when existing flow uses card containers.

Card style:

- `rounded-xl`
- `p-3`
- border `rgba(255,255,255,0.13)`
- `bg-card-pattern`
- `drop-shadow`

Real use:

- Settings top cards: device connection, media database
- Home connection status
- Create landing action cards
- Search database warning card
- Recent-search rows
- Device rows/history entries via `DeviceRow`
- Core outdated notice with warning border/background overrides

Do not wrap new settings subsections in cards unless sibling sections on that page are cards. Most settings toggles are plain stacked rows, not cards.

### ToggleSwitch

Use `ToggleSwitch` for boolean settings.

Pattern:

- row: label left, switch right
- no card wrapper
- label can include `SettingHelp`
- `loading` shows skeleton switch
- disabled state belongs on switch, not custom opacity wrapper

Real use: Readers, Advanced, Accessibility, Play Controls, Media Scrape force toggle.

Do not add paragraphs under toggles. Put longer explanation in `SettingHelp` if the settings page already uses it.

### TextInput

Use `TextInput` for standard text/number/search input.

Built-in style:

- label above input, `mb-1 block`
- input height `h-12`
- `bg-background`
- `border-bd-input`
- rounded corners
- disabled border/text state
- optional save button and clear button

Use native `type`, `inputMode`, `clearable`, `saveValue`, `error` props before creating custom input UI.

Do not restyle internal input from call sites beyond layout width (`className`).

### Badge and TagBadge

Use `Badge` for compact labels/status markers.

Variants exist: default, pro, success, warning, error, info.

Real use:

- Mapping type/match labels
- disabled mapping badge
- playtime state badge
- Pro badge uses its own component
- TagBadge wraps `Badge` for `type:tag`

Do not invent new badge colors or stat pills.

### EmptyState

Use `EmptyState` for empty or no-results content.

Patterns:

- compact empty placeholders: `size="compact"`
- larger initial/no-results states: default size
- description only when it helps recovery and nearby empty states use descriptions
- action only when there is a clear next step

Real use: readers with no detected readers, mappings empty/search empty, search initial/no results, selectors empty/error.

### Segmented/radio controls

Use existing segmented/radio patterns when choosing one option among a small set.

Real patterns:

- Accessibility text size segmented row: pill group, selected item has check icon and `bg-button-pattern`
- Readers scan mode and shake mode: two full-width pill halves, selected item uses `bg-button-pattern`
- `wui/Segmented.tsx`: generic radiogroup with bordered rounded container and active gradient item

Do not invent a new segmented style. If a generic pattern fits, prefer `Segmented`.

### ToggleChip

Use `ToggleChip` for compact on/off controls, especially icon or filter-like toggles.

Real use:

- Home history button
- Logs level filters (`compact` chips)

Do not use chips for normal settings; use `ToggleSwitch`.

### SettingHelp

Use `SettingHelp` for settings explanations already expressed as help icons.

Real behavior:

- inline circular help button with `HelpCircleIcon size={18}`
- hint color `text-foreground-hint`, hover/focus muted
- opens a shadcn `Dialog`, not `SlideModal`
- supports `**bold**` and paragraph breaks in description text

Do not replace an existing help-icon pattern with visible helper paragraphs.

## Settings pages

Settings are plain and utilitarian. Avoid decorative UI.

### Structure

Subpage pattern:

1. `PageFrame`
2. back `HeaderButton`
3. centered page title `text-foreground text-xl`
4. content stack
5. settings rows/inputs/toggles

Examples:

- `settings.advanced.tsx`: simple `gap-5` stack of toggles and nav row
- `settings.readers.tsx`: dense `gap-3` stack because it has multiple reader controls
- `settings.play-controls.tsx`: grouped settings; inner field groups must match within page

### Settings navigation rows

Settings index nav rows use:

- `flex min-h-[48px] flex-row items-center justify-between`
- text on left
- `NextIcon size="20"` right
- no cards
- no descriptions

Device history is a different settings subflow:

- list wrapper `flex flex-col gap-3 pt-2`
- rows use `DeviceRow`, which is a `Card` with active dot, primary name/address, muted address/platform/version metadata, optional lock icon, and optional right action button
- device detail uses `flex flex-col gap-6 p-3`, TextInput for name, a home-style info section heading `font-bold text-gray-400 capitalize`, and full-width buttons

### Settings toggles

Use `ToggleSwitch` directly in stack.

If help is needed:

```tsx
<ToggleSwitch
  label={
    <span className="flex items-center">
      {t("...")}
      <SettingHelp title={t("...")} description={t("...")} />
    </span>
  }
/>
```

Do not add a visible helper paragraph below one toggle if sibling toggles use `SettingHelp`.

### Settings fields

Match sibling field style exactly.

Numeric field group pattern in Play Controls:

- outer group: `flex flex-col gap-3`
- each field: `flex flex-col gap-2`
- peer field labels: exactly `text-sm font-medium`
- input row: `flex gap-2`
- paired fields: two `TextInput`s in one row
- single numeric fields in same group: one `TextInput` in the same row pattern, constrained to one half-width
- disabled state stays on the inputs/toggles; do not make peer field labels differ by feature enabled state

If one sibling section has no visible description, new sibling sections must not add one.

## Forms and selectors

### Native selects

Native select patterns vary by context, so copy the nearby one:

- Settings language and scraper select: `border-bd-input bg-background text-foreground rounded-md border border-solid p-3`
- `SimpleSystemSelect`: `border-input text-foreground w-full rounded-md border px-3 py-2` with inline `backgroundColor: var(--color-background)`
- labels above are often `text-white` or `mb-1 text-white`
- disabled: opacity/cursor where nearby component does so

Real use: language select, scraper select, media search modal simple system select.

### Search/filter forms

Search route pattern:

- role `search`
- `TextInput` for query with `type="search"` and `clearable`
- filter labels `mb-1 text-white`
- selector triggers for system/tag
- full-width Search button

### Selector triggers and modal selectors

Use `SystemSelector`, `TagSelector`, and their trigger components for choosing systems/tags.

Selector modal pattern:

- `SlideModal fixedHeight="90vh"`
- search bar at top with icon inside input
- category tabs/accordion where relevant
- virtualized list rows
- footer for multi-select apply/clear count
- `BackToTop` for long lists

Do not create a new picker UI for systems/tags.

## Modals

### SlideModal

Use `SlideModal` for app bottom-sheet modals.

Visual behavior:

- black overlay `bg-black/50`
- bottom sheet on mobile, centered max width on desktop
- `bg-[rgba(17,25,40,0.7)]`
- border `rgba(255,255,255,0.13)`
- backdrop blur
- mobile drag handle cyan
- title centered `text-lg`
- safe-area bottom padding
- focus trap and Android back handling

Do not implement one-off bottom-sheet shells.

### Dialog modals and full-screen write state

Not every modal is a `SlideModal`:

- `SettingHelp`, `ProPurchase`, `RequirementsModal`, and `NFCModal` use shadcn `Dialog`.
- `WriteModal` is a special full-screen fixed overlay with scan spinner and cancel button, not a bottom sheet.

Copy the existing modal type for the same job. Do not move help/purchase/write flows into `SlideModal` unless redesigning those flows deliberately.

### Confirm modals

Confirm modal content is simple, but not one single template:

- `StopConfirmModal`: centered paragraph, `flex flex-col gap-4 p-4`, buttons row `justify-center gap-4`, cancel outline + confirm primary.
- Advanced error reporting confirmation matches the `StopConfirmModal` centered paragraph/buttons pattern.
- `ConfirmClearModal` and mapping delete confirmation use `py-4`, a `flex gap-2` equal-width button row, and destructive outline styling with `border-error text-error`.

Match the existing confirmation type closest to the action. Destructive actions use visible error styling, not `intent="destructive"` alone.

### Staged token modal

Launch Guard staged token modal pattern:

- `SlideModal fixedHeight="auto"`
- footer with two equal buttons in `flex gap-3 pt-4`
- content `flex flex-col gap-4 py-4`
- muted small description
- token value `text-foreground text-sm font-medium break-all`

Keep it concise. Do not add extra cards/icons/status badges.

## Home screen

Home is more branded and status-oriented than Settings.

Patterns:

- Page uses logo, history `ToggleChip`, large scan control, then status sections
- Connection status uses `Card` + `ConnectionStatusDisplay`
- Last scanned and now playing sections use `p-3`
- Home section headings use `font-bold text-gray-400 capitalize`
- Stop action is icon-only `Button variant="text"`

Do not copy Home heading style into Settings; it is home/status-specific.

## Create, Search, and NFC flows

### Create landing

Create index uses stacked `Card` rows:

- `flex flex-row items-center gap-3`
- decorative icon `Button`
- text stack with `font-semibold` title and `text-sm` subtitle
- `NextIcon size="20"` on navigable rows

Use this pattern only for menu-like action cards.

### Search results

Search result rows are list rows, not cards:

- clickable row
- `px-1 pt-3 pb-5`
- bottom divider between rows
- primary name `font-semibold`
- metadata `text-sm`, muted filename when needed
- `NextIcon` right

Do not wrap search results in new cards.

### Mapping editor and ZapScript input

Mapping editor uses a plain `flex flex-col gap-4` form stack:

- `TextInput` for label/pattern
- `Segmented` for type/match
- `ZapScriptInput` for override text
- `ToggleSwitch` for enabled
- save button primary, delete button outline with `border-error text-error`

`ZapScriptInput` is its own compound editor:

- textarea with `border-bd-input bg-background rounded-b-none border border-solid p-3`
- footer area with matching border/background and `rounded-b-md`
- character count muted small text
- command palette uses existing `Button variant="outline"` grid/flex rows
- clear action uses `ConfirmClearModal`

Do not replace ZapScript editing with a plain `TextInput`.

### NFC tabs

NFC utilities use shadcn `Tabs` for Read/Tools.

NFC content panels use custom rounded blocks, not WUI `Card`:

- wrapper: `bg-background-secondary/50 space-y-4 rounded-2xl p-4`
- headings: `text-lg font-semibold`
- values: `bg-background/50 rounded-lg px-3 py-2`, often mono/small
- badges for NFC booleans/tech types
- dangerous tool warnings use red icon/text in the Tools tab

Do not copy WUI Card styling into NFC tab panels; match the NFC panel pattern.

### Mapping rows

Mapping rows use:

- `px-1 py-3`
- divider except last
- primary text `font-medium`
- badges for type/match
- mono override preview `font-mono text-sm`
- `NextIcon` right

Use this style for mapping-like data rows.

## Settings support pages

### Help

Help page uses a simple outline-button directory:

- page stack `flex flex-col gap-4`
- sections `flex flex-col gap-4`
- centered section headings `text-center text-lg font-semibold`
- outline buttons for external links
- support email paragraph centered with underlined link

### About

About page is a credits page and has unique content styling:

- outer stack `flex flex-col gap-8`
- app heading centered `text-2xl font-bold`
- credit groups use `flex flex-col gap-2`
- credit rows use `flex flex-row justify-between`
- supporter names include legacy inline colors

Do not copy About credits styling into normal settings pages.

### Online account

Online settings has auth/account-specific layout:

- logged-in state centers avatar/user info with `items-center gap-4 py-4`
- avatar is either rounded image with border or gradient circle initial
- account actions are full-width outline buttons in `gap-3`
- delete/scheduled-deletion states use error border/text/background treatments
- logged-out auth form is a `gap-4` stack with `TextInput`s and full-width buttons

Do not use Online account avatar/card/error panel patterns for unrelated settings.

## Logs, inbox, and notifications

### Logs

Logs screen is a dense utility page, not a card/list page:

- header can have multiple `HeaderButton`s in a `flex gap-2` right slot
- control area uses `flex flex-col gap-3`
- search uses `TextInput` with empty label
- level filters use compact `ToggleChip`s in a wrapping row `gap-1.5`
- entry count is `text-muted-foreground text-sm`
- log rows use `p-3 font-mono text-xs` and an inline `borderBottom` divider
- log message is `text-foreground font-mono text-sm break-all whitespace-pre-wrap`
- metadata fields are `text-muted-foreground mt-1 font-sans text-sm break-all`
- log level uses `Badge` variants
- `BackToTop` appears for long log content

Do not use normal settings rows or cards for log entries.

### Inbox

Inbox uses a `SlideModal` opened from a header `InboxButton`:

- inbox button is `HeaderButton` with Bell icon and optional `attention-throb`
- empty inbox uses `EmptyState` with Bell icon
- rows are bordered boxes: `border-bd-outline rounded-md border border-solid p-3`
- severity icon left, title `font-semibold`, body `text-foreground-hint text-sm`, timestamp `text-foreground-hint text-xs`
- row body can expand/collapse with `line-clamp-2`
- delete uses small text `Button` with trash icon
- clear-all confirmation lives in modal footer, not a separate modal

Do not reuse inbox bordered rows for ordinary settings/navigation lists.

## Status, loading, and progress

### Connection status

Use `ConnectionStatusDisplay` for connection state:

- status icon left, 24px
- title `font-medium`
- subtitle `truncate text-sm` with muted or error color
- optional action slot right
- lock/unlock icon for encryption state

Do not recreate connection rows manually.

### Loading

Use loading treatment that matches known dimensions:

- `Skeleton` for specific pending UI slots, e.g. switch skeleton, stat value skeletons
- `LoadingSpinner` for inline async work
- `Loader2` icon for network scan, reconnecting indicator, and some header upload/refresh states
- text-only muted pending states where existing component does that
- full-screen write/scan waiting uses `WriteModal` with `ScanSpinner`, not a generic spinner overlay

Do not invent new loading cards or shimmer styles.

### Progress

Progress bars exist for media database and scraper flows.

Patterns:

- database compact bar: `h-[10px]`, border, `bg-button-pattern` inner bar
- scraper active bar: `h-5`, thicker inner bar
- status rows use `text-sm`, muted labels, values right-aligned

Do not use progress bars outside real progress work.

## Lists and rows

Choose row style by context:

- Settings nav: plain 48px row with `NextIcon`
- Device row: `DeviceRow` Card row with status dot, optional lock, muted metadata, optional separate right action
- Mapping row: dense data row with badges and mono preview
- Search result: large clickable result row with metadata and tags
- Selector row: modal list item with selection indicator/check
- Log row: monospaced text row with inline divider and badges
- Inbox row: bordered modal row with severity icon and compact timestamp
- Card row: only inside `Card`-based menus/status blocks

Do not mix row styles in one list.

## Icons

Icons communicate actions or status. They are not decoration for settings copy.

Common sizes:

- 20px: row chevrons, button icons, small actions, log header actions
- 24px: header buttons, status icons, settings/action icons, bottom nav icons
- 18px: small edit/delete/help-adjacent actions where existing component uses it
- 16px: inline metadata icons, spinner/status details
- larger sizes only when owned by a component, e.g. scan spinner

Rules:

- icon-only interactive controls need `aria-label`
- decorative Button icons in cards should use `decorative`
- do not add icons to settings section headings or field labels unless existing sibling headings/labels do

## Accessibility and interaction

Keep existing accessibility behavior:

- root layout already provides `SkipLink targetId="main-content"`; add new skip targets only for new bypass regions that need them
- use `usePageHeadingFocus()` for page titles/headings
- use `HeaderButton` labels for header actions
- use accessible queries/roles in tests
- maintain `aria-live` for async scan/search/progress/connection updates
- use `SlideModal` focus trap for bottom-sheet modals
- use `useSmartSwipe` for subpage back gesture where sibling pages use it
- use `useHaptics()` or WUI component `intent` instead of ad-hoc haptic calls
- focus rings should match existing `focus-visible:ring-2 focus-visible:ring-white/50`

Disabled controls should use component disabled props and existing disabled colors, not custom hidden interactivity.

## Copy rules

- Match existing capitalization exactly.
- Product noun: `App` when referring to Zaparoo App.
- Feature toggles read as actions: `Enable playtime limits`, `Enable launch guard`.
- Do not add visible explanatory copy unless sibling controls use visible explanations.
- Prefer `SettingHelp` for longer setting explanations when settings page already uses it.
- In tests, translations return keys; assert keys, not English strings.

## Change checklist

Before finishing UI work, compare changed UI against nearest siblings and verify:

- same component primitives used
- same spacing/gaps
- same text hierarchy
- same label casing
- same input widths and row structure
- same presence or absence of descriptions/helper text
- no new card/badge/icon/progress/loading treatment introduced
- row style matches context: settings nav vs device row vs mapping row vs search result vs log row vs inbox row
- modal type matches job: `SlideModal`, shadcn `Dialog`, or full-screen `WriteModal`
- focus rings and accessible labels intact
- mobile safe-area and desktop max-width handled by existing shell
