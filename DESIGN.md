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

## Test Centre and Botanical Calm upgrade

Reference: user-provided https://test.quizrr.in/analysis-demo#comparative-analysis, inspected directly in the browser on 20 October 2026. Personal analysis supplies overview, performance, time quality and buckets, attempts, difficulty, subject movement, chapter errors, improvement scenarios, question journey and per-question review. Comparative supplies cohort performance, time/accuracy, hourly and difficulty comparison. Adapt the workflow hierarchy and measured-data relationships into Verdant; retain existing white/mint/emerald visual identity.

User specification locks #107C41 main actions, tonal sage secondary actions, 240ms/40ms entry cascade, 220ms shared indicators, 800ms progress, 400ms counters, tabular rolling timer digits and 4-second breathing focus state. Refero bundled motion.md supplies feedback/continuity/hierarchy, interruptibility, explicit-property transitions and reduced-motion rules. Existing unavailable live Refero subscription is unchanged.

Real data rule: question papers are authored, imported from validated JSON, or assembled from existing user questions; no seeded bank. Attempts record actual timings/events. Cohort comparison uses only imported actual results and names its source size and empirical percentile method. No predicted exam percentile without historical exam data. All core scoring/analytics are deterministic and require no AI.
