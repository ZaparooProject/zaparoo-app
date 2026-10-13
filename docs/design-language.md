# Zaparoo App Design Language

This document describes how the app already looks and behaves. It is not a wishlist and not a place to invent new UI. When changing UI, match the nearest real pattern first.

## Non-negotiable rule

Existing app UI wins. Nearby screens win over generic preference. If no existing pattern fits, stop and ask before introducing a new visual treatment.

Do not add decorative icons, new card styles, helper text, descriptions, badges, stat blocks, progress styles, loading treatments, spacing systems, or typography treatments unless the same context already uses them or the user explicitly asks.

## Source-of-truth files

Use these before creating or changing UI:

- App shell: `src/components/PageFrame.tsx`, `ResponsiveContainer.tsx`, `AdaptiveNavigation.tsx`, `SidebarNavigation.tsx`, `SidebarDeviceStatus.tsx`, `BottomNav.tsx`, `BackToTop.tsx`, `ConnectionStatusBar.tsx`, `src/lib/appSections.ts`
- WUI primitives: `src/components/wui/Button.tsx`, `ModalActionBar.tsx`, `ModalActionRail.tsx`, `HeaderButton.tsx`, `StatusPill.tsx`, `TabBar.tsx`, `Card.tsx`, `ToggleSwitch.tsx`, `TextInput.tsx`, `Select.tsx`, `PinInput.tsx`, `Badge.tsx`, `EmptyState.tsx`, `RadioGroup.tsx`, `ToggleChip.tsx`, `SettingHelp.tsx`; `src/components/HeaderOverflowMenu.tsx`, `InlineLoading.tsx`
- Modals: `src/components/SlideModal.tsx`, `SlideModalProvider.tsx`, `ConfirmClearModal.tsx`, `DeepLinkConfirmModal.tsx`, `PairingModal.tsx`, `RequirementsModal.tsx`, `ProPurchase.tsx`, `home/StopConfirmModal.tsx`, `home/StagedTokenModal.tsx`
- Reader activity: `src/components/ReaderActivityControl.tsx`, `ReaderActivityAction.tsx`, `src/hooks/useContextualNfcWrite.ts`
- Settings screens: `src/routes/settings.index.tsx`, `settings.readers.tsx`, `settings.advanced.tsx`, `settings.accessibility.tsx`, `settings.language-region.tsx`, `settings.media.tsx`, `settings.play-controls.tsx`, `settings.about.tsx`, `settings.licenses.tsx`, `settings.help.tsx`, `settings.online.tsx`, `src/routes/-pages/Devices.tsx`, `DeviceDetail.tsx`, `Logs.tsx`; `src/components/SettingsFieldGroup.tsx`, `StatRow.tsx`, `ProgressBar.tsx`
- Create/search flows: `src/routes/create.index.tsx`, `create.custom.tsx`, `create.nfc.tsx`, `create.mappings.tsx`, `src/routes/-pages/Search.tsx`, `MappingEditor.tsx`, `ZapScriptInput.tsx`
- Zap: `src/routes/-pages/Index.tsx`, `ZapHistory.tsx`, `src/components/home/*`
- Library: `src/components/library/*`
- Lists/selectors: `MappingRow.tsx`, `VirtualSearchResults.tsx`, `SystemSelector.tsx`, `TagSelector.tsx`, `SelectorParts.tsx`, `SimpleSystemSelect.tsx`, `DeviceRow.tsx`, `home/DeviceSheet.tsx`, `InboxModal.tsx`
- Foundations: `src/styles/theme.css` (semantic palette, tokens), `src/styles/components.css` (materials and layout classes), `src/index.css` (Tailwind aliases, tours, keyboard)

## Breakpoints

Widths are CSS px. Tailwind `md` is redefined to 760px (`--breakpoint-md: 47.5rem`); `sm` is 640px. Other sections name a breakpoint and refer here rather than restating what changes.

| From   | Name | What changes                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 640px  | `sm` | Default page content is bounded to 42rem and centered. Phone-sheet action rails use inline icon/caption and sit beside the primary action (640–759px only).                                                                                                                                                                                                  |
| 760px  | `md` | Wide layout. Bottom dock gives way to the navigation rail beside the page; navigation precedes `<main>`. `content-wide` headers scroll with content and show breadcrumbs. Sheets become centered dialogs. Full-width page buttons shrink to their content; in dialogs they cap at 20rem. Zap leads with playback and scan tiles. Toolbars wrap side by side. |
| 1024px | —    | Two-column compositions: `settings-panel-layout`, Settings overview, Zap main/supporting, Create destinations and search, Library collections and search, deck detail, NFC panel grids.                                                                                                                                                                      |
| 1100px | —    | Selected Library media uses the docked 400px details pane instead of a sheet.                                                                                                                                                                                                                                                                                |
| 1280px | —    | The rail gives way to the persistent 256px sidebar (unless the user collapsed it); the details pane is 460px (520px from 1600px); the page's left margin beside the sidebar is 24px.                                                                                                                                                                         |

"Phone" means below 760px, "tablet" 760–1279px, "desktop" from 1280px. Resizing only changes presentation: one route outlet and one mounted tree per feature survive every width, so drafts, focus, reader work, pending requests and scroll owners are never reset, restarted or duplicated by a width change.

## Visual foundations

### Theme

Zaparoo App treats phone, tablet, and desktop as first-class contexts using Online's tactile materials in dark and cool-neutral light themes. System is the default; Settings → Accessibility → Appearance offers System, Light, and Dark. Appearance applies app-wide, follows OS changes live in System mode, and persists through Capacitor Preferences. A valid legacy `vite-ui-theme` is migrated without replacing explicit choices.

Online, not the constrained Rust frontend, owns the visual direction: chunky arcade buttons, Outfit typography, recessed inputs, small-radius surfaces, and restrained status/interaction colors. Phone Zap workflows remain reader-first; wider Zap recomposes the same mounted features. The Zap page can be rearranged by the user (see Adaptive Zap).

Use semantic roles from `src/styles/theme.css` through existing Tailwind aliases:

- background: `bg-background`; foreground: `text-foreground`; secondary copy: `text-muted-foreground`
- disabled text and borders: `text-foreground-disabled`, `border-foreground-disabled`
- interaction: `text-primary`; `text-primary-foreground` on a primary fill (white in light, near-black in dark)
- status colors: `text-success`, `text-error`, `text-warning`; washes `bg-success-wash`, `bg-error-wash`, `bg-warning-wash`, `bg-primary-wash`
- borders: `border-border` for dividers and panel edges, `border-input` for field edges; `border-error` for error state
- surfaces: `bg-surface-raised`, `bg-surface-inset`, `bg-surface-highlight`
- shadows: `shadow-material` and `inset-shadow-material`, or `--material-shadow` / `--material-highlight` in an arbitrary value; no hardcoded black shadows
- focus: `ring-ring` or the `--interaction` outline; never a white ring, and `ring-offset-*` needs `ring-offset-background`
- bounds and caps: `--content-bound` (42rem) for bounded content; `--cap-*` for primary, pro and destructive button caps and their ink

The components layer (`components.css`) owns the border, typography, material and disabled treatment of `Button`, `Card` and inputs through `.wui-button`, `.wui-card` and `.wui-input`. Do not put color, border or font utilities on those primitives; call sites pass layout only. Disabled primitives fade to 50% opacity, except a Button's default recessed "unavailable" state (see Button).

Selected controls (dock tab, tab faces) show a recessed face (`--surface-inset` plus the inset material shadow), weight or neutral contrast. A selected list row keeps its face unchanged and is marked on its content instead (see Library rows). There are no blue selection stripes, tinted row fills or raised row cards anywhere.

Do not hardcode new colors unless matching a nearby existing hardcoded pattern. Prefer app tokens and WUI components.

### Typography

Font is locally bundled variable Outfit (100–900), with platform system-font fallbacks for unsupported glyphs. Font and OFL notice live under `public/fonts/`; web, native, and Core builds do not request Google Fonts. Use existing Tailwind classes; do not introduce custom font families.

Common hierarchy:

- Page titles and navigation labels use sentence case: `Manage media`, `Play controls`, `Recently played`, `Language & region`. Product names keep their capitals (`Zaparoo Online`, `Custom ZapScript`). Other older strings retain their source casing until they are next touched; new copy is sentence case.
- Section headings and field labels use sentence case: `Media database`, `Metadata scraper`, `Playtime limits`, `Session reset timeout`.
- Page titles are left-aligned Outfit, 20px (`text-xl`)/600, tight tracking and natural wrapping. `PageHeader` owns the typography; programmatic heading focus remains, without a decorative outline.
  - Seen across settings, create, search, logs, devices.
- Slide modal title: `text-lg font-semibold`; alignment is described under SlideModal.
- Home section labels: `text-muted-foreground font-bold capitalize`.
  - Used by `NowPlayingCard`, `ReaderStrip` and the home cover rows.
