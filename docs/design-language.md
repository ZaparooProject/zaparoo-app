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
- Lists/selectors: `MappingRow.tsx`, `VirtualSearchResults.tsx`, `SystemSelector.tsx`, `TagSelector.tsx`, `SimpleSystemSelect.tsx`, `DeviceRow.tsx`, `home/DeviceSheet.tsx`, `InboxModal.tsx`
- Foundations: `src/styles/theme.css` (semantic palette), `src/styles/components.css` (materials), `src/index.css` (Tailwind aliases, tours, keyboard)

## Visual foundations

### Theme

Zaparoo App treats phone, tablet, and desktop as first-class contexts using Online's tactile materials in dark and cool-neutral light themes. System is the default; Settings → Accessibility → Appearance offers System, Light, and Dark. Appearance applies app-wide, follows OS changes live in System mode, and persists through Capacitor Preferences. A valid legacy `vite-ui-theme` is migrated without replacing explicit choices.

Online, not the constrained Rust frontend, owns the visual direction: chunky arcade buttons, Outfit typography, recessed inputs, small-radius surfaces, and restrained status/interaction colors. Phone Zap workflows remain reader-first; wider Zap recomposes the same mounted features. The customizable Hub is a separate delivery.

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

- full-height page layout, with an opt-in supporting pane for Library
- safe-area padding from the root-owned inset variables
- default pinned header chrome; opt-in `headerMode="content-wide"` keeps the same heading/actions mounted inside the page scroll owner and presents them as an unframed, scrolling content row from 760px
- primary page scroll element, retaining `page-scroll` restoration identity through resize
- `ResponsiveContainer`

`ResponsiveContainer` constrains content on larger screens:

- default form/reference content: `sm:mx-auto sm:max-w-2xl` (672px)
- `PageFrame layout="workspace"`: intentionally full-width browse content, not a global removal of form bounds
- phone nav content: `sm:mx-auto sm:max-w-lg`; hierarchical sidebar/drawer content fills its own chrome

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
- NFC tabs: tab content uses `gap-4 px-2 pt-4/pt-6`; inner NFC panels use rounded background blocks, not WUI Card.
- Modal content: `SlideModal` owns the horizontal gutter and compact title-to-body gap; selector/search body wrappers do not add another shell-level padding. Confirmation modals vary between `py-4` and `p-4` based on the existing modal being matched.

Use the nearest screen’s spacing. Do not mix gap systems inside one section unless sibling code does.

### Header pattern

Subpages use:

- `HeaderButton` with `BackIcon size="24"` on left
- left-aligned `<h1>` title, styled consistently by `PageHeader`
- optional right `HeaderButton` or small group of `HeaderButton`s for page actions; grouped header controls have no wrapper gap, leaving 8px between their inset visible faces
- header controls move face and content together when pressed; modal triggers expose `aria-expanded` and retain the active inset face while their modal is open
- `useSmartSwipe({ onSwipeRight: goBack })` when nearby routes use swipe-back

Root tab pages can omit the back button and use a left-aligned title or existing branded content. Visible header controls use the same 8px mobile chrome inset as bottom navigation rather than the 16px page-content gutter. On phone Home, keep the compact logo left and group the content-sized device status control directly beside History on the right. Both controls use the same header-button face; the status control must not grow to consume remaining header space. Wide Home omits this duplicate header. Sidebar/tablet chrome owns branding; navigation exposes Devices under Settings and separate scan/play history destinations under Zap. The page heading remains mounted for route focus and announcements.

Zap Scan history and Play history use content-wide scrolling titles/actions
with a quiet real parent link to Zap. Phone retains pinned Back/Refresh controls.
Chronological play sessions remain distinct from deduplicated phone Played and
Library Recently played collections.

### Adaptive navigation and floating app chrome

`BottomNav` retains phone tab-return/reselect behavior; `AdaptiveNavigation` and `SidebarNavigation` provide a purpose-built hierarchy for wider contexts, inspired by zaparoo.com's mobile disclosure navigation:

