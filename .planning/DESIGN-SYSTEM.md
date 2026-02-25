# Design System — rasolv.ai

**Clean Enterprise SaaS × Editorial Precision**

---

## Core Aesthetic

Generous whitespace, off-white backgrounds, subtle borders, one strong orange accent, sharp typographic hierarchy. The UI is confident and functional — never decorative for its own sake. Structure through spacing, borders, and type weight — not gradients, shadows, or color fills.

**Keywords**: Authoritative, Minimal, Functional, Precise, Trustworthy

---

## Color Tokens

### Backgrounds

| Token            | Value     | Usage                               |
| ---------------- | --------- | ----------------------------------- |
| `--background`   | `#FAFAFA` | Page background — off-white, never pure white |
| `--surface`      | `#FFFFFF` | Card / panel background             |
| `--muted`        | `#F3F4F6` | Subtle hover backgrounds            |

### Text

| Token              | Value     | Usage                        |
| ------------------ | --------- | ---------------------------- |
| `--text-primary`   | `#111827` | Main text — near black       |
| `--text-secondary` | `#6B7280` | Secondary labels, metadata   |

### Borders

| Token            | Value     | Usage                        |
| ---------------- | --------- | ---------------------------- |
| `--border`       | `#E5E7EB` | Default border — subtle gray |
| `--border-strong`| `#D1D5DB` | Stronger borders for emphasis|

### Accent

| Token            | Value     | Usage                         |
| ---------------- | --------- | ----------------------------- |
| `--accent`       | `#FF5001` | Orange — primary CTA only     |
| `--accent-hover` | `#E04500` | Orange hover state            |

### Semantic / Flow Colors

| Token           | Value     | Usage                              |
| --------------- | --------- | ---------------------------------- |
| `--success`     | `#22C55E` | Active / Insolvenzantrag           |
| `--warning`     | `#F59E0B` | Pending / 1. Anschreiben           |
| `--info`        | `#3B82F6` | In Review / Portal zugesendet      |
| `--purple`      | `#8B5CF6` | 2. Anschreiben                     |
| `--destructive` | `#EF4444` | Blocked / Error                    |

### Color Rules

- `--accent` (orange) is reserved for primary CTAs only — **one per section maximum**
- Never use pure `#FFFFFF` for page backgrounds — always `--background: #FAFAFA`
- No gradients. No shadow-based depth. Depth through spacing and border weight only.
- No one-off colors outside the token system.

---

## Typography

### Fonts

| Role               | Family           | Usage                        |
| ------------------ | ---------------- | ---------------------------- |
| Primary            | **DM Sans**      | All UI text                  |
| Mono / Metadata    | **JetBrains Mono** | Dates, IDs, case numbers   |

> Never use Inter, Roboto, or Arial.

### Weights

| Role             | Weight  |
| ---------------- | ------- |
| Headings         | 600–700 (semibold to bold) |
| Body             | 400 (regular) |
| Secondary labels | 400, `--text-secondary` |
| Section labels   | 400, 11px, uppercase, `letter-spacing: 0.08em` |

### Type Scale

| Token  | Size  | Usage                     |
| ------ | ----- | ------------------------- |
| `xs`   | 12px  | Fine print, metadata, IDs |
| `sm`   | 14px  | Default body, labels      |
| `base` | 16px  | Body (comfortable reading)|
| `lg`   | 18px  | Lead paragraphs           |
| `xl`   | 20px  | Card titles               |
| `2xl`  | 24px  | Section intros            |
| `3xl`  | 32px  | Subheadings               |
| `4xl`  | 40px  | Page H1s                  |

**Base font-size**: 14px

---

## Spacing

| Element                    | Value       |
| -------------------------- | ----------- |
| Base unit                  | 4px         |
| Component inner padding    | 16px–24px   |
| Card inner padding         | 20px 24px   |
| Row gap                    | 0 (use divider lines) |
| Section vertical whitespace| 32px–48px   |

---

## Border Radius

| Element         | Radius     |
| --------------- | ---------- |
| Cards & panels  | 12px       |
| Badges / chips  | 9999px (pill) |
| Buttons         | 8px        |
| Inputs          | 8px        |
| Avatars         | 9999px (circle) |
| Toasts          | 10px       |

---

## Borders & Dividers

| Style     | Value                                | Usage                     |
| --------- | ------------------------------------ | ------------------------- |
| Default   | `1px solid var(--border)`            | Row dividers, input borders |
| Medium    | `1px solid var(--border-strong)`     | Card outlines             |
| Focus     | `2px solid var(--accent)`            | Interactive focus state   |

No shadows. No elevation. Structure through borders and whitespace only.

---

## Motion & Interactions