- Card/list primary text: usually `font-semibold` or `font-medium` depending sibling row.
  - Create landing card titles use `font-semibold`.
  - Connection status title uses `font-medium`.
  - Mapping row primary label uses `font-medium`.
- Settings field labels: `text-sm font-medium`, set by `TextInput`, `Select`, `RadioGroup` and `SettingsFieldGroup` rather than by the page.
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

- default form/reference content: `sm:mx-auto sm:max-w-2xl` (672px). From 1024px the bounded column and its header start at the left edge instead of centring, so a page title sits in the same place on every page
- `PageFrame layout="workspace"`: intentionally full-width browse content, not a global removal of form bounds
- phone nav content: `sm:mx-auto sm:max-w-lg`; hierarchical sidebar/drawer content fills its own chrome

Do not add page-level max widths or safe-area padding manually when `PageFrame` already handles it.

### Page stacks

Settings pages get their stack from layout classes in `components.css`, not from utilities on the page:

- `settings-panel-page` on the `PageFrame`: bounds the wide header to `--content-bound` until 1024px
- `settings-panel-stack`: one bounded column of panels, 1.25rem (`gap-5`) apart
- `settings-panel-layout`: the same column until 1024px, then a two-column grid with a 1.5rem gap; `settings-reader-panels`, `settings-play-panels` and `settings-online-panels` adjust its tracks
- `settings-overview`: the Settings landing stack
- `settings-form-rows` on a settings `Card`: from 1024px each labelled `Select` or `RadioGroup` in it becomes a row, label on the left and control on the right (a 16rem select; radio options side by side, wrapping when they do not fit), matching the switch rows. Below 1024px the fields stack as usual. Used by Language & region, Accessibility and Advanced
- Help is headed groups of external-link rows (`settings-nav-row` with a trailing `ExternalIcon`) in Cards, left-aligned like the other settings pages; it has no stack of buttons
- `logs-toolbar`: stacked on phones; from 1024px Upload, the filter box, the level chips and the entry count share one line, and an upload link takes the line below
- `settings-overview-panels`: the Settings landing page while the full sidebar is showing, which already lists every settings page. The destination tiles are not rendered; the page is a two-column grid of status panels (Device, Media database, Zaparoo Online, App), each a `text-lg font-semibold` heading over a `Card` with its status and one action. Do not repeat sidebar links here. Beside the rail and on phones the tiles are the way into the settings pages and stay

Inside a settings `Card` the form stack is `flex flex-col gap-4`. `gap-5` is only the distance between panels.

Other stacks:

- Help: `flex flex-col gap-5` page of sections, each a heading over a Card of link rows. About: `flex flex-col gap-8` with inner `gap-2` / `gap-3` groups.
- Create landing: `create-destinations`. NFC tabs: `nfc-workspace` with `nfc-read-grid` / `nfc-tools-grid`.
- Modal content: `SlideModal` owns the horizontal gutter and title-to-body gap; body wrappers add no shell-level padding.

Use the nearest screen’s spacing. Do not mix gap systems inside one section unless sibling code does.

### Header pattern

Subpages use:

- `HeaderButton` with `BackIcon size="24"` on left
- left-aligned `<h1>` title, styled consistently by `PageHeader`
- optional right `HeaderButton` or small group of `HeaderButton`s for page actions; grouped header controls have no wrapper gap, leaving 8px between their inset visible faces
- `useSmartSwipe({ onSwipeRight: goBack })` when nearby routes use swipe-back

Root tab pages can omit the back button and use a left-aligned title or existing branded content. On phone, `.page-header-shell` has 12px side padding so the 4px-inset `HeaderButton` face, and a title with no back button, sit on the 16px content margin. On phone Home, keep the compact logo left and group the content-sized device status control directly beside History on the right. Both controls use the same header-button face; the status control must not grow to consume remaining header space. Wide Home omits this duplicate header. The page heading remains mounted for route focus and announcements.

Tablet/desktop subpages use standard inline breadcrumbs in `PageHeader`, passed through `PageFrame breadcrumbs`. Ancestors and current heading share one row, with actions alongside: `Library › Favorites`. Do not add a separate parent/title line. Ancestors use real route links; in-place Library folder/search ancestors use session-owned buttons instead of invented URLs. Include section ancestors for nested editors. Current page is the existing focused `<h1>`, not a duplicate or link. The labeled breadcrumb navigation is wide-only; phone keeps its original Back/title and hides ancestors. Wrap naturally only when space is insufficient, preserving targets and long translated labels.

```tsx
<PageFrame
  headerMode="content-wide"
  breadcrumbs={[{ to: "/library", label: t("library.title") }]}
  headerCenter={<h1 ref={headingRef}>{t("library.favorites")}</h1>}
/>
```

### Adaptive navigation and floating app chrome

`src/lib/appSections.ts` is the single table of sections (Zap, Library, Create, Settings), their child destinations and the gates that hide or disable them. `BottomNav` renders `AdaptiveNavigation`, which presents that table as the phone dock or, through `SidebarNavigation`, as the tablet drawer and desktop sidebar.

Layout:

- phone: 64px-minimum bottom dock plus bottom safe inset, four destinations, uppercase 12px labels, recessed active tab. Translated or enlarged captions may grow the dock; page clearance follows its measured height. The dock lives in the footer slot
- tablet (760–1279px): an 80px rail beside the page (`useNavigationMode` reports `rail`), not a top bar. It shows the menu button, then the four sections as icon-over-name links (11px uppercase; `RailLabel` sets a name too long for the width smaller, only as far as that name needs and no lower than 8px, and it wraps only if it still does not fit), with nothing deeper listed, so pages keep their own way into their children (Settings tiles, the Library tab bar). The rail section that contains the current page carries `aria-current="true"`. The menu button opens the full labelled hierarchy over the page as a dialog named `nav.menu`; the same button, in the same place, then closes it
- desktop (from 1280px): persistent 256px sidebar plus left safe inset (`full`). The button beside the logo collapses it to the rail and the rail's menu button pins it open again, with no dialog; the choice is a saved preference (`sidebarCollapsed`). Pages decide on `useFullSidebar()`, never on width alone, whether the sidebar is listing their destinations for them
- full screen (`hidden`, saved as `fullScreen`): from 760px a `Full screen` control at the foot of the rail and sidebar hides the navigation completely, for using a page as an always-on display. A 48px button at the bottom-left corner, where the control that hid the navigation was (above the connection strip when that shows), brings it back; it fades after 1.5 seconds without pointer or keyboard activity, reappears on either, and is always reachable by keyboard. Escape also exits unless a dialog is open. Phones keep their dock regardless
- the shell sets `data-app-nav` (`dock`, `rail`, `full`, `hidden`) on the document root; page offsets and `--app-navigation-width` follow it, not a width media query
- from 760px the in-flow page title (breadcrumbs or heading) sits in a 48px row, and the space above its text equals the page's side margin: 24px from the top of the window beside the rail or the sidebar. The row is followed by 8px before the page content, so the title's text sits about 20px above it. Do not add top padding that makes the title sit lower than it sits in from the side
- from 760px the navigation precedes `<main>` in DOM and tab order; the phone dock stays in the footer
- parent labels are uppercase 14px/600 links to section roots; child links are 14px/500 in sentence case. Heading, chevron and submenu form one unframed group: no inset surface, shadow, separate submenu box or filled row
- children follow their section's phone landing page: the same order and the same groups. Library lists Search and Systems, then `Collections` with All first and the six collections after it; Settings lists its destinations under `App`, `Device` and `Support`, with Devices first under Device. Decks are user content and are not listed
- group labels are unlinked uppercase 11px/700 muted text with 1px tracking, aligned with ungrouped child links; the links in a group are indented a further 16px beneath their label, so the group reads as a nested level. Every group is headed the same way: a group's own landing view is an `All` link inside it, never a clickable heading. No divider lines
- pages under the Collections view (each collection, a deck, adding to a deck, a new deck opened from Library) carry `Library › Collections` as ancestor breadcrumbs (`useLibraryCollectionBreadcrumbs`). Collections opens the Library root on that view, as the sidebar's All does
- collections keep one order everywhere: the lists a user builds (Favorites, Play later, Liked, Disliked), then the ones play history fills in (Recently played, Top played)
- sidebar labels are short nouns (`Search`, `Devices`, `Media`) even where the page heading is longer. Systems and the Collections group's All both open the Library root, each on its own view, and each is the current page only while its view shows. Systems is the listed ancestor of a system's own pages, All of deck pages. On desktop the Library section link itself always opens the Systems view; in the tablet drawer, where the page keeps its tab bar, it returns to the last view
- while the full sidebar is showing, the Library root drops its Systems/Collections tab bar and shows the chosen view under a `Systems` or `Collections` heading instead. Beside the rail, and on phones, the tab bar remains the way to switch
- the active section's icon uses interaction blue, including on child routes; text stays neutral, and the current child uses brighter text at 600 weight. Fine-pointer hover is a faint neutral wash; keyboard focus keeps its outline
- a passive block near the bottom (`SidebarDeviceStatus`) shows device name, connection state and address. It is not a button; Devices is the destination for connecting and managing devices
- the whole sidebar or drawer scrolls in short windows; controls do not shrink
- docked details own the right safe inset without narrowing nominal content width

