# FRAKTUM Literature v0.18.0 — Architecture & Book Studio foundation

## Реализовано

- Исправлены реальные `ReferenceError` в действиях заметок, сообществ и сводки рецензий: заметки сохраняются, участие переключается, сообщество создаётся, а сводка рассчитывается по существующим оценкам.
- Добавлены обязательные `lint`, `typecheck`, `test`, `test:e2e` и `build` scripts и автоматическая проверка соответствия UI actions центральному dispatcher.
- Добавлена typed schema `BookDocument` / `CanvasPage` / text и image objects для дальнейшей миграции legacy canvas.
- Вынесены из монолита транзакционная история, editor root, правила сериализации и asset pipeline.
- Drag, resize и rotate записываются в историю одной транзакцией на pointer gesture; create, delete, duplicate, layer order и background image также являются undoable. Добавлены Ctrl/Cmd+Z и Ctrl/Cmd+Shift+Z.
- Новые изображения Book Studio проходят MIME/size validation и загружаются в Supabase Storage `lit-work-assets`. В постоянном editor state сохраняются `assetId` и `storagePath`, а SVG/base64 upload path удалён.
- Добавлена защита сериализации, отклоняющая embedded `data:` media в новой document model.
- Версия приложения и package обновлена до 0.18.0.

## Тесты

- Unit: history transaction/undo/redo, запрет data URL, image validation, storage metadata и UI action contract.
- Runtime smoke: запуск HTTP-приложения, доступность shell/editor modules, регистрация основных routes и editor actions.

## Следующий этап

- Перевести legacy canvas rendering/selection с DOM `dataset` на typed editor store полностью.
- Подключить TipTap/ProseMirror structured rich text вместо legacy `contenteditable`/`execCommand`.
- Добавить revision-aware debounced cloud autosave и статусы conflict/offline.
- Расширить browser E2E до реальных pointer/touch interactions после доступности Playwright browser package в CI.