- below 760 CSS px: 64px-minimum bottom dock plus bottom safe inset, with four destinations, uppercase 12px labels, and recessed active tab. Normal-size geometry stays 64px; translated/enlarged captions may grow the dock, with measured page clearance following its actual height
- 760–1279 CSS px: compact top bar with menu control and branding; the menu opens the same labeled hierarchy in a side drawer rather than a phone-style icon rail
- from 1280 CSS px: persistent 256px sidebar plus left safe inset
- parent labels link to section roots. Independent chevrons expand/collapse child destinations without navigating. The current branch opens on navigation; other expanded branches stay as chosen
- use consistent 48px-minimum navigation rows, not a mixture of WUI action-button variants. Parent labels are uppercase 14px/600; child links use 14px/500 source casing. Heading, chevron, and submenu form one full-width unframed group, without an inset surface, shadow, separate submenu box, or gap. Alignment, spacing, and indented child labels establish hierarchy rather than narrowing the group
- active section icon uses primary interaction blue, including on child routes; expansion alone does not color the icon. Text stays neutral; current child uses brighter neutral text and 600 weight, not a filled row or dot. No blue selection stripe or glow. Link and chevron retain separate hit targets. Fine-pointer hover uses a faint neutral wash without shadow or travel; keyboard focus retains its explicit outline
- parent branch treatment and `aria-expanded` describe hierarchy; `aria-current="page"` identifies the actual destination. Ordinary links and disclosure buttons, not an ARIA menu/tree or tab widget. Unread Settings counts retain `NotificationBadge`
- Zap exposes Scan history and Play history; Library exposes existing search/collection destinations; Create exposes existing tools; Settings exposes existing sections and Devices. Feature/capability gates remain in force
- passive device name, explicit connection state, and address form a separate context block near the bottom when space permits. It is not a button or modal launcher. Devices is the navigation destination for connecting/managing devices
- the whole sidebar/drawer scrolls in short windows; controls do not shrink. Drawer owns focus trapping, Escape/app Back, and modal coordination. Navigation focuses the new page, while dismissal restores its trigger. Becoming a desktop sidebar releases modality without stealing focus
- root owns one route outlet; resizing does not remount pages, reader work, or drafts, nor redirect History URLs. Phone sheets remain available and retain intent through resizing
- tablet top chrome owns its top safe inset; pages do not add it again. Desktop sidebar owns left safe inset. Docked details own right safe inset without narrowing nominal content width
- `RootLayout` publishes measured `--app-footer-overlay-height` and `--app-footer-overlay-clearance`. Wider layouts remove bottom-dock clearance while retaining connection-status strip and bottom safe inset. Global reader strip and `BackToTop` stay within the page workspace

Global connection status uses `ConnectionStatusBar`, an in-layout strip above bottom nav:

- sub-second connecting/reconnecting stays hidden
- routine connecting/reconnecting uses muted neutral styling and an inline spinner
- prolonged Core/network unavailability uses warning styling and a Settings action
- Settings landing relies on its contextual connection summary instead of duplicating the visible strip; Home does not, because its device pill carries identity rather than connection state
- restored status appears briefly only after a connection issue was presented

`BackToTop` is the only floating page utility. Use it only on long,
scrollable result or reference surfaces where returning to controls or the list
start would otherwise require substantial reverse scrolling. It uses a flat
48px square with 8px corners, a neutral `surface-raised` face, and a semantic
border; no raised material, depth shadow, or press travel. Keep haptic feedback
and a visible focus ring. It clears the measured footer
(`--app-footer-overlay-clearance` plus 1rem by default), matching the right-edge
margin. Footer measurement already includes the bottom safe inset; do not add
it again. It respects reduced motion and returns keyboard focus with the viewport. Do not
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

