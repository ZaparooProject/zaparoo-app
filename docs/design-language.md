# Zaparoo App Design Language

This document describes how the app already looks and behaves. It is not a wishlist and not a place to invent new UI. When changing UI, match the nearest real pattern first.

## Non-negotiable rule

Existing app UI wins. Nearby screens win over generic preference. If no existing pattern fits, stop and ask before introducing a new visual treatment.

Do not add decorative icons, new card styles, helper text, descriptions, badges, stat blocks, progress styles, loading treatments, spacing systems, or typography treatments unless the same context already uses them or the user explicitly asks.

## Source-of-truth files

Use these before creating or changing UI:

- App shell: `src/components/PageFrame.tsx`, `src/components/ResponsiveContainer.tsx`, `src/components/BottomNav.tsx`, `BackToTop.tsx`, `ConnectionStatusBar.tsx`
- WUI primitives: `src/components/wui/Button.tsx`, `ModalActionBar.tsx`, `ModalActionRail.tsx`, `HeaderButton.tsx`, `CircleButton.tsx`, `StatusPill.tsx`, `TabBar.tsx`, `Card.tsx`, `ToggleSwitch.tsx`, `TextInput.tsx`, `PinInput.tsx`, `Badge.tsx`, `EmptyState.tsx`, `RadioGroup.tsx`, `ToggleChip.tsx`, `SettingHelp.tsx`; `src/components/HeaderOverflowMenu.tsx`
- Modals: `src/components/SlideModal.tsx`, `ConfirmClearModal.tsx`, `PairingModal.tsx`, `RequirementsModal.tsx`, `ProPurchase.tsx`, `home/StopConfirmModal.tsx`, `home/StagedTokenModal.tsx`
- Settings screens: `src/routes/settings.index.tsx`, `settings.readers.tsx`, `settings.advanced.tsx`, `settings.accessibility.tsx`, `settings.media.tsx`, `settings.play-controls.tsx`, `settings.about.tsx`, `settings.help.tsx`, `settings.online.tsx`, `src/routes/-pages/Devices.tsx`, `DeviceDetail.tsx`, `Logs.tsx`
- Create/search flows: `src/routes/create.index.tsx`, `create.custom.tsx`, `create.nfc.tsx`, `create.mappings.tsx`, `src/routes/-pages/Search.tsx`, `MappingEditor.tsx`, `ZapScriptInput.tsx`
- Home: `src/routes/-pages/Index.tsx`, `src/components/home/*`
- Lists/selectors: `MappingRow.tsx`, `VirtualSearchResults.tsx`, `SystemSelector.tsx`, `TagSelector.tsx`, `SimpleSystemSelect.tsx`, `DeviceRow.tsx`, `NetworkScanModal.tsx`, `InboxModal.tsx`
- Foundations: `src/styles/theme.css` (semantic palette), `src/styles/components.css` (materials), `src/index.css` (Tailwind aliases, tours, keyboard)

## Visual foundations

### Theme

Zaparoo App is mobile-first UI using Online's tactile materials in dark and cool-neutral light themes. System is the default; Settings → Accessibility → Appearance offers System, Light, and Dark. Appearance applies app-wide, follows OS changes live in System mode, and persists through Capacitor Preferences. A valid legacy `vite-ui-theme` is migrated without replacing explicit choices.

Online, not the constrained Rust frontend, owns the visual direction: chunky arcade buttons, Outfit typography, recessed inputs, small-radius surfaces, and restrained status/interaction colors. Existing Zap composition and workflows remain unchanged; the customizable Hub is a separate delivery.

Use semantic roles from `src/styles/theme.css` through existing Tailwind aliases:

- background: `var(--color-background)` / `bg-background`
- foreground: `text-foreground`; secondary copy: `text-muted-foreground`
- muted text: `text-muted-foreground`
- disabled text and borders: `text-foreground-disabled`, `border-foreground-disabled`
- interaction: `text-primary`; filled button material comes from `Button`, not a utility class
- status colors: `text-success`, `text-error`, `text-warning`; washes `bg-success-wash`, `bg-error-wash`, `bg-warning-wash`, `bg-primary-wash`
- borders: `border-border` for dividers and panel edges, `border-input` for field edges; `border-error` for error state
- surfaces: `bg-surface-raised`, `bg-surface-inset`, `bg-surface-highlight`; card gradients and button caps are owned by `.wui-card` and `.wui-button` in `components.css`
- shadows: use `--material-shadow` and `--material-highlight` (for example `shadow-[0_-4px_12px_var(--material-shadow)]`); no hardcoded black shadows
- focus: `ring-ring` or the `--interaction` outline; never a white ring

The legacy `bd-*`, `bg-button-pattern`, `bg-card-pattern` and `bg-wui-card` utilities still exist while call sites migrate. Do not use them in new code.

Do not hardcode new colors unless matching a nearby existing hardcoded pattern. Prefer app tokens and WUI components.

### Typography

Font is locally bundled variable Outfit (100–900), with platform system-font fallbacks for unsupported glyphs. Font and OFL notice live under `public/fonts/`; web, native, and Core builds do not request Google Fonts. Use existing Tailwind classes; do not introduce custom font families.

