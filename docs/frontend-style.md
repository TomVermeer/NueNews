## Frontend style (Material Design 3)

NueNews follows [Material Design 3](https://m3.material.io) wherever it fits. Dark mode only, spacious card style.

If a rule here conflicts with a product rule in `CLAUDE.md` (headline and handoff, attribution, link behavior), the `CLAUDE.md` rule wins.

### Color

- Use the design tokens in `apps/web/src/style.css` and never hard-coded colors. They map to the Material color roles:

  | Token       | Material role        |
  | ----------- | -------------------- |
  | `canvas`    | `surface`            |
  | `card`      | `surface-container`  |
  | `line`      | `outline-variant`    |
  | `ink`       | `on-surface`         |
  | `ink-muted` | `on-surface-variant` |
  | `accent`    | `primary`            |

- Need a new role (e.g. `surface-container-high`, `outline`, `primary-container`)? Add a token to `style.css` and name it after the role. Don't use one-off hex values or arbitrary opacity in components.
- Accent color is for the one thing that matters in a view: primary actions, selection, focus, links on hover. Don't decorate with it.
- Contrast: 4.5:1 for text, 3:1 for icons, borders of controls and focus indicators. Muted text (`ink-muted`) still has to meet 4.5:1.
- Never use color as the only signal. Pair it with an icon, text or shape (e.g. errors show an icon and a message).

### Elevation and surfaces

- In dark mode, elevation is expressed by lighter tonal surfaces, not shadows. Stack `canvas` → `card` → a higher container.
- Cards use a 1px `line` border and no shadow. Avoid drop shadows except for floating layers (menus, dialogs, the add panel).
- Keep surfaces flat inside a card: group with spacing and dividers, not nested boxes.

### Typography

Use the Material type scale. Map roles to Tailwind classes and don't invent sizes.

| Role         | Size / line height | Weight | Tailwind                  | Use                               |
| ------------ | ------------------ | ------ | ------------------------- | --------------------------------- |
| Title large  | 22 / 28            | 400    | `text-[22px]/7`           | Page and dashboard titles         |
| Title medium | 16 / 24            | 500    | `text-base/6 font-medium` | Section headings, channel headers |
| Title small  | 14 / 20            | 500    | `text-sm/5 font-medium`   | Widget titles, list item titles   |
| Body large   | 16 / 24            | 400    | `text-base/6`             | Reading text                      |
| Body medium  | 14 / 20            | 400    | `text-sm/5`               | Default body text, excerpts       |
| Body small   | 12 / 16            | 400    | `text-xs/4`               | Metadata, captions, timestamps    |
| Label large  | 14 / 20            | 500    | `text-sm/5 font-medium`   | Buttons                           |
| Label medium | 12 / 16            | 500    | `text-xs/4 font-medium`   | Chips, small buttons, counts      |

- Use at most two weights (400 and 500). No bold body text.
- Sentence case everywhere. No all-caps headings.
- Truncate with an ellipsis (`truncate`, `line-clamp-N`), never clip mid-letter.

### Layout and spacing

- Spacing follows a 4px base unit; prefer 4, 8, 12, 16, 24, 32. Use Tailwind's `1, 2, 3, 4, 6, 8` steps.
- Card padding is 16px. Gap between cards is 16px on compact screens and 24px from 840px up.
- Window size classes: compact < 600px, medium 600-839px, expanded ≥ 840px. Margins are 16px on compact and 24px above. The layout has to work on a phone width.
- Align to the grid. If two things nearly line up, make them line up.

### Shape

- Corner radius scale: extra small 4px, small 8px, medium 12px, large 16px, extra large 28px.
- Cards and containers: medium (12px, `rounded-xl`). Buttons and inputs: small (8px, `rounded-lg`) or full for chips and icon buttons. Thumbnails and images: small to medium (8-12px). Dialogs and sheets: extra large.

### Components

- Buttons: use the five Material types: filled (`btn-primary`, one per view), tonal, outlined (`btn`), text (`btn-ghost`) and icon buttons. A view has at most one filled button.
- Dividers: 1px `line`. A divider separating a header from content spans the full width of the container (full-bleed) and is not inset; dividers between list items inside content are inset with the content.
- Lists: a leading icon or avatar, a title (title small), supporting text (body small) and an optional trailing element. Minimum row height 48px (single line) or 56px (with leading element).
- Chips: 32px high, label medium, 8px corner radius. Use for filters and tags, not for decoration.
- Icons: Lucide, 16px inline and 20px or 24px for standalone buttons. Decorative icons get `aria-hidden="true"`; icon-only buttons get an `aria-label`.
- Empty and error states: an icon, a short message and, where it helps, one action. No blank space.

### Interaction and state

- Touch targets are at least 48 × 48px. A visually smaller control (e.g. a 28px icon button) must have a hit area padded out to 48px.
- State layers: draw hover, focus, pressed and dragged states as an overlay of the content color on the surface at 8%, 10%, 10% and 16% opacity. Don't change the control's own color.
- Focus: every interactive element shows a visible 2px `accent` focus ring (`focus-visible`). Never remove an outline without replacing it.
- Disabled: content at 38% opacity, container at 12%. Disabled controls are not clickable and not focusable.
- Support keyboard use for everything that supports a pointer, including the layout editor.

### Motion

- Use Material easing: standard `cubic-bezier(0.2, 0, 0, 1)`; decelerate for elements entering, accelerate for elements leaving.
- Durations: 100-200ms for small changes (hover, press), 250-400ms for larger ones (panels, cards moving). Nothing over 500ms.
- Motion has a purpose: show where something came from or went. No decorative animation.
- Respect `prefers-reduced-motion`: fade or switch instantly instead of sliding or scaling.

### Content and accessibility

- Write short labels in sentence case. Say what the control does ("Add widget"), not what it is ("Button").
- Images that carry no information use `alt=""`. Thumbnails are decorative because the title next to them says the same thing.
- Use semantic HTML (`section`, `h2`/`h3` in order, `ul`/`li`, `button`, `a`) before reaching for ARIA.
- Don't rely on hover to reveal essential actions; they must also be reachable by keyboard and touch.
