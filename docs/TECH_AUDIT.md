# FRAKTUM Literature v0.17.0 — технический аудит

**Статус:** audit only, 2026-09-29. Этот документ фиксирует текущее поведение и
план миграции; код приложения на этом этапе намеренно не изменялся.

## Объём и методика

Проверены все исходники и точки запуска (`index.html`, `src/*.js`, CSS,
`server.mjs`, `build.mjs`), конфигурация npm, документация и статический `dist`.
Проведены статический поиск обработчиков/`data-action`, опасных DOM API,
хранилищ, сетевых запросов, таймеров и pointer-событий, а также ручная трассировка
login → home → create/studio → preview/reader и cloud save/load.

Ограничения аудита: в репозитории нет тестового раннера и тестов, а вход в UI
зависит от реального Supabase OTP. Поэтому runtime/e2e-проверка с
аутентифицированным пользователем до Phase 0 невоспроизводима локально. Схема,
миграции и RLS-политики Supabase также отсутствуют в репозитории: корректность
RLS можно подтвердить только отдельной проверкой backend-конфигурации.

## Краткий итог

- Основной риск — **stored XSS**: HTML книги из локального и облачного состояния
  без sanitization возвращается в `innerHTML`.
- Изображения Book Studio превращаются в data URL и попадают одновременно в
  `mediaLibrary`, canvas JSON, `localStorage` и `lit_work_versions.content`.
- «Autosave» сохраняет только в `localStorage`; cloud save запускается вручную,
  не имеет revision/conflict protocol и может перезаписать более новую версию.
- Startup literature sync загружает до 200 works, **все** их versions/content,
  reviews и reactions. Discovery не отделён от editor/reader payload.
- `app.js` (1278 строк) соединяет router, auth, editor, persistence, WebRTC,
  polling и DOM lifecycle через изменяемые globals.
- Зарегистрированные статические `data-action` имеют обработчики; явного вызова
  несуществующей функции в community UI не обнаружено. Но этот контракт ничем
  не проверяется, а обычные кнопки-заглушки остаются без действий.
- Единственный npm script, кроме запуска, — копирующий `build`; lint,
  typecheck, unit и e2e отсутствуют. Успешный build не проверяет импорт,
  синтаксис браузерного графа, handlers или runtime.

## Critical

### C-01. Stored XSS через HTML документа и canvas text

- **Файлы / функции:** `src/pages.js` — `renderCanvasObject`,
  `renderPageComposition`, `readerPage`, `createPage`; `src/app.js` —
  `cleanEditorHtml`, `cleanCanvasTextHtml`, `serializeCanvasObject`,
  `syncDocumentPages`; `src/state.js` — `normalizeWork`/`canvasForLegacyPage`;
  `src/cloud.js` — `fetchCloudLiterature`/`saveCloudWork`.
- **Проблема:** `documentPages[].html` и `bookPages[].canvas.objects[].html`
  сохраняются как произвольный HTML и позднее вставляются в template/`innerHTML`
  без sanitizer. Cloud content и восстановленный `localStorage` считаются
  доверенными. Атрибуты событий, опасные элементы/URL и SVG payload могут
  пережить round trip.
- **Почему плохо:** это stored XSS в контексте origin приложения; возможны кража
  Supabase access/refresh token из `localStorage`, действия от имени пользователя
  и заражение опубликованной книги.
- **Как исправлять:** сначала добавить regression fixtures, затем ввести
  versioned document schema и allow-list sanitizer на всех legacy ingress;
  renderer строит DOM из document model и никогда не принимает trusted HTML.
  Добавить CSP как второй рубеж, URL policy (`https`, storage/blob только) и
  удалить inline event-capable markup из сериализации.

### C-02. Binary/base64 media встроены в состояние и cloud JSON

- **Файлы / функции:** `src/app.js` — `optimizeImageForStudio`,
  `handleMediaUpload`, `handleCanvasImageDrop`, `handleCanvasImagePaste`,
  `addCanvasImageObject`, `setPageBackgroundImage`, `collectEditor`;
  `src/state.js` — `save`; `src/cloud.js` — `saveCloudWork`.