Common hierarchy:

- Existing translated page titles retain their source casing during this visual migration; new copy follows Online sentence case. Examples: `Manage Media`, `Play Controls`, `Create a New Tag`.
- Section headings and field labels use sentence case: `Media database`, `Metadata scraper`, `Playtime limits`, `Session reset timeout`.
- Page titles are left-aligned Outfit, 20px (`text-xl`)/600, tight tracking and natural wrapping. `PageHeader` owns the typography; programmatic heading focus remains, without a decorative outline.
  - Seen across settings, create, search, logs, devices.
- Slide modal title: `text-lg font-semibold`, centered on mobile and left-aligned from the `sm` breakpoint, above the body.
- Home section labels: `text-muted-foreground font-bold capitalize`.
  - Used by `NowPlayingCard`, `ReaderStrip` and the home cover rows.
- Card/list primary text: usually `font-semibold` or `font-medium` depending sibling row.
  - Create landing card titles use `font-semibold`.
  - Connection status title uses `font-medium`.
  - Mapping row primary label uses `font-medium`.
- Settings field labels: match sibling label treatment exactly, commonly `text-sm font-medium`, `mb-1 block`, or `text-foreground` depending screen.
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
  - Settings index, Advanced, Accessibility, Manage Media.
- Dense settings/control pages: `flex flex-col gap-3`
  - Readers, Play Controls, Create landing.
- Form/editor pages: `flex flex-col gap-4`
  - Mapping editor, Help, Online auth flows.
- About page: `flex flex-col gap-8` with smaller inner `gap-2` / `gap-3` groups.
- Search form groups: `space-y-3`, with nested `flex flex-col gap-3 md:flex-row` where filters become columns on desktop.
- NFC tabs: tab content uses `space-y-4 px-2 pt-4/pt-6`; inner NFC panels use rounded background blocks, not WUI Card.
- Modal content: `SlideModal` owns the horizontal gutter and compact title-to-body gap; selector/search body wrappers do not add another shell-level padding. Confirmation modals vary between `py-4` and `p-4` based on the existing modal being matched.

Use the nearest screen’s spacing. Do not mix gap systems inside one section unless sibling code does.

### Header pattern

Subpages use:

- `HeaderButton` with `BackIcon size="24"` on left
- left-aligned `<h1>` title, styled consistently by `PageHeader`
- optional right `HeaderButton` or small group of `HeaderButton`s for page actions; grouped header controls have no wrapper gap, leaving 8px between their inset visible faces
- header controls move face and content together when pressed; modal triggers expose `aria-expanded` and retain the active inset face while their modal is open
- `useSmartSwipe({ onSwipeRight: goBack })` when nearby routes use swipe-back

Root tab pages can omit the back button and use a left-aligned title or existing branded content. Visible header controls use the same 8px mobile chrome inset as bottom navigation rather than the 16px page-content gutter. On Home, keep the compact logo left and group the content-sized device status control directly beside History on the right. Both controls use the same header-button face; the status control must not grow to consume remaining header space.

### Bottom navigation and floating app chrome

Bottom nav is its own pattern in `BottomNav`:

- below `md`: a 64px dock plus the bottom safe inset (`--bottom-nav-base-height`), full width, flush to the screen edges, flat `surface-raised` face with a top edge
- from `md`: a contained floating bar (max 42rem, 8px corners, material shadow, 80px tall) with icon and label side by side
- four equal nav buttons with 48px minimum hit height
- uppercase 12px/600 labels with neutral icons; the active destination uses primary text on a recessed surface, a blue icon with a restrained glow, and `aria-current="page"`
- no attention/throb animation on nav items; unread counts use `NotificationBadge`
- `RootLayout` measures the footer and publishes `--app-footer-overlay-height` and `--app-footer-overlay-clearance` on the layout wrapper and on `:root`. Anything fixed above the nav (the global write strip, `BackToTop`) positions with the clearance variable, not `--bottom-nav-base-height`, so it clears the floating desktop bar and the status strip

Global connection status uses `ConnectionStatusBar`, an in-layout strip above bottom nav:

- sub-second connecting/reconnecting stays hidden
- routine connecting/reconnecting uses muted neutral styling and an inline spinner
- prolonged Core/network unavailability uses warning styling and a Settings action
- Settings landing relies on its contextual connection card instead of duplicating the visible strip; Home does not, because its device pill carries identity rather than connection state
- restored status appears briefly only after a connection issue was presented

`BackToTop` is the only floating circular page utility. Use it only on long,
scrollable result or reference surfaces where returning to controls or the list
start would otherwise require substantial reverse scrolling. It uses the
neutral secondary `CircleButton`, clears the measured footer (`--app-footer-overlay-clearance` plus 1rem by default) and safe areas,
respects reduced motion, and returns keyboard focus with the viewport. Do not
introduce additional floating actions or use primary action colour for this
navigation utility.

Do not use these styles for ordinary page content.

## Components

### Button

