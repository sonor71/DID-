# FRAKTUM Literature v0.19.0 — Identity, Discovery & Evaluation

## Profile 2.0

- Новый адаптивный профиль с banner, avatar, status, bio, ролью, верификацией, XP, репутацией, followers/following и вкладками работ.
- Avatar и banner проходят JPEG/PNG/WebP validation, center crop, WebP resize и загружаются в `lit-avatars` / `lit-profile-banners`; binary не попадает в состояние.
- Структурированные любимые книги и социальные ссылки сохраняются в Supabase. URL ограничены HTTP/HTTPS.
- Жизненный цикл работы отделён от публикации полем `writing_status`.

## Discovery preferences

- Добавлены нормализованные справочники жанров и тем, 60+ жанров/поджанров и 40 тем с группами.
- Желаемые/нежелательные жанры и темы сохраняются в join tables. UI поддерживает поиск и не разрешает конфликт wanted/unwanted.
- Legacy `wanted_genres` / `unwanted_genres` мигрируются без удаления исходных данных.

## Evaluation and fragments

- Выбор между фиксированной быстрой сессией и paginated cloud catalog.
- Размер сессии 1–50, сервер фиксирует ровно заданный набор; прогресс и завершение обновляются RPC.
- Черновик и публичный Fragment разделены. Fragment сохраняется как structured content в `lit_fragments`, а приватный draft не публикуется.
- Create menu различает произведение, fragment, draft и post.

## Inline annotations and feedback

- Четыре разных типа: `unclear`, `strange`, `disputed`, `comment`, каждый с icon и label.
- Аннотация хранит version/fragment, offsets, block id, selected text и prefix/suffix fallback в `lit_review_annotations`.
- Пометки сохраняются в Supabase; изменять и удалять их может только reviewer, автор произведения имеет read-only доступ.
- Добавлен авторский «Центр обратной связи» с группировкой по произведению и сохранением version binding.
- На mobile annotation actions отображаются как крупная bottom toolbar.

## Database and security

- Добавлены четыре additive migrations с RLS, indexes, storage policies и security-controlled RPC.
- Все новые profile/evaluation/annotation writes проверяют `auth.uid()`; публичны только опубликованные fragments и catalog dictionaries.

## Achievements foundation

- Добавлены server-evaluated достижения автора, reviewer и social categories с progress и earned state.
- Клиент не имеет INSERT/UPDATE policy для наград; trusted RPC вычисляет прогресс из works, reviews, annotations и followers.
- Профиль показывает earned/locked badges и прогресс без пересчёта на каждом render.
