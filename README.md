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
- Focus sessions, assessment history, and mastery analytics reflect your activity. Empty history shows zero rather than invented progress.

## Storage

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

Create papers manually, import validated paper JSON, or assemble existing practice questions from your Resource Vault. Single correct, exact-set multiple correct, and numeric answers support per-question marks, penalties, target time, difficulty, and explanations. Paper snapshots keep historical results intact when you edit a paper. Shared-paper imports preserve canonical question IDs; explicit cloning creates a separate paper.

An absolute deadline, saved responses, review flags, per-question times, answer changes, and events support resuming after reload and automatic expiry. The report includes subject/chapter/difficulty scores, quality of time, final-answer time intervals, attempt evaluation, subject movement, manual error labels, correction scenarios, a chronological question journey, painful questions, answer-key review, and Mistake Book capture. Submitted attempts also appear in the main assessment history.

Comparative analysis accepts actual cohort JSON/CSV or pasted result records. Export/share a result to compare the same paper and revision. Rank uses competition ranking, and empirical percentile uses lower scores plus half of tied scores divided by the imported cohort size. Official exam percentile prediction is not supplied. Full question-level data unlocks difficulty and hourly comparisons; summary-only imports show only supported metrics. No cohort, ranks, or activity are fabricated.

Testing data is separately saved under verdant.testing.v1 in localStorage. Use Export test workspace for a paper/attempt/cohort backup, and Import JSON to merge it back. The general Workspace settings export covers the original study records; uploaded file binaries remain separate.

AI is not required for the test engine or analysis. Optional future AI could draft questions, explanations, or study suggestions from material, subject to checking their answers. A live multi-user leaderboard and cross-device synchronization would require a shared authenticated service and actual participant results.

Botanical Calm adds shared navigation/tab indicators, route cascades, bounded spring feedback, 800ms mastery progress, 400ms counters, rolling timer digits, a breathing active focus card, subtle leaf motion, sage secondary actions, chart gridlines, clearer surfaces, and reduced-motion alternatives.

Validation for this upgrade: 32 unit tests passed, including scoring, numeric tolerance, exact-set marking, immutable snapshots, timing/expiry, imported-cohort ties and validation. Browser QA covered paper authoring, question types, answer/review/clear, reload/resume, submission, solutions, mistake capture, and detailed comparison using an actual recorded result. Browser download-event automation was unavailable; JSON export uses standard browser Blob downloads, and a visible/shareable JSON result is also provided.