Use `src/components/wui/Button.tsx`.

Variants:

- `fill` default: primary gradient button, border, white text
- `secondary`: neutral raised cap for Cancel and supporting actions
- `outline`: quieter inset face with a two-pixel edge for utility/alternative actions
- `ghost`: chrome-free icon utility with only a subtle hover/pressed wash; use for small inline refresh and similar affordances
- `text`: unframed textual action without filled treatment

Intents: `default`, `primary`, `destructive`, and `pro`. `destructive` supplies the red cap and red text/border; `pro` supplies the gold cap with a dark label, and gold text/border on non-filled variants. Reserve gold action styling for every paid-upgrade or paid-support call to action: Unlock Zaparoo Pro, Get Warp, subscribe, the final Pro purchase action, and Join the Patreon. Use `intent="pro"` for these; gold means “upgrade to premium,” not general emphasis or ordinary settings navigation. An active Pro state is a status (Badge or text), not a disabled button.

`intent="destructive"` alone supplies the whole destructive treatment; do not add `border-error text-error` or similar classes. Cancel is `variant="secondary"`, not `outline`.

Sizes:

- default: normal app action
- `sm`: compact secondary action
- `lg`: rare large action

Shape is owned by Button:

- standalone icon-only buttons are round; `shape="square"` aligns Save and editor utility controls with rectangular fields
- labeled buttons use 4px corners, bold uppercase Outfit labels, and 0.05em tracking
- primary and secondary buttons have 4px opaque front edges and three-stop caps; outline has a 2px edge and half-distance travel
- pointer hover lowers caps by 2px; press lowers them by 4px, without scaling/fading
- touch targets remain at least 48px; compact labels do not shrink the hit target
- reduced-motion settings disable transitions, and disabled controls do not travel
- disabled appearance communicates why the control is unavailable:
  - `disabledAppearance="unavailable"` is the default recessed/sunken state. Use it when a prerequisite, capability, selection, connection, or current media state is absent. “Unavailable” can still change during the page lifetime; it means no automatic completion is currently restoring this control.
  - `disabledAppearance="busy"` retains the normal raised material at 50% opacity. Use it while an in-flight action temporarily locks the control and it will automatically become available when that action settles, such as launching, saving, pairing, searching, or deleting.
  - when both reasons are possible, select `busy` only while the in-flight flag is active; otherwise use `unavailable`. A loading label or spinner should continue to explain the active work.
- haptics derive from `intent`: default light, primary and pro medium, destructive heavy; destructive and pro intents also supply visible colour treatment
- geometry is owned by the component, materials live in the CSS components layer; call-site utilities must not have to fight unlayered overrides

Use `className="w-full"` for full-width primary page actions and complex-modal primary actions. Say it explicitly rather than relying on flex-column stretch: from the `md` breakpoint up, full-width buttons cap at 20rem and center, so a page action does not stretch across the desktop column. `ModalActionBar` and `ModalActionRail` opt their children out of that cap. Use `className="flex-1"` only for equal-width confirmation actions sharing one footer row.

Button layout is inline by default. `layout="responsive"` is reserved for compact action-rail items: icon above caption on narrow screens, then icon beside caption from the `sm` breakpoint. Keep rail captions on one line.

Do not build custom buttons with raw `<button>` unless implementing a specialized primitive already present in the codebase, such as selector rows or segmented radio buttons.

### CircleButton

Use `src/components/wui/CircleButton.tsx` for raised circular icon actions. It mirrors Zaparoo Online's dedicated CircleButton material rather than approximating it with a rounded generic Button. Default controls retain a 48px touch target; variants are `primary`, `secondary`, `destructive` and `pro`. Use `variant="secondary"` for neutral contextual actions such as Pair in the device sheet and `BackToTop`.

### HeaderButton

Use `HeaderButton` only for header actions: back, history, reload, close-like header controls.

Pattern:

- 48px square hit target with a 6px-radius raised face inset 4px inside it
- icon-only
- accessible name should come from `aria-label`; some existing log actions use `title`, but new icon-only header actions should include `aria-label`
- active state interaction blue with accessible pressed state; disabled muted text

Do not use `HeaderButton` inside page body.

`HeaderOverflowMenu` collects secondary header actions behind one ellipsis `HeaderButton` that opens a `SlideModal` of full-width secondary buttons. Use it when a header has more actions than fit, rather than adding a fourth button.

### StatusPill

`StatusPill` is the content-sized header status control (Home device pill). It shares the `HeaderButton` face, keeps a 48px minimum height, truncates its label, and exposes `aria-expanded` when it opens a sheet. It never grows to fill the header.

### TabBar

`TabBar` is the inset tray for switching content panels: NFC Read/Tools, History Scans/Played, Library Systems/Collections, system categories, and Remote Keyboard Remote/Keyboard. It always uses tab semantics with panel ids from `tabBarIds`. Never use its tab faces for a setting or form value; use `RadioGroup` instead.

### PinInput

`PinInput` is the one-time-code entry used for pairing and PIN flows: individual 48px recessed slots built on the `wui-input` material, digits only, with a primary-coloured active slot and the standard disabled treatment.

