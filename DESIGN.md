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

## Full CBT workspace

Reference lock: extend the user's violet/plum/lavender screenshot palette and existing Test Centre. A focused exam shell places the absolute timer and save status above the question, subject navigation and a status-coded question palette beside it, and answer/review/navigation actions below. Keep forms readable in both themes and collapse the palette on narrow screens. Use restrained question transitions, tactile controls, visible keyboard focus, and reduced-motion support following Refero's bundled motion and craft guidance; live Refero remains unavailable because the subscription is inactive.

PDF and LaTeX import extract real local source into a mandatory editable review stage. Unknown answer keys stay unresolved until the user supplies them. TeX is parsed as text and never executed. Browser integrity controls are optional, disclosed observations: fullscreen, focus changes, clipboard/context-menu restrictions, stable shuffling and an explicit incident threshold. Record no camera, audio, typed content or visited URLs. These controls deter casual interruption, but browser-held keys and local records cannot enforce a secure proctored exam without a server. Preserve canonical paper snapshots and store shuffled presentation separately so grading and cohort revision matching remain correct.

Verification on 25 October 2026: 109 tests pass across scoring/persistence, stable presentation, import conflicts, policy/deduplication, navigation recovery and prior features. Local browser QA converted an actual README-based LaTeX question, required its missing key and explicit review, scored the shuffled answer correctly, verified clipboard blocking and saved integrity events, fenced guarded hash navigation, and restored the selected answer behind a fullscreen gate after reload. A three-question documentation attempt exercised single/multiple/numeric answers, keypad entry, review flags, palette filters, question overview, final counts and a reconciled 12/12 result. Checked 390px and desktop layouts and independent exam themes, correcting legacy dark-style overrides that initially reduced light-mode contrast. The browser automation's file-chooser upload failed before passing a file to the app; PDF extraction uses the existing locally verified PDF.js material pipeline. No mock paper or activity is seeded in production.

## Separate answer-key sources

Extend the existing import modal and violet reference lock with an optional answer-key panel, keeping the question source separate from the key source. Use the same labeled file/paste controls, independent progress/error recovery and an explicit mapping review table. Default to filling missing keys; replacing supplied or manually edited keys requires the user to select that mode. Match source question numbers, never row positions, and flag duplicates, conflicts, unmatched keys and uncertain columns. Preserve keyboard focus and reduced-motion behavior from Refero craft guidance. PDF geometry supplies selectable single/two-column reading order; text-based tables and LaTeX stay inspectable before application. Local question papers and generated document artifacts remain excluded from deployed source.

## Comprehensive update reference lock — 26 October 2026

The user's comprehensive report defines the full-page ChatGPT-style stream, fixed four-card Kanban pages, preserved nested LaTeX structure, and exact dark surfaces #0d0b14 / #161224 with #7c5cff actions. Existing violet, plum, and lavender references remain the light-theme authority. Live Refero research remains unavailable; the user-specified product patterns and previously read Refero craft/motion guidance anchor this extension.

| Decision | Reference | Implementation |
|---|---|---|
| Full-height conversation canvas and centered reading column | User report, ChatGPT interaction model | Assistant UI runtime/viewport, collapsible dated history, pinned composer |
| Context stays off until selected | User real-data requirement and context connector request | Visible per-message snapshots, explicit saved-file selection, no URL fetches |
| Four-card work viewport | User Kanban specification | Embla vertical pages, dnd-kit handles, GSAP page/Flip transitions; reduce repeated header decoration in Board mode |
| Durable completion history | User History specification | Full completion snapshots, preserved recurrence, real elapsed timer values, unknown times labelled |
| Source review before grading | User LaTeX and multi-source key request | AST hierarchy, explicit number matching, key grid, independent solution/source previews |

Verification found and fixed malformed TAB answer headings, continued solution numbering, multi-page solution truncation, and shared-store loading races. Desktop/390px chat, both appearance modes, actual chemistry imports, and transient board pagination were checked locally. No academic questions, generated results, documents, or study activity are shipped as seed data.


