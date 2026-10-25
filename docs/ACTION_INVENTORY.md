# User control audit

The stabilization audit checked button markup in `src/pages.js`, `src/profile`,
`src/feedback`, modal builders in `src/app.js`, and direct event listeners in
`src/call-experience.js`. A handled action is not a claim that its production
backend, policies, credentials, or hardware have been verified.

## Existing functions retained

| Area | Real behavior and entry points | Persistence / boundary |
| --- | --- | --- |
| Authentication | role choice, email/phone tabs, request/resend OTP, verification, sign out, session restoration | Supabase Auth; OTP delivery needs a configured project |
| Navigation | menu, profile, read/evaluate/library/create/feedback/messages, sidebar, browser history | client navigation; admin is conditional on the server profile |
| Feed | create post and upload media, like, comments, comment reactions, report, share/permalink/retry | Supabase REST/Storage; share uses Web Share or clipboard |
| Profile | edit, save text/preferences/books/links, upload/remove avatar/banner, profile tabs | Supabase profile RPC/Storage; database migration required |
| Reading / evaluation | work details, read, library, reading position, font/theme, quote annotations, review, reactions, evaluation catalogue/session/progress/filter | Supabase for cloud entities; typography and draft UI are local preferences |
| Studio | project wizard, draft/fragment/document/book, page selection/add/delete, text formatting, media upload/placement/layout/layers, undo/redo, preview/save/version/publish | structured editor state and Supabase Storage; cloud save must succeed before reporting synchronization |
| Private notes | edit and save personal notes | explicitly device-local, described as such in the UI; no simulated cloud publication |
| Messaging | find user, direct conversation, create project group, select thread, send message, drawer tabs/toggle, contact shortcut | Supabase conversations/messages; group membership is not community membership |
| Calls | start/answer/reject/end direct audio/video call, media controls, sound-unlock and notification permissions | Supabase signalling plus browser WebRTC; real cross-account media acceptance is separate |
| Notifications / moderation | notification centre/read state, reports, author verification request, admin queue/resolution | Supabase REST/RPC; authorization must be enforced by DB, not UI |
| Analysis | author analytics and rating/category summary | real calculation over loaded reviews; no AI-generation claim |
| External game | explicit TCG launch | opens configured external origin; not part of literature readiness |

Buttons without `data-action` were traced separately: submit buttons belong to
known forms (`friendForm`, thread-message, login/register/OTP, post/comment,
profile, reports, verification, filters, review/annotation, group creation).
Call sound/permission/media buttons use explicitly registered ID listeners.
The active ribbon label and current community tab are static labels, not buttons.

## Disabled or removed unfinished controls

| Previous behavior | Decision / visible result | Reason |
| --- | --- | --- |
| Post share button had no handler | implemented by central feed share/permalink flow | active controls must perform their stated action |
| Community creation and joining changed only local arrays | disabled with `Скоро` and explanatory title | no cloud community persistence exists; device-local changes must not masquerade as shared membership/publication |
| Community Discussions / Flood / Member works / Members tabs had no handlers | disabled with `Скоро` | those views have no implementation |
| Community showed a hardcoded pinned discussion | removed; actual unavailable-state explanation | fixed sample content is not a community's stored discussion |
| Author review reply changed only local `authorReply` | disabled with `Скоро` and cloud-storage explanation | an author reply must be visible to other accounts before it can be published |
| Group call controls invoked the one-to-one-only call path | disabled with `Скоро` | group media transport is not implemented; direct calls stay active |
| Ribbon “Главная” tab had no action | static active label | the formatting ribbon has no independent “home” view to activate |
| Noninteractive contact rendering could create a button without an action | renders a span | decorative identity must not imply an action |
| Launch checklist required unavailable community membership | removed that requirement | onboarding progress must contain attainable steps |

Legacy local-only community/reply functions remain for compatibility with older
stored state, but rendered production controls do not invoke them. Existing
cloud functions were not replaced with local substitutes.

## Text / warning audit

- Seed/demo removal in `state.js` is migration compatibility for old local state,
  not a production demo seed. Runtime demo configuration does not activate an
  alternative cloud implementation.
- `prototype`, historical demo descriptions and TODOs in documentation are
  historical material; removing text would not fix an executable control.
- `alert` paths in authentication, media, posts/comments, annotations, profiles,
  reviews and calls report validation or operation failure. They are not silent
  placeholder actions. Converting all legacy dialogs is outside this repair.
- Polling/bootstrap warnings report actual network failures. Debug-only RTC
  diagnostics belong to the call subsystem and must not expose credentials.
- Live Supabase/RLS/Storage checks, OTP delivery, microphone/camera permissions,
  TURN relay reachability and two-account calls remain production acceptance
  requirements. A locally rendered working button does not establish them.

The regression matrix checks rendered active controls, chat attachment geometry,
mobile and desktop navigation, and browser console errors using isolated network
fixtures. Fixture results must be reported separately from live production checks.