### Card

Use `src/components/wui/Card.tsx` when existing flow uses card containers.

Card style:

- 8px corners
- `p-4` (navigation-group shells use `p-2` around padded rows)
- semantic subtle border
- elevated-to-raised surface gradient from `.wui-card`
- inset material highlight and restrained shadow
- disabled interactive cards use a permanently recessed `surface-inset` face
  with an inner shadow and clearly faded content; they do not retain the raised
  card shadow, hover response, press travel, or haptic feedback

Real use:

- Settings top cards: device connection, media database
- Home connection status
- Create landing action cards
- Search database warning card
- Device rows/history entries via `DeviceRow`
- Core outdated notice with warning border/background overrides

Group related settings on a shared raised Card; controls recess into that surface. Do not wrap each toggle in its own card. Accessibility and Language & Region are single form panels; Readers separates reader status from controls; Play Controls preserves its existing named groups.

### ToggleSwitch

Use `ToggleSwitch` for boolean settings.

Pattern:

- row: label left, switch right
- grouped rows live on a raised settings panel; no individual card wrapper
- 48px hit region around a 44×24 track and a 20px physical thumb; the raised cap lifts above the track while its lower 3D edge stays inside, with equal end clearance in either state. A semantic thumb border supplies contrast in light mode only; geometry scales with text zoom
- label can include `SettingHelp`
- `loading` shows skeleton switch
- disabled state belongs on switch, not custom opacity wrapper

Real use: Readers, Advanced, Accessibility, Play Controls, Media Scrape force toggle.

Do not add paragraphs under toggles. Put longer explanation in `SettingHelp` if the settings page already uses it.

### TextInput

Use `TextInput` for standard text/number/search input.

Built-in style:

- label above input, `mb-2 block text-sm font-medium`
- input height `h-12`
- recessed `--surface-inset` with inner shadow (from `.wui-input`)
- `border-input` edge; `border-error` when invalid
- 4px corners
- disabled state uses `border-foreground-disabled` and `text-foreground-disabled`
- optional square Save action separated from the field by a gap; its position stays reserved while disabled
- clear action remains inside the input; no attached round Save cap

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

### Radio choices and tabs

Use `RadioGroup` for one setting/form value among mutually exclusive choices. Its circular recessed indicators and selected dots must not look like navigation tabs. No shared tray, raised option faces, or blue CTA buttons.

- Default to stacked 48px rows. Use this for three or more options, long labels, and choices that reveal related form fields: appearance, text size, shake mode, profile role/PIN/limits, mapping type/match, and deck item type.
- `layout="inline"` is only for two short choices without conditional form fields, currently reader Tap/Hold and Warp Annual/Monthly. Options share a line only while their content fits; translated labels and text zoom can push them onto separate rows. Do not squeeze, truncate, or horizontally scroll radio choices.
- Long labels wrap, with the indicator aligned to the first text line. Existing group help remains associated with the group.
- Arrow/Home/End selection and roving focus remain; an unselected group still has a keyboard entry point. Disabled groups cannot activate or receive keyboard focus.
- Existing Library sort lists and write-target value rows are specialized radio patterns, not tab bars; keep their established layouts.

Reserve `TabBar` for content panels with tab/panel wiring. Its compact inset tray has 48px interactive targets and 40px visible faces, with equal 4px padding around each face. Selected tabs rise from the tray, with neutral text, edge and highlight. Scrolling tab lists retain single-line options. There are no Radix Tabs in the app.

### ToggleChip

Use `ToggleChip` for compact on/off controls, especially icon or filter-like toggles.

Real use:

- Logs level filters (`compact` chips)

The Home History control is a `HeaderButton`, not a chip.

Do not use chips for normal settings; use `ToggleSwitch`.

### SettingHelp

Use `SettingHelp` for settings explanations already expressed as help icons.

Real behavior:

- inline circular help button with `HelpCircleIcon size={18}`; wrapper and button use flex centering so inline baseline space cannot lift the icon above neighboring labels or Pro badges
- hint color `text-foreground-hint`, hover/focus muted
- opens a content-sized `SlideModal`
- supports `**bold**` and paragraph breaks in description text

Do not replace an existing help-icon pattern with visible helper paragraphs.

## Settings pages

Settings are restrained control panels: raised grouped surfaces, inset fields and choices, and neutral navigation rows. Avoid decorative icons, invented helper copy, and a separate card for every setting.

### Structure

Subpage pattern:

1. `PageFrame`
2. back `HeaderButton`
3. left-aligned page title using shared `PageHeader` typography
4. content stack
5. settings rows/inputs/toggles

Examples:

- `settings.advanced.tsx`: simple `gap-5` stack of toggles and nav row
- `settings.readers.tsx`: dense `gap-3` stack because it has multiple reader controls
- `settings.play-controls.tsx`: grouped settings; inner field groups must match within page

### Settings navigation rows

The Settings index is a grid of outline-button tiles in `settings-navigation-grid`: each tile is a `site-button site-button-outline` with a muted leading icon and label, and status tiles span the full row. Do not turn the index back into a list of rows.

