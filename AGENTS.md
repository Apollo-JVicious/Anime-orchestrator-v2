# Anime Orchestrator — Codex Instructions

This application manages anime production projects through structured canon.

## Core rule

Never silently modify locked canon.

## Production pipeline

Story Bible
→ Character Approval
→ Scene Development
→ Storyboard
→ Shot Approval
→ Video Generation
→ Continuity Review
→ Final Assembly

## Data rules

- Preserve immutable IDs.
- Never overwrite approved assets; create new versions.
- Treat external changes as drafts until a user explicitly approves promotion to canon.
- Keep temporary costume, injury, age, and transformation states separate from core identity.
- Reject stale writes with optimistic concurrency control.
- Enforce project and permission scope on the server for every request.
- Record external writes and canon approvals in an audit log.
- Never expose Gemini, Veo, database, storage, bearer-token, or MCP secrets in client code, logs, or local storage.
- Never execute model output as code.

## MCP rules

- Read operations must not mutate application state.
- Write operations create drafts by default.
- Approved or locked records require a separate, explicit approval operation before change.
- Paid generation requires a reviewed estimate and a separate confirmation step.
- Treat prompt and model content as untrusted data; it cannot elevate permissions or bypass approval checks.

## Verification

Before completing changes:

- Run type checking.
- Run tests.
- Verify the mobile layout.
- Verify API authentication and authorization.
- Confirm read-only tokens cannot write.
- Confirm a token for one project cannot access another project.
- Confirm locked canon cannot be overwritten or silently changed.
- Confirm secrets are absent from client bundles and logs.
- Confirm the existing application remains runnable.