Behaviour:

- section labels navigate; independent chevrons expand or collapse children without navigating (`aria-expanded`). One section is open at a time: opening one closes the others, navigation opens the current branch, and the open section's chevron can close it. Ordinary links and disclosure buttons, not an ARIA menu, tree or tab widget
- `aria-current="page"` marks only the exact destination. A child link that is an ancestor of the current route, such as a list above its editor, carries `aria-current="true"`
- gated children are omitted (`visibleWhen`) or, for Create tools that need a connection or NFC, listed but disabled (`enabledWhen`)
- notifications: on the phone dock the Settings tab carries the unread `NotificationBadge`, hidden while inside Settings, where Inbox has its own entry. From 760px the rail and sidebar have their own Notifications control at the foot, above Full screen (`sidebar-action`: bell with the badge, plus the label in the full sidebar), which opens the Inbox from any page; their Settings link carries no badge. Between it and Full screen sits a light/dark button that switches the mode now showing and is named for the mode it switches to (sun in dark mode, moon in light); choosing System stays under Settings › Accessibility
- desktop: clicking a destination opens that route at the top; reselecting adds no history entry and does not resume phone tab scroll memory. Sidebar-created entries keep their own scroll for Back/Forward. Modified clicks do not reset the current page
- phone tab-return/reselect memory and tablet drawer scroll restoration are unchanged; sidebar navigation clears no filters, drafts or pending operations
- the opened list owns focus trapping, Escape/app Back and modal coordination. Focus stays on the menu button as it opens, since that button is inside the list and closes it. Navigating focuses the new page; dismissal leaves focus on the menu button. Becoming a sidebar releases modality without stealing focus, and narrowing back to the rail leaves focus on a section link that is still showing
- `RootLayout` publishes the measured footer height as `--app-footer-overlay-height` and `--app-footer-overlay-clearance` (the same value; it already includes the bottom safe inset). Wide layouts drop the dock but keep the connection strip. The global reader strip and `BackToTop` stay within the page workspace

Global connection status uses `ConnectionStatusBar`, an in-layout strip above bottom nav:

- sub-second connecting/reconnecting stays hidden
- routine connecting/reconnecting uses muted neutral styling and an inline spinner
- prolonged Core/network unavailability uses warning styling and a Settings action
- Settings landing relies on its contextual connection summary instead of duplicating the visible strip; Home does not, because its device pill carries identity rather than connection state
- restored status appears briefly only after a connection issue was presented

`BackToTop` is the only floating page utility. Use it only on long, scrollable result or reference surfaces where returning to controls or the list start would otherwise require substantial reverse scrolling. It is a flat 48px square with 8px corners, a neutral `surface-raised` face and a semantic border; no raised material, depth shadow or press travel. Keep haptic feedback and a visible focus ring. It sits 1rem above the measured footer clearance, matching its right-edge margin. Inside a dialog whose scroll area has a classic (space-taking) scrollbar, it moves in by the scrollbar's width so it never covers it; overlay scrollbars, as on phones, leave it at the plain 1rem margin. It respects reduced motion and returns keyboard focus with the viewport. Do not introduce additional floating actions or use primary action colour for this utility.

Do not use these styles for ordinary page content.

## Components

### Button

Use `src/components/wui/Button.tsx`.

Variants:

- `fill` default: primary gradient cap, white label
- `secondary`: neutral raised cap for Cancel and supporting actions
- `outline`: quieter inset face for utility/alternative actions
- `ghost`: chrome-free icon utility with only a subtle hover/pressed wash; use for small inline refresh and similar affordances
- `text`: unframed textual action without filled treatment

Intents: `default`, `primary`, `destructive`, and `pro`. `destructive` supplies the red cap, or red text and border on non-fill variants; `pro` supplies the gold cap with a dark label, or gold text and border on non-fill variants. Use `intent="destructive"` alone; never add `border-error text-error` or similar classes. Cancel is `variant="secondary"`, not `outline`.

Gold is reserved for every paid-upgrade or paid-support call to action: Unlock Zaparoo Pro, Get Warp, subscribe, the final Pro purchase action, and Join the Patreon. Gold means “upgrade to premium,” not general emphasis or ordinary settings navigation. An active Pro state is a status (Badge or text), not a disabled button.

Sizes: default; `sm` for a compact secondary action; `lg` for a rare large action.

Shape and material are owned by Button and `.wui-button`:

- standalone icon-only buttons are round; `shape="square"` aligns Save and editor utility controls with rectangular fields
- labeled buttons use 4px corners, bold uppercase Outfit labels, and 0.05em tracking
- secondary, outline and non-fill destructive/pro buttons show their 1px border; fill caps do not need one
- fill and secondary have a 4px opaque front edge; outline has a 2px edge and half-distance travel
- pointer hover lowers caps by 2px; press lowers them by 4px, without scaling/fading
- touch targets remain at least 48px; compact labels do not shrink the hit target
- reduced-motion settings disable transitions, and disabled controls do not travel
- every enabled button, `role="button"` element and select shows the pointer cursor, from one base rule in `src/index.css`. Do not add `cursor-pointer` per component; disabled and unavailable states set `not-allowed` themselves
- disabled appearance communicates why the control is unavailable:
  - `disabledAppearance="unavailable"` is the default recessed/sunken state. Use it when a prerequisite, capability, selection, connection, or current media state is absent. `ghost` and `text` buttons have no face to recess, so their content turns muted and fades to 50% opacity instead.
  - `disabledAppearance="busy"` keeps the raised material at 50% opacity. Use it only while an in-flight action (launching, saving, pairing, searching, deleting) temporarily locks the control. A loading label or spinner should continue to explain the work.
- haptics derive from `intent`: default light, primary and pro medium, destructive heavy

Width: use `className="w-full"` for full-width primary page actions and complex-modal primary actions, and say it explicitly rather than relying on flex-column stretch. From 760px a full-width button on a page is as wide as its content (never under 10rem) and starts at the column edge, in line with the text and fields above it; it does not stretch or float in the middle of a desktop column. A cell that owns its button's width (a toolbar slot, a grid of actions) adds `max-w-none`. A centred composition (Help, About) adds `mx-auto`. Inside dialogs, which are narrow columns of their own, a full-width button keeps a centred 20rem cap, as do a lone `ModalActionBar` action and `ReaderActivityControl` (the reader's button fills that capped shell); `ModalActionBar` pairs and `ModalActionRail` items opt out. This is the only statement of the rule; other sections refer to it. Use `className="flex-1"` only for equal-width confirmation actions sharing one footer row.

Button layout is inline by default. `layout="responsive"` is reserved for compact action-rail items (see SlideModal). Standalone primary buttons keep their inline layout.

Do not build custom buttons with raw `<button>` unless implementing a specialized primitive already present in the codebase, such as selector rows.

### HeaderButton

Use `HeaderButton` only for header actions: back, history, reload, close-like header controls.

Pattern:

- 48px square hit target with a 6px-radius raised face inset 4px inside it
- icon-only; the accessible name comes from `aria-label`, falling back to `title`. New header actions pass `aria-label`
- face and content travel together when pressed, with haptic feedback on a completed press
- active state is interaction blue with `aria-pressed`; modal triggers pass `aria-expanded` instead and keep the inset face while their modal is open
- disabled: muted icon at 50% opacity

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
- `p-4`
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

One raised Card per functional section is the settings rule (see Settings pages); do not nest raised Cards. Simple forms such as Accessibility, Language & Region, Advanced, and Device Detail use one panel without an extra heading. Readers separates reader status from controls; Play Controls preserves its named groups; Manage Media has Database and Metadata scraper panels; Online groups account, connected-device, features, and Warp sections, including the signed-out account entry.

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

Display-only badges retain their existing container, border, and background. Enabled write-target tag toggles add a persistent 14px square selection indicator inside that same badge: outlined when off, filled when selected, using muted foreground rather than label color. The marker has 4px left inset and 6px gap before the label so it reads as a control, not a glyph in the text. The indicator makes interaction visible on touch without relying on hover or cursor; enabled toggles also have pointer/hover/focus feedback. Path mode disables interaction and removes the indicator entirely, showing ordinary display-only badges while retaining remembered selection for returning to ZapScript mode; no disabled inset effect or text-only conversion. Read-only tags elsewhere remain unchanged.

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