Link rows inside settings subpages (Advanced, About) use `settings-nav-row`:

- 48px minimum, 12px padding, neutral text and a trailing chevron
- text on left
- `NextIcon size="20"` right
- related rows share a raised Card shell; rows remain flat, not individual action cards
- no invented descriptions

Device history is a different settings subflow:

- list wrapper `flex flex-col gap-3 pt-2`
- rows use `DeviceRow`, which is a `Card` with active dot, primary name/address, muted address/platform/version metadata, optional lock icon, and optional right action button
- device detail uses `flex flex-col gap-6 p-3`, TextInput for name, a home-style info section heading `text-muted-foreground font-bold capitalize`, and full-width buttons

### Settings toggles

Use `ToggleSwitch` directly in stack.

If help is needed:

```tsx
<ToggleSwitch
  label={t("...")}
  help={<SettingHelp title={t("...")} description={t("...")} />}
/>
```

Keep help buttons and their modals outside the checkbox label so opening or closing help cannot change the setting. Do not add a visible helper paragraph below one toggle if sibling toggles use `SettingHelp`.

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

Native selects share the `wui-input` recess and 48px minimum height. Keep native picker behavior:

- Settings language and scraper select: `wui-input border-input text-foreground min-h-12 rounded-md border border-solid p-3`
- `SimpleSystemSelect`: `wui-input` with `border-input text-foreground w-full rounded-md border px-3 py-2`
- labels above are often `text-foreground` or `mb-1 text-foreground`
- disabled: opacity/cursor where nearby component does so

Real use: language select, scraper select, media search modal simple system select.

### Search/filter forms

Search route pattern:

- role `search`
- `TextInput` for query with `type="search"` and `clearable`
- filter labels `mb-1 text-foreground`
- selector triggers for system/tag
- full-width Search button

### Selector triggers and modal selectors

Use `SystemSelector`, `TagSelector`, and their trigger components for choosing systems/tags.

Selector modal pattern:

- `SlideModal fixedHeight="90vh"`; shared modal maximum clamps rendered height to 80% of viewport
- search bar at top with icon inside input
- category tabs/accordion where relevant
- search and category controls participate in normal modal scrolling rather
  than sticking over list content
- virtualized list rows
- footer for multi-select apply/clear count
- `BackToTop` for long lists

Tag selector keeps selected count inside the Apply label so its footer remains a
single action row. Category labels map every canonical Core tag type; internal
`scraper.*` and `scraper-run.*` bookkeeping tags are not user-facing filters.

Do not create a new picker UI for systems/tags.

## Modals

### SlideModal

Use `SlideModal` as the default modal for app flows: bottom sheets, selectors, action confirmations, and multi-step content. Prefer it unless the nearest existing flow already uses a different modal type.

Visual behavior:

- black overlay `bg-black/60`, no blur
- bottom sheet on mobile, centered max width on desktop
- content-sized by default and capped at 80% of viewport height
- fixed-height selector/search requests are still capped at 80%
- opaque raised surface with semantic border and a material highlight
- 8px upper corners; 16px shell gutter matching page content. Modal body
  wrappers do not add a second horizontal gutter; padding inside rows, cards,
  and fields remains component-owned
- header, scrollable body, and persistent footer form distinct zones
- mobile drag handle uses muted foreground
- `text-lg font-semibold` title, centered on mobile and left-aligned from `sm`;
  compact 8px title-to-body spacing, drag handle, and desktop close action;
  the drag handle and close button keep 48px hit areas around their smaller visuals, and focus uses the `ring` outline
- safe-area bottom padding
- focus trap and Android back handling

Persistent footer behavior:

- footer stays in normal flex flow below scrollable body with an 8px gap after its divider; never float actions over content
- body shrinks and scrolls before footer; footer gets its own constrained overflow only as short-viewport/text-zoom fallback
- simple confirmations keep two labelled, equal-width actions on one row
- form and selector footers with one secondary action plus one primary action use `ModalActionBar`, preserving the same labelled, equal-width pair; examples include Reset/Apply, Clear/Apply, Delete/Save, and Logout/Save
- media/detail modals with several independent contextual actions use `ModalActionRail`; do not treat those actions as confirmation buttons
- on narrow screens, the rail spans the footer above a full-width primary action; rail items use an icon above a short caption
- from the `sm` breakpoint, the rail sits left of the primary action and its items switch to inline icon-and-caption layout
- rail items share available width while they fit, never wrap onto another row, and scroll horizontally once their minimum widths exceed the available space; adding actions must not shrink the primary action or grow the footer vertically
- use short, stable visual captions such as `Favorite`, `Write`, `Copy`, and `Preview`; communicate toggle or loading state through icon treatment, `aria-pressed`, disabled state, and a state-specific accessible name rather than changing caption width. The contextual reader action explicitly changes `Write` to `Cancel` while waiting; `Button.labelAlternatives` reserves space for all translated captions so its footprint stays stable
- rail icons never shrink, captions remain on one line, action order stays stable, every item remains directly reachable, and secondary actions precede the primary action in DOM and focus order
- reserve icon-only buttons for established constrained controls and always provide an accessible `aria-label`
- modal action targets stay at least 48px high; keep actions mounted and disable them during temporary unavailable, empty, disconnected, or loading states so the rail does not reflow
- do not use action rails for confirmations, form submission pairs, single terminal actions, navigation, or unbounded destination data such as individual collections
- current reference implementations are `MediaDetailsModal` and `LibraryMediaDetailsModal`
- use `footerSkipLabel` when long content needs direct keyboard/screen-reader navigation to actions

