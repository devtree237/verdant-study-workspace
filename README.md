# Verdant study workspace

A complete React + TypeScript + Tailwind CSS + GSAP single-page app. It starts **empty**, and uses only the tasks, subjects, mistakes, resources, and quiz questions you create. There is no seeded academic content, invented activity, or sample profile.

## Run locally

Requires Node.js 20.19+ and pnpm 10 (or a compatible npm installation).

```sh
pnpm install
pnpm dev
```

```sh
pnpm test
pnpm build
pnpm preview
```

## Workflows

- Add your first subject from the sidebar. Its root resource folder is created automatically. Adding the first mistake, folder, or resource guides you through subject creation.
- Quick Add with Q or Ctrl/Cmd + K. Supports `#Subject`, `@label`, `p1`–`p4`, today, tomorrow, next weekday, and daily recurrence. Tasks include notes, subtasks, dates, time blocks, reminders, and resource/mistake links.
- Switch between grouped lists, draggable boards, and week/day calendars. Stage selectors provide keyboard-accessible board controls. Complete or delete a task with Undo.
- Log your own mistakes with Markdown/LaTeX, screenshots, error categories, and solutions. Active recall schedules 1/3/14-day reviews. A failed recall also adds an urgent task for today.
- Create nested folders. Upload PDFs, Word (.docx), UTF-8 text, and Markdown documents (up to 25 MB). Add Markdown notes, links, and custom quizzes. The split study view saves notes, captures mistakes, and adds linked study tasks.
- Delete a folder from its card or from inside the folder. Confirmation explains where its contents will move: direct materials and child folders move to the parent; root materials become Unfiled under All resources. Files, notes, nested descendants, and PDF annotations are retained. Undo restores the folder without overwriting later content edits or moving newly added items.
- Open a saved PDF in the Resource Vault's annotation workspace. Search all pages; zoom, fit width, or expand the reader; highlight text or areas; draw with a pen, circles, or rectangles; and add editable notes. Undo/redo and per-file autosave preserve your marks. Download the original, an annotated PDF (full notes included in an appendix), an annotation JSON backup, or a rectangular/circular PNG capture containing actual page pixels and annotations. Keyboard users can focus the page, press Enter to begin drawing, adjust with arrows (Shift for larger steps), and press Enter to finish or Escape to cancel.
- Switch to Text & read aloud to search extracted text, jump between pages/sections, and select passages into Quick capture. Read-aloud supports pause, resume, stop, and speed selection. Scanned PDFs need a text layer for search and speech; drawings and snapshots still work. DOCX text view does not preserve full layout, equations, or images.
- Attach your own practice questions to any resource. Folder assessments collect those questions. Quiz and flashcard modes record results, calculate mastery, and send missed questions to the Mistake Book. No questions are generated or fabricated.
- Open **Practice** to find the indexed JEE Advanced chapters by subject, answer questions at your own pace, resume where you stopped, and save questions with their printed excerpts to the Mistake Book. Questions with unclear keys are available for self-review.
- Focus sessions, assessment history, and mastery analytics reflect your activity. Empty history shows zero rather than invented progress.

## Storage

Chapter practice uses `public/practice-library/index.json` and the exact source books under `public/practice-library/source/`. Source PDFs are tracked with Git LFS so they remain available in this private repository without inflating ordinary Git history. Install Git LFS before cloning or building so the PDFs are downloaded and included. On a local checkout, `.local/practice-books.json` can still map the `mathematics`, `physics`, and `chemistry` book IDs to alternate local PDF paths. Practice answers and your last position are included with the workspace records.

Study records persist in localStorage. Original uploaded materials, extracted text, and screenshots persist in IndexedDB. Document extraction runs locally and speech uses local device voices. Everything remains in the browser on the current device; there is no cross-device sync or server database. Reminders are delivered while the app is open. Workspace settings export study records as JSON; uploaded files are not included.

Optional Study Chat sends only the conversation and attached document text you choose to send to your configured AI provider. Task dictation uses the browser's speech service or, when explicitly selected and connected, Google Cloud Speech. These services may process text/audio remotely. Local study records are not automatically sent to either service.

