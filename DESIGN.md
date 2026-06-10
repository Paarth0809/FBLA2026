---
name: Apex Green
colors:
  surface: '#f4fbf4'
  surface-dim: '#d4dcd5'
  surface-bright: '#f4fbf4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef6ee'
  surface-container: '#e8f0e9'
  surface-container-high: '#e3eae3'
  surface-container-highest: '#dde4dd'
  on-surface: '#161d19'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#2b322d'
  inverse-on-surface: '#ebf3eb'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#a43a3a'
  on-tertiary: '#ffffff'
  tertiary-container: '#fc7c78'
  on-tertiary-container: '#711419'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3af'
  on-tertiary-fixed: '#410005'
  on-tertiary-fixed-variant: '#842225'
  background: '#f4fbf4'
  on-background: '#161d19'
  surface-variant: '#dde4dd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style
The design system is engineered for a high-stakes competition environment, blending the reliability of an enterprise SaaS platform with the vibrant energy of a modern educational institution. The aesthetic is rooted in **Modern Minimalism** with a focus on high-clarity information density.

The UI should evoke a sense of professional organization and immediate relief. By utilizing expansive whitespace, crisp borders, and a refined "SaaS" polish, the system transforms a chaotic lost-and-found process into a streamlined dashboard experience. The goal is to feel "institutional yet innovative"—trustworthy enough for school administration but sleek enough for tech-savvy students.

## Colors
The palette is anchored by "Green Level High" Emerald, a vibrant green used strategically for primary actions and brand presence. The primary text color is a deep Slate charcoal to ensure high legibility and a premium feel.

- **Primary:** Use for main buttons, active states, and brand accents.
- **Surface:** Pure white is reserved for high-priority cards and containers.
- **Background:** The main app background uses a soft `neutral_gray` (#F8FAFC) to provide a gentle contrast against white card elements.
- **Status Colors:** Standardized semantic colors for status badges (e.g., "Found", "Claimed", "Missing").

## Typography
This design system utilizes a dual-font strategy. **Plus Jakarta Sans** provides a modern, geometric personality for headlines and branding. **Inter** is used for all functional body text and data labels to ensure maximum readability in dense list views and forms.

- **Headlines:** Use tight letter spacing and heavier weights to create a "locked-in" professional look.
- **Data Labels:** Use `label-md` for table headers and form labels to provide a clear distinction from user input.
- **Scalability:** Large displays scale down by approximately 25% on mobile devices to maintain visual balance.

## Layout & Spacing
The layout follows a strict 8px grid (with 4px increments for micro-adjustments). This ensures a rhythmic, structured appearance essential for a dashboard interface.

- **Grid:** Use a 12-column fluid grid for desktop with 24px gutters. On mobile, transition to a single column with 16px side margins.
- **Sectioning:** Content should be grouped in cards with `lg` (24px) padding.
- **Density:** Dashboard tables should use `sm` (8px) vertical padding for rows to maximize information density without sacrificing touch targets.

## Elevation & Depth
To achieve a "SaaS" aesthetic, the design system uses **Ambient Shadows** and **Tonal Layering** rather than heavy borders.

- **Level 0 (Background):** `neutral_gray` (#F8FAFC).
- **Level 1 (Cards):** White surface with a very soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.04)).
- **Level 2 (Hover/Modals):** White surface with a more pronounced shadow (0px 10px 30px rgba(0, 0, 0, 0.08)) to indicate interactivity or focus.
- **Dividers:** Use 1px borders in a very light gray (#F1F5F9) for internal card divisions.

## Shapes
The shape language is "Soft-Modern." Elements use a 12px default radius (`rounded-md` in most frameworks) to feel approachable but professional.

- **Primary Buttons & Cards:** Use 12px (`0.5rem` or `rounded-md`) to 16px (`1rem` or `rounded-xl`).
- **Input Fields:** Match the button radius for consistency.
- **Status Badges:** Use fully rounded (pill-shaped) geometry to distinguish them from clickable buttons.

## Components

### Buttons
Primary buttons use the Brand Green with white text and a subtle 2px bottom "lift" shadow. Secondary buttons should be ghost-style with a light gray border or a subtle gray background.

### Polished Cards
Cards are the primary container. They feature a white background, 12px-16px corner radius, and a subtle shadow. Cards for "Lost Items" should include a top-weighted image area and a footer for status badges.

### Scannable Tables
Tables utilize `Inter` at `body-md`. Header rows should be `label-md` with a slight gray background. Rows should have a hover state of `neutral_gray` to help the eye track data.

### Dashboard Tabs
Tabs should be "Pill" style or "Underline" style. If using underline, the active indicator should be the Brand Green, 3px thick, with soft rounded ends.

### Form Inputs
Inputs use a white background with a 1px border (#E2E8F0). On focus, the border transitions to Brand Green with a 3px soft outer glow (ring) of the same color at 20% opacity.

### Status Badges
Badges use a "soft-fill" approach: a low-opacity version of the status color for the background (e.g., 10% Green) and a high-contrast version for the text.