- Default to stacked 48px rows. Use this for three or more options, long labels, and choices that reveal related form fields: appearance, text size, shake mode, profile role/PIN/limits, the profile switch picker, mapping type/match, and deck item type.
- `layout="inline"` is only for two short choices without conditional form fields, currently reader Tap/Hold and Warp Annual/Monthly. The one other place options share a line is a `settings-form-rows` card from 1024px. Options share a line only while their content fits; translated labels and text zoom can push them onto separate rows. Do not squeeze, truncate, or horizontally scroll radio choices.
- Long labels wrap, with the indicator aligned to the first text line.
- Group help is either a string, rendered as muted text beneath and tied to the group with `aria-describedby`, or a `SettingHelp` node rendered beside the label.
- Arrow/Home/End selection and roving focus remain; an unselected group still has a keyboard entry point. Disabled groups cannot activate or receive keyboard focus.
- Existing Library sort lists and write-target value rows are specialized radio patterns, not tab bars; keep their established layouts.

`TabBar` geometry: a compact inset tray with 48px interactive targets and 40px visible faces. Selected tabs rise from the tray, with neutral text, edge and highlight, and a 2px lip beneath (`--tab-lip`: the material edge in light mode, the page tone in dark) plus a soft lift in light mode (`--tab-lift`). Scrolling tab lists retain single-line options. There are no Radix Tabs in the app.

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
- accessible name comes from `settingHelp.label` with the setting title, unless the caller passes `ariaLabel`
- hint color `text-foreground-hint`, hover/focus muted
- opens a content-sized `SlideModal`
- supports `**bold**` and paragraph breaks in description text

Do not replace an existing help-icon pattern with visible helper paragraphs.

## Settings pages

Settings forms are restrained control panels: one raised Card per functional section, inset fields and choices, and neutral navigation rows. Keep any section heading inside its panel. Spacing comes from the settings panel classes (see Page stacks). Do not invent headings for simple forms, decorative icons, helper copy, a separate card for every setting, or nested raised Cards.

Apply this rule by purpose, not route location: Logs, Manage devices, Help, About, and Licenses remain list/document screens with their established row styles. Existing entity cards (such as device rows), warnings, and inset status wells retain their own semantics. Modal shells are not settings panels.

### Structure

Subpage pattern:

1. `PageFrame className="settings-panel-page"` with `headerMode="content-wide"`
2. back `HeaderButton` and the page title in shared `PageHeader` typography
3. `settings-panel-stack` or `settings-panel-layout`
4. one `Card className="flex flex-col gap-4"` per section holding rows, inputs and toggles

Examples:

- `settings.advanced.tsx`: one panel of toggles, selects and nav rows
- `settings.readers.tsx`: reader status and controls in separate panels
- `settings.play-controls.tsx`: named groups; inner field groups must match within the page

Shared behaviour:

- Core settings are written through `useCoreSettingsUpdate`; typed values that save as you go use `useDebouncedSave`
- errors: an action or save failure shows one toast; form validation is inline on the field. Never both for one failure, and never silent
- loading: `Skeleton` for a pending value in a known slot (reader list, connection subtitle, stat values, switch); `InlineLoading` for a pending list or panel
- dates and times use `formatAppDate` / `formatAppDateTime` from `src/lib/formatDate.ts`
- `CoreOutdatedNotice` is a polite `role="status"` Card with a warning border and visible warning wash

### Adaptive Settings pages

All Settings forms and related Devices, device detail, Logs, Help, About, and Licenses use `headerMode="content-wide"`. From 760px their inline breadcrumb/title and actions scroll with content. Device detail includes Settings and Devices ancestors; other Settings pages link to Settings. Phone keeps the existing back button and swipe behavior. Links preserve parent scroll intent and embedded `/app/` routing. Title/actions/dialogs are not duplicated or remounted on resize.

- Accessibility, Language & Region, Advanced, device detail, Help, About, Licenses, and signed-out Online remain bounded forms/reference pages. Do not stretch controls or document text across the whole workspace.
- Manage Media uses two independent equal-width panels from 1024px: database and scraper. Existing warning remains above both panels.
- Readers places controls in the main column and connected-reader status in the supporting column from 1024px (3:2). Phone retains reader status before controls. Native capability and purchase gates are unchanged.
- Play Controls stacks limits and launch guard in the main column, with Profiles alongside in the supporting column from 1024px (3:2). Phone retains Profiles before limits/guard. Without Profiles support, limits/guard use equal columns. Profile editor, selection, PIN, and confirmation dialogs retain their existing owners.
- Signed-in Online groups device/link/features in the main column and Warp/account panels in the supporting column from 1024px (3:2). Phone preserves existing order; signed-out entry and authentication remain bounded. Account actions, MFA, entitlement and linkage behavior are unchanged.
- Logs opts into the workspace width for dense diagnostic lines; its filters, page actions, scrolling and exports retain existing behavior. Devices keeps its existing connection/management workspace.
- All panels retain natural heights and functional grouping without additional shells. Stable wrappers own presentation only; resizing does not create mutations, reset drafts, or restart query/reader owners.

### Settings navigation rows

Settings landing uses `PageFrame layout="workspace" headerMode="content-wide"` with a bounded 672px phone/tablet stack. Its title and Inbox scroll with page content from 760px, without a raised header bar; phone retains the pinned header. Sidebar owns navigation, and the rail's menu button opens the full list. The same heading/action nodes survive width changes, preserving focus and Inbox ownership. From 1024px, existing App/Device/Support navigation groups occupy the main column and device/database/purchase context occupies the supporting column in a 3:2 split. Columns stack independently, without forced matching heights or extra enclosing cards. Phone order stays context before destinations; resizing changes only presentation and preserves the shared device sheet, manual drafts, and route focus. Simple settings forms retain the default bounded PageFrame; this overview does not globally widen every settings page.

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
- the Devices page uses `settings-panel-layout`; its saved-device section has an `h2` in `text-lg font-semibold` above a `flex flex-col gap-3` list. The Home-style heading is used only in the device sheet
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

- `SettingsFieldGroup` is the labelled row of related inputs, such as hours and minutes: a `fieldset` whose legend is `text-sm font-medium` with the inputs in one `flex gap-2` row and an optional hint beneath. Groups stack in `flex flex-col gap-3`
- `StatRow` is the status row: muted label left, value right-aligned, both wrapping; pass a `Skeleton` as the value while pending
- `ProgressBar` is the only progress bar (see Progress)
- the profile switch picker is a stacked `RadioGroup` that opens on the active profile
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

### Select

`src/components/wui/Select.tsx` is the only select. It keeps the native picker and shares the `wui-input` recess, a 48px minimum height, full width, and a drawn chevron in place of the platform arrow. Pass `label` for a visible label above the field and `help` for a `SettingHelp` control beside it; do not hand-write label markup or select classes.

Real use: language and region selects, Advanced, Online backup schedule, scraper select, Library system filters, and `SimpleSystemSelect`.

### Search/filter forms

`MediaSearchForm`, `MediaSearchSelectors` and `useMediaSearchForm` are the one search-form implementation, shared by Create search, the media search dialog and Library search:

- role `search`
- `TextInput` for query with `type="search"`
- system and tag selector triggers
- Search button: full width on phone and in the dialog, natural width in the toolbar row
- field labels share one style (`text-sm font-medium`, 8px above the control), so they line up when the fields sit side by side
- on the Create and Library search pages, and in the media search dialog, from 760px the form is one toolbar row above full-width results: the query field stretches, System and Tags keep a 220px basis, and Search sits at the end. When that does not fit (tablet, or beside the details pane) the query takes the first row and System, Tags and Search share the second. Never a side column of filters. The layout lives in `.library-search-*`/`.create-search-*`, not utility classes on the form

Do not build another search form or copy its fields into a page.

### Selector triggers and modal selectors

Use `SystemSelector`, `TagSelector`, and their trigger components for choosing systems/tags.

Selector modal pattern:

- `SlideModal fixedHeight="90vh"`; shared modal maximum clamps rendered height to 80% of viewport
- search bar at top with icon inside input; triggers use the shared `SelectorTrigger`
- category tabs/accordion where relevant
- search and category controls participate in normal modal scrolling rather
  than sticking over list content
- rows put the `SelectionIndicator` on the left (checkbox for multi-select, radio for single); preserve accessible-list fallback in virtualized tag search
- footers use `ModalActionBar`: Clear is `secondary` and disabled with nothing selected; Done or Apply stays enabled with nothing selected
- `BackToTop` for long lists

Tag selector keeps selected count inside the Apply label so its footer remains a
single action row. Category labels map every canonical Core tag type; internal
`scraper.*` and `scraper-run.*` bookkeeping tags are not user-facing filters.

Do not create a new picker UI for systems/tags.

## Modals

### SlideModal

Use `SlideModal` as the default modal for app flows: bottom sheets, selectors, action confirmations, and multi-step content. Do not implement one-off bottom-sheet shells.