## Chat, appearance, and voice entry

Study Chat is a separate sidebar page. Configure a Gemini API key or an OpenAI-compatible chat endpoint, model, and key through AI connection settings. A local compatible endpoint can omit a key. External endpoints require HTTPS and must permit browser requests through CORS. Keys stay in session storage by default; Remember on this device explicitly opts into local storage. They are not embedded in the application source or deployed build. Conversations are stored separately on this device and can be exported. Real text/PDF/DOCX/Markdown attachments are extracted locally and are sent only with your message; scanned PDFs need a text layer.

The top-bar moon/sun button changes the entire workspace theme and remembers your choice. Without a saved choice, appearance follows your system setting. Uploaded PDF pages and image pixels keep their original colors.

In Quick Add or Edit task, use Dictate task, choose English (India) or Hindi, then stop dictation before saving. Recognized words append to the title without replacing what you typed. Browser speech availability depends on the browser and its recognition service.

For Google Cloud Speech, choose that provider in the task form and enter your quota/billing project ID. The supplied public Google OAuth client ID is already configured. Before connecting, enable Cloud Speech-to-Text and billing, grant the signed-in account the required Speech and Service Usage permissions, and configure the OAuth consent screen/test users. Add the exact deployed origin `https://verdant-study-workspace.indigoperch2.chatgpt.site` to the client's authorized JavaScript origins; for development, add the exact localhost origin you use. Connect Google from the form, then record a phrase of up to 55 seconds. Access tokens and audio remain temporary; recordings go to Google only for recognition and are not saved in the study workspace. A client ID alone does not authorize or fund requests. See [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) and [Speech setup](https://docs.cloud.google.com/speech-to-text/docs/setup).

An upgrade migration removes the first development version's fixed example records while preserving user-created records and unlinking references to removed examples.

## Motion and accessibility

GSAP, `@gsap/react`, Flip, and Draggable are registered explicitly. Scoped `useGSAP` contexts and `contextSafe` callbacks cover page entrances, navigation, cards, form controls, modal transitions, task completion, recall reveal, quiz flips, counters, and progress bars. The app respects reduced-motion preferences. Dialogs trap focus, support Escape, and restore focus. Forms are labeled and priority controls have accessible names.

## Validation

Unit tests cover natural language dates, recurrence parsing, an empty initial state, demo-data migration, nested mastery calculations, review intervals, linked task identity, file validation, literal search across pages, and speech chunk boundaries. TypeScript and the Vite production build provide additional checks. Browser checks cover the connected task, recall, resource, and assessment flows at desktop and mobile widths.

## Test Centre

The timed testing workspace follows the personal and comparative workflow patterns of the user-supplied Quizrr analysis demo, adapted to Verdant’s existing design. It does not connect to Quizrr accounts or import its private question bank.

Create papers manually, import validated paper JSON, or assemble existing practice questions from your Resource Vault. Single correct, exact-set multiple correct, and numeric answers are configured once per question group. Choose each group’s subject from existing workspace subjects and assign question ranges in bulk. Decide one paper-wide marking scheme; all questions then keep the same marks and penalty. Target time, difficulty, and explanations remain available, while chapter/topic fields are optional details. Existing historical papers and immutable attempt snapshots remain readable. Paper snapshots keep historical results intact when you edit a paper. Shared-paper imports preserve canonical question IDs; explicit cloning creates a separate paper.

Import a text-based PDF or paste/upload LaTeX through **PDF / LaTeX to CBT**. PDF text extraction runs locally; the editable source stage lets you repair reading order and option labels. LaTeX supports numbered text, `exam` questions/choices/CorrectChoice and nested enumerate choices; mathematics is kept for rendering. TeX is never compiled and external files or executable commands are never loaded. Every conversion opens question review. Subject and answer type are chosen per group, marks and penalties are fixed once for the paper, and each question retains its own prompt, answer key and supplied explanation. Optional source number, chapter/topic, difficulty and target time stay in a details section. Missing keys must be supplied before saving, and explicit review confirmation is required. Scanned PDFs need OCR or manually supplied text; arbitrary diagrams and complex layouts cannot be reconstructed automatically. No AI or API key is needed for this conversion.

