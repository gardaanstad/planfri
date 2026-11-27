# Planfri design

How Planfri looks and behaves, as rules to follow. The tokens live in
`app/globals.css` (`@theme`), the shared control classes in `app/lib/ui.ts`.
Use those before writing new classes; a value that isn't here or there is a
deviation and needs a reason.

The interface is in Norwegian Bokmål, calm and quiet: a green-tinted neutral
palette, one accent, few borders, no decoration. The map is the page; every
list, project and menu sits over or beside it.

## Principles

- **Quiet by default, firm when it matters.** Metadata is muted, reading text
  soft, titles full ink. Chosen, set or unread things get weight or the
  accent; nothing else does.
- **One way per job.** A kind of overlay, row, button or state looks and
  moves the same wherever it appears. Reach for the shared component
  (`BottomSheet`, `ActionSheet`, `Dialog`, `ChoiceSelect`, `PanelHeader`,
  `EmptyState`) instead of a local copy.
- **Pointer and touch are different devices.** Hover is for a fine pointer
  only; touch gets a press wash instead. Phones get sheets, desktop gets
  anchored menus and dialogs.
- **Nothing jumps.** Things that change size fold, things that appear fade or
  slide, and a scrollbar appearing never shifts layout (`scrollbar-thin`
  keeps its gutter). With reduced motion, only opacity changes.
- **No dead strips.** Hit areas reach across the gaps between neighbouring
  rows and controls (`before:`/`after:` reaches), so a press between two rows
  lands on one of them.

## Layout

### Breakpoints

| Name   | Width          | Use                                                   |
| ------ | -------------- | ----------------------------------------------------- |
| `xs`   | < 370px        | Very small phones: drop secondary icons and labels    |
| `sm`   | < 640px        | Dialog goes edge to edge; button rows stack           |
| `md`   | < 768px        | **The phone layout.** `max-md:`; `explorer.tsx` matches it in JS |
| `xl`   | < 1200px       | Desktop sidebar room                                  |
| `narrow:` | sidebar < 450px | Desktop sidebar's narrow mode (a container query) |

Style mobile with `max-md:`. Only use `max-sm:` for things that depend on
the screen being truly small (dialogs, button stacking).

### Desktop

- The **sidebar** (results list) sits beside the **map**. Its width is
  resizable and remembered. Below 450px it goes **narrow**: Kategori and
  Status fold into one filter button, labels down to their icons. Things that change between widths **fold**
  (`fold unfolded narrow:folded`), never jump.
- **Panels** (a project, a profile, Lagret, Forslag, the editor) stack as
  layers over the list in the sidebar. They slide in from the left edge
  (`animate-panel-in`, 320ms) and slide back out on close. The list stays
  mounted underneath, scroll position kept.
- Escape, Back and ✕ close the panel on top.
- A panel's own actions (save, suggest a change, share) sit in its ⋯ menu,
  beside ✕, so the title has the bar to itself.
- Drawing a project takes the **map area** beside the sidebar
  (`DrawSurfaceContext`), its tools in a small bar floating over the
  map's top.
- Content gutter inside panels is **24px** each side (`px-gutter-scroll`,
  which accounts for the scrollbar).

### Phones

- The map fills the screen. The results list is a **sheet** (see below)
  resting at its middle height.
- Panels are sheets of their own, stacked over the list's sheet; the one
  under stays where it was.
- Content gutter is **18px** (`px-4.5`).
- Modal sheets and dialogs **push the page back** (`useBackgroundPush`): it
  scales down slightly and rounds its corners against the scrim.
- Text fields are at least 16px (`text-base`) so iOS doesn't zoom.
- Respect safe areas: `env(safe-area-inset-*)` on anything touching an edge.

## Overlays

Pick the overlay by **what it holds**, not by where it's opened from.