Presentation:

- phone: bottom sheet with slide/drag motion, 8px upper corners, safe-area bottom padding, a centered title and a drag handle (no close X)
- from 760px: centered floating dialog with 8px corners, no slide motion and no drag-to-dismiss, a 16px gutter inside all safe viewport edges, a left-aligned title and a close X (no handle). The title aligns with the visible close glyph, not its larger target
- title is `text-lg font-semibold` and wraps naturally; handle and close button keep 48px hit areas around smaller visuals, and focus uses the `ring` outline
- one provider-owned scrim (`SlideModalProvider`, `bg-black/60`, no blur) is portaled to `<body>` and stays mounted and fully dimmed through dialog handoffs instead of crossfading layers. Click closes the current dismissible owner. Tablet navigation keeps its separate backdrop
- default dialogs are bounded to 42rem; only the command chooser opts into `layout="workspace"` for up to 60rem
- content-sized by default and capped at 80% of viewport height and the available safe space; keyboard and notch insets participate. `fixedHeight` requests cannot exceed those caps
- opaque raised surface with semantic border and material highlight; 16px shell gutter matching page content. Body wrappers add no second horizontal gutter; padding inside rows, cards and fields stays component-owned
- closed sheets stay mounted for lifecycle and transitions but suppress their upward shadow while off-screen, so stacked closed sheets never paint a gradient over the dock
- closed floating dialogs hide with `visibility`, so nothing inside a dialog may use `transition-all`: it would animate visibility and leave that element on screen for a moment after the dialog closes. Name the properties (`transition-colors`, `transition-[opacity,scale]`)
- header, scrollable body, and persistent footer form distinct zones; focus trap and Android back handling are built in
- one mounted title/body/footer tree survives sheet/dialog resize; widening cancels an in-flight drag without dismissing

Workspace bodies reuse existing controls and scrolling ownership. The media search dialog stays at the default width and uses the toolbar row described under the search form, like the search pages; at that width the query takes the first row and System, Tags and Search the second. Command categories use intrinsic 24rem tracks from 760px. Forms, confirmations, Profiles, pairing, and system/tag selectors stay bounded; do not widen them just because viewport space is available.

Use `dismissible={false}` only for mandatory blocking flows. It keeps the scrim but disables overlay-click, drag, Escape, Android-back, and close-button dismissal while preserving explicit completion/logout actions. Use `footerSkipLabel` when long content needs direct keyboard/screen-reader navigation to actions.

Footer:

- stays in normal flex flow below the scrollable body with an 8px gap after its divider; never float actions over content
- body shrinks and scrolls before the footer; the footer scrolls only as a short-viewport/text-zoom fallback, and its viewport extends into the shell gutters so reader halos and button shadows are not clipped
- `ModalActionBar` is the footer for confirmations, forms and selectors: one secondary plus one primary action as a labelled, equal-width pair (Cancel/confirm, Reset/Apply, Clear/Apply, Delete/Save, Logout/Save), or a lone action that follows the Button width cap
- modal action targets stay at least 48px high; keep actions mounted and disabled during temporary unavailable, empty, disconnected, or loading states so the footer does not reflow

Action rail (`ModalActionRail`), for media/detail surfaces with several independent contextual actions:

- `ContextualWriteRail` (`src/components/library/ContextualWriteRail.tsx`) is the shared write/launch rail for Library details, launchable and deck-item modals, and the deck page
- phone: the rail spans the footer above a full-width primary action, with icon above caption. 640–759px sheets use inline icon/caption beside the primary action. Dialogs from 760px stack icon above caption again and put the rail above the primary action
- captions are one line of sentence case (`Favorite`, `Play later`, `Write`, `Copy`, `Preview`), 13px semibold with 12px side padding. Columns are `minmax(max-content, 1fr)`: items fit their caption, share spare width, never wrap, and the rail scrolls horizontally with edge chevrons once they no longer fit. Adding actions must not shrink the primary action or grow the footer
- communicate toggle or loading state through icon treatment, `aria-pressed`, disabled state and a state-specific accessible name, not a changing caption. Toggled-on Favorite, Like, Dislike and Play later use the interaction colour on icon and caption with a 150ms fade and no background change; this is scoped to those buttons
- the contextual reader action changes `Write` to `Cancel` while waiting; `Button.labelAlternatives` reserves space for every translated caption so its footprint stays stable
- action order stays stable, every item remains directly reachable, and secondary actions precede the primary action in DOM and focus order
- do not use rails for confirmations, form submission pairs, single terminal actions, navigation, or unbounded destination data such as individual collections

### Adaptive Library details

Library preserves Systems/Collections, system/folder browsing, searches, tagged collections, history collections, and decks. Broad browse pages use the workspace layout; forms remain bounded.

Layout:

- root, browse, collection, search, deck detail and deck-item editor use `headerMode="content-wide"` with breadcrumbs to Library; the deck-item editor also links to its deck. Folder/search ancestors are session-owned buttons, not fake route links
- collection tiles are `outline` buttons in a grid (`library-collection-links`): two columns on phone, three from 760px, one row of equal tiles from 1280px. Collections and Decks are stacked sections at every width, never side-by-side columns; the deck list runs the full width beneath the tiles. The deck filter and New deck share one line from 760px, with New deck at a fixed 12rem from 1024px
- Favorites, Liked, Play later and Disliked (`LibraryTaggedCollection`) and `/library/recent` and `/library/top` (`LibraryHistoryCollection`) all render through `LibraryCollectionPage`. History rows add a muted detail line (last played, or total play time)
- the first list row sits at the standard page inset on collections and system browse; do not pull lists up with negative margins
- the selected row (`.library-browse-row[aria-current="true"]`) has no background, border or stripe. Its title takes the interaction colour and its trailing chevron becomes a solid arrow in the same colour (`RowSelectionChevron`). The shape change is required: selection must not rest on colour alone
- Library search puts its form in a toolbar row above full-width results from 760px; available width, including space taken by the details pane and enlarged text, decides whether the row wraps to two
- deck detail is one column at every width: description, the contextual rail (capped at 28rem from 760px, not stretched across the page), then the items at full width, with one drag/edit owner. Metadata fields and description stay bounded to 42rem. From 1100px a selected item shows in the docked details pane like other Library lists, its row marked as selected; smaller windows keep the sheet. Editing the deck closes the pane
- from 1100px selected-media details occupy the docked pane (see Breakpoints): a labeled nonmodal region with its own scroll; no backdrop, focus trap, inert background, swipe-dismiss, or modal-priority Back. Smaller windows keep the sheet
- in the docked pane, detail rows keep labels beside values as they do in the sheet; the footer stacks the action rail above Launch, which keeps the standard button width
- pending game-detail artwork keeps its 16rem height in a roughly 4:3 stand-in capped at 21.333rem; loaded images keep their natural aspect ratio
- virtual lists measure their origin within the actual page scroller, including preceding headers/filters, and measure natural row height so larger text wraps without overlap. Letter jumps honor measured scroll padding

Behaviour:

- one mounted details feature and presentation host survive resize, including carousel state, contextual NFC work, and child-dialog drafts. Wide selection keeps list focus; the narrow sheet traps focus
- selection stays scoped to device and browse/search/collection context in session memory; it neither launches media nor creates a URL/history entry. Closing or invalidating a selection cancels its owned work; changing presentation does not. Modified ancestor-link clicks do not clear it
- child dialogs retain takeover behavior and the mounted underlying context
- game metadata is an exploration surface. The Details list has one labelled row per fact: System first, then every canonical tag type with a display name (year, players, developer, publisher, genre, region, language, edition, revision and the rest), using the tag type's name as the label. Each value is an inline `text-primary` link to Library results: no chevron, no enlarged box, underline on hover; label and value share a baseline. Several values in one row are comma-separated. Dump and hardware facts (extension, dump status, MAME parent, video, media, protection and similar) sit with Path and Launcher under Technical details. The rows are one shared implementation (`LibraryMediaFacts`, `LibraryFactRows`, `TechnicalDetails`) used by game details, Now Playing details and deck items that have an indexed game. Tags of types without a display name stay in a Tags row as ordinary badges that are themselves the link, with no chevron or added padding. The caption beneath the artwork (system • year • players) is plain text, not links. Field labels stay static. Descriptions, paths, and launcher identifiers remain reference text. Collapsible sections (Technical details) use a down chevron that turns up when open, as the sidebar does; right chevrons mean navigation
- metadata links use exact raw `type:tag` filters and current system/device context; friendly labels never rewrite queries. Core labels take precedence, then translated names for known vocabulary values only (genres, region, language, edition, revision, players, input and the other closed vocabularies in `libraryTagLabels.ts`). Free text and any value outside those vocabularies is shown exactly as Core sent it; never reformat it
- `/library/search` accepts validated optional system/tag parameters and auto-runs supported filters. Each exploration history entry owns its search/scroll/selection session; at most 20 are kept per device, and the least recently visited are forgotten along with their scroll
- metadata navigation remembers the originating details per history entry. Back (browser, page, swipe, Android) returns to those details and Forward restores results; a history entry's return marker outranks the scope's later selection. Explicit close or selection clears the marker; device changes invalidate it. Modified/middle/new-tab clicks do not mutate the source

