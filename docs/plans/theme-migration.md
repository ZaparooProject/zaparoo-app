# Theme migration design notes

Working notes for mobile-specific adaptations and refinements discovered while reviewing individual components. Fold settled rules into `docs/design-language.md` once the migration is complete.

## Bottom navigation

Reference: `zaparoo.com` marketing header and the shared Header Variants / Nav Rail rules. The app keeps its persistent four-destination bottom navigation; this is a product-specific placement adaptation, not a separate material system.

- Persistent navigation uses a flat `surface-raised` face. Do not copy the website header’s elevated→raised gradient here: across the wide, always-visible dock it reads as a glossy two-tone band. Depth comes from the top edge/highlight on mobile and the front edge/shadow on wider layouts.
- Below the `md` breakpoint (768px), navigation is a compact 64px dock before safe-area padding: full viewport width, flush to both side and bottom edges, with no outer margin or rounded outer corners. Visible labels remain because several app icons are not self-explanatory. Tabs retain at least a 48px touch target, and the dock scales with text zoom. Native bottom and side safe areas remain inside the dock.
- At `md` and above, the dock may become a contained header-like bar: `max-width: 42rem`, 16px minimum side clearance, 12px bottom clearance, 8px corners, solid `surface-base` front edge, and material shadow. Icon and label also move into an inline tab layout, matching the website header more closely. This wider-layout elevation must not leak back into the phone layout.
- Tabs use the same navigation treatment as the website: neutral secondary text/icons at rest, surface-highlight on fine-pointer hover, semantic blue focus outline, and primary text on an inset pressed surface for the active route.
- Active tabs add semantic blue to the icon with a restrained theme-aware glow, while the label stays primary. They do not add a card-like border. State remains redundantly conveyed by `aria-current`, foreground contrast, inset background, and inset shadow rather than color alone.
- Keep app-specific mobile requirements: four equal destinations, icon plus uppercase label, 48px minimum target, long-label wrapping/hyphenation, notification badge, haptics, tab-session restoration, and active-tab scroll-to-top behavior.
- Connection status remains a separate in-layout strip above navigation; it does not become part of the elevated navigation surface.

## Slide sheets

- Open bottom sheets retain their upward material shadow. Closed sheets remain mounted for lifecycle and transition behavior, but must suppress that shadow while translated below the viewport; otherwise stacked closed sheets paint a false gradient across persistent bottom navigation.