Use `dismissible={false}` only for mandatory blocking flows. This keeps the visible overlay but disables overlay-click, drag, Escape, Android-back, and close-button dismissal while preserving explicit completion/logout actions.

Do not implement one-off bottom-sheet shells.

### Reader activity

Physical NFC waits stay in context instead of opening an app-owned modal. `ReaderActivityControl` is the shared full-size control for NFC scan, read, and write actions, including Zap’s Tap a tag action; compact action rails use `ReaderActivityAction` below. Do not reproduce their latched state or pulse with a one-off `Button`:

- waiting latches the physical button down and adds a broad, slow blue halo outside its edge; do not draw an illuminated line inside the button face
- a required re-tap uses an external amber double pulse
- verification failure swaps to an explicit Retry/Cancel pair: Retry stays latched (pressed face) inside a static red halo with the failure text inside its face, and Cancel is an outline button; nothing pulses. Actions share equal-width columns while they fit and stack at narrow or enlarged-text widths rather than squeezing their labels
- match ordinary full-width buttons: fill the mobile column, cap at 20rem only from the desktop breakpoint, and use normal stack gaps; the halo paints outside the face without adding layout padding
- status sits inside the button beneath its main label, in smaller sentence-case text that inherits the face's contrasting text color. Compact reader buttons have a 72px minimum height for both idle and active states; Zap keeps its larger face. Content can grow for translated labels and text zoom rather than clipping. Do not reserve an empty status row below the button
- pressing the latched waiting control again cancels the session; visible status copy says “Press again to cancel” so it cannot be mistaken for another NFC-card tap
- labels describe the physical action; do not imply finite progress
- state changes receive one live announcement without moving focus
- the waiting halo is a solid ring whose `box-shadow` spread animates outward up to 8px, within ordinary control gutters; the re-tap glow animates opacity. The halo colour derives from `--interaction`
- reduced motion keeps a static illuminated state

Game-detail and deck action rails use `ReaderActivityAction`, not the full-size control:

- keep the selected game and original Write control mounted; its icon becomes NFC, face latches down, and visible caption changes `Write` → `Cancel` → `Write`. Pressing Cancel ends the owned write without closing details
- reserve caption width for Write, Cancel, and Retry, including translations; ordinary waiting must not resize the rail, footer, or sheet
- do not append “Hold tag to reader” or “Press again to cancel” paragraphs. Announce waiting once; the visible Cancel caption already explains the action. Only re-tap and verification recovery need additional instructions
- reader rails include halo gutters in the intrinsic scrolling content width, not padding around overflowing grid tracks. Keep clearance at both scroll ends and below the depressed face; preserve normal scrolling boundaries and focus targets
- contextual writes never enqueue a detached global write; cancel owned work when its details close or selection/device changes

Queue or deep-link writes without a visible source control use the compact reader activity strip above the measured footer clearance (`--app-footer-overlay-clearance`). Native iOS NFC system UI may still appear because it is OS-owned. Do not add spinner, orbit, fake percentage, or app-owned full-screen reader overlays.

### Confirm modals

Confirm modal content is simple, but not one single template. New action confirmations should generally use `SlideModal` with concise text and equal-width buttons.

- `StopConfirmModal`: `SlideModal` with a centered paragraph in a `p-4` body and a `ModalActionBar` footer: Cancel (`secondary`) left, confirm (`intent="primary"`) right, equal width.
- Advanced error reporting confirmation matches the `StopConfirmModal` pattern.
- `ConfirmClearModal` and mapping delete confirmation use `py-4` and a `flex gap-2` equal-width button row with Cancel `secondary` and the confirm action `intent="destructive"`.
- Manage Media clean confirmation uses `SlideModal`, muted description text, and a `flex gap-2` equal-width button row.

Match the existing confirmation type closest to the action. Destructive confirmations use `intent="destructive"` alone; do not add manual `border-error text-error` classes.

### Staged token modal

Launch Guard staged token modal pattern:

- `SlideModal fixedHeight="auto"`
- footer with two equal buttons in `flex gap-3`; shared footer owns separator and top padding
- content `flex flex-col gap-4 py-4`
- muted small description
- token value `text-foreground text-sm font-medium break-all`

Keep it concise. Do not add extra cards/icons/status badges.

## Home screen

Home is the phone-as-reader screen: scanning is the primary action and the one
Pro is sold on, and everything below it is the connected device's live state.

Order: header (logo, device pill, history) → scan actions → Remote Keyboard → Now Playing →
background slot → favourites → recently played → reader strip.