### Reader activity

Physical NFC waits stay in context instead of opening an app-owned modal. `ReaderActivityControl` is the shared full-size control for NFC scan, read, and write actions, including Zap’s Tap a tag action; compact action rails use `ReaderActivityAction` below. Do not reproduce their latched state or pulse with a one-off `Button`:

- waiting latches the physical button down and adds a broad, slow blue halo outside its edge; do not draw an illuminated line inside the button face
- a required re-tap uses an external amber double pulse
- verification failure swaps to an explicit Retry/Cancel pair: Retry stays latched (pressed face) inside a static red halo with the failure text inside its face, and Cancel is an outline button; nothing pulses. The pair uses `.wui-action-grid`, the intrinsic two-action grid (9rem minimum tracks) also used by the manual-entry footer and mapping capture: equal-width faces while they fit, stacked at narrow or enlarged-text widths
- width follows ordinary full-width buttons (see Button); the halo paints outside the face without adding layout padding
- status sits inside the button beneath its main label, in smaller sentence-case text that inherits the face's contrasting text color. Compact reader buttons have a 72px minimum height for both idle and active states; Zap keeps its larger face. Content can grow for translated labels and text zoom rather than clipping. Do not reserve an empty status row below the button
- pressing the latched waiting control again cancels the session; visible status copy says “Press again to cancel” so it cannot be mistaken for another NFC-card tap
- labels describe the physical action; do not imply finite progress
- state changes receive one live announcement without moving focus
- the waiting halo is a solid ring whose `box-shadow` spread animates outward up to 8px, within ordinary control gutters, in `--interaction`; the re-tap glow animates opacity in `--status-yellow`, and the error halo is static `--status-red`
- reduced motion keeps a static illuminated state

Game-detail and deck action rails use `ReaderActivityAction`, not the full-size control:

- keep the selected game and original Write control mounted; its icon becomes NFC, face latches down, and visible caption changes `Write` → `Cancel` → `Write`. Pressing Cancel ends the owned write without closing details
- reserve caption width for Write, Cancel, and Retry, including translations; ordinary waiting must not resize the rail, footer, or sheet
- do not append “Hold tag to reader” or “Press again to cancel” paragraphs. Announce waiting once; the visible Cancel caption already explains the action. Only re-tap and verification recovery need additional instructions
- reader rails include halo gutters in the intrinsic scrolling content width, not padding around overflowing grid tracks. Keep clearance at both scroll ends and below the depressed face; preserve normal scrolling boundaries and focus targets
- contextual writes never enqueue a detached global write; cancel owned work when its details close or selection/device changes

Queue or deep-link writes without a visible source control use the compact reader activity strip above the measured footer clearance. Native iOS NFC system UI may still appear because it is OS-owned. Do not add spinner, orbit, fake percentage, or app-owned full-screen reader overlays. The dev-only App preview simulator (`docs/capacitor.md`) stays as the way to review these states without hardware.

### Confirm modals

Confirmations are a `SlideModal` with concise text and a `ModalActionBar` footer: Cancel (`secondary`) left, confirm right. `StopConfirmModal`, `ConfirmClearModal`, `DeepLinkConfirmModal`, `StagedTokenModal`, the App badge prompts, the Advanced error-reporting prompt, mapping delete, device forget and Manage Media clean all use it.

- body: one centered paragraph with `py-4` vertical padding and no horizontal padding of its own
- confirm is `intent="primary"`, or `intent="destructive"` for destructive actions
- a confirmation that must show the value being confirmed (staged token, deep link) uses `flex flex-col gap-4 py-4`: muted `text-sm` description, then the value in `text-foreground text-sm font-medium break-all`

Keep them concise. Do not add extra cards, icons or status badges.

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
  system, and a transport deck. Artwork and title are one details control: a
  single button whose hit area covers the artwork, opening the shared details.
  Keep the previous/stop/play/next deck mounted while idle so the card does not
  shift. Idle Play replays the most recent media when available; the other
  controls remain unavailable. Never repurpose the Stop position as Play.
  Without a playlist, the deck drives the launcher's media controls
  (`launcherControls`) and carries its own group, Pause and Resume labels
  rather than playlist wording. When a playlist is active, keep the
  artwork/title/system area about the active media and show the text queue in a
  second recessed, vertically scrollable well below the transport. Its compact
  header carries playlist name and plain item position. Each 48px row selects
  that item with `playlist.goto` then `playlist.play`; auto-center the current
  item, using its name with ZapScript as the fallback. Do not render playlist
  position as a progress bar.
- Recently played and favourites are horizontal cover rows that scroll, each
  hidden when empty. Tapping a cover opens the shared media-details sheet so
  launch, favourite, and write actions stay consistent with Library and search.
- The reader strip uses the shared `ReaderStatusRow`, the same row as reader
  settings. Both lists sort by displayed name (natural numeric order), with reader identity breaking ties; connection changes never reorder rows. Names fill remaining width so state and optional detail sit on the right.
- The History sheet uses the neutral title “History” with semantic Scans and
  Played tabs. Both tabs use `HistoryListRow`: primary value or media title,
  muted timestamp metadata, optional low-priority details, and a right-aligned
  ghost Play action. Scan failures use a compact text status rather than
  colouring the entire row. The tabs share the history pages' states through
  `HistoryQueryState` (not connected, error with Retry, loading, empty) and
  their replay rule through `useHistoryReplay`: a replay needs a live target,
  one runs at a time, and a failure that lands after a device change is
  dropped. Keep the sheet at a stable 70vh while either API loads.
- Home section headings use the Home label style from Typography.
- Stop and transport actions are icon-only outline `Button` controls inside a
  shared recessed transport deck.

### Adaptive Zap

