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
- Open a saved material to search its actual text, jump between PDF pages or document sections, and download the original. Select passages into Quick capture. Read-aloud uses installed device voices and supports pause, resume, stop, and speed selection. Images and scanned PDFs need a text layer for search and speech; original PDFs remain viewable. DOCX text view does not preserve full layout, equations, or images.
- Attach your own practice questions to any resource. Folder assessments collect those questions. Quiz and flashcard modes record results, calculate mastery, and send missed questions to the Mistake Book. No questions are generated or fabricated.
- Focus sessions, assessment history, and mastery analytics reflect your activity. Empty history shows zero rather than invented progress.

## Storage

Study records persist in localStorage. Original uploaded materials, extracted text, and screenshots persist in IndexedDB. Document extraction runs locally and speech uses local device voices. Everything remains in the browser on the current device; there is no cross-device sync or server database. Reminders are delivered while the app is open. Workspace settings export study records as JSON; uploaded files are not included.

An upgrade migration removes the first development version's fixed example records while preserving user-created records and unlinking references to removed examples.

## Motion and accessibility

GSAP, `@gsap/react`, Flip, and Draggable are registered explicitly. Scoped `useGSAP` contexts and `contextSafe` callbacks cover page entrances, navigation, cards, form controls, modal transitions, task completion, recall reveal, quiz flips, counters, and progress bars. The app respects reduced-motion preferences. Dialogs trap focus, support Escape, and restore focus. Forms are labeled and priority controls have accessible names.

## Validation

Unit tests cover natural language dates, recurrence parsing, an empty initial state, demo-data migration, nested mastery calculations, review intervals, linked task identity, file validation, literal search across pages, and speech chunk boundaries. TypeScript and the Vite production build provide additional checks. Browser checks cover the connected task, recall, resource, and assessment flows at desktop and mobile widths.