Use **Separate answer key** in the source or review stage to upload a key PDF/.tex file or paste key text/LaTeX. Each source has its own PDF column-order selector, progress and cancellation. Preview the question-number mapping before applying. Fill missing answers preserves existing keys and flags differences; Replace matching answers requires an explicit selection and acknowledgement before overwriting manual keys. Duplicate question numbers, unknown option labels, conflicting key entries, and unmatched numbers are shown without positional guesses. Pending source changes and unresolved matching conflicts prevent final review until applied, corrected or deliberately resolved. Source numbers can be edited in review to disambiguate repeated numbering.

Recognized key layouts include numbered pairs (`1: A,C`), compact multiple answers (`AC`), spaced or parenthesized choices, repeated Q/Key/Level table groups, paired question/answer rows, LaTeX tabular/longtable and numbered enumerate keys. Bare numerical keys are numerical answers; choice positions need explicit option labels. Multiple-correct questions use the exact set of selected choices. Question import also preserves `questionblock` numbers, column containers, and consistent option labels such as A/C above B/D; supported simple LaTeX tables render as scrollable tables. Unsupported tables remain visible source with a review warning. PDF extraction reconstructs visual rows, keeps common formula subscripts together, and offers automatic, single-column or left-column-first reading order. Always check the editable text and answer keys against the original documents.

Starting a paper opens CBT setup with an optional candidate name, instructions, marking summary and practice/guarded settings. The expanded exam workspace includes section tabs, a status-coded question palette with filters, single/multiple-choice controls, a numerical keypad, clear response, mark for review, previous/next, paper overview, instructions and a submission summary. Answers autosave on this device. Question shuffling stays within authored question groups (or subject sections for legacy papers) and option shuffling preserves canonical answer indices; both orders survive reload without changing the paper revision used for result comparison.

Guarded mode can require fullscreen, observe page/focus changes, restrict clipboard/print shortcuts and context menus inside the exam, and submit at an explicitly chosen incident limit. Fullscreen requires a user gesture and supported browser; an unavailable fullscreen request cannot silently downgrade a guarded attempt. The timer keeps running during interruptions. Brief browser bursts are coalesced; window-only blur is ambiguous and requires acknowledgement before counting. Reports and workspace backups include the selected policy and timestamped event types, without clipboard text, typed content, URLs, camera, audio or screen recordings. The default is unmonitored practice with no automatic incident submission. These browser checks deter casual interruptions and do not establish misconduct, prevent another device, protect browser-held answer keys, or make local storage tamper-proof. High-stakes multi-user exams need authenticated server-held papers/keys, server timestamps and an appropriate supervised proctoring system.

An absolute deadline, saved responses, review flags, per-question times, answer changes, and events support resuming after reload and automatic expiry. The report includes subject/chapter/difficulty scores, quality of time, final-answer time intervals, attempt evaluation, subject movement, manual error labels, correction scenarios, a chronological question journey, painful questions, answer-key review, and Mistake Book capture. Submitted attempts also appear in the main assessment history.

Comparative analysis accepts actual cohort JSON/CSV or pasted result records. Export/share a result to compare the same paper and revision. Rank uses competition ranking, and empirical percentile uses lower scores plus half of tied scores divided by the imported cohort size. Official exam percentile prediction is not supplied. Full question-level data unlocks difficulty and hourly comparisons; summary-only imports show only supported metrics. No cohort, ranks, or activity are fabricated.

Testing data is separately saved under verdant.testing.v1 in localStorage. Use Export test workspace for a paper/attempt/cohort backup, and Import JSON to merge it back. The general Workspace settings export covers the original study records; uploaded file binaries remain separate.

AI is not required for the test engine or analysis. Optional future AI could draft questions, explanations, or study suggestions from material, subject to checking their answers. A live multi-user leaderboard and cross-device synchronization would require a shared authenticated service and actual participant results.