| Interaction   | Behavior                           |
| ------------- | ---------------------------------- |
| Transitions   | 100–150ms max. Functional only.    |
| Row hover     | `background → --muted`             |
| Button hover  | Color darkens or fills             |
| Focus         | Border thickens or shifts to `--accent` |

No bounce, no parallax, no floating elements.

---

## Components

### Buttons

#### Primary (CTA)

- Background: `--accent`, Text: white, semibold
- Border-radius: 8px, Padding: 8px 16px
- Hover: `--accent-hover`
- Focus: `outline: 2px solid var(--accent); outline-offset: 2px`
- **Max one per section** — e.g. `+ Add user`, `+ Publish`

#### Secondary (Outlined)

- Transparent background, Border: `1px solid var(--border)`, Text: `--text-primary`
- Hover: border → `--border-strong`, background → `--muted`
- e.g. `Filters`, `Test run`

#### Ghost / Tertiary

- No border, no background, Text: `--text-secondary`
- Hover: text → `--text-primary`
- e.g. inline actions, overflow menu triggers

---

### Badges — Flow Chips

Pill-shaped. Outlined with tinted background (8–10% opacity). **Never solid filled.**

| Flow State          | Color Token       |
| ------------------- | ----------------- |
| Portal zugesendet   | `--info` (blue)   |
| 1. Anschreiben      | `--warning` (amber)|
| 2. Anschreiben      | `--purple`        |
| Insolvenzantrag     | `--success` (green)|

- Font-size: 12px, semibold, Padding: 2px 10px
- Multiple badges per row: gap 6px

---

### Status Indicators

Filled pill badges for case state.

| Status     | Color             |
| ---------- | ----------------- |
| Active     | `--success`       |
| In Review  | `--info`          |
| Pending    | `--warning`       |
| Blocked    | `--destructive`   |
| Closed     | `--text-secondary` |

---

### Cards / List Rows

- Background: `--surface`, Border: `1px solid var(--border)`, Radius: 12px
- Padding: 16px 20px
- Row dividers: `border-bottom: 1px solid var(--border)` — no zebra striping
- Hover: background → `--muted`
- Avatar: circular, 36–40px

---

### Sidebar / Navigation

- Background: `--surface`, Width: 220px
- Active item: background `--muted`, text `--text-primary`, semibold
- Inactive: text `--text-secondary`, regular
- Section labels: 11px, uppercase, `letter-spacing: 0.08em`
- Logo + "Enterprise edition" stacked top, user avatar + name bottom

---

### Tables / User Lists

- Column headers: 12px, `--text-secondary`, normal case
- Sort: small arrow inline with active column
- Checkbox: leftmost, 16px
- Overflow `...`: rightmost, visible on hover only
- Pagination: centered, active page filled dark circle

---

### Inputs / Search

- Border: `1px solid var(--border)`, Radius: 8px, Padding: 8px 12px
- Background: `--surface`
- Search: magnifier icon left-inset
- Focus: `border-color → --accent`, no outline ring
- Placeholder: `--text-secondary`

---

### Toast Notifications

- Position: fixed bottom-right
- Background: `#111827`, Text: white
- Icon: colored circle (green check for success)
- Inline actions: white text links ("Undo" / "View profile")
- Dismiss: X top-right, Radius: 10px, Max-width: 320px

---

## Accessibility

| Requirement      | Spec                                          |
| ---------------- | --------------------------------------------- |
| Touch target     | Minimum 44x44px                               |
| Focus indicator  | `focus-visible` on all interactive elements   |
| Button focus     | `outline: 2px solid var(--accent); outline-offset: 2px` |
| Input focus      | `border-color → --accent`                     |
| Contrast         | WCAG AA minimum (4.5:1)                       |
| Color dependency | Never rely on color alone — pair with icon or label |

---

## Rules to Never Break

1. No pure white `#FFFFFF` for page backgrounds — use `--background: #FAFAFA`
2. No gradients anywhere
3. No drop shadows — depth via spacing and borders only
4. No zebra-striping on tables or lists
5. No more than 1 primary (orange) CTA per section
6. No filled badges for Flow Chips — always outlined + tinted
7. No Inter, Roboto, or Arial — use DM Sans
8. No absolute positioning unless strictly unavoidable
9. No one-off colors outside the token system
10. No decorative elements that don't serve a functional purpose

---

## Implementation Notes

### Tech Stack Context

- **Frontend**: React 18 + TypeScript, React Router 6
- **Backend**: Node.js / Express (JavaScript)
- Use CSS custom properties for all design tokens
- Prefer flexbox and grid — avoid absolute positioning
- Mobile-first responsive approach
- Centralize tokens — minimize duplication and one-off styles

### General Principles

- Keep components modular — helpers and utilities in their own files
- All UI must be responsive
- Prioritize reusability and composability
- Structure through spacing, borders, and type weight — never through decoration