- **Проблема:** upload/drop/paste читает изображение как data URL (SVG — без
  rasterization), сохраняет `src` в media library и в каждый объект/фон, после
  чего весь work сериализуется и локально, и в `lit_work_versions.content`.
- **Почему плохо:** быстро достигается quota `localStorage`, синхронная
  `JSON.stringify` блокирует UI, payload Supabase разрастается и дублируется;
  SVG сохраняет активное содержимое. Ошибка quota сейчас вылетает из `save()` и
  может оборвать пользовательское действие.
- **Как исправлять:** asset service: MIME/magic-byte/size validation → safe
  raster decode и optional resize → `lit-work-assets` → `lit_assets` metadata →
  только `assetId/storagePath` в document. Мигратор должен загрузить legacy data
  URLs один раз, дедуплицировать их и не удалять локальную копию до подтверждения
  cloud commit. SVG запретить либо безопасно rasterize в worker.

### C-03. Cloud save допускает lost update и ложный статус «сохранено»

- **Файлы / функции:** `src/app.js` — `scheduleStudioAutosave`, `saveWork`;
  `src/cloud.js` — `saveCloudWork`.
- **Проблема:** autosave вызывает только `state.save()`; Supabase обновляется по
  ручной кнопке. PATCH/insert не сравнивают `revision`/`updated_at`; параллельные
  вкладки и устройства используют last-write-wins. Сетевой save не имеет очереди
  снимков, cancellation/version guard и полноценной state machine. Ошибка cloud
  не мешает сохранённому локальному mutation выглядеть актуальным.
- **Почему плохо:** пользователь может незаметно потерять работу либо
  перезаписать новую cloud revision старой.
- **Как исправлять:** repository с immutable snapshot, dirty revision,
  single-flight/debounced (1–3 s) queue и статусами Unsaved/Saving/Saved/Offline/
  Error/Conflict. UPDATE должен включать ожидаемый revision; ноль затронутых строк
  означает Conflict. Publication — отдельная команда.

## High

### H-01. Discovery загружает полный corpus и имеет N×M обработку

- **Файлы / функции:** `src/cloud.js` — `fetchCloudLiterature`.
- **Проблема:** startup запрашивает `lit_works?select=*` (limit 200), затем
  `lit_work_versions?select=*` без limit, то есть полный `content` всех версий,
  плюс все reviews/reactions. В циклах для каждого work/review выполняется
  повторный `filter` больших массивов.
- **Почему плохо:** память/сеть и CPU растут вместе с каталогом; приватный draft
  content избыточно запрашивается (доступность зависит от внешнего RLS).
- **Как исправлять:** отдельные typed queries: paginated discovery projection,
  work/version metadata и ленивый content by version id. Агрегаты рейтинга — view/
  RPC; maps/grouping вместо повторных filters; cursor pagination и abortable
  requests.

### H-02. Полный rerender уничтожает DOM и transient editor state

- **Файлы / функции:** `src/app.js` — `render`, `notify`, `go`, многие action
  handlers; `src/pages.js` — все page factories.
- **Проблема:** `app.innerHTML = ...` пересоздаёт экран. Selection/range хранится
  как глобальная ссылка на старые DOM nodes; focus, IME composition, scroll,
  pointer capture и несинхронизированный contenteditable могут исчезнуть.
- **Почему плохо:** потеря ввода/selection и трудно воспроизводимые regression
  bugs, особенно при polling, toast, modal и mobile keyboard.
- **Как исправлять:** изолировать editor root с собственным store и стабильным
  lifecycle; shell/router не должен remount editor без навигации. Selection
  хранить координатами structured document, а не DOM `Range`.

### H-03. Нет undo/redo и transform transaction

- **Файлы / функции:** `src/app.js` — canvas add/delete/duplicate/layer/property,
  `startCanvasDrag`, `startCanvasResize`, `startCanvasRotate`.
- **Проблема:** операции напрямую мутируют DOM/state; браузерный undo применим
  только к части contenteditable. Истории объектов нет. Gesture пишет geometry на
  каждом move, но не оформляет pointerdown→pointerup как команду.
