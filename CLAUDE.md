# Mandanten Portal — Claude Code Rules

## Tech Stack

- **Backend:** JavaScript + Node.js/Express, MongoDB (Mongoose) — `server/`
- **AI Service:** FastAPI + Gemini (separate repo)
- **MongoDB:** Always use `_id` (not `id`) for document lookups
- **Environment variables:** Use `VITE_` prefix for frontend env vars in MandantenPortalDesign

## Two Codebases — CRITICAL

| | Old App (CRA) | New Design (Vite) |
|---|---|---|
| **Path** | `/src/` | `/MandantenPortalDesign/src/` |
| **Stack** | React 18 + CRA + Tailwind v3 | React 18 + Vite 6 + Tailwind v4 |
| **Status** | Legacy — being phased out | **Active development** |
| **Start** | `npm start` (Port 4000) | `cd MandantenPortalDesign && npm run dev` (Port 5173) |

**DEFAULT: Always work in `MandantenPortalDesign/src/`** unless explicitly told otherwise.

- `src/` — Legacy client portal (CRA). Do NOT add new features here.
- `src/admin/` — Legacy admin pages embedded in old app. Being replaced.
- `src/agent/` — Legacy agent portal. Being migrated to admin portal.
- `MandantenPortalDesign/src/` — **Active frontend.** All new UI work goes here.
- `server/` — Express backend (JavaScript, shared by both frontends)

**Backend:** `cd server && npm run dev` (Port 10000)
**Vite Proxy:** `/api/*` → `http://localhost:10000`

## Design System — Mandatory Reading

Before ANY frontend work, read: `MandantenPortalDesign/guidelines/Guidelines.md`

**Core aesthetic:** Clean Enterprise SaaS with Editorial Precision.
Generous whitespace, off-white backgrounds, subtle borders, one strong orange accent, sharp typographic hierarchy.

### Rules to never break
- No `#FFFFFF` page backgrounds — always `#FAFAFA` (`--background`)
- No gradients (exception: GradientAvatar component)
- No drop shadows / elevation — depth via spacing and borders only
- No zebra-striping in tables/lists
- Max 1 orange CTA per section
- Flow badges: always outlined + tinted, never solid filled
- Font: **DM Sans** only (mono data: JetBrains Mono). Never Inter, Roboto, Arial
- No absolute positioning (except modals/tooltips)
- No one-off colors outside the token system
- Use `cn()` from `ui/utils.ts` for className merging

### Color tokens
```
--background: #FAFAFA    --surface: #FFFFFF       --muted: #F3F4F6
--text-primary: #111827  --text-secondary: #6B7280
--border: #E5E7EB        --border-strong: #D1D5DB
--accent: #FF5001        --accent-hover: #E04500
--success: #22C55E       --warning: #F59E0B       --info: #3B82F6
--purple: #8B5CF6        --destructive: #EF4444
```

### Typography
- Body: DM Sans, 14px base, regular (400)
- Headings: semibold–bold (600–700)
- Mono/metadata: JetBrains Mono (Aktenzeichen, dates, IDs)
- Section labels: 11px, uppercase, letter-spacing: 0.08em

### Spacing & Radius
- Base unit: 4px
- Card padding: 20px 24px, radius: 12px
- Buttons/Inputs: radius 8px
- Badges: radius 9999px (pill)
- Section spacing: 32–48px
- Transitions: max 100–150ms, functional only

## Workflow Rules

### Never jump to code without understanding context first
Before ANY implementation or planning task:
1. Read relevant existing code, designs, and documents (PROJECT.md, CONTEXT.md, design specs)
2. Understand the current state of the codebase for the area you're touching
3. If a planning/design document was mentioned or exists for this task, read it FIRST

### Confirm targets before editing
Before making UI or multi-file edits:
1. Identify ALL candidate files that could be the target
2. State which file you will edit and WHY it's the correct one — especially distinguish between `/src/` (old) and `/MandantenPortalDesign/src/` (new)
3. If there's any ambiguity, ask before editing

### Plan before implement
When asked to create a plan, design spec, or feature:
1. Produce the planning document FIRST — no implementation until it's reviewed
2. Do not start coding until the plan is explicitly approved

## Debugging Rules

### Trace before fixing
When debugging, do NOT apply speculative fixes. Instead:
1. Trace the full data flow: database query → backend route → API response → frontend state → render
2. Identify the exact point where behavior diverges from expected
3. Propose a fix targeting the actual root cause

### Two-strike rule
If a fix doesn't work after 2 attempts:
- STOP applying patches
- Re-read the full code path from scratch
- Consider whether you're targeting the wrong file/component/layer entirely
- Explain your updated understanding before trying again

## Pre-Change Checklist (Frontend)

- [ ] Am I working in `MandantenPortalDesign/src/`? (NOT in `/src/`)
- [ ] Am I using defined color tokens? (No one-off colors)
- [ ] Font is DM Sans? (Mono data in JetBrains Mono)
- [ ] Background is `#FAFAFA`, not `#FFFFFF`?
- [ ] No shadow, no gradient (except Avatar)?
- [ ] Max 1 orange CTA per section?
- [ ] Badges are outlined + tinted, not solid?
- [ ] Border-radius correct? (Cards 12px, Buttons 8px, Badges pill)
- [ ] Transitions ≤ 150ms, functional?
- [ ] Touch targets ≥ 44px?