Botanical Calm adds shared navigation/tab indicators, route cascades, bounded spring feedback, 800ms mastery progress, 400ms counters, rolling timer digits, a breathing active focus card, subtle leaf motion, sage secondary actions, chart gridlines, clearer surfaces, and reduced-motion alternatives.

Validation for this upgrade: 32 unit tests passed, including scoring, numeric tolerance, exact-set marking, immutable snapshots, timing/expiry, imported-cohort ties and validation. Browser QA covered paper authoring, question types, answer/review/clear, reload/resume, submission, solutions, mistake capture, and detailed comparison using an actual recorded result. Browser download-event automation was unavailable; JSON export uses standard browser Blob downloads, and a visible/shareable JSON result is also provided.

## October 2026 parser, board, and chat update

LaTeX question extraction now uses unified-latex's AST. Nested Roman/numbered statement lists remain in stems; alphabetical choices, multicols, questionblock, qmeta tags, and continued enumerate numbering are detected separately. Structural answer/solution headings stop question extraction. Competency/source tags remain in the question text and recognized difficulty tags map to the assessment scale. Shared Markdown supports scrollable tables, display math, and chemistry notation; the MathJax/MathML update below extends the mathematical renderer without changing answer checking.

Attach Answer Key / Solutions accepts local PDF/.tex uploads, pasted sources, an embedded answer/solution section, or saved Resource Vault PDFs/LaTeX. Saved PDFs support an explicit PDF-page range and optional chapter-heading search. Supplied explanations are mapped by source number. The compact verification grid supports single and multiple answers before grading; ambiguous matches and conflicting keys require review. No answers or explanations are generated. A narrowly scoped warning reports recovered TAB + extbf answer headings in malformed generated LaTeX.

The Kanban board shows at most four cards per column page with Embla, keyboard/wheel pagination, dnd-kit sorting, and GSAP Flip/Observer choreography. The newest four completed tasks stay on the board; older full snapshots appear in History, grouped by completion day and subject. Recurring tasks keep each completed occurrence. Task timers measure elapsed time explicitly; planned duration and unknown legacy time never count as studied time.

Workspace records, Mistake Book, task history, uploaded file blobs, and chat conversations now use Dexie IndexedDB. Zustand holds hydrated live workspace state. Existing localStorage and native IndexedDB copies remain available during migration; damaged snapshots are retained with recovery controls instead of overwritten. Testing papers/attempts remain in their separate existing localStorage store and export workflow. Data remains device-local rather than cross-device cloud sync.

Study Chat uses a full-page layout, Assistant UI runtime/viewport primitives, cmdk commands/mentions, and real configured-provider requests. Context starts off. Mistake Vault reads only explicitly selected saved documents; Daily Tracker and History show the actual snapshot before sending. Previously sent snapshots remain in that conversation. A provider API key is required for AI replies; import, Kanban, History, and scoring require no AI.

Validation: 218 regression tests, TypeScript, and production build passed. Actual chemistry PDF and LaTeX imports independently matched all 30 answer keys and all 30 supplied explanations, with four options per question. Local browser checks covered the 30-question review, manual key toggles, rendered tables, keyboard chat commands, missing-key draft preservation, explicit context previews, phone and desktop layouts, both themes, and transient nine-card pagination without creating study records. Real provider responses require the user's configured key and were not simulated.


## Grouped tests and screenshot-style chat

Study Chat follows the supplied desktop screenshot: a narrow workspace rail, one conversation sidebar, a plain centered welcome heading, and an approximately 800px two-row composer. The model/API controls, microphone, attachments, study tools and context tray use the real existing workflows. Opening Chat collapses the workspace navigation; leaving restores its previous width, and the phone drawer keeps full labels. The light and dark Verdant palettes remain in use.

PDF/LaTeX review supports named question groups and bulk range assignment, removing repeated subject, answer-type, topic and scoring setup from each basic question form. A group uses an existing workspace subject; changing between incompatible answer families clears the incompatible key for review. One fixed marking scheme applies across the paper. Numbered administrative instructions before a restarted question list are excluded when the later structure clearly identifies real questions; incomplete questions still stay visible for repair.