Use `src/components/wui/CircleButton.tsx` for raised circular icon actions. It mirrors Zaparoo Online's dedicated CircleButton material rather than approximating it with a rounded generic Button. Default controls retain a 48px touch target; variants are `primary`, `secondary`, `destructive` and `pro`. Use `variant="secondary"` for neutral contextual actions. `BackToTop` keeps its documented flat utility style instead.

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

- Settings device summary and media database cards
- Home connection status
- Create landing action cards
- Search database warning card
- Device rows/history entries via `DeviceRow`
- Core outdated notice with warning border/background overrides

Long translated headings/labels wrap within their panel. Connection/device rows and Create destinations wrap according to available width and text size; do not shrink targets or hide meaningful text to force a single line.

Settings forms use one shared raised Card per functional section, not per control. Headings, related status, fields, toggles, and section actions belong inside the same panel; do not nest raised Cards. Simple forms such as Accessibility, Language & Region, Advanced, and Device Detail use one panel without inventing an extra heading. Readers separates reader status from controls; Play Controls preserves its named groups; Manage Media has Database and Metadata scraper panels; Online groups account, connected-device, features, and Warp sections, including the signed-out account entry.

### ToggleSwitch

Use `ToggleSwitch` for boolean settings.

Pattern:

- row: label left, switch right when space permits. Opt into `reflow` for narrow/enlarged-text panels so label/help and switch can wrap without clipping or shrinking targets
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

Settings forms are restrained control panels: one raised Card per functional section, inset fields and choices, and neutral navigation rows. Keep any section heading inside its panel and use `gap-5` between panels. Preserve existing control-specific spacing inside panels; do not invent headings for simple forms, decorative icons, helper copy, a separate card for every setting, or nested raised Cards.

Apply this rule by purpose, not route location: Logs, Manage devices, Help, About, and Licenses remain list/document screens with their established row styles. Existing entity cards (such as device rows), warnings, and inset status wells retain their own semantics. Modal shells are not settings panels.

### Structure

Subpage pattern:

1. `PageFrame`
2. back `HeaderButton`
3. left-aligned page title using shared `PageHeader` typography
4. content stack
5. settings rows/inputs/toggles

Examples:

- `settings.advanced.tsx`: simple `gap-5` stack of toggles and nav row
- `settings.readers.tsx`: reader status and controls in separate panels, `gap-5` between panels
- `settings.play-controls.tsx`: grouped settings; inner field groups must match within page

### Adaptive Settings pages

All Settings forms and related Devices, device detail, Logs, Help, About, and Licenses use `headerMode="content-wide"`. From 760px their title and actions scroll with content; a quiet translated `PageParentLink` sits above the title instead of the phone back icon. Device detail links to Devices; other Settings pages link to Settings. Phone keeps the existing back button and swipe behavior. Links preserve parent scroll intent and embedded `/app/` routing. Title/actions/dialogs are not duplicated or remounted on resize.

- Accessibility, Language & Region, Advanced, device detail, Help, About, Licenses, and signed-out Online remain bounded forms/reference pages. Do not stretch controls or document text across the whole workspace.
- Manage Media uses two independent equal-width panels from 1024px: database and scraper. Existing warning remains above both panels.
- Readers places controls in the main column and connected-reader status in the supporting column from 1024px (3:2). Phone retains reader status before controls. Native capability and purchase gates are unchanged.
- Play Controls stacks limits and launch guard in the main column, with Profiles alongside in the supporting column from 1024px (3:2). Phone retains Profiles before limits/guard. Without Profiles support, limits/guard use equal columns. Profile editor, selection, PIN, and confirmation dialogs retain their existing owners.
- Signed-in Online groups device/link/features in the main column and Warp/account panels in the supporting column from 1024px (3:2). Phone preserves existing order; signed-out entry and authentication remain bounded. Account actions, MFA, entitlement and linkage behavior are unchanged.
- Logs opts into the workspace width for dense diagnostic lines; its filters, page actions, scrolling and exports retain existing behavior. Devices keeps its existing connection/management workspace.
- All panels retain natural heights and functional grouping without additional shells. Stable wrappers own presentation only; resizing does not create mutations, reset drafts, or restart query/reader owners.