- **Почему плохо:** destructive edits необратимы; модель и DOM легко расходятся.
- **Как исправлять:** command/history manager с before/after snapshots или
  invertible operations, transaction на жест, coalescing text/style edits,
  bounded history и Ctrl/Cmd+Z / Shift+Z.

### H-04. Mutable singleton state смешивает production и demo

- **Файлы / функции:** `src/state.js` — module-level `state`, `initialState`,
  `update`, `save`; `src/app.js` — module globals; `src/data.js` — seeds;
  `refreshCloudLiterature`, `refreshCloudFeed`.
- **Проблема:** state импортирует seed всегда; cloud refresh объединяет seed/local
  и cloud collections. UI/editor/auth/RTC state мутируется из callbacks и
  timers без ownership. `update()` не обеспечивает immutability или schema
  validation.
- **Почему плохо:** demo записи попадают в production UX, stale async responses
  способны перезаписать более новый state, тесты не изолируются.
- **Как исправлять:** runtime environment flag и отдельный dev seed adapter;
  production store стартует пустым. Разделить domain/editor/session/UI stores,
  typed actions и repositories; async responses проверяют request/session id.

### H-05. Upload validation и storage access model недостаточны

- **Файлы / функции:** `src/cloud.js` — `uploadPublicMedia`,
  `createCloudPost`; `src/app.js` — `handleMediaUpload`,
  `optimizeImageForStudio`.
- **Проблема:** доверие к browser-provided `file.type`, отсутствие size/dimension/
  signature checks; helper всегда строит public URL. Client-side accept не
  является проверкой. Частично загруженный post не откатывается.
- **Почему плохо:** storage abuse, oversized/decompression payload, active SVG и
  orphan assets; приватные черновики нельзя безопасно обслужить public URL.
- **Как исправлять:** общий asset policy + server/storage policies, allow-list
  raster MIME и magic bytes, лимиты bytes/pixels, generated name, cleanup job;
  private draft bucket/signed URL при необходимости. Проверить RLS тестами.

### H-06. Cloud bootstrap/polling подвержены race и лишней нагрузке

- **Файлы / функции:** `src/app.js` — `refreshCloudFeed`,
  `refreshCloudLiterature`, `refreshCloudChats`, `startCloudPolling`,
  `refreshNotifications`; `src/cloud.js` — `ensureSession`, `rest`.
- **Проблема:** polling каждые 1.5/1.8/7 s может запускать новый async request до
  завершения прошлого; нет AbortController, sequence guard, backoff или visibility
  pause. Параллельные callers могут одновременно refresh одного expired token.
- **Почему плохо:** out-of-order response возвращает устаревшие данные,
  дублируется traffic, rate-limit и battery impact на mobile.
- **Как исправлять:** Supabase Realtime там, где уместно; иначе single-flight,
  abort/sequence tokens, exponential backoff, visibility/online awareness и
  централизованный refresh mutex.

### H-07. Ссылки и resource URLs не имеют безопасной policy

- **Файлы / функции:** `src/app.js` — `editor-link`, `execEditorCommand`;
  `src/pages.js` — image/background rendering.
- **Проблема:** prompt принимает произвольную схему для `createLink`; image `src`
  из document model лишь HTML-escaped, но не проверяется по protocol/origin.
- **Почему плохо:** `javascript:`/опасные navigation URLs и tracking/resource
  injection могут попасть в сохранённый контент.
- **Как исправлять:** URL parser с allow-list protocol/origin, link renderer с
  безопасными `rel`, asset resolver только из metadata/storage path.

## Medium

### M-01. Event lifecycle не формализован

- **Файлы / функции:** `src/app.js` — `attachSpecial`,
  `attachCanvasInteractions`, `attachMediaInteractions`, `attachBookSwipe`.
- **Проблема:** listeners навешиваются императивно после каждого render. DOM
  replacement обычно удаляет nodes, а document keydown защищён флагом в
  `dataset`; lifecycle зависит от неявных условий. Selection globals сохраняют
  detached nodes. Pointer cleanup существует только при ожидаемом up/cancel.
