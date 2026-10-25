# Отчёт по стабилизации FRAKTUM Literature

Дата: 26 октября 2026, Москва. Ветка: `codex-20261025-210012-production-stabilization`.
Draft PR: https://github.com/sonor71/DID-/pull/9.

**Production acceptance ещё не завершён.** Исправления и локальные проверки не
доказывают соответствие production-схемы, доставку настоящего OTP и звонок двух
реальных аккаунтов через внешние сети. Production и общая база не изменялись.

## 1. Причины и исправления

| Подсистема | Причина | Исправление |
| --- | --- | --- |
| Chat drawer | Drawer и toggle были отдельными fixed-элементами; несколько поколений CSS конфликтовали, mobile скрывал toggle. | Общий shell, одна движущаяся panel с drawer и прикреплённой кнопкой, неподвижный dock; transform 300 ms, reduced motion, inert/ARIA и возврат фокуса. |
| Сообщения | Отложенный refresh безусловно заменял DOM после начала ввода, старые ответы возвращали прошлый чат. | Немедленный выбор, проверка актуальности ответа и пользователя, обновление потока без замены формы; текст очищается только после подтверждения отправки. |
| Навигация | `go()` заменял весь интерфейс без общей модели перехода, history и scroll. | Native View Transition, CSS fallback 200 ms, отмена устаревших переходов, маршруты и back/forward с восстановлением scroll. |
| Async feedback | Повторные клики отправляли дубли; toast пересоздавал редактор и формы. | `withBusy`, disabled/ARIA, видимые ошибки; toast не пересоздаёт страницу. У модального окна есть доступная кнопка закрытия. |
| Share | Кнопка не имела обработчика и пост загружался только внутри первых 50 элементов ленты. | Web Share или clipboard; стабильный `/post/<uuid>`, отдельный bounded-запрос публичного поста, anonymous deep link, явные ошибки и корректная отмена. |
| Media editor | Книга использовала canvas, документ — raw figure HTML; normalization терял asset identity; fragment сохранял только текст. | Общая структурированная модель, canvas для всех типов, flow/free, границы страницы, gestures/history, metadata и Storage path; fragment сохраняет и загружает весь layout. |
| Параметры проекта | Metadata-поля не участвовали в синхронизации до промежуточного render. | Название, описание, жанры и остальные параметры синхронизируются при input/change и перед сохранением. |
| Сломанные картинки | Не было error UI; retry перехватывался drag-обработчиком и использовал тот же закэшированный ресурс. | Видимая ошибка и рабочая кнопка retry; интерактивные элементы исключены из drag. В модели остаётся канонический URL, cache-busting применяется только к отображению. |
| Сохранение | Autosave был локальным, параллельные первые записи могли создавать дубли. | Последовательная очередь облачных сохранений, подтверждённые identity/status; миграция старых embedded-медиа перед записью. При ошибке исходная локальная копия сохраняется. |
| WebRTC | TURN-модуль не импортировался, peer создавался со STUN; polling перекрывался, ICE/cursors/errors обрабатывались ненадёжно. | Явная ICE-конфигурация, TURN env, изолированный CallSession, ранний ICE queue, таймауты, статусы, очистка tracks, redacted debug/stats и conditional accept. |
| Профиль | Отсутствовала миграция production GRANT; фиксированные URL кэшировались; media pointer/cleanup и сохранение details были неатомарны. | GRANT в истории, immutable paths, rollback нового upload при ошибке, replace/remove, явный null при reload и одна транзакционная profile RPC. |
| Права | Owner RLS не запрещал менять собственные privilege fields; legacy SECURITY DEFINER мог иметь незащищённый reject/no-op путь. | Защита privilege fields, отдельный admin-checked wrapper до любых legacy side effects, scoped ACL и Storage boundaries; RLS external links привязан к владельцу work. |
| PWA | Manifest использовал прямоугольный brand 206×92 как icon `any`. | Отдельные PNG 192×192, 512×512 и Apple 180×180; размеры и MIME проверены. |
| Dev server | Сервер раздавал файлы конфигурации и HTML вместо отсутствующих JS/картинок; malformed URI мог завершить процесс. | Раздача только app/public assets, запрет dotfiles и конфигурации, 404 для отсутствующего ресурса, 400 для некорректного пути. |
| Инструменты | Lockfile не содержал quality tools; CI доустанавливал плавающие зависимости. | Node 24 pin, точные devDependencies и lockfile, `npm ci`; CI включает integration, Chromium и coturn. |

## 2. Изменённые файлы

