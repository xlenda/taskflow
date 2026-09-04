# Detailed confirmed findings

This file expands the three Medium findings. The two Low findings and residual dependency risk are summarized in `REPORT.md`; the machine-readable traces are in `findings.json`.

## PRIV-01 — report evidence could disclose user-edited text (CWE-201)

Status: fixed in the current worktree. Confidence: High.

Before the fix, `ManifestationScreen` combined `item.title`, `item.affirmation`, and `item.story` as report evidence. Title/affirmation and a vision's displayed story can be edited by the person, so the voluntary safety report could transmit personal text rather than only the model output described by the UI. Separately, the modal preview truncated after 357 characters while normalization and storage accepted 4,000, so a reporter could not inspect the full transmitted evidence.

The fix passes only the generated scene story and preserves a separate immutable `generatedStory` for visions. The preview now uses the same normalization function as the request. Regression coverage adds a visible suffix beyond the old cutoff and asserts that editable fields and private prompt/onboarding data are absent.

## ABUSE-01 — disposable anonymous identities bypassed report quotas (CWE-799)

Status: fixed in the current worktree; migrations 013/014 still require staged production rollout. Confidence: High.

The legacy authenticated RPC serialized and limited reports per `auth.uid()`, but anonymous sign-up is intentionally available. Clearing the local anonymous session or using a fresh client produced a new UUID and a fresh ten-report allowance. Repetition could grow the moderation queue and retained evidence without a stable actor or global ceiling.

The fix moves submission behind `/api/denunciar-conteudo-ia`, validates an anonymous bearer identity and client platform, derives a pseudonymous actor HMAC from trusted request context, and calls service-role-only RPCs. Migration 013 adds per-user, per-actor, and global serialized counters plus 180-day retention and deletion. Migration 014 makes the public legacy RPC fail closed and revokes execution. The deploy guard requires the exact schema-2 contract by default and supports schema 1 only during an explicit expansion rollout.

## REMINDER-01 — reset/import could leave a recurring ritual notification (CWE-459)

Status: fixed in the current worktree. Confidence: Medium.

Native scheduling returned an identifier before the screen persisted it. A navigation/unmount timing window could therefore leave the recurring notification scheduled while application state still contained a null identifier. Reset and native import then called identifier-based cancellation; that helper treated a missing identifier as success without contacting the notification subsystem. The notification survived deletion of the local journey and could continue revealing prior app use on the device.

The fix enumerates native scheduled notifications and recognizes both the current ritual tag and the legacy ritual URL. Reset/import perform this sweep before durable mutation and abort if cleanup fails. The regression test supplies current, legacy, and unrelated notifications and proves only ritual notifications are removed, including the null-ID case.