- **Почему плохо:** сложно доказать отсутствие дублей/leaks; unmount во время
  gesture или исключение оставляет stale state.
- **Как исправлять:** scoped controllers с `AbortController.signal`, явные
  mount/unmount и tests на повторный mount; pointer transaction cleanup в
  `finally`/abort.

### M-02. Mobile canvas поддержан лишь частично

- **Файлы / функции:** `src/app.js` — pointer transforms/book swipe;
  `src/style.css` — responsive editor rules.
- **Проблема:** нет pinch zoom/pan/viewport model, safe-area-aware context bar,
  multi-touch arbitration или keyboard/visualViewport handling. Drag clamp не
  разрешает частичный выход объекта за страницу. Swipe хранит один глобальный X.
- **Почему плохо:** page scroll конфликтует с transform, handles малы, экранная
  клавиатура ломает viewport; несколько pointers дают неверный жест.
- **Как исправлять:** input controller по pointerId, gesture state machine,
  `touch-action` только на активной поверхности, zoom/pan transform, mobile
  toolbar/handles и отдельная device test matrix.

### M-03. Text wrap — визуальный DOM proxy, не layout model

- **Файлы / функции:** `src/app.js` — `attachCanvasWrapProxies`,
  `exclusionGradient`; `src/pages.js` — page composition styles/markup.
- **Проблема:** wrapping вычисляется из текущих DOM boxes и float/shape-outside
  proxy; результат не является частью deterministic composition model и плохо
  учитывает rotation.
- **Почему плохо:** editor и reader могут отрисовать разные переносы; layout
  зависит от timing/fonts/viewport.
- **Как исправлять:** layout service с rectangular exclusion zones в page units,
  пересчёт при geometry/font change и единый renderer editor/reader.

### M-04. Reader turn — timeout вместо управляемого перехода

- **Файлы / функции:** `src/app.js` — `animateBookTurn`, `attachBookSwipe`.
- **Проблема:** CSS class + 360 ms timeout затем полный rerender; progress
  обновляется до подтверждённого завершения. Нет continuous progress, cancel,
  front/back surface или interruption handling.
- **Почему плохо:** быстрые/прерванные жесты и background throttling рассинхронят
  UI/progress.
- **Как исправлять:** reader state machine (idle/dragging/settling/cancelled),
  animation driven by normalized progress and completion event; использовать тот
  же page composition renderer.

### M-05. localStorage schema, quota и multi-tab не обработаны

- **Файлы / функции:** `src/state.js` — `KEY`, load block, `save`.
- **Проблема:** единый blob без явной schema version/migrations/checksum; parse
  failure молча возвращает seed, `setItem` без error handling, нет `storage`
  coordination. Почти всё приложение синхронно сериализуется при каждом save.
- **Почему плохо:** повреждение/quota означает потерю черновика; вкладки молча
  перетирают друг друга; main-thread jank.
- **Как исправлять:** versioned small metadata, IndexedDB для offline draft
  snapshots, quota/error telemetry, atomic migration/backup и BroadcastChannel.

### M-06. Cloud save не атомарен между work и version

- **Файлы / функции:** `src/cloud.js` — `saveCloudWork`.
- **Проблема:** work row и version row создаются/обновляются отдельными REST
  запросами. Ошибка между ними оставляет частичный результат; create path может
  породить orphan/incomplete work.
- **Почему плохо:** карточка и содержимое расходятся.
- **Как исправлять:** transactional RPC для draft create/update/publish либо
  строгая compensating cleanup; idempotency key и integration tests.

### M-07. Rich-text API устарел и ошибки скрываются

- **Файлы / функции:** `src/app.js` — `execEditorCommand`, `applyFontSize`,
  `applyEditorTool`, selection helpers.
- **Проблема:** `document.execCommand` deprecated; broad empty catches скрывают
  failure. Browser-generated HTML непредсказуем, range инвалидируется rerender.
- **Почему плохо:** разные browsers сериализуют разные документы и теряют style/
  selection.