- Приложение: `src/app.js`, `src/pages.js`, `src/cloud.js`, `src/state.js`,
  `src/ui.js`, `src/style.css`, `server.mjs`.
- Новые границы: `src/navigation/Navigation.js`, `AsyncFeedback.js`,
  `src/feed/PostLinks.js`, `src/calls/CallSession.js`.
- Editor: `AssetService.js`, `Serialization.js`, `types.ts`, новые `MediaModel.js`,
  `LegacyMediaMigration.js`, `SaveQueue.js` в `src/editor/`.
- Calls/config: `src/webrtc-config.js`, `src/call-experience.js`,
  `scripts/runtime-config.mjs`, `.env.example`.
- Profile: `src/profile/ProfileEditor.js`, `ProfileMediaService.js`,
  `ProfileService.js`, `ProfileView.js`.
- PWA: `index.html`, `public/manifest.webmanifest`, `public/assets/icons/*.png`.
- Tooling: `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`,
  `.github/workflows/ci.yml`.
- DB/audit: две новые migrations, `supabase/baseline/MIGRATION_MANIFEST.md`,
  `supabase/audits/profile_security.sql`, `scripts/test-profile-db.sh`,
  `tests/database/profile-stabilization.test.sql`.
- Regression: новые unit/integration/browser/media tests, network fixtures в
  `tests/helpers/browser-fixture.js`, реальный тестовый relay в
  `tests/fixtures/local-turn.js`; расширен `tests/e2e/smoke.test.js`.
- Отчёты: этот файл, `ACTION_INVENTORY.md`, `PROFILE_SECURITY_AUDIT.md`.

`dist/` — отслеживаемый generated output. Build проверен в отдельной копии входов;
его старые tracked-файлы не включаются в изменения. Vercel продолжает собирать
`dist/` из исходников через существующий `vercel.json`; менять эту конфигурацию
для permalink не требуется, static files имеют приоритет над SPA rewrite.

## 3. Новые migrations

- `202610250001_profile_stabilization.sql`: сохраняет `GRANT UPDATE lit_profiles`,
  вводит owner/privilege boundary, atomic profile RPC, admin wrapper, scoped
  function ACL, profile Storage cleanup и исправляет ownership external links.
- `202610250003_editor_assets.sql`: постоянные asset records, owner RLS,
  immutable objects и restrictive write boundaries для `lit-work-assets`.

Обе migrations повторно применены в disposable PostgreSQL fixture. Они не
применялись к production. История до v0.19 и реальное тело legacy resolver
отсутствуют в Git; их нельзя выдумать или заменить предположениями fixture.

## 4–5. Запущенные проверки и результаты

| Проверка | Фактический итог |
| --- | --- |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0; существующая strict TypeScript-проверка `src/editor/**/*.ts` |
| `npm test` | 65 passed, 0 failed, 0 skipped |
| `npm run test:integration` | 17 passed, 0 failed, 0 skipped |
| `npm run test:e2e` | 25 passed, 0 failed, 0 skipped: 20 browser, 4 HTTP, 1 native two-browser media |
| `npm run build` | exit 0 в отдельной копии входов, runtime config/HTML/assets проверены; env только из существующего e2e fixture |
| `bash scripts/test-profile-db.sh` | exit 0, `PROFILE AND EDITOR DATABASE REGRESSIONS PASSED` |
| `git diff --check` | exit 0 |

Итого 107 автоматических тестов плюс отдельные SQL-проверки. Browser-сценарии
проверяют интерфейс на 360/390/430/1366/1920, actual input/gestures, history/scroll,
регистрацию/OTP/login/logout/session refresh, посты и реакции, share/deep link,
profile media, четыре типа проекта и восстановление media в новом контексте.
Проверки console/pageerror не обнаружили ошибок в этих успешных сценариях.
Fixtures используются только тестами; production cloud-клиент не заменён
локальной реализацией. Установка по обновлённому install script повторно выполнена
успешно. Live credentials и свежий task после публикации среды не проверялись.

## 6. Что ещё требует реальной среды

- Supabase Security Advisor, сверка production schema/migration history, real
  legacy resolver body, policies и реальных grants всех SECURITY DEFINER.
- Настоящая доставка OTP, два отдельных обычных аккаунта и существующий admin.
- Profile и media после входа с другого устройства в настоящий backend, без 403.
- Signalling и media call A→B/B→A через production, внешние NAT/TURN, reject/hangup
  и повторные вызовы; реальные microphone/camera, физическое переключение камеры.