| Holds                                     | Phone                       | Desktop                          |
| ----------------------------------------- | --------------------------- | -------------------------------- |
| A page of arbitrary length (list, project, profile, Lagret, Forslag, editor) | **Sheet** with heights | Sidebar panel                    |
| A fixed set of actions (⋯, account, comment) | **Drawer** (`ActionSheet`), untitled | Dropdown menu (`menuPopup`) |
| One or more choices (sort, category, layers) | **Drawer** (`ChoiceSelect` sheet), titled | Anchored menu (`ChoiceSelect`) |
| Several filter sections                   | **Drawer** (`FilterSheet`), titled | Popover (`FilterPopover`) |
| A yes/no question before a destructive or account action | **Drawer** (`ActionSheet`) titled with the question | `Dialog` |
| A short form (profile, username, login)   | Drawer                      | `Dialog`                         |
| Feedback after an action                  | Toast, top                  | Toast, bottom centre             |
| An icon-only control's name               | —                           | Tooltip (`data-tooltip`)         |

### Sheets: pages of arbitrary length (phones)

A sheet is a non-modal drawer that holds a page and rests at set heights.

- **Heights**: `middle` (58% of the screen, map above) and `full`, for
  pages that go with the map: the list, a project opened from the map, a
  profile, the account. A sheet that sits over the map may also **fold**
  down to its header (the list to its filters at 124px, a project to its
  header and phase timeline) when the map is touched; a tap on a folded
  sheet unfolds it a step.
- **Full height only** for pages that stand on their own: Lagret, Forslag,
  the editor, and a project opened from the list, which covers the list it
  came from.
- A sheet with a middle height opens there, unless the user asked for the
  whole page (a deep link, "Les mer", writing a comment), which takes it to
  `full`.