- **Как исправлять:** после characterization tests перейти на TipTap/ProseMirror
  JSON с schema, commands и controlled selection; legacy importer санитизирует
  один раз.

### M-08. Нет quality gates; build лишь копирует файлы

- **Файлы / функции:** `package.json`; `build.mjs`.
- **Проблема:** отсутствуют ESLint, TypeScript, Vitest, Playwright; build не
  анализирует модульный граф и просто копирует `index.html`, `src`, `public`.
- **Почему плохо:** undefined symbols, unsafe handlers и browser regressions
  обнаруживаются пользователями.
- **Как исправлять:** Phase 0 foundation и CI с обязательными scripts; JS
  сначала typecheck через `checkJs`, новые editor modules — TypeScript.

### M-09. Static server hardening отсутствует

- **Файлы / функции:** `server.mjs` — request handler; deployment headers.
- **Проблема:** нет CSP и security headers/cache policy; ошибки stream/stat не
  обрабатываются. Проверка пути опирается на строковый `startsWith`.
- **Почему плохо:** XSS impact выше, caching непредсказуем; prefix/path edge cases
  и I/O errors дают ненадёжный ответ.
- **Как исправлять:** deploy-level CSP/headers, безопасный `path.resolve` +
  relative containment, 404/500 handling и immutable caching fingerprinted
  assets.

## Low

### L-01. Dead/placeholder UI не отличим от рабочих controls

- **Файлы / функции:** `src/pages.js` — tabs Communities, кнопки Portfolio и
  Journal; `src/app.js` — handler branches `reset-demo`, `report-review` и др.
- **Проблема:** часть обычных `<button>` не имеет action, а несколько handler
  branches не имеют статического UI. Это не ReferenceError, но выглядит как
  сломанная функция и затрудняет аудит достижимости.
- **Как исправлять:** disabled + явный TODO/roadmap для недоступного control либо
  удалить его; registry генерирует и markup, и dispatch contract.

### L-02. Дублирование двух editor paths

- **Файлы / функции:** `src/app.js` — embedded-media и free-canvas paths;
  `src/pages.js` — document/editor/preview/reader renderers.
- **Проблема:** upload, selection, resize, serialization и rendering реализованы
  отдельными ветками, а legacy migration добавляет третью форму данных.
- **Почему плохо:** fixes расходятся и увеличивают regression surface.
- **Как исправлять:** единая composition schema/assets service; document mode и
  book canvas используют общие primitives, сохраняя разные layout policies.

### L-03. Нестабильные идентификаторы на `Date.now()/Math.random()`

- **Файлы / функции:** `src/app.js` — page/object creation; `src/state.js` —
  normalization defaults.
- **Проблема:** IDs генерируются ad hoc и иногда во время normalization.
- **Почему плохо:** возможны collision и нестабильный diff/migration.
- **Как исправлять:** `crypto.randomUUID()` и стабильные IDs только при explicit
  migration/create.

## Undefined handlers и dead-code результат

Статическое сопоставление литеральных `data-action` со всеми ветками центрального
click dispatcher не выявило отсутствующего action, включая
`create-community`, `join-community` и `open-community`. Это не доказывает
runtime correctness: action contract не типизирован, динамические значения и
forms не покрыты, а импорт модуля невозможно безопасно выполнить без DOM.

Наиболее заметный «функциональный dead UI»: tabs на community detail, Portfolio
и Journal «Читать» — кликабельные кнопки без поведения. Потенциально лишние
dispatcher branches (`reset-demo`, `report-review`, legacy aliases) следует
подтвердить coverage, а не удалять по одному regex-поиску.

## Recommended architecture

```text
src/
  app/                 # bootstrap, router, shell; без editor internals
  domain/              # Work/Version/Asset schemas и migrations
  data/
    supabase/          # typed repositories, auth, pagination, RLS boundary
    local/             # IndexedDB optimistic drafts
    demo/              # включается только development flag
  editor/
    EditorRoot.ts
    store/
    canvas/            # Page, objects, selection, transforms, input controller
    rich-text/         # TipTap schema + legacy importer
    history/HistoryManager.ts
    layout/            # snap/guides и rectangular exclusions
    assets/            # validation, upload, URL resolution, thumbnail
    persistence/       # autosave queue + revision conflict state machine
    serialization/     # versioned schema + validation
  composition/         # безопасный общий page renderer
  reader/              # turn state machine поверх composition
  security/            # sanitizer and URL policy
```