## Micro-animation and calendar update

- The Time Journey result chart uses a custom GSAP SVG line graph instead of the licensed React Bits Pro component. It draws measured interval counts over two seconds on first viewport entry, with bounded curves, a fading area, hover-glow points and a dashed count grid. Hover, touch and arrow keys expose exact counts. Legend toggles, the interval table and the warning for missing answer timestamps remain available. Reduced-motion and print modes render the final data directly; no sample result series is shipped.
- Resource Vault folders use the supplied floating-folder treatment, adapted to Verdant colors. Their previews open actual child folders or saved resources. The ordinary folder title, pin, delete and assessment actions remain accessible independently.
- When completed Board cards exceed the four-card limit, a one-shot paper-strip animation represents an item already saved to History. It does not delete the task record or delay persistence. Undo, navigation, resize, tab visibility and reduced-motion handling can end the visual independently of the saved history entry.
- Study Chat displays the supplied thought-line treatment while a real provider request is pending. The steps report request delivery and response status; they are not fabricated assistant reasoning. Success, Stop and failure show the corresponding actual request state.
- The calendar uses the supplied event-calendar structure with Month, Week, Day, 3-day, 5-day, Agenda and Subjects views. Existing tasks supply every event. Add or select a slot, open task details, edit, complete, delete, reschedule and resize through the existing task store. Subject columns use saved workspace subjects; unscheduled tasks remain separately visible. Device-local dates/times and planned duration stay distinct from measured study time.
- Shared dropdowns use a native field beneath a Base UI popup with short GSAP entry, option stagger and exit transitions. Disclosure panels and chevrons use the same motion timing and reduced-motion policy.

Focused geometry tests cover curve bounds at peaks and zero intervals, single-observation and empty cases, integer question-count ticks, and narrow-screen labels. These checks supplement the existing measured-result metrics tests; they do not introduce demonstration data into the workspace.

Validation for the 27 October update: all 252 regression tests pass. Local browser checks verified keyboard and dialog dropdown behavior, the actual saved-result line chart and exact-count tooltip, calendar date prefill and view switching, floating-folder navigation, status settle timing and the finite shredder effect. The calendar was also checked in a 390px iframe viewport; no records were created by the isolated animation checks. ReUI's full MIT notice is distributed in public/THIRD-PARTY-LICENSES.txt. Time Journey supports 1-, 5-, 15- and 30-minute grouping without altering recorded answers.

## Draggable chat task cards — 28 October 2026

Study Chat renders saved task context and recognized task snapshots as readable cards. Open Tasks to search completed or active work, drag a card into the composer, or use Attach to chat. Cards are shared with the configured provider only when the message is sent. Long pasted text appears as a named Pasted text attachment with a full preview; missing connection settings preserve the draft and attachments.

Drag cards onto a board stage or use Add to board. Active tasks move; completed tasks create a fresh follow-up while their original completion stays in History. Undo preserves later edits. Actions re-read the current saved task using an identity-only drag payload. Older snapshots can act only when they match one existing task unambiguously; deleted or ambiguous snapshots remain readable. No snapshot text can silently create or edit a task.

Validation: all 273 tests pass. Browser checks verified native dragging into the composer and onto a board stage, follow-up preservation and Undo, readable History context, long-paste cards, missing-key draft preservation, and the 390px phone layout. Task completion now saves immediately, independently of its decorative animation. Live AI responses still require the user's configured provider key and were not simulated. Test-only local records and generated documents are excluded from publication.

## Science notation, Time Analysis and Mistake Book — 29 October 2026

Shared question/solution rendering now supports explicit \(…\) and \[...\] math delimiters alongside dollar math, vectors, fractions, matrices/aligned equations, mhchem \ce reactions/charges, \pu units and explicit text scripts. Literal code remains literal, raw HTML is not enabled, and stored source is unchanged. Scientific notation is displayed consistently in the CBT workspace, solutions, chat and Mistake Book.