### Settings navigation rows

Settings landing uses `PageFrame layout="workspace" headerMode="content-wide"` with a bounded 672px phone/tablet stack. Its title and Inbox scroll with page content from 760px, without a raised header bar; phone retains the pinned header. Sidebar owns navigation, and tablet menu chrome remains the drawer entry point. The same heading/action nodes survive width changes, preserving focus and Inbox ownership. From 1024px, existing App/Device/Support navigation groups occupy the main column and device/database/purchase context occupies the supporting column in a 3:2 split. Columns stack independently, without forced matching heights or extra enclosing cards. Phone order stays context before destinations; resizing changes only presentation and preserves the shared device sheet, manual drafts, and route focus. Simple settings forms retain the default bounded PageFrame; this overview does not globally widen every settings page.

The Settings index is a grid of outline-button tiles in `settings-navigation-grid`: each tile is a `site-button site-button-outline` with a muted leading icon and label, and status tiles span the full row. Do not turn the index back into a list of rows.

Link rows inside settings subpages (Advanced, About) use `settings-nav-row`:

- 48px minimum, 12px padding, neutral text and a trailing chevron
- text on left
- `NextIcon size="20"` right
- related rows share a raised Card shell; rows remain flat, not individual action cards
- no invented descriptions

The Settings device area uses `DeviceConnectionSummary`: a standard `Card` containing `ConnectionStatusDisplay` followed by a full-width secondary button with a neutral Monitor device icon in both states, Change device (Connect before a device is selected). Keep the address editor, Save button, and discovery controls out of this summary. A ghost square Pair key icon sits in the status row, matching DeviceSheet; show it when connected or when pairing is required for the selected address. Device names, metadata, and connection errors wrap alongside this compact action.

The Settings landing page's Update media database button is also secondary, retaining its database icon. The dedicated Manage Media page keeps that action primary.

Settings and Zap open the same `DeviceSheet`. Selection has no footer: Add device manually is the final card row below saved/discovered devices, with a trailing chevron. Manage devices is a separate quiet text action beneath the list. The address form footer uses the reader-recovery pattern's intrinsic 9rem grid: equal-width faces when they fit, stacked controls for narrow or enlarged-text layouts. Manual entry is a focused view within the same sheet, using a labeled `TextInput` and Cancel/Connect footer; Cancel returns to selection and restores focus to Add device manually, while dismissal exits the flow. Discovery pauses during manual entry. Each entry starts from the selected address; validation stays inline and a valid selection closes the sheet. Manual entry remains available on web and when discovery fails.

Device management is a separate settings subflow:

- page title matches Manage devices; switching stays in the shared sheet
- list wrapper `flex flex-col gap-3 pt-2`
- rows use `DeviceRow`, which is a `Card` with active dot, primary name/address, muted address/platform/version metadata, and optional lock icon; tapping a row opens details without changing the active device
- selection checkboxes appear only in the existing Combine editing mode
- device detail uses one Card with a `flex flex-col gap-4` form stack: TextInput for name, an info section heading `text-lg font-semibold`, and full-width buttons for explicit device selection and Forget

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

### Input and Save rows

`TextInput` owns the shared field-and-Save row. Keep `items-end` on the row:
buttons reserve their physical front edge with a bottom margin, while recessed
inputs sit flush with the ground plane. An enabled Save cap sits above the
input; pressed or unavailable Save aligns with it. Do not top-align the faces
or remove button travel to compensate. Keep the Save control mounted and the
input footprint stable as edits enable or disable saving.

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
- existing list controls; preserve accessible-list fallback in virtualized tag search
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
- bottom sheet below 760 CSS px; centered floating dialog from 760px, with a 16px gutter inside all safe viewport edges
- default dialogs remain bounded to 42rem (672px at default text size); only media search and command chooser opt into `layout="workspace"` for up to 60rem
- content-sized by default and capped at 80% of viewport height and available safe viewport space; keyboard/notch insets participate in floating-dialog bounds and centering
- fixed-height selector/search requests cannot exceed those caps
- opaque raised surface with semantic border and a material highlight
- 8px upper corners on sheets, 8px corners on floating dialogs; 16px shell gutter matching page content. Modal body
  wrappers do not add a second horizontal gutter; padding inside rows, cards,
  and fields remains component-owned
