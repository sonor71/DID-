# D20 Platform — architecture v0.5

Prototype-first architecture. Data is localStorage only.

## Core roles
- Reader: read, review, post, communities, friends, private chats, group membership.
- Author: all reader capabilities + verified author status, publish works, full Book Studio, analytics, project collaboration groups.

## Social / communication
- Persistent right chat rail is available from every authenticated page.
- Friends are added by username.
- Direct-message threads are separate from project/group threads.
- Authors can create project collaboration groups and invite friends.
- Group/direct calls have prototype call state + history. Real audio/video transport is intentionally not implemented yet; production should use WebRTC or a dedicated realtime provider.

## Content
- Works and versions remain separate objects conceptually. Reviews are attached to a concrete work version.
- Library buckets: reading, later, completed.
- Reader annotations and full reviews are distinct.

## Storage
Current prototype: localStorage key `d20-platform-v4`.
Production split: auth/identity, relational database, object storage, realtime chat/presence, calls, search/recommendations, AI review aggregation.


## D20 Studio v0.9
Works получили поля `creationType`, `editorMode`, `documentPages`, `bookPages`, `mediaLibrary`. Поле `content` по-прежнему формируется как plain text для чтения и совместимости.


## v0.10
- D20 Studio expanded to use nearly all available desktop width.
- Illustrations can be dragged vertically through the text and between left/right/center positions.
- Text reflows around left/right floated illustrations.
- Selected illustrations can be resized to 25/40/55/70/100%.
- Image selection/drag handling was rebuilt to avoid the interaction lock after clicking an image.


## Server-first social layer (v0.13)

Основная соцчасть больше не имеет локального fallback: доступ требует Supabase Auth. Посты, комментарии, реакции и сообщения хранятся в Postgres. Личный чат создаётся RPC-функцией `lit_get_or_create_direct_conversation`, что не позволяет клиенту подменить владельца беседы. WebRTC-медиа передаётся peer-to-peer, а Supabase хранит только метаданные звонка и SDP/ICE-сигналинг.
