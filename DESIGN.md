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

Polish follow-up: header elements enter together over 240ms, then banners and KPI cards enter at 40ms intervals. Navigation pills update only when their layout target changes, so live counters cannot restart the glide. Navigation targets keep stable geometry during interaction. Weekly chart guides share the bars' 130px plotting range and zero baseline. Narrow focus captions wrap; Escape uses the dialog's animated dismissal and restores focus. Verified desktop and 390px layouts, timer controls, layout tabs, Labels and Mistake Book empty states, and Resource Vault action hierarchy; TypeScript, production build, and all 32 regression tests pass.

## Screenshot reference lock: violet result analysis

The user's eight screenshots now govern the result report and color system. Images 1/7 lock the actual-score bars with gradient improvement caps and subject tabs; Image 2 locks the interval table and grouped time-journey chart; Image 3 locks the quality-of-time segmented bar; Image 4 locks the subject pie/attempt/accuracy card triptych; Image 5 locks the outcome table with proportional gradient cells; Image 6 locks difficulty small multiples. Image 8 supersedes emerald branding with sampled violet #6A43FF, plum #2E005B, and lavender #F4F1FF / #EBE7FF, retaining white content surfaces. Preserve outcome green/red/slate and subject green/orange/blue as semantic data colors.

Build directly from these references using native SVG, focusable chart marks, data tooltips, subject tabs, dashed grids, and restrained bottom-up chart reveals. Keep actual recorded attempts and authored answer keys as the only result data. A 50% error reduction is an explicitly proportional scenario for recovering incorrect-answer marks, including penalties; it is not a forecast. The reference's predicted percentile number and Quizrr branding are not application data and must not be copied. Existing empirical cohort percentiles remain labeled with their actual imported source.

The repeated reference set on 21 October adds the subject-tabbed difficulty table above the chart small multiples. Result analysis is available in the Test Centre's completed-results tab and in each report. Verified the existing README-based recorded attempt, keyboard tab and tooltip access, legend toggles, desktop and 390px layouts with contained table scrolling, and the violet tokens. All 40 tests and the production build pass. A regression test covers fractional-duration answers saved exactly at the deadline. Chart reveals start on viewport entry and respect reduced motion.

## Resource Vault PDF workspace

Extend the established violet design with a document-first reader: compact labeled toolbar, white paper on a lavender-gray canvas, and optional study tools. The existing MaterialReader supplies the document and keeps text/read-aloud available. PDF.js's official rendering example and installed TextLayer API govern page rendering and text selection; pdf-lib's official modify-document workflow governs annotated copies. Keep document coordinates normalized so highlights, circles, ink, notes, and selected image captures stay aligned under zoom. Save annotations against the uploaded file key in browser storage. Original PDFs remain available; exported annotated copies include full note text in a notes appendix. Selected-area captures use actual page pixels and annotations. No seeded materials or remote document processing.

PDF verification: an existing project-documentation PDF was rendered, searched across six pages, annotated, reopened, zoomed, and expanded inside the actual reader modal. Keyboard drawing cancellation preserves the parent dialog; read-aloud/text mode returns to the annotation workspace. The phone toolbar uses one complete tools row with color/history controls below. Vector export tests cover native rotations, crop boxes, metadata/forms, unchanged original bytes, and transparent circular image captures.

## Dedicated chat, appearance, and task dictation

Reference lock: the user's supplied AnimatedAIChat component owns the chat composition: centered question prompt, growing textarea, slash-command picker, attachment chips, restrained ambient violet glow, and animated feedback. Adapt its neutral black/white styling to Verdant's existing violet/plum/lavender tokens. Remove its simulated upload names, delayed fake responses, and unrelated Figma/webpage commands. Real study commands, selected local documents, configured-provider responses, error recovery, and conversation history define the working page. Keep this in a separate Study Chat route, with no photography or decorative assets. Refero live research remains unavailable (inactive subscription); the user component and bundled craft/motion guidance are the primary references.

| Decision | Source | Role | Reason |
|---|---|---|---|
| Centered composer and progressive chat history | User-supplied component | Chat layout and interaction | Preserve the requested interface while giving real messages room |
| Violet actions, plum text, lavender surfaces | Existing screenshot reference lock | Brand tokens | Match the rest of Verdant |
| Dark plum canvas and layered dark surfaces | User dark-theme request; Refero contrast/form guidance | Appearance | Keep controls, status colors and charts readable without inverting document paper |
| Local conversation history, explicit API configuration | User real-data and add-API requests | Data and connection states | No invented assistant responses or embedded provider secrets |
| User-initiated task dictation with visible recording state | User speech request; Google token-model and Speech REST docs | Task capture | Preserve typed text and make microphone/network use clear |

Google OAuth's public client ID identifies the application; it is not an API key. Cloud recognition needs the user's consent, an enabled and billed Cloud Speech project, authorized website origins, and appropriate project access. Keep access tokens in memory. Browser dictation is separately labeled as browser-provided recognition. Both paths require an explicit user action to begin recording.

Verification on 24 October 2026: all 73 regression tests and the production build pass. Checked desktop and 390px chat layouts, API provider fields and required-model validation, missing-key send gating with draft preservation, keyboard slash commands, task dictation language/provider controls, successful Google Identity script loading, and theme persistence across reload. Actual AI responses and Google Cloud recognition await the user's provider key/project authorization; no fake responses or microphone recordings were used in UI verification.

Folder deletion follows the existing Resource Vault card controls: a visible trash action on every folder and an in-folder Delete folder action open a confirmation with exact reparenting counts. The user deletes only the folder; direct materials and child folders move to the parent, with root materials kept as Unfiled. Undo restores locations while preserving later edits and moves. File keys and annotation storage are retained. A virtual Unfiled option includes an explicit subject selector in the material form. Root and nested deletion, Undo, missing parents, retained file identities, and deep/cyclic traversal are covered by seven additional tests. All 80 tests pass; local UI verification covered confirmation, cancellation, actual deletion/Undo, and the Unfiled form path.