- header, scrollable body, and persistent footer form distinct zones
- mobile drag handle uses muted foreground
- `text-lg font-semibold` title, centered on mobile and left-aligned from `sm`;
  compact 8px title-to-body spacing, drag handle, and desktop close action;
  the drag handle and close button keep 48px hit areas around their smaller visuals, and focus uses the `ring` outline
- safe-area bottom padding on edge-attached sheets; floating dialogs sit inside safe edges rather than repeating that edge padding
- focus trap and Android back handling
- one mounted title/body/footer tree across sheet/dialog resize; wide mode cancels any in-flight sheet drag without dismissal, and floating dialog content does not drag-to-dismiss

Workspace bodies reuse existing controls and scrolling ownership. Media search
uses intrinsic 20rem/30rem filter/result stacks from 1024px; actual available
width and enlarged text determine wrapping. Command categories use intrinsic
24rem tracks from 760px. Phone order, query/filter drafts, selected details,
pending work, editor cursor and nested-selector ownership remain unchanged.
Forms, confirmations, Profiles, pairing, and system/tag selectors stay bounded;
do not widen them just because viewport space is available.

Persistent footer behavior:

- footer stays in normal flex flow below scrollable body with an 8px gap after its divider; never float actions over content
- body shrinks and scrolls before footer; footer gets its own constrained overflow only as short-viewport/text-zoom fallback. Its scroll viewport extends into existing side and bottom shell gutters so reader halos and button shadows are not clipped; inset padding keeps action geometry and the divider unchanged
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

### Adaptive Library details

Library preserves Systems/Collections, system/folder browsing, searches, tagged collections, history, and decks. Broad browse pages use the workspace layout; forms remain bounded.

- root, browse, collection, search, deck detail and deck-item editor use `headerMode="content-wide"`: title/actions scroll from 760px; phone retains pinned back/header/swipe behavior
- quiet parent links lead to Library; deck-item editor links to its parameterized deck, preserving `/app/` base path and parent scroll intent. Folder ascent and leaving embedded search are quiet buttons, not fake route links: they retain existing session navigation, selection cleanup and Back ownership. Modified parent-link clicks do not clear current selection
- Collections separates existing collection links and Decks into independently sized, intrinsically wrapping supporting/main stacks from 1024px. Deck filter/New deck toolbar wraps from 760px; phone ordering and unsupported-feature behavior remain
- Library search separates bounded filters and flexible results from 1024px using 20rem/30rem flex bases. Available width, including space consumed by details pane and enlarged text, decides whether stacks fit side by side; neither column is squeezed merely because viewport is wide
- deck detail uses the same independent context/items composition from 1024px, retaining original phone order, one drag/edit owner and existing contextual write/action rail. Metadata fields and description stay bounded to 42rem; standalone deck-item editor keeps the default form bound
- both browse and shared search virtualizers measure list origin within the actual page scroller, including preceding headers/filters. Local row transforms subtract that origin; letter jumps honor measured scroll padding. Accessible browse jumps retain header clearance. Search retains its original 8px leading row space separately from page origin. Resize observers include preceding content, not only list dimensions
- from 1100 CSS px, selected-media details occupy a separate 320px supporting pane (340px beside full sidebar); smaller windows retain the existing sheet
- one mounted details feature and presentation host survive resize, including carousel state, contextual NFC work, and child-dialog drafts
- pane is a labeled nonmodal region, with its own detail scroll; no backdrop, focus trap, inert background, swipe-dismiss, or modal-priority Back registration
- selection stays scoped to device and browse/search/collection context in session memory; selection neither launches media nor creates a URL/history entry
- wide selection keeps list focus; narrow sheet traps focus. Closing/invalidating selection cancels its owned work; changing presentation does not
- virtual browse rows retain existing minimum estimates but measure natural content height, allowing larger text and wrapping without overlapping rows
- child dialogs retain takeover behavior and mounted underlying context; collapsing details defers its modal presentation while a competing dialog owns focus
- pane footer stacks the existing horizontally scrolling action rail above full-width Launch; action order, captions, reachability, and 48px targets remain unchanged

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
  `SlideModal` device sheet. Pair is an unframed `ghost` icon action on the
  connected-device status row, matching Refresh below with a 48px square target.
  Pair remains available when pairing is required before connection. The sheet
  is shared with Settings and includes the manual-address and management
  actions described above. It runs one bounded discovery pass on open,
  offers an icon refresh action whose spinner and busy state indicate scanning
  without a visible searching row; a screen-reader-only status announces discovery.
  It merges discovered devices into the saved
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