Patterns:

- Scanning is `ScanActions` (`src/components/home/ScanActions.tsx`): a stacked
  column with the leading mode first and the other mode beneath. NFC leads
  unless the camera is the mode last used, and a phone with one capability
  gets a single action. There is no mode toggle. The NFC action is a
  `ReaderActivityControl` (`size="lg"`, `layout="stacked"`); the camera action
  is a secondary stacked `Button`. When NFC is disabled the NFC slot becomes a
  primary button that opens NFC settings.
- While a queued or deep-link write is active, its `ReaderActivityControl`
  replaces the scan actions; with no reader at all the section shows an
  `EmptyState` inside a `Card`.
- The NFC control stays pressable while scanning: its label and accessible name
  switch to the scanning/stop state and it carries `aria-pressed`.
- Remote Keyboard is a full-width secondary `Button` below the scan actions,
  behind the `remoteInput` feature gate and disabled while disconnected.
- Device identity is a `StatusPill` in the Home header actions, opening a
  `SlideModal` device sheet. The sheet keeps Pair as a circular secondary icon
  action on the connected-device status row. It runs one bounded discovery pass on open,
  offers an icon refresh action, and merges discovered devices into the saved
  switch list by stable ID, hostname, then endpoint. Omit the currently
  connected device; inactive rows do not reserve an empty status-indicator
  gutter. Selecting an unsaved result saves and connects it. Connection
  _problems_ belong to the global
  `ConnectionStatusBar`, not to Home.
- Now Playing is a `Card` with cover art from `LibraryArtwork`, the title and
  system, and transports derived from the media's `launcherControls`. Keep the
  previous/stop/play/next deck mounted while idle so the card does not shift.
  Idle Play replays the most recent media when available; the other controls
  remain unavailable. Never repurpose the Stop position as Play. When a
  playlist is active, keep the artwork/title/system area exclusively about the
  active media; do not replace it with playlist metadata or position. Show the
  text queue in a second recessed, vertically scrollable well below the
  transport. Its compact header carries playlist name and plain item position.
  Each 48px row selects that item with `playlist.goto` then `playlist.play`;
  highlight and auto-center the current item, using its name with ZapScript as
  the fallback. Do not render playlist position as a progress bar.
- Recently played and favourites are horizontal cover rows that scroll, each
  hidden when empty. Tapping a cover opens the shared media-details sheet so
  launch, favourite, and write actions stay consistent with Library and search.
- The reader strip uses the shared `ReaderStatusRow`, the same row as reader
  settings. Both lists sort by displayed name (natural numeric order), with reader identity breaking ties; connection changes never reorder rows. Names fill remaining width so state and optional detail sit on the right.
- The History sheet uses the neutral title “History” with semantic Scans and
  Played tabs. Both tabs use `HistoryListRow`: primary value or media title,
  muted timestamp metadata, optional low-priority details, and a right-aligned
  ghost Play action. Scan failures use a compact text status rather than
  colouring the entire row. Keep the sheet at a stable 70vh while either API
  loads, prefetch Played history when the sheet opens, and request distinct
  media with a local compatibility dedupe for older Core versions.
- Home section headings use `text-muted-foreground font-bold capitalize`.
- Stop and transport actions are icon-only outline `Button` controls inside a
  shared recessed transport deck.

Do not copy Home heading style into Settings; it is home/status-specific.

## Create, Search, and NFC flows

### Create landing

Create index uses stacked `Card` rows:

- `flex flex-row items-center gap-3`
- neutral inset square icon tile (decorative, not a fake blue button)
- text stack with `font-semibold` title and muted `text-sm` supporting copy
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

### Recent searches

The Recent Searches sheet follows the Home History sheet rather than card-menu
styling:

- content-height sheet that grows until `SlideModal`'s maximum height, then
  scrolls
- shared `HistoryListRow` geometry with search text as the primary value and a
  muted timestamp below
- right-aligned ghost Search action
- Clear History is a centered destructive text action below the list with a
  full-width touch target but no visible button face; it is not a prominent
  modal footer action
- clearing keeps the sheet open so the empty-state result is apparent

### Write-focused media details

Search/Create media details prioritize the value being written:

- with Show filenames off, ZapScript is first and selected by default
- with Show filenames on, Path is first and selected by default
- tags only modify parsed ZapScript; Path selection disables them using the
  shared recessed unavailable treatment
- Favorite, Copy, and Preview remain secondary to Write in the modal action
  rail, with no extra body padding above the footer

### Mapping editor and ZapScript input

Mapping editor uses a plain `flex flex-col gap-4` form stack:

- `TextInput` for label/pattern
- stacked `RadioGroup` for type/match
- `ZapScriptInput` for override text
- `ToggleSwitch` for enabled
- save button primary, delete button `intent="destructive"`

`ZapScriptInput` is its own compound editor:

- recessed monospace textarea with the shared input focus/error vocabulary
- raised attached toolbar with matching boundary and 4px lower corners; utility rows wrap at narrow/zoomed widths
- character count muted small text
- command palette uses existing `Button variant="outline"` grid/flex rows, localized category headings, and `BackToTop` for its long command list
- clear action uses `ConfirmClearModal`