PDF import and the material reader share text-layer layout reconstruction. Smaller baseline-shifted adjacent glyphs support conservative super/subscript preservation; column ordering and review remain available. Ambiguous fractions or unsupported glyphs are retained for checking against the original. Scanned PDFs require OCR; no answer keys, formulas, diagrams or missing text are guessed.

Time Analysis adds subject-tabbed Time Breakdown, outcome-tabbed interval tables, and a larger animated line chart. Imported cohort rows use real supplied records, tie-inclusive score groups and stated coverage counts. Missing question detail/timestamps remains unavailable. Attempt Analysis now shows both question-count and measured-time charts. Chart preparation prevents a full-data flash before the scroll entrance; reduced-motion and print views retain data.

Mistake Book follows the supplied obsidian/violet glass brief with one header CTA, compact metrics, category proportions, search and filters, a two-column question grid, original-image zoom, recall/reveal controls and re-attempt scheduling. Optional 1–5 self-rated mastery persists separately from difficulty and scheduled review status. Native date input responds to both input and change events. On phones the review banner stacks its action below readable copy.

The archive effect now enters gently, holds the saved card briefly, feeds the paper at a controlled pace and fades out after the falling strips. Completion and History persistence remain immediate and independent of the visual.

Validation: 295 tests, TypeScript and production build pass. Actual chemistry PDF and LaTeX independently retain all 30 questions, four options each, all 30 supplied keys and explanations, with matching answer indices. Local browser checks covered a manually answered source-paper attempt, visible interval graph, dark/light result surfaces, science expressions with no KaTeX errors, original paper-image zoom, Mistake Book search/keyboard shortcut, mastery keyboard/reload persistence, recall, corrected scheduling and 390px layout/overflow. Test harnesses, recorded verification responses and source documents remain excluded from publication. Browser download-event automation was unavailable; no successful download verification is claimed.


## MathJax and MathML in CBT

Question stems, answer options and supplied explanations can contain TeX mathematics or complete Presentation MathML `<math>…</math>` fragments. The importer keeps those fragments opaque while detecting numbered questions, choices, keys and solutions, so labels or percent signs inside MathML cannot split a paper or alter its answer key. Existing `\ce{…}` chemistry source stays intact. Paper JSON preserves the same source strings and canonical answer indices; math rendering does not calculate a correct answer or change grading.

Paste MathML into the existing question editor or numbered-text/LaTeX source. You may also load a UTF-8 `.mml` or `.mathml` equation snippet, up to 1 MB, into editable source. A snippet is an equation, not a question paper: add your real numbered stem, choices and supplied key before parsing. An isolated equation produces no invented question or answer. `.tex` and `.latex` remain supported alongside text-based PDFs.

MathML snippet files are validated as a bounded Presentation MathML root. General `.xml`/HTML files, XML declarations, DTDs, external entities, executable content, event/URL/style attributes and unsupported markup are rejected. Imported or pasted math is rendered through the shared safe MathJax/MathML path; TeX is not compiled and external files are not loaded. Conversion still requires question review, verified keys, existing workspace subjects and the paper’s fixed marking scheme.

Focused parser regressions cover MathML in stems/options/solutions, nested labels and key-like text inside math, mixed chemistry and TeX annotations, JSON round trips and canonical grading, safe snippet uploads, and incomplete or unsafe sources. No question bank or academic activity is seeded.

The shared renderer uses locally bundled MathJax 4.1.3 with TeX, AMS, mhchem and Presentation MathML input. Its SVG output follows the existing Verdant theme and includes accessible MathML. The engine loads on demand without a CDN or API key. Unsupported or malformed formulas retain a readable source fallback. Inline and display equations preserve their layout, and wide display equations scroll inside their card on phones.