- Реальные мобильные браузеры iOS/Android, помимо Chromium viewport/touch.

Локальный native media regression запускает два **отдельных процесса Chromium**,
настоящий coturn TCP relay и synthetic devices, проверяет relay candidates и
inbound/outbound RTP отдельно для audio и video. Это не тест двух cloud-аккаунтов.
На этой машине managed browser policy запрещает nonproxied UDP; политика не
изменялась. TURN/TCP — поддерживаемый способ выполнить медиатест.

## 7. Environment

Для приложения обязательны `VITE_SUPABASE_URL` и
`VITE_SUPABASE_PUBLISHABLE_KEY`. Для TURN задаётся полный набор
`VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`; debug включается
через `VITE_CALL_DEBUG=true`. Credentials TURN видны браузеру по назначению,
поэтому нужны scoped/short-lived credentials, а не серверный signing secret.

Для live advisor нужен `SUPABASE_ACCESS_TOKEN` через защищённые настройки и
`FRAKTUM_PROJECT_REF`, выводимый из обычного URL проекта. Значения ключей в чат,
Git, команды deploy и отчёт не копировались. GitHub Git-read и push работают. Первичная REST-проверка `api.github.com`
получила proxy CONNECT HTTP 403, однако последующее создание Draft PR #9 через
`gh` успешно. Сохранение сетевого домена в черновике само по себе не доказывает
применение к runtime. Существующая remote-ветка `codex` сохранена; для новой ветки
использовано свободное имя без конфликтующего префикса `codex/`.

В черновике среды обновлены `install_script`, `start_skill`, сохранены требования
Supabase и добавлен Management API secret target `api.supabase.com`. Custom rules:
`*.supabase.co`, `api.github.com`, `api.supabase.com`; package-manager presets
сохранены. Это не публикация конфигурации и не deploy приложения.

## 8. Команды проверки и deploy

В подготовленной cloud-среде:

```bash
cd /workspace/DID-
source /workspace/.cloud-setup/did-test-env.sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
bash scripts/test-profile-db.sh
node /workspace/.cloud-setup/did-stage-build.mjs
```

Последняя команда требует настоящие env приложения и выполняет `npm run build`
во временной копии. Во время offline проверки были использованы явно тестовые
env существующего e2e, без запросов к настоящему проекту.

Для нового CI/Linux нужны Chromium и coturn; точные команды есть в workflow:

```bash
npm ci
npx --no-install playwright-core install --with-deps chromium
sudo apt-get install --no-install-recommends -y coturn
```

Далее — команды для оператора с настроенными Supabase/Vercel CLI и защищёнными
доступами. Сначала прочитать `PROFILE_SECURITY_AUDIT.md`, экспортировать baseline
и проверить staging с той же схемой. Не запускать reset или универсальный repair.

```bash
supabase link --project-ref "${FRAKTUM_PROJECT_REF:?}"
supabase migration list --linked
supabase db push --linked --dry-run
```

После сверки baseline/history и проверки dry-run:

```bash
supabase db push --linked
```

Повторить SQL audit и настоящий Advisor по `PROFILE_SECURITY_AUDIT.md`. Для
выкладки приложения в правильный Vercel project, где заданы production env:

```bash
vercel link --yes --project "${FRAKTUM_VERCEL_PROJECT:?}" --scope "${FRAKTUM_VERCEL_SCOPE:?}"
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

Эти deploy-команды приведены для последующего проверенного релиза; production
deploy в рамках этой работы не выполнялся.

## 9. Оставшиеся ограничения

Production acceptance блокируют отсутствующие подключения и проверка baseline.
Существующий private `lit-work-assets` bucket не переводится в public автоматически;
для него нужен согласованный private URL design, поскольку текущий клиент использует
public object URLs. Legacy embedded media при неудачной миграции сохраняется в
исходной локальной копии; интерфейс явно предупреждает о pending migration.

Необлачные community create/join, будущие community tabs, author review replies и
group media calls отключены с «Скоро»; активные cloud-функции локальными
заглушками не заменялись. Полный инвентарь — `ACTION_INVENTORY.md`.

Текущий редактор не реализует межустройственное разрешение конкурентных правок:
локальная очередь предотвращает перекрывающиеся записи одного экземпляра, но не
заменяет серверный revision/conflict protocol. Публичная версия по прежней модели
обновляется вместе с сохранением опубликованного work; immutable publish snapshot
потребует отдельной согласованной миграции persistence.

До устранения внешних блокеров и получения live evidence статус production-ready
не заявляется.