- Phone keeps the order above. From 760px playback leads, in the DOM as well as visually, with reader tools/status before secondary cover rows.
- From 1024px use independent main/supporting stacks in a 3:2 column split: playback/background slots then scan actions in the main column; Controls then Readers in the supporting column. Shared grid rows do not push scan actions down to match the remote's height. Covers span the workspace below. Keep section heights natural, with no extra enclosing cards. Short windows scroll; controls never shrink to fit height.
- Main/supporting wrappers stay mounted at every width and become `display: contents` below the two-column threshold so phone order stays reader-first. Layout ownership stays separate from feature/session ownership.
- **Customising Zap.** The page's built-in widgets (Now playing, Scan, Controls, Readers, Favourites, Recently played) and any custom buttons can be moved between three places (main column, side column, full width) and hidden. There is no free grid and no per-size layout: one arrangement applies at every width, and arbitrary resizing is not implemented. Arrangements are device-local and **per device**: `zapLayouts` in preferences, keyed by the device record ID (`src/lib/zapLayout.ts`); a device with no entry shows the built-in page, which must stay exactly as described above (phone order, the Controls launcher under the scan actions, width-dependent order). The page swaps arrangement when the active device changes and stays on the last device while offline. Forgetting a device deletes its arrangement. Each arrangement is one self-contained, versioned object (buttons included) so it can be copied between devices, and later backed up, as a unit. `normaliseZapLayout` repairs stored layouts, so widgets added later appear in their default place.
- A saved layout (`data-zap-layout="custom"`) stacks main, side, then full width on phones and tablets, and uses the 3:2 grid from 1024px, with an empty column handing its width to the other. The Controls launcher moves with the Controls widget. Each place is a twelve-column grid; a widget sits in a cell (`.zap-cell`) that takes its width in twelfths, packed in order. Built-in widgets take the full row; a button is Small (a quarter), Medium (a half) or Large (the full row, taller). A column too narrow for a button's share gives it a bigger one (container queries on the place) so the label keeps its room: below 32rem a quarter becomes a half, below 18rem a half takes the row.
- **Custom buttons.** A button runs its ZapScript through `CoreAPI.run` when pressed, is disabled while disconnected, and is held with a spinner in place of its icon (`aria-busy`) until Core answers, because `run` returns only once the script has finished (this also stops a second press starting another), and reports a failed run with the same toast as the ZapScript editor. Making one asks for a label, an icon from a curated set, a size and the ZapScript builder; style (blue, plain, red) and "Ask before running" are behind "More options". "Ask before running" is a per-button option the user turns on and is off by default; the app does not judge scripts. Buttons are free: they are purely digital.
- **Custom collection rows.** A collection row is a cover row like Favorites and Recently played (`MediaCoverRow`), showing a library collection the built-in rows do not (Top played, Liked, Disliked, Play later) or a deck. Its heading is the user's title, or the source's own name when the title is empty. Like the built-in rows it shows nothing while it has nothing to show, which includes a deck that no longer exists, a Core too old for the collection, and, for a deck, items that link to no media (decks hold scripts and cards as well as media; only media has a cover). It is a widget in the layout like any other and lives in the full-width area when added. Rows cap at 12 covers. "Add" in the editor bar opens a short chooser, Button or Collection, because the two take different settings; a collection's settings (what to show, an optional title) open as a screen in place of the arrangement, like a button's. Deck ids belong to one Core, so a copied arrangement can point at a deck the other Core does not have, which the editor names "Deck not found".
- The editor replaces the page in place (`ZapLayoutEditor`, `ZapWidgetFrame`, `ZapButtonFrame`, `ZapButtonEditor`): a sticky bar across the page with Cancel at the leading edge, the title "Customise Zap page" centred and Done at the trailing edge; one "Add" control in the bar, beside Done, that adds a button or a collection row (just its plus on a phone, where the bar has no room for the word); a list per place plus a Hidden list; and a frame per widget. A built-in widget's frame is its name, a note when it shows nothing right now, and its moves: drag, keyboard, and up/down arrows that carry it across places, plus hide. There are no live previews of built-in widgets. A button's frame shows the button at its own width in its row, with drag, earlier/later and edit underneath. A button's or collection row's settings open as a form screen in place of the arrangement, not a dialog and not under the editor bar: the bar is for arranging, and these are ordinary forms, so each has a heading, its fields, and closes with Save (primary), Cancel (secondary) and, for an existing one, Delete (outline, destructive): stacked on a phone, as in the mapping editor, and from 760px Save and Cancel in one row with Delete on its own line beneath. A button's form is one column in fill-in order up to 1024px and, from there, a narrow column of basics (preview, label, icon, size, more options, then the actions) beside the ZapScript editor; a collection's form is bounded to 32rem and starts at the left edge, like Settings forms, so no field stretches across a desktop. They are not dialogs because ZapScript's pickers are dialogs and a dialog opened over a dialog closes it. "Add" opens a dialog of two `Card` rows in the Create landing style (Button, Collection), each with its inset icon tile, title, supporting copy and a next chevron. No move depends on dragging. While a widget is dragged a lifted copy, as large as the widget was, follows the pointer above the page and the layout reflows live, so the dashed slot is where the widget will land (where it lands follows the pointer, not the lifted copy, which a tall card's bottom-edge handle holds well above the pointer); there is no drop-zone highlight; Escape or a drop on nothing puts it back. Reset to default and "Copy from another device" (listed only when another device has an arrangement; it loads a copy into the draft, with new button ids) are quiet controls at the foot of the editor. Done saves (saving nothing when the arrangement equals the default), Cancel discards. It opens from "Customise" below the page, which stays reachable except in full screen, and from Settings › Customise Zap page. Customising is free; it is not a phone-as-reader feature.
- Now playing, Controls, and Readers use the same outside-card Home heading. Docked Controls owns its body material, not its section heading. Omit the Controls launcher while the pane is visible. Docked Controls does not repeat disconnected copy: global connection status and disabled live controls suffice. Standalone phone dialog keeps its recovery hint; actual input/capture errors remain visible.
- From 760px scan actions form a row of equal square-ish tiles with icons above captions, matching 24px icons, and a 10rem minimum height. Tracks grow from 10rem to 12rem and wrap when space or text sizing requires it; a single capability stays one tile rather than stretching across the column. Aspect ratio is a preference, not a fixed height: translated labels and active status can grow the row. NFC retains its primary material and camera its neutral secondary material; activity feedback stays within the existing mounted control. Phone scan geometry remains unchanged.
- The scan bank opts nested reader wrappers out of the Button width cap, not just the outer button. Queued/deep-link writes still replace scanning with the contextual reader control and its retry/cancel recovery bank; from 760px that control is full-width with inline captions and at least 72px height. Playback artwork expands to 96×128 CSS px at default text size, with a full-width recessed transport bank whose keys are centred, 64px tall at minimum and capped at 80px wide. Remote D-pad and secondary keys retain 64px targets; their horizontal grouping wraps when width or text size requires it.
- Scan history and Play history are real Zap child routes (`ZapHistory.tsx`), accessible directly at any width, with content-wide breadcrumb headers to Zap; phone keeps pinned Back/Refresh. They share rows, states and replay with the phone History sheet. Play history lists chronological sessions, including repeated games, with cursor pagination; Library Recently played remains a deduplicated collection. Page queries are device-scoped, and play history is gated on Core support. On the pages, row text aligns with the page title (`flush` rows); the sheet keeps row padding. A played row opens the shared game details the way a Library row does: the whole row is the control (pointer cursor, trailing `RowSelectionChevron`, no hover fill), and the sheet hands the entry to Zap, which swaps the sheets. Play stays a separate quick-launch button just before the chevron. Scan rows are tag contents and open nothing.
- Devices combines the shared connection/discovery/manual-entry flow with saved-device management and direct connection actions, in `settings-panel-layout` columns from 1024px. The phone DeviceSheet hosts the same connection feature with its existing footer/focus behavior. Width changes do not restart discovery or clear address drafts. Where the Core is too old to link to Zaparoo Online, device linking is plain muted text, not a disabled button.
- One Home/session tree and one Controls controller remain mounted. Controls use the existing nonmodal pane on wide screens and the existing phone modal intent below the threshold; width alone does not open a previously closed phone modal.
- Keyboard mode/case, focused surviving controls, screenshot results, and in-flight captures survive presentation changes. Captured exports remain usable offline.
- Cached media is not a live connection. Play/transport/remote/capture require current connection state and actual transport readiness. Serialized input rechecks its record, endpoint, transport, and session generation immediately before dispatch; reconnect/device changes drop stale pending work and ignore stale responses.
- Existing scanner offline behavior, capability hydration, native keep-awake preference, and feature gates remain unchanged.

Do not copy Home heading style into Settings; it is home/status-specific.

## Create, Search, and NFC flows

Create destinations and shared new-deck editor use `PageFrame headerMode="content-wide"`. Create subpages use inline breadcrumbs to Create; mapping editors include Create and Mappings ancestors. New-deck ancestor follows entry context (Create or Library). The custom text editor is locked while its write waits on a tag.

### Create landing

Create index uses bounded stacked `Card` rows below 1024px and a two-column destination grid from 1024px. Card content retains its menu-row geometry:

- `flex flex-row items-center gap-3`
- neutral inset square icon tile (decorative, not a fake blue button)
- text stack with `font-semibold` title and muted `text-sm` supporting copy
- `NextIcon size="20"` on navigable rows

Use this pattern only for menu-like action cards.

### Search results

Search result rows are list rows, not cards, and are rendered only by `VirtualSearchResults`; hosts learn about loading through its `onLoadingChange` rather than drawing their own state.

Library search opts into `rowVariant="library"`, which renders the same artwork row (`LibraryMediaRow`) as Library browse and collection lists. Create search and the media search dialog keep the plain rows described here:

- clickable row
- `px-1 pt-3 pb-5`
- bottom divider between rows
- primary name `font-semibold`
- metadata `text-sm`, muted filename when needed
- `NextIcon` right

Do not wrap search results in new cards. Create search keeps its bounded stack on phone; from 760px it uses the same full-width toolbar row and results as Library search. Both use the same page scroll owner. Selection retains the write-focused detail modal rather than introducing another details owner.

### Recent searches

The Recent Searches sheet follows the Home History sheet rather than card-menu
styling:

- content-height sheet that grows until `SlideModal`'s maximum height, then
  scrolls
- shared `HistoryListRow` geometry with search text as the primary value and a
  muted timestamp below
- right-aligned ghost Search action, named “Search for …” with the query
- the list uses the sheet gutter only; no extra horizontal padding
- Clear History is a destructive `text` action below the list with a
  full-width touch target but no visible button face; it is not a prominent
  modal footer action
- clearing keeps the sheet open so the empty-state result is apparent

Expanded game-detail tag badges show `type:value`, preserving friendly value labels when available (for example `region:eu`, `lang:en`, `edition:Special Edition`). This applies to Library details and write-focused details, not condensed search-result tag summaries. Accessible names and tag selection semantics stay unchanged.

### Write-focused media details

Search/Create media details prioritize the value being written:

- with Show filenames off, ZapScript is first and selected by default
- with Show filenames on, Path is first and selected by default
- tags only modify parsed ZapScript; each is a chip with a checkbox mark, the
  same one the tag selector uses (an outlined box, filled with a thick check
  when included). In Path mode they become plain display-only badges with no
  selection indicator and no disabled inset (see Badge)