Do not replace ZapScript editing with a plain `TextInput`.

### NFC tabs

NFC utilities use `TabBar` (`role="tab"`) for Read/Tools.

NFC content panels use custom rounded blocks, not WUI `Card`:

- wrapper: `bg-surface-raised space-y-4 rounded-lg p-4`
- headings: `text-lg font-semibold`
- values: `bg-surface-inset rounded-lg px-3 py-2`, often mono/small
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

Use this style for mapping-like data rows. Mapping lists and editors show delayed inline loading, an explicit retryable load error, and `BackToTop` on long mapping lists. NFC and Camera capture buttons in the editor are supporting outline actions; Save remains the primary action.

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

- signed-in order is Connected device → Online features → Warp → Account; name/email live in Account
- mobile Online content starts 16px below the header and ends 16px above the measured footer overlay, matching horizontal gutters; do not add page-wrapper vertical padding. Feature rows rely on their 48px hit heights rather than extra row gaps
- linked state is plain “Linked to Zaparoo Online” text, never a disabled action or a claim that the device belongs to the signed-in account
- Online features use a tri-state master checkbox (none, some, all) above individual switches; pressing the mixed state enables all available features. Cloud backups only join the master selection when Warp is confirmed
- remote connection state sits beneath Remote control; backup result sits beneath backup controls. Only cloud backups carry a Warp requirement; do not label ordinary features “Free”
- account actions are full-width outline buttons in `gap-3`
- delete/scheduled-deletion states use error border/text/background treatments
- signed-out view starts with primary Log in and secondary Sign up; authentication opens a `SlideModal` containing recessed `TextInput`s and the primary submit action

Do not use Online account avatar/card/error panel patterns for unrelated settings.

## Logs, inbox, and notifications

### Logs

Logs screen is a dense utility page, not a card/list page:

- header can have multiple `HeaderButton`s in a `flex` right slot with no wrapper gap
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

- inbox button is `HeaderButton` with Bell icon and a `NotificationBadge` count
- empty inbox uses `EmptyState` with Bell icon
- rows are `Card`s (`flex flex-row items-start gap-3`), not bordered boxes
- severity icon left, title `text-foreground font-semibold`, body `text-muted-foreground text-sm`, timestamp `text-muted-foreground text-xs`
- row body can expand/collapse with `line-clamp-2`
- delete uses small text `Button` with trash icon
- clear-all confirmation lives in modal footer, not a separate modal

Do not reuse inbox card rows for ordinary settings/navigation lists.

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
- physical read/write waits use the latched `ReaderActivityControl`, not a loading spinner or blocking overlay

Do not invent new loading cards or shimmer styles.

### Progress

Progress bars exist for media database and scraper flows.

Patterns:

- both media database and scraper bars: a `h-[10px]` `rounded-full` track with `border-border bg-background`, and an `h-[8px]` `bg-primary` fill (`animate-pulse` for indeterminate optimizing)
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
- Inbox row: `Card` row with severity icon and compact timestamp
- Card row: only inside `Card`-based menus/status blocks

Do not mix row styles in one list.

## Icons

Icons communicate actions or status. They are not decoration for settings copy.

Common sizes:

- 20px: row chevrons, button icons, small actions, log header actions
- 24px: header buttons, status icons, settings/action icons, bottom nav icons
- 18px: small edit/delete/help-adjacent actions where existing component uses it
- 16px: inline metadata and compact status icons
- larger sizes only when owned by a component, e.g. the primary reader control

Rules:

- icon-only interactive controls need `aria-label`
- decorative Button icons in cards should use `decorative`
- do not add icons to settings section headings or field labels unless existing sibling headings/labels do

Button icon usage:

- icons mark actions with a universal glyph (add, search, play, share, copy, edit, delete, refresh, external link); confirm and dismiss words (Cancel, Apply, Done, Save, Create, Try again, Yes/No, Log in, Sign up) are text-only
- the trash can means deleting stored data. Clearing a selection or filter is text-only (an X only for a dismissible chip)
- buttons in the same footer, pair or rail either all have icons or none do; a trigger may have an icon while its confirmation dialog does not
- buttons that leave the app use the custom `ExternalIcon`
- use one glyph per concept: where `src/lib/images.tsx` defines it (Play, Search, Save, Create, Camera, Nfc, External, History, Back, Next), use that instead of the lucide equivalent, except the Pause/Play/Skip transport set. Import lucide icons with their `Icon` suffix (`XIcon`, `Trash2Icon`)
- busy buttons show `LoadingSpinner size={20} decorative`, never a raw `Loader2`

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
- focus rings use the semantic interaction token (`ring-ring` or the `--interaction` outline); no hardcoded white ring on light surfaces, and `ring-offset-*` needs `ring-offset-background`

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
- modal type matches job: `SlideModal`; reader waits stay in context
- focus rings and accessible labels intact
- mobile safe-area and desktop max-width handled by existing shell
