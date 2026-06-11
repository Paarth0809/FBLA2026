# Accessibility

## Standards

Target: WCAG 2.1 AA for the judged demo.

## Implemented

- Semantic pages with headings, buttons, links, labels, and form controls.
- Visible focus styles through the shared CSS system.
- Reduced-motion support for standard UI animation and homepage story fallback.
- Color palette designed for high contrast on both light and dark surfaces.
- Form validation uses text messages, not color alone.
- Modals use `role="dialog"` and `aria-modal="true"` where present.
- Public pages remain usable without the cinematic WebGL effect.

## Manual QA Matrix

| Viewport | Pages |
| --- | --- |
| Mobile 390px | homepage, search, forms, claim, portal tabs |
| Tablet 768px | search grids, detail pages, student portal |
| Desktop 1440px | homepage story, admin dashboard, table layouts |

## Reduced Motion

The homepage scroll story checks reduced-motion preferences. In reduced-motion
contexts, the content should remain readable without forcing the full animation.

## Remaining Watch Items

- Run Playwright + axe before the final submission.
- Re-check every icon-only button for accessible text or `aria-label`.
- Verify keyboard focus order in admin tables and message modals.
