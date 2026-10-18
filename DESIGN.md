# Verdant reference lock

Designing a desktop-first study workspace for students. The primary task is deciding what to study next, then turning mistakes into useful follow-up practice.

Primary target: the user's explicit Todoist-style application structure, adapted to the specified crisp white and botanical emerald palette. Live Refero was unavailable (inactive subscription); bundled Refero typography and craft references supplied the fallback research.

Preserve: a 260px mint sidebar, restrained 13–14px Inter UI typography, flat task rows with hairline dividers, circular priority controls, deep slate headings, emerald actions, and generous space between task groups. JetBrains Mono is reserved for dates, small metrics, and keyboard shortcuts.

Borrow only: progressive disclosure for task metadata and an independent review/focus rail. No marketing hero, decorative photography, gradients, or unrelated accent palette. Media uses code-native icons and meaningful data visualizations.

| Decision | Source | Role | Reason |
|---|---|---|---|
| White canvas, mint sidebar, emerald actions | User brief | Surfaces and primary actions | Keep attention on study content |
| Grouped task rows and list/board/calendar switching | User's Todoist target | Task structure | Fast scanning and planning |
| Inter at 13–14px, 28–32px page title | Refero typography.md | Product UI type hierarchy | Dense enough for work, readable at rest |
| Visible focus, form labels, undo, modal focus trap | Refero craft-details.md | Interaction/accessibility | Complete keyboard and recovery paths |
| Scoped useGSAP and contextSafe | GSAP official React documentation | Animation lifecycle | Reliable cleanup on navigation |

Technical reference: https://gsap.com/resources/React/