## Grouped authoring and desktop chat reference — 27 October 2026

The latest ChatGPT desktop screenshot supersedes the earlier decorated welcome composition. Lock the 76px Verdant rail plus approximately 318px history sidebar at wide desktop sizes, a plain centered welcome heading, and a two-row composer close to 800px wide. Preserve Verdant’s violet/plum/light and dark tokens. Keep real model settings, attachment controls, dictation, study commands and explicit context previews; omit unrelated ChatGPT approval or product controls. Phone navigation expands to a labeled drawer, and leaving Chat restores the previous workspace sidebar state.

The authoring screenshot identifies repeated setup and administrative preamble extraction as the central problems. Put subject/type at named question-group level, use existing workspace subjects, and assign review-order ranges in bulk. Lock one marking scheme for the paper. Keep optional chapter/topic/source details collapsed, preserve individual keys and supplied solutions, and clear only incompatible keys when a group changes answer family. Runtime sections and within-section shuffling follow authored group membership. Preserve legacy papers and attempt snapshots.

## Supplied motion references and task calendar — 27 October 2026

The user chose an original GSAP graph in place of React Bits Pro Simple Graph. Its official [Simple Graph documentation](https://pro.reactbits.dev/docs/components/simple-graph) locks the two-second path draw, curves, dots, glow, gradient and scroll-once treatment. This is an independent SVG implementation, requiring no Pro registry or license key. Apply it to Time Journey’s recorded interval counts; keep the exact count table and missing-timestamp disclosure. Cubic handles stay between adjacent measured points so a curve cannot invent a negative count or overshoot a measured peak. Integer ticks, endpoint labels, keyboard/touch tooltips and semantic result colors take priority over decoration. Other result charts retain their existing appropriate bar/pie forms.

The user’s pasted Shredder, floating-folder and thought-line components are narrow interaction references. The Board shredder is a brief visualization of a completed card already persisted in History; its animation callback only clears presentation state. Folder previews use actual resource and child-folder names and open the matching saved item. Chat’s thought line reports the real request lifecycle instead of simulated internal reasoning. Reduced-motion preferences end or skip these effects, and unmount cleanup releases listeners, animation frames and animation contexts.

The supplied event-calendar component governs the calendar layout and view structure. Adapt its controls, event surfaces and selected states to existing Verdant tokens. Map existing tasks into month/week/day/custom-day/agenda/subject views; use task-store actions for scheduling, duration changes and editing. Keep empty or unscheduled data explicit, and keep planned calendar durations separate from measured study time. Dense month cells use an overflow popover rather than overlapping cards. Completed tasks require reopening before rescheduling.

The shared dropdown implementation layers an accessible Base UI popup over the native field’s visible value and event interface. Lock short 220ms entry and 140ms exit motion with a restrained option cascade; cleanup must preserve close/reopen behavior. Native multi-select/listbox fields retain their original form. Popup focus, Escape, viewport containment and reduced motion are functional requirements, including inside existing dialogs and the expanded CBT workspace.

Final local QA corrected hover/click folder toggling, the phone calendar header collision, dropdown labeling and focus forwarding. A 390px layout viewport confirmed day-first calendar navigation and contained menus. The existing documentation attempt supplied the line graph's real counts; isolated status/archive checks did not create messages or task records. ReUI's full MIT attribution is included in the deployed public notices.

## Readable chat task attachments — 28 October 2026

The user's latest request replaces raw completed-task data with cards and explicitly supports both chat and board destinations. Keep the screenshot-locked chat canvas and violet tokens. Place the task shelf in a responsive drawer so it does not decorate or crowd the initial welcome. Show real status, subject, dates, estimates and measured time; unknown measured time remains distinct from zero. Compact composer cards retain their task identity and a clear removal control. Long text becomes a Pasted text attachment with an inspectable full preview.

Native drag and accessible buttons perform the same validated actions. Shared snapshots remain historical views; actions resolve the current saved record before attaching or moving it. A completed record produces a new follow-up and retains its completion in History. Legacy snapshots need a unique current-record match. Stale or ambiguous references remain read-only. Use restrained GSAP entry and press feedback, clean up animation on unmount, and respect reduced motion. Persistence must never depend on an animation callback.

Desktop and 390px checks confirmed readable attachment cards, the drawer's touch-friendly controls, native drag into chat and onto the board dock, preserved History and conservative Undo. No API response or academic data was fabricated for verification.

## Science rendering, time analysis and Mistake Book reference — 29 October 2026

The user's Time Analysis screenshot locks the subject-tabbed Time Breakdown, outcome-tabbed hourly table and large hourly line chart. Use Verdant violet for personal performance and distinct series colors for actual imported cohorts. Preserve semantic correct/incorrect states. Never fill absent cohort or answer timestamps with invented observations; unavailable detail needs an explanation. Charts need readable axes and reliable dimensions in both themes, with smooth, interruptible entrances and reduced-motion alternatives.

The attached Mistake Book brief owns the page's dark treatment: #09090E canvas with restrained violet ambience, #111118 glass cards, #0B0B10 recessed recall chamber, fine inset highlights, one white header CTA, compact bento metrics, segmented category proportions, searchable two-column question cards and framed photos. Preserve the light appearance and actual study actions. Self-rated mastery is optional and separate from existing difficulty; historical records start unrated. Search owns Ctrl/Cmd+K only while this page is mounted.

The shredder needs a visible sequence: soft entrance, brief saved-card hold, controlled paper feed, falling strips and a fade exit. Decoration must never delay task completion or History persistence. The user's supplied visual references plus Refero's bundled motion guidance anchor this update; live Refero research is unavailable because its subscription is inactive.

## MathJax and MathML integration — 29 October 2026

The user's explicit request replaces the shared KaTeX presentation layer with MathJax4 and adds Presentation MathML. Preserve Verdant's existing app layout, theme colors, CBT answer semantics and animations. Mathematical glyphs use bundled MathJax SVG font data; expressions inherit the surrounding theme and keep natural dimensions inside answer buttons. Wide display equations scroll within their own area.

Render formulas in isolated virtual documents rather than rewriting React-owned question markup. Load the local engine only when needed, cache bounded results, and discard stale asynchronous responses when content changes. Keep original notation visible during loading or errors. Provide one assistive MathML representation beside a decorative, non-focusable SVG without adding nested controls to answer options. Preserve literal code and reject executable XML/HTML, arbitrary external loads and unsafe attributes.

MathML fragments remain opaque while importing real numbered questions, answer keys and supplied solutions. A standalone equation file is a source snippet to place in an authored question, never an inferred complete assessment. The existing mandatory review, question groups, marking scheme and grading remain authoritative. References: MathJax official direct-module, MathML and safe-extension documentation; no visual redesign is introduced.


## CBT MathJax and MathML source preservation — 29 October 2026

Extend the existing CBT question, option, explanation and solution surfaces through the shared math renderer. Keep the established violet/plum/light and dark tokens and existing question layout. Math rendering is presentation only: canonical option indices, numerical keys/tolerances, fixed paper scoring and immutable result snapshots remain authoritative.

The importer treats complete `<math>` fragments as opaque source before TeX AST traversal, comment cleanup and numbered text/key/solution scanning. Presentation markup, text annotations, percent signs and chemistry commands inside those fragments must survive without creating a question, option or key. Restore the original fragments for editable review and shared preview. Standalone `.mml`/`.mathml` files are explicitly equation snippets; they do not supply a CBT schema or justify invented stems/answers. General XML/HTML file import stays unavailable.

The renderer’s bounded MathML sanitizer owns allowed mathematical markup and attributes. Keep XML directives, external entities, HTML, event handlers, remote resources and executable content out of the render path. Mandatory review and missing-key gates remain in place. Use clear file/field labels to distinguish source import from mathematical display; do not hide renderer implementation controls in the test-taking flow.

## Calendar scheduling and task spacing — 30 October 2026

Reference lock: the existing Verdant theme owns canvas, typography, violet accents and subject colors. The user's Google Calendar screenshot and 56-second recording own the scheduling behavior: a fixed time gutter, separate Any time row, continuous hour lines, moving a block across days without changing its duration, and dragging an edge with a live range. The recording shows bottom-edge resizing; the user's written request adds the top edge. Refero live research was unavailable because the subscription is inactive; its bundled focus, touch and form guidance supplements these supplied references.

| Decision | Source | Role preserved |
| --- | --- | --- |
| 18px list insets, 12px on phones | User task-row screenshot | Keep completion controls and subject badges inside their row surface |
| Solid hour, softer half-hour and faint quarter-hour lines | User calendar screenshot and recording | Time structure at the existing 64px/hour density |
| 15-minute move/resize snapping | Recording at 16–22 seconds | Explicit calendar position, with live start/end labels |
| Visible top/bottom grips, vertical cursor and named keyboard controls | User request and bundled accessibility guidance | Change one edge while holding the other fixed |
| Collapsible work tray with real saved task identities | Existing task model and user's drag-to-calendar request | Schedule work without creating duplicate tasks |
| Short edge-hover delay when entering from the tray | Observed phone interaction | Prevent accidental scrolling before reaching the intended slot |

Calendar changes commit through the existing workspace store on release and remain visible in List, Board, task editing and related workspace views. Planned duration stays separate from measured focus time and completion history. Drop validation resolves the current saved task, rejects completed or invalid items, preserves existing subjects, and provides conservative Undo. Escaping or releasing outside the calendar cancels the gesture. A transient preview date for undated work is never saved until a valid drop.


## Solid calendar and material previews — 2 November 2026

The user’s folder screenshot and existing Verdant tokens govern this focused update. Keep the violet folder illustration and its hover movement, but use actual saved descendant materials as the preview content. Empty folders show the folder itself, with no placeholder material, blank paper or floating Open folder chip. The illustration is a native button that enters the folder; preview buttons open the corresponding saved resource. Trigger-before-preview DOM order supports focus, Tab and Enter, and return focus stays on the visible folder button after selection. The phone hover bridge must fit within the card rather than expand the page.

Calendar task blocks use opaque existing subject colors with an explicit foreground chosen for at least 4.5:1 contrast. Chrome stays on solid Verdant surfaces; structural time-grid lines and temporary drag ghosts retain their functional roles. A visible Planning / Day / Week switch changes the existing calendar view. Planning maps to the existing agenda, and the other menu views remain available. Both selectors share the same state, date anchor and task store. Preserve the prior drag, resize, Undo and measured-time semantics.

## Dedicated study pages and compact attachments — 3 November 2026

Reference lock: the user's three screenshots define the clutter to remove and the requested spacing. Preserve Verdant's existing violet theme, typography, task identities and navigation motion. Calendar occupies the entire main content container as its own route; retain the existing Planning/Day/Week switch, subject filters, saved task gestures, work tray and Undo. Focus has a standalone navigation route, while the timer remains mounted at workspace level so page navigation does not interrupt a session. The dashboard uses the recovered width rather than retaining an empty timer/review/mastery column.

The Mistake Book recall card keeps its text, reveal, assessments and scheduling action while removing the brain icon, due footer and mastery-star control. Persisted review and mastery data remain available to existing scheduling and analytics. Workspace settings use 24px body/header padding, 20px section gaps and a wrapping, vertically aligned action row with a 12px gap.

Draft chat task attachments use 38px single-row chips: status dot, ellipsized title, subject badge and named remove control. Full task snapshots remain authoritative when sent; source task actions remain in the task shelf. The composer has 14px/16px/12px desktop padding and 12px phone padding. Preserve message drafts when an attachment is removed. Respect reduced motion and existing keyboard focus styles.
