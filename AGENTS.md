# FRAKTUM Literature engineering rules

- Do not add stubs without an explicit `TODO` explaining the missing behavior.
- No UI control may call an undefined action or function.
- Every feature change requires automated tests.
- Never persist binary/base64 media in JSON or localStorage.
- Never render user HTML without sanitization.
- Avoid giant mutable global state; editor code belongs in `src/editor` modules.
- Every canvas mutation must participate in undo/redo history.
- Cloud saving must not depend solely on a manual save button.
- Production data must never be mixed with demo seed data.
- Do not rewrite a working module without characterization tests.
- Test mobile UX separately from desktop UX.
- A passing build does not establish runtime correctness; run all quality scripts.