Ключевой принцип: canonical state — versioned typed document, не DOM. DOM не
сериализуется целиком и не служит transport между editor и reader. React +
TypeScript допустим для изолированного editor island; миграция shell не требуется
в этом PR. Supabase repositories возвращают DTO projections, а не `select=*`.

### Целевая модель persistence

1. Команда меняет editor store и увеличивает local revision.
2. Snapshot атомарно пишется в IndexedDB (без binary).
3. Debounced queue отправляет ожидаемую server revision.
4. Сервер транзакционно фиксирует version JSON и возвращает новую revision.
5. Assets загружаются отдельно до ссылки из snapshot; orphan cleanup асинхронен.
6. Publish создаёт immutable published revision и никогда не является autosave.

## Migration phases

### Phase 0 — guardrails, без изменения поведения

- Добавить корневой `AGENTS.md` с согласованными правилами.
- ESLint, TypeScript `checkJs`, Vitest/jsdom и Playwright; scripts `lint`,
  `typecheck`, `test`, `test:e2e`, сохранить `build`.
- Characterization smoke tests и handler-contract test; Supabase API mock/fixture.
- Зафиксировать known failures отдельно, не маскировать `skip` без TODO/issue.

### Phase 1 — runtime/security blockers

- Удалить/disable dead buttons, registry всех actions/forms.
- Санитизировать legacy content/URL на ingress и render boundary; CSP.
- Сделать `save()` quota-safe, вывести честный статус ошибки.

### Phase 2 — изоляция Book Studio

- Вынести schema/serialization и editor island из `app.js`, не меняя UX.
- Адаптер читает старую модель; новые операции идут через typed store.
- Единый page composition renderer подключить в preview/reader.

### Phase 3 — Asset Storage

- Asset policy/uploader/repository, `lit_assets`, private/public URL policy.
- Миграция data URL с resumable journal; thumbnail/cover pipeline.
- После telemetry-подтверждения запретить новые binary JSON и очистить legacy.

### Phase 4 — structured rich text

- TipTap/ProseMirror schema, safe legacy HTML importer, JSON renderer.
- Characterization fixtures для текущих bold/list/link/alignment styles.

### Phase 5 — canvas/history/layout

- Geometry/input controllers, transform transactions, HistoryManager.
- Затем rotation/layers/copy, selection; multi-select/group только после базовой
  совместимости. Snap/guides и rectangular exclusion layout.

### Phase 6 — autosave/cloud persistence

- IndexedDB optimistic draft, debounced queue, revision RPC, conflict UX,
  offline/backoff. Publish отдельно.

### Phase 7 — preview/reader

- Общий composition renderer; turn state machine с progress/cancel/complete.
- Reading progress sync idempotent/debounced.

### Phase 8 — mobile editor

- Pinch zoom/pan, touch transforms, safe areas/VisualViewport/context toolbar.
- Отдельные mobile Playwright projects и real-device checklist.

### Phase 9 — performance/security cleanup

- Paginated projections/lazy content, Realtime/single-flight, demo adapter.
- RLS/storage tests, CSP tightening, accessibility/performance budgets, удалить
  legacy только после migration metrics.

Каждая phase — отдельный небольшой commit/PR, полный quality gate и обновление
changelog. Большой rewrite до зелёной Phase 0 запрещён.

## Files to change (план, не текущий patch)