Validation: all 319 tests across 30 files, TypeScript and the production build pass. Browser checks covered actual supplied chemistry questions in the live CBT workspace, MathML answer selection and navigation, light/dark rendering, unchanged-source rerenders during timer updates, accessible formula labels, literal code, malformed-source fallbacks and contained overflow at a 390px phone viewport. Verification used in-memory attempts and did not create study records. The locally bundled SVG font ranges produce a large lazy-loaded math chunk; the engine is fetched only when mathematics is rendered.

## Calendar drag scheduling and resize handles — 30 October 2026

Task lists inset completion controls and subject badges by 18px on desktop and 12px on phones. Calendar clock views show hour, half-hour and quarter-hour divisions. Drag existing blocks across dates/times, or drag undated and Any time work from the collapsible work tray onto a slot. Moving retains the task's planned duration. Pull the top or bottom grip to adjust one edge; focused grips also support the arrow keys. Scheduling snaps to 15-minute positions and shows a live range. Escape cancels a gesture; releasing a move outside the calendar also cancels it. External drags wait briefly at an edge before scrolling so crossing into the grid does not shift the intended time.

The same saved task is updated through the workspace store; no duplicate calendar event or extra task is created. Date, time, duration and subject changes synchronize with List, Board and task editing. Undo restores schedule fields only while they still match that operation. Actual elapsed study time, completion and History are unaffected by planned-duration edits. Completed tasks remain read-only until reopened. Date-only tasks can move onto the clock; horizontal multi-day resizing is not offered because the task model stores a single due date.

Validation: all 329 tests across 31 files, TypeScript and the production build pass. Browser checks used an isolated memory-only store with the task titles shown in the user’s screenshot. They verified exact-slot external scheduling with no unintended scroll, preserved 25-minute plans, native cross-day moves, native top/bottom resizing, keyboard resizing and focus, off-grid cancellation, Undo, synchronized List/Board fields, all four scheduled tasks in Month view, both themes and a 390px phone frame without page overflow. Clicking a slot prefilled the real task form with its date, start time and 15-minute duration; the draft was discarded. Verification fixtures and the video are excluded from publication, and no saved study records were created.


## Solid calendar and folder material previews — 2 November 2026

Calendar tasks now use solid subject fills and readable labels in both themes. The visible Planning / Day / Week switch and the existing calendar menu control the same view; Planning is the agenda. Other calendar views and scheduling actions remain available.

Resource Vault folder hover/focus previews show up to two real saved materials, including materials in descendant folders. Empty folders animate without a fake Open folder preview. Click or press Enter on the illustration to enter the folder, or select a material preview to open that saved resource. Previews retain full accessible titles, restore focus after selection, respect reduced motion and stay within the phone viewport. No academic content or workspace records are seeded.

Validation: all 331 tests across 32 files, TypeScript and production build pass. Browser checks confirmed opaque task fills and readable labels in both themes, Planning/Day/Week switching and menu synchronization, direct empty/populated folder entry, trigger-to-preview keyboard order, saved paper and nested solution resource callbacks, visible return focus, and contained previews/tabs in a 390px phone frame. Checks used only the ignored memory-only harness and the actual supplied chemistry files; no study records or demonstration content were published.

## Dedicated Calendar and Focus pages — 3 November 2026

Calendar and Focus are available directly in the main navigation. Calendar fills the main workspace and retains real-task scheduling, resizing, Planning/Day/Week views, filters and its collapsible work tray. List and Board remain in task views. The standalone Focus page uses the existing 25/45/60-minute timer, which continues across navigation. The dashboard no longer has an inline Pomodoro, review or mastery rail.

Workspace settings now use 24px internal padding, 20px section spacing and a 12px gap between action buttons. Mistake cards remove the brain graphic and due/mastery footer while retaining recall and scheduling. Chat draft task attachments are compact removable chips; full snapshot sharing and task-shelf board actions continue to use the same real saved records.

Validation: all 332 tests across 32 files pass. TypeScript and the production build pass. Browser checks verified full-page Calendar sizing, mobile navigation and 390px containment, timer continuity across Calendar/Focus navigation, modal spacing, task-chip attachment/removal, retained message drafts and 12px mobile composer insets. Checks used the ignored memory-only harness with supplied task titles and no published sample records.