- Favorite, Copy, and Preview remain secondary to Write in the modal action
  rail, with no extra body padding above the footer. Copy goes through the
  shared clipboard helper (`src/lib/clipboard.ts`) and reports Copied or a
  failure. Where the sheet only picks a value to use, such as inserting into a
  ZapScript from the media search dialog, there is no Favorite and the footer is
  just the primary action

### Mapping editor and ZapScript input

Mapping editor uses a plain `flex flex-col gap-4` form stack:

- `TextInput` for label/pattern
- stacked `RadioGroup` for type/match
- `ZapScriptInput` for override text
- `ToggleSwitch` for enabled
- Save is primary; Delete beside it is `variant="outline" intent="destructive"` with no icon

`ZapScriptInput` is the ZapScript builder, shared by Custom ZapScript, the mapping editor, adding to a deck and reader settings. Its value is always the ZapScript text; it offers two views of it through a `TabBar`:

- **Steps** (the default whenever the script can be split): one bordered `surface-raised` card per command (`ZapScriptSteps`). The card leads with the command's plain-language description in semibold, with the command name beneath in muted monospace; ghost icon buttons move it up, move it down and remove it. Under that sits the command's form, one field per argument from the catalogue: text and number fields, a `Select` for fixed choices, and for media, system and launcher values a field with a square outline search-icon button beside it (the same icon for all three) that opens the media search, the system picker or the launcher list (`LauncherSelector`; the button is left out on a Core too old to list its launchers). Named options (`?name=value`) sit under an `Advanced` disclosure, open when the step already has one. An expression, `[[ ... ]]`, can be typed into any field and is written exactly as typed. `Add step` (outline) opens the command catalogue. An empty script shows a compact `EmptyState` with the same button
- **Text**: the recessed monospace textarea with the shared input focus/error vocabulary and its raised attached toolbar (matching boundary, 4px lower corners; utility rows wrap at narrow/zoomed widths) always showing four buttons: insert media, a system or a command, plus the ZapScript help link with `ExternalIcon`. There is no toggle and no `**`/`||` buttons: an inserted command, or media that is not an argument of the command being written (straight after `:` or `,`), is set apart from the text around it with `||` automatically
- under both views: the character count in muted small text, Clear (`ConfirmClearModal`) and Test (it runs the script on the connected device)
- the command catalogue (`CommandsModal`) is searchable and grouped under localized headings; each row leads with the plain-language description and shows the command name beneath. It uses the selector row geometry and `BackToTop`. Deprecated commands and ones Core does not run on their own are recognised when read but never offered
- pages where the editor is the main content pass `split`: from 1024px the steps and the text sit side by side (3:2) with no tabs, the text updating live. Embedded editors keep the tabs at every width
- fidelity rules, which are not negotiable: a step keeps the exact text it was read from until the user edits that step; anything the builder has no form for (JSON arguments, an escaped `^[` that would read as an expression, `@System/Title` shorthand, unknown commands, more arguments than the form has fields) is a text step edited as ZapScript; a script that cannot be split reliably opens in Text with a note in Steps. The builder never rewrites what it does not understand
- the catalogue (`src/lib/zapscript/catalog.ts`) is the app's copy of the commands in the ZapScript library Core pins. `scripts/sync-zapscript-commands.mjs` regenerates `commandNames.json` from that library and `catalog.test.ts` fails when a command is added or removed there. Descriptions and field labels live under `zapscript.*` in the locale files

Do not replace ZapScript editing with a plain `TextInput`. Mapping and shared new-deck forms stay bounded to 672px; extra width is not a reason to split dependent fields or expand attached editing controls.

### NFC tabs

NFC utilities use `TabBar` (`role="tab"`) for Read/Tools. Content stays bounded and stacked below 1024px. From 1024px, Read and Tools use two-column panel grids with natural panel heights; Read's scan/cancel control spans both columns. Same mounted controls and tab/session owner serve every width.

NFC content panels use custom rounded blocks, not WUI `Card`:

- wrapper: `bg-surface-raised space-y-4 rounded-lg p-4`
- headings: `text-lg font-semibold`
- values: `bg-surface-inset rounded-lg px-3 py-2`, often mono/small
- badges for NFC booleans/tech types
- dangerous tool warnings use red icon/text in the Tools tab
- Read and Tools panels both stay mounted; the hidden one is only hidden. Each tool uses its own `ReaderActivityControl`; only the selected action latches, with the other operations unavailable until completion or cancellation
- the Read/Tools tabs are locked during a tag wait. A tool's completion stays on Tools and clears the Read result, because only a read describes what is on the tag now

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

Use this style for mapping-like data rows. From 1024px a mapping reads across one line in aligned columns (name and status badges, type and match badges, ZapScript); narrower windows stack the three. The list toolbar matches Decks: the filter stretches and New mapping keeps a fixed 12rem at the list's right edge from 760px. Editable rows end in the standard chevron; read-only rows have none and are not interactive. Mapping lists and editors show delayed `InlineLoading`, an explicit retryable load error, and `BackToTop` on long mapping lists. Token capture in the editor is one outline `ReaderActivityControl` beside a mounted outline Camera button, each shown only when the app has that capability and only for the ID type; leaving ID cancels a waiting capture. Save remains the primary action.

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
- highlighted supporter names use `text-warning`
- the Licenses link is a `settings-nav-row` inside a `Card`

Do not copy About credits styling into normal settings pages.

### Online account

Online settings has auth/account-specific layout:

- signed-in order is Connected device → Online features → Warp → Account; name/email live in Account
- mobile Online content starts 16px below the header and ends 16px above the measured footer overlay, matching horizontal gutters; do not add page-wrapper vertical padding. Feature rows rely on their 48px hit heights rather than extra row gaps
- linked state is plain “Linked to Zaparoo Online” text, never a disabled action or a claim that the device belongs to the signed-in account
- Online features use a tri-state master checkbox (none, some, all) above individual switches; pressing the mixed state enables all available features. Cloud backups only join the master selection when Warp is confirmed
- remote connection state sits beneath Remote control; backup result sits beneath backup controls. Only cloud backups carry a Warp requirement; do not label ordinary features “Free”
- account actions are full-width outline buttons in `gap-3`; all four (dashboard, change password, log out, delete account) carry an icon
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
- log rows use `p-3 font-mono text-xs` with a `border-b` divider except on the last row
- log message is `text-foreground font-mono text-sm break-all whitespace-pre-wrap`
- metadata fields are `text-muted-foreground mt-1 font-sans text-sm break-all`
- log level uses `Badge` variants
- `BackToTop` appears for long log content
- loading uses `InlineLoading`

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
- state wording comes from `connectionStateLabelKey` (`src/hooks/useDevicePresentation.ts`), shared with the sidebar device block and Home device pill

Do not recreate connection rows manually.

### Loading

Use loading treatment that matches known dimensions:

- `Skeleton` for a pending value in a known slot: switch, stat values, reader list, connection subtitle
- `InlineLoading` (`src/components/InlineLoading.tsx`) for every pending list or panel: one centered row with a 16px spinner and status text, usually inside `DelayedLoading`
- busy buttons show `LoadingSpinner size={20} decorative`; progress and inline status spinners are 16px
- raw `Loader2` only in the connection status displays (`ConnectionStatusBar`, `ConnectionStatusDisplay`)
- physical read/write waits use the latched `ReaderActivityControl`, not a loading spinner or blocking overlay

Do not invent new loading cards or shimmer styles.

### Progress

Progress bars exist for media database and scraper flows.

Patterns:

- `src/components/ProgressBar.tsx` is the only bar: a `h-[10px]` `rounded-full` track with `border-border bg-background`, and an `h-[8px]` `bg-primary` fill (`animate-pulse` for indeterminate work)
- status rows use `StatRow`

Do not use progress bars outside real progress work.

## Lists and rows

Choose row style by context:

- Settings nav: tiles on the Settings index; `settings-nav-row` (48px, trailing `NextIcon`) inside a Card on subpages
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
- buttons in the same footer, pair or rail either all have icons or none do: a Delete beside Save has no trash icon, and the four Online account actions all carry one. A trigger may have an icon while its confirmation dialog does not
- buttons that leave the app use the custom `ExternalIcon`
- use one glyph per concept: where `src/lib/images.tsx` defines it (Play, Search, Save, Create, Camera, Nfc, External, History, Back, Next, Clear, Check, Lock, Warning, Database, Device), use that instead of the lucide equivalent. Custom glyphs accept numeric sizes. Lucide `PlusIcon` means add and is distinct from `CreateIcon`; directional and carousel chevrons and the Pause/Play/Skip transport set stay lucide. Import lucide icons with their `Icon` suffix (`XIcon`, `Trash2Icon`)
- busy-button and loading spinners follow Loading
- deliberate exceptions, not patterns to copy: the page-level action rail on deck detail; Warp “Manage” without an external icon; the eraser on ZapScript Clear; lucide icons for transport, bottom navigation and Settings tiles

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