- **Grip** (`SheetGrip`, the same as every drawer's), centred in a 20px
  strip (`gripStrip`) that the content rises 12px under, the grip drawn over
  it; only the grip's middle takes a press.
- **Header** (`PanelHeader`): back (if any), the title, the panel's actions,
  close. Its ink stands as far below the sheet's top edge as it is in from
  the sides: the title's capitals and the close glyph alike. It has no
  surface of its own, since it reaches into the sheet's rounded corners;
  nothing that does may paint one. Its bottom border shows only once content
  has scrolled under it.
- Below full height, a swipe on the content moves the sheet; at full height
  it scrolls. A fade along the bottom edge says there is more.
- Swiping below the lowest height closes it. Never a scrim: the map stays
  live.
- Floating at `middle`, a sheet stands 8px clear of the screen edges and
  grows into them on its way to `full`; its text doesn't reflow as it does.

### Drawers: fixed-length menus (phones)

A drawer is a modal bottom sheet sized to its content (`BottomSheet` and the
components built on it).

- **Titled when it chooses or asks**: a choice ("Kartlag", "Sorter",
  "Filtrer prosjekter"), a
  question ("Logg ut?", "Slette kommentaren?") or a form
  ("Kontoinnstillinger"). The title is an `h2` under the grip, left-aligned
  (`sheetTitle`: `text-heading`, full ink), passed as `BottomSheet`'s
  `title`. Its capitals stand as far below the top edge as they are in from
  the side (`sheetTitleGap` from the grip).
- **Untitled when it's a menu of actions** from a control that names it
  (a project's ⋯, the account avatar, a comment's ⋯).
- **Grip** (`SheetGrip`): 36×4px, `ink/15`, darkening under a pointer. No
  close button on phones: it closes by a swipe down, a tap on the scrim,
  Escape, or choosing a row.
- **Scrim**: `scrim/25`, fading in; the page behind is pushed back.
- **Rows** (`ActionSheet`): 48px tall (`min-h-12`), `text-body`, a 20px
  muted icon on the left, 12px gap. Destructive rows are in `danger`, icon
  too. A group divides from the one above with a hairline. Guests see
  locked rows muted, with a login icon at the end.
- Opens with a slide from the bottom (`animate-sheet-in`, 320ms,
  `ease-out-soft`); closes sliding back down before its action runs, so
  focus is back on the trigger.
- Scrolls only if its content is taller than the screen allows; a swipe in
  the scroller waits until it's at its top.

### Desktop menus

Base UI `Menu` with `DropdownPopup` (`dropdown.tsx`) and the shared
classes in `ui.ts`; never a hand-built `role="menu"`.

Every desktop dropdown, menus, `ChoiceSelect` and `FilterPopover` alike,
behaves one way:

- **At once**: it opens and closes as the mouse goes down, with no motion.
- **It takes the pointer**: while it's open, a clear layer covers
  everything but the dropdown and its trigger. Nothing behind it hovers,
  and a press there only closes it. Menus get the layer from
  `DropdownPopup`, hand-built dropdowns in the top layer from
  `useDropdownShield`.
- **The trigger stays in reach**: it still hovers, and pressing it again
  closes what it opened.

`expectDropdown` in `tests/support.ts` checks all of this; a new dropdown
gets a spec calling it.

- **Popup** (`menuPopup`): `rounded-xl border bg-surface p-1.5 text-ui
  shadow-popover`. 208px wide at least; `min-w-60` for menus with long rows
  or switches.
- **Rows** (`menuItem`, `menuItemDanger`): 36px (44px on a coarse
  pointer), `rounded-lg px-2.5 py-1.5`, 10px gap, a 16px muted icon.
  Highlight is `bg-surface-muted`, the same for hover and keyboard.
  Rows take the pointer cursor, like buttons. A row that destroys or leaves
  (Slett prosjekt, Logg ut) is `menuItemDanger`; a row that opens a page may
  end its label in a chevron (Din profil).
- **Separators** (`menuSeparator`): a hairline out to the popup's edges.
- **Counts** (`countBadge`) at a row's end.
- A menu may name itself in a first row (`text-body font-semibold`), smaller
  than a phone drawer's title.
- Menus open on press (`data-press` or Base UI's own), close on choosing,
  Escape, a press outside or a second press on the trigger.

### Dialogs

- Desktop only for confirmations; phones ask in a titled drawer instead
  (see the overlay table).
- `Dialog`: centred card, 480px by default (360–400px for confirmations),
  `rounded-dialog` (18px), `shadow-dialog`, `animate-dialog-enter` (180ms). Scrim
  `scrim/33` with a 4px blur.
- Inside: 20px padding, a `text-title` heading, a `text-ui` muted line
  under it, then the buttons.
- Buttons are right-aligned, cancel first: `secondaryButton` "Avbryt", then
  `primaryButton` or `dangerButton`. On small screens they stack, the action
  on top.
- A press that starts and ends on the backdrop closes it; Escape closes it
  unless it's busy.

### Toasts and tooltips

- **Toasts** use the inverse colours, `rounded-2xl`, `shadow-float`,
  `text-ui font-medium`. One action at most (usually "Angre"), plus close.
  They stack with the newest in front and fan out on hover. Bottom centre on
  desktop, top on phones; swipe away.
- **Tooltips** (`data-tooltip`, `TooltipLayer`) name icon-only controls and
  explain compact stats. Inverse colours, `rounded-md`, `text-xs` medium,
  `animate-tooltip-in` (90ms). Desktop only. Anything a phone can't hover
  says what it is in words instead.

## Typography

IBM Plex Sans throughout (`font-sans`), Geist Mono for code and coordinates.
`antialiased`. Numbers that line up or change in place are `tabular-nums`.

### Roles

Headings use a role class that sets size, leading, tracking and weight at
once. Never build a heading from `text-* font-semibold`.

| Role            | Size / leading | Tracking | Weight | For                                    |
| --------------- | -------------- | -------- | ------ | -------------------------------------- |
| `text-display`  | 26px / 1.16    | −0.02em  | 600    | A page's or panel's title: a project, Lagret, Forslag, Kontoinnstillinger (`panelTitle`; 24px on phones) |
| `text-title`    | 20px / 1.3     | −0.015em | 600    | A dialog's title, a profile's name     |
| `text-heading`  | 18px / 1.35    | −0.01em  | 600    | A section or entry inside a page; a drawer's title |
| `text-item`     | 16px / 1.35    | −0.005em | 600    | A row's or card's title; a compact bar's question; an entry's title on phones |

A desktop menu or popover may name itself in a first line set
`text-body font-semibold`: a label, not a heading.

Titles that can wrap use `wrapTitle` with `text-balance` or `text-pretty`,
and a line clamp where room is fixed.

### Text sizes

| Class       | Size | For                                                       |
| ----------- | ---- | --------------------------------------------------------- |
| `text-base` | 16px | Form fields on phones                                     |
| `text-body` | 15px | Reading text in a page; drawer rows; empty-state titles   |
| `text-sm`   | 14px | Buttons; tabs; card excerpts; composer text               |
| `text-ui`   | 13px | Desktop controls, menus, filters, counts, dialog body     |
| `text-xs`   | 12px | Metadata (place, time, author), tooltips, secondary lines |
| `text-2xs`  | 11px | Count badges, labels on photos                            |

No arbitrary sizes (`text-[14px]`) except the map's attribution and
markers.

### Weight and colour

- **400** for everything that isn't a heading or a control.
- **500** (`font-medium`) for controls, tab labels, and anything chosen,
  set or key (a selected option, a set filter, a pressed view).
- **600** only through the heading roles, and for count badges.
- Colour carries hierarchy: titles `ink`, reading text `ink-soft`, metadata
  and placeholders `muted`. The accent is for links, unread marks and the
  primary action, not for emphasis in text.

## Colour

All colours are tokens and all have dark values; never use raw hex or
Tailwind's palette (`text-white` only on photos, over `scrim`).

| Token                      | Use                                            |
| -------------------------- | ---------------------------------------------- |
| `canvas`                   | Page behind everything; browser chrome         |
| `surface`                  | Panels, sheets, cards, menus, dialogs          |
| `surface-subtle`           | Quiet inset boxes; trigger hover               |
| `surface-muted`            | Row and menu hover/press wash; disabled fields |
| `ink` / `ink-soft` / `muted` | Titles / reading text / metadata             |
| `accent` / `-strong` / `-soft` | Primary action, links, unread; its hover; its tint |
| `danger` / `-strong` / `-soft` | Destructive actions; their hover; their tint |
| `warning`                  | Caution text                                   |
| `border` / `border-strong` | Hairlines and dividers / outlined controls and fields |
| `focus`                    | Keyboard focus ring                            |
| `inverse` / `on-inverse`   | Tooltips and toasts                            |
| `scrim`                    | Behind modals, over photos (never lightens)    |
| `status-*` / `status-*-ink` | Project status: fills and dots / text      |
| `avatar-*`                 | Avatar backgrounds and initials                |
| `diff-*`                   | Suggestion diffs                               |

Status colours are mirrored in `statuses` (`lib/data.ts`) for Leaflet;
change both together. Use `statusTone` for status dots, fills and badges.

Dark mode: canvas and surface are pure black; borders do the lifting that
shadows do in light mode. Every new colour needs a dark value in the
`@variant dark` block.

## Sizing and spacing

### Hit targets

- **44px** minimum for any control on its own (`min-h-11`, `size-11`).
- **48px** for rows in phone drawers (`min-h-12`).
- **36px** for desktop menu rows and pills (`min-h-9`, `h-9`), rising to
  44px on a coarse pointer (`pointer-coarse:min-h-11`).
- Smaller visible controls (32px composer buttons, 28px chips) get a reach
  (`after:` inset) or a `pointer-coarse:` size so the target is still 44px.

### Controls

| Class                 | Look                                                    |
| --------------------- | ------------------------------------------------------- |
| `primaryButton`       | Filled accent, 44px, `rounded-xl`, `text-sm` medium. One per view. |
| `secondaryButton`     | Outlined `border-strong`, transparent                   |
| `dangerButton`        | Filled danger: the confirming step of a destructive action |
| `dangerOutlineButton` | Outlined danger: the first step, which asks before it acts |
| `textButton`          | Accent text, underlines on hover                        |
| `textLink`            | Inline link in text: faint underline that darkens       |
| `pillButton`          | Outlined pill, 36px, `text-ui`: a project's actions, beside filter pills |
| `iconButton`          | 44px, borderless, muted icon                            |
| `mapIconButton`       | 44px square over the map: bordered, `shadow-control`    |
| `fieldControl`        | Text input: 44px, `rounded-xl`, `border-strong`         |
| `composer`            | The round comment box; its border carries focus         |

### Icons

Lucide, default stroke, on an even scale:

| Size | For                                                    |
| ---- | ------------------------------------------------------ |
| 12   | Inside small chips and status marks                    |
| 14   | Inline in metadata (place, stats), small text buttons  |
| 16   | Desktop menu rows, pills, buttons, tabs                |
| 18   | Desktop icon buttons, checks in drawers, field adornments |
| 20   | Phone icon buttons, drawer rows, header controls       |
| 24   | Empty states, illustrations                            |

A glyph inside a mark smaller than 16px (a checkbox's tick, a badge's
icon) is sized to fit its mark instead.

Icons in rows are `muted` and `shrink-0`; an icon takes the row's colour
only when the row is destructive (`danger`).

### Radii

| Radius                 | For                                        |
| ---------------------- | ------------------------------------------ |
| `rounded-sm` 4px       | Tiny marks: checkboxes, map labels         |
| `rounded-md` 6px       | Map controls, segments, tooltips, map hints |
| `rounded-lg` 8px       | Rows, menu items, header and toolbar buttons |
| `rounded-xl` 12px      | Buttons, fields and choice triggers, icon buttons, menus, photos, cards' hover wash |
| `rounded-2xl` 16px     | Toasts                                     |
| `rounded-dialog` 18px  | Dialogs, and the cards standing in for them on desktop |
| `rounded-sheet` 22px   | Every sheet and drawer from a phone's bottom edge |
| `rounded-panel` 24px   | Floating panels                            |
| `rounded-full`         | Pills, chips, avatars, dots, badges, the composer's send |

### Elevation

Shadows share the ink-green shadow colour; pick by role, not by look:
`control` (map buttons), `overlay`, `popover` (menus), `float` (toasts,
floating bars), `bar` (bottom sheets, cast upward), `card`, `panel`,
`dialog`.

## States

### Hover (fine pointer only)

`hover:` already means "hover with a mouse or trackpad" (see the custom
variant); never use `@media (hover)` by hand.

- **Menu items, outlined buttons**: wash to `bg-surface-muted`.
- **Borderless buttons** (icon buttons, the place, the sort, the search and
  filter buttons): wash to `bg-ink/[0.05]` (translucent, so it works on any
  surface), text or icon from `muted` to `ink`. The place and sort tint at
  once.
- **Text controls** (tabs, stats): `muted` → `ink`, no wash.
- **Links**: underline darkens (`textLink`) or appears (`textButton`).
- **Filled buttons**: to their `-strong` colour.
- **Destructive outlined**: to `danger-soft` with a firmer border.
- **List rows and cards** (projects, Nytt, suggestions, a profile's
  comments): the borderless buttons' `ink/[0.05]` wash, `surface-muted/65`
  in dark mode, bleeding 12px past the text (8px on phones), so the text
  edge never moves. A touch shows the same wash while pressed
  (`pointer-coarse:active:`).
- A control filled with `surface-muted` deepens to `ink/[0.08]`.
- Hover and keyboard highlight look the same.

### Press

- **Buttons with a fill or border**: move down 1px (`active:translate-y-px`).
- **Icon buttons**: scale to 0.97 (never further) (`active:scale-[0.97]`), on a fine pointer
  only in panel headers.
- **Touch rows and controls**: wash to `bg-surface-muted` on `active:`;
  that's what a touch gets instead of hover. Turn off the browser's tap
  highlight where a custom one shows.
- **A control that opens a menu** has no press effect: the menu opening is
  the response, and its open state (`aria-expanded`/`data-popup-open`:
  `bg-ink/[0.05]`, icon in `ink`) stays while it's open.
- **`data-press`**: easily undone actions (opening a menu, a project, a
  panel) act on mouse-down. Touch, keyboard and modified clicks keep the
  click.

### Selected, pressed, set

- **Single choice** (sort, layer): a radio at the row's end, ring always
  shown, filled when chosen; the chosen row in `font-medium`.
- **Multiple choice** (category, status): a check at the row's end, shown
  only when chosen; chosen rows in `font-medium`.
- **The category filter** (`CategoryFilter`): a chosen main becomes a
  card outlined in `border`, holding its subcategories as bare chips that
  wash `surface-muted` under the pointer. A chosen chip fills with
  `inverse`, a check before its label; the whole main reads as such a chip
  the card's width, a check at its end where an unchosen main has a
  chevron. An unchosen main hovers as a menu row does, and rounds into a
  pill as it opens. Narrowed to some chips, the main row is plain.
- **On/off settings** (dark mode, moderator mode, map overlays, hiding
  projects): a switch (`SwitchTrack`) at the row's end, in menus and
  drawers alike. Never a check.
- **A state an action toggles** (saving): the icon fills and the label
  says what pressing does next ("Lagre", "Fjern fra lagrede"); no mark.
- **Segmented control** (list view): pressed segment raised to
  `bg-surface` with `shadow-xs`, label in `ink`.
- **Tabs**: `text-sm font-medium muted`; the current one in `ink` with a
  2px `ink` underline on the tab bar's hairline.
- **Icon toggles** (save, vote up): the icon in `accent` when pressed;
  vote down in `danger`.
- **A set filter**: its pill gets a firmer border and medium weight.
- **Unread**: a 6px accent dot, with a count in accent ("• 2 nye").

### Focus

- Keyboard only. One indicator everywhere: a 2px `focus` outline, offset
  2px. After a pointer press (`data-pointer` on the root) it never shows.
- Rows and other full-width items draw it inside (`-outline-offset-2`).
- Fields show focus with their own border and ring
  (`border-accent/55 ring-3 ring-accent/12`); the composer with its border.
- Moving focus with a script (opening a drawer) goes to the first action
  from the keyboard, to the container from a tap.

### Disabled and locked

- Disabled: `opacity-45`, no pointer events, everywhere. `aria-disabled`: the
  not-allowed cursor.
- Locked for guests: the control still shows, muted; using it asks them to
  log in (`LoginPrompt`) rather than doing nothing.

## Motion

| What                          | Duration | Easing              |
| ----------------------------- | -------- | ------------------- |
| Colour, border, wash changes  | 150ms    | default             |
| Menu enter                    | 140ms    | ease-out            |
| Tooltip enter                 | 90ms     | ease-out            |
| Dialog enter, content fade    | 180ms    | ease-out            |
| Narrow/wide fold              | 220ms    | `ease-out-soft`     |
| Choice group opening          | 250ms    | `ease-out-soft`     |
| Panel slide, drawer enter     | 320ms    | `ease-out-soft`     |
| Sheet between heights         | 450ms    | Base UI's drawer    |
| Page push back / return       | 500 / 520ms | `--push-ease` / `ease-out-soft` |
| Theme cross-fade              | 360ms    | `ease-out-soft`     |

- Hover tints change at once where a wash would lag behind the pointer
  (menu rows, sort); only colour eases.
- Reduced motion: no slides, scales or translations; opacity fades only.
  Every transition has `motion-reduce:transition-none` or a reduced-motion
  branch.
- Don't scale pages of text; it shimmers. Fade them.

## Components

- **Count row**: the list's count ("N synlige prosjekter · P i sted"), the
  reset link and the sort at its end (`sortChoice`: muted, borderless,
  chevron on the content edge). The same row heads comments and Lagret.
- **List rows** (compact): `text-item` title, a `text-xs muted` meta line
  with place and status dot, stats at the end. **Cards** (expanded) add a
  two-line `text-sm ink-soft` excerpt and photos.
- **Empty states** (`EmptyState`): centred, a `text-body font-medium`
  title, a `text-ui muted` line, then text-link actions.
- **Badges**: count badges are 18px accent pills, `text-2xs` semibold,
  "99+" past 99. Status badges use `statusTone.badge`.
- **Avatars**: initials on an `avatar-*` tone, `rounded-full`.

## Writing

- Bokmål, sentence case. Buttons are verbs ("Lagre", "Logg ut", "Opprett
  prosjekt").
- A confirmation's title is the question ("Slette kommentaren?"); its
  confirming button repeats the verb ("Slett"), never "OK" or "Ja".
- Say what will happen, briefly, under the question ("Svarene blir
  stående.").
- Every icon-only control has an `aria-label`, and on desktop the same text
  as its tooltip.