| Phase | Existing files | New files/directories |
|---|---|---|
| 0 | `package.json`, `package-lock.json`, `TESTING.md` | `AGENTS.md`, ESLint/TS/Vitest/Playwright configs, `tests/` |
| 1 | `src/app.js`, `src/pages.js`, `server.mjs`, deploy config | `src/security/`, action registry tests |
| 2 | `src/app.js`, `src/pages.js`, `src/state.js`, `src/style.css` | `src/editor/`, `src/domain/`, `src/composition/` |
| 3 | `src/cloud.js`, editor serialization | `src/editor/assets/`, Supabase migration/RLS files |
| 4 | editor legacy HTML path | `src/editor/rich-text/` |
| 5 | legacy canvas functions/styles | `src/editor/canvas/`, `history/`, `layout/` |
| 6 | `src/cloud.js`, `src/state.js` | persistence repository/queue and RPC migration |
| 7 | reader functions in `app.js/pages.js` | `src/reader/` |
| 8 | editor CSS/input | mobile fixtures/projects |
| 9 | cloud queries, seeds, server/deploy headers | perf/security suites, demo adapter |

## Risky areas и стратегия миграции

1. **Legacy user drafts:** never destructive; golden fixtures, versioned importer,
   backup/export и dual-read до telemetry подтверждения.
2. **Base64 migration:** upload может оборваться; journal по asset hash,
   idempotency, retry и cloud reference commit только после успешного upload.
3. **Published rendering:** snapshot visual regression editor ↔ reader до смены
   renderer; fonts и page units фиксируются.
4. **RLS:** frontend не является security boundary. Проверить anon/owner/other/
   admin matrix на локальном Supabase или dedicated test project.
5. **Concurrent autosave:** fake timers недостаточны; integration test двух
   clients на одной revision и network reorder/offline.
6. **Rich text:** HTML→JSON может терять formatting. Corpus fixtures и fallback
   read-only legacy renderer только с sanitizer.
7. **Mobile gestures:** browser emulation не заменяет iOS Safari/Android Chrome;
   после automated matrix нужен real-device pass.
8. **Auth dependency:** e2e не должен использовать production OTP; test-only
   seeded account/session через отдельный backend environment, без service-role
   key во frontend/browser bundle.

## Тестовый план

### Static/unit

- Action registry: каждый `data-action` и form id существует в registry; каждый
  registry handler достижим; community actions включены.
- Schema/serialization round-trip, malformed payload, legacy migrations.
- Sanitizer XSS corpus: script/event attrs, SVG, `javascript:`/`data:` URLs.
- Asset validation: MIME/signature/size/pixels; запрет binary/data URL в document.
- History transaction: create/delete/move/resize/rotate/style/text undo/redo;
  один drag = одна запись.
- Autosave state machine с fake timers, offline/error/retry/conflict и stale
  response order.
- Layout rectangular exclusions/snap geometry в page units.

### Playwright desktop smoke

1. login screen renders;
2. authenticated home renders;
3. Book Studio opens;
4. create-work flow opens;
5. text object is added;
6. fixture/storage-backed image object is added;
7. object selection works;
8. drag commits expected geometry;
9. resize commits expected geometry;
10. delete + undo/redo work;
11. Book Preview opens and matches composition;
12. save/autosave does not throw and status reaches Saved;
13. reader opens same composition;
14. major navigation emits no `pageerror`, `ReferenceError`, console error or
    unhandled rejection;
15. community create/join/open handlers execute without undefined calls.

Дополнительно: reload persistence, two-tab conflict, large catalogue pagination,
upload failures, XSS fixtures, editor remount/selection, preview visual snapshots.

### Playwright mobile + manual devices

- iPhone/Safari-like и Android/Chrome-like viewports: touch drag/resize/rotate,
  two-pointer zoom/pan, no accidental page scroll, keyboard/VisualViewport,
  safe-area toolbar, 44px+ targets.
- Реальные iOS Safari и Android Chrome: long editing session, background/resume,
  offline/reconnect, image upload from camera/gallery.

### Cloud integration

- RLS matrix для works/versions/assets/reviews/messages и absence service role in
  bundle.
- Atomic draft save, optimistic conflict, immutable publish, signed URL expiry,
  orphan cleanup, reading-progress idempotency.
- Query assertions: discovery никогда не выбирает version `content`; limits/
  pagination обязательны.

### Quality gate каждой phase

```sh
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

До Phase 0 первые четыре команды закономерно отсутствуют; это подтверждённый
gap, а не пройденная проверка.