### Adaptive Zap

- Phone keeps the order above. From 760 CSS px playback leads, with reader tools/status before secondary cover rows.
- From 1024px use independent main/supporting stacks in a 3:2 column split: playback/background slots then scan actions in the main column; Controls then Readers in the supporting column. Shared grid rows do not push scan actions down to match the remote's height. Covers span the workspace below. Keep section heights natural, with no extra enclosing cards. Short windows scroll; controls never shrink to fit height.
- Main/supporting wrappers stay mounted at every width and become `display: contents` below the two-column threshold so phone order stays reader-first. Layout ownership stays separate from feature/session ownership; customization editor, visibility preferences, drag handles, and arbitrary resizing are not implemented.
- Now playing, Controls, and Readers use the same outside-card Home heading. Docked Controls owns its body material, not its section heading. Omit the Controls launcher while the pane is visible.
- From 760px scan actions form a row of equal square-ish tiles with icons above captions, matching 24px icons, and a 10rem minimum height. Tracks grow from 10rem to 12rem and wrap when space or text sizing requires it; a single capability stays one tile rather than stretching across the column. Aspect ratio is a preference, not a fixed height: translated labels and active status can grow the row. NFC retains its primary material and camera its neutral secondary material; activity feedback stays within the existing mounted control. Phone scan geometry remains unchanged.
- The scan bank opts nested reader wrappers out of the ordinary 20rem desktop cap, not just the outer button. Queued/deep-link writes still replace scanning with the existing full-width contextual reader control and retry/cancel recovery bank; wide write controls retain inline captions and at least 72px height. Playback artwork expands to 96×128 CSS px at default text size, with a full-width transport bank and 64px minimum key height. Remote D-pad and secondary keys retain 64px targets; their horizontal grouping wraps when width or text size requires it.
- Scan history and Play history are real Zap child routes, accessible directly at any width. Scan history shares row/copy/replay presentation with the phone History sheet. Play history lists chronological sessions, including repeated games, with cursor pagination; Library Recently played remains a deduplicated collection. Page queries are device-scoped and expose loading, offline, error/retry and unsupported-Core states. Replay requires a live target, and stale target errors are ignored.
- Devices combines the shared connection/discovery/manual-entry flow with saved-device management and direct connection actions. At wide widths these occupy separate columns; narrow widths stack. The phone DeviceSheet hosts the same connection feature with its existing footer/focus behavior. Width changes do not restart discovery or clear address drafts.
- One Home/session tree and one Controls controller remain mounted. Controls use the existing nonmodal pane on wide screens and the existing phone modal intent below the threshold; width alone does not open a previously closed phone modal.
- Keyboard mode/case, focused surviving controls, screenshot results, and in-flight captures survive presentation changes. Captured exports remain usable offline.
- Cached media is not a live connection. Play/transport/remote/capture require current connection state and actual transport readiness. Serialized input rechecks its record, endpoint, transport, and session generation immediately before dispatch; reconnect/device changes drop stale pending work and ignore stale responses.
- Existing scanner offline behavior, capability hydration, native keep-awake preference, and feature gates remain unchanged.

Do not copy Home heading style into Settings; it is home/status-specific.

## Create, Search, and NFC flows

Create destinations and shared new-deck editor use `PageFrame headerMode="content-wide"`: one title/action tree scrolls with content from 760px, while phone pinned headers/back/swipe remain. Create subpages have quiet parent links to Create; mapping editors link to Mappings. New-deck parent follows entry context (Create or Library). Preserve drafts, selected results, reader sessions and modal ownership across resizing; layout changes never start, cancel or repeat operations.

### Create landing

Create index uses bounded stacked `Card` rows below 1024px and a two-column destination grid from 1024px. Card content retains its menu-row geometry:

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

Do not wrap search results in new cards. Create search keeps its bounded filter/results stack below 1024px; from 1024px, filters occupy a 20rem supporting column alongside flexible results. Both use the same page scroll owner. Selection retains the write-focused detail modal rather than introducing another details owner.

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

Do not replace ZapScript editing with a plain `TextInput`. Custom text, mapping and shared new-deck forms stay bounded to 672px; extra width is not a reason to split dependent fields or expand attached editing controls.

### NFC tabs

NFC utilities use `TabBar` (`role="tab"`) for Read/Tools. Content stays bounded and stacked below 1024px. From 1024px, Read and Tools use two-column panel grids with natural panel heights; Read's scan/cancel control spans both columns. Same mounted controls and tab/session owner serve every width.

NFC content panels use custom rounded blocks, not WUI `Card`:

- wrapper: `bg-surface-raised space-y-4 rounded-lg p-4`
- headings: `text-lg font-semibold`
- values: `bg-surface-inset rounded-lg px-3 py-2`, often mono/small
- badges for NFC booleans/tech types
- dangerous tool warnings use red icon/text in the Tools tab
- Tools keeps every panel and warning mounted during physical waits. Each tool uses its own `ReaderActivityControl`; only the selected action latches, with the other operations unavailable until completion or cancellation

### Remote Keyboard and screenshots

Remote Keyboard keeps its specialized D-pad and virtual-key geometry. Remote controls use chunky secondary WUI Buttons with 64px minimum targets; keyboard keys use a keyboard-only muted outline at a compact size with 48px minimum height: a 1px subtle border, retaining the shared 2px front edge and press travel. Focus outlines remain full contrast. Key labels preserve their actual case so Shift remains meaningful. Disconnecting disables send/capture controls with the recessed unavailable material; mode tabs, dismissal, and captured screenshot exports remain available. The virtual keyboard uses a disabled fieldset around semantic key buttons rather than a clickable overlay. Screenshot Share/Clear use secondary WUI buttons; Download keeps native anchor/download semantics with the same shared material and touch geometry. Result actions use an intrinsic two-action grid that stacks when narrow or enlarged text requires it.

### Inline copy and crash recovery

`CopyButton` stays compact beside history/NFC values. Accessible labels and feedback are translated. Clipboard success alone shows Copied/checkmark/success haptic; failure reports an error and permits retry, with a local live region that also works outside the app announcer.

`ErrorComponent` is a standalone recovery shell, not `PageFrame`: it must work outside router and announcer providers. Its viewport scrolls, safe-area padding combines cached and CSS insets, and automatic vertical margins center content only when it fits. Diagnostics remain bounded and Reload uses a shared secondary Button.

Do not copy WUI Card styling into NFC tab panels; match the NFC panel pattern.

### Mapping rows

Mappings list uses workspace width. Filter and New mapping action share an intrinsically wrapping toolbar from 760px; phone retains their stacked order. List remains unframed.

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
