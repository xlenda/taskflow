# Celeste security audit - run 1

Audit date: 2026-08-28

## Executive summary

No open exploitable vulnerability survived validation in the reviewed build. The audit did confirm one practical provider-cost exhaustion path during the run: rotating anonymous Supabase identities renewed the per-user budget. That path was fixed with a server-derived, pseudonymous actor quota, atomic database accounting and a fail-closed API contract. Dependency audit, tracked-source secret scan and the paid-route regression suite are clean. Native paid API access and remote Community publication remain deliberately disabled until their additional controls are ready.

## Baseline

Celeste is comparable to consumer AI wellness applications that combine anonymous onboarding, personal LLM text, generated images and cloud narration. Its main risks are therefore personal-data disclosure, provider-cost exhaustion, unsafe generated guidance and accidental public sharing. The current design is stronger than a simple client-side rate limit: consent, authorization, quota reservation and provider dispatch are enforced at server boundaries.

## Open findings

| Severity | Title | Result |
| --- | --- | --- |
| - | No validated open findings | `findings.json` is empty for the final reviewed source. |

## Resolved during this run

| Previous risk | Concrete impact | Resolution |
| --- | --- | --- |
| Anonymous identity rotation renewed paid quota | An unauthenticated script could create fresh anonymous UUIDs and exhaust the global provider budget, causing a cost-capped denial of service. | `api/_paid-access.js:115` derives an HMAC actor key from Vercel's trusted origin header. Migration 008 enforces a shared 96-unit daily actor budget atomically; migration 009 closes the legacy reserve signature. |
| Billed failures could release scene/image reservations | Repeated provider failures could consume provider credits while restoring local quota. | Scene and visual routes now commit before billable dispatch and release only when dispatch did not occur. |
| Fixed-cost narration admitted oversized spend | A single quota unit previously covered disproportionately large TTS input. | `api/gerar-audio.js:8` caps a request at 800 characters and charges proportional units. |
| Legacy consent booleans remained reusable after processor changes | Old consent could authorize a materially changed processor list. | `constants/cloudConsent.js:1` versions cloud consent; all five paid APIs and the dream API reject absent or stale versions before quota/provider work. |
| Future Community backend could be enabled prematurely | Public sync without complete moderation and abuse controls could expose private stories or enable spam. | Remote Community is off by default, client paths are feature-gated, and migration 007 installs a database kill switch and restrictive policies. |

## Evidence

- Dynamic actor-quota tests rotate 30 anonymous UUIDs, exercise concurrent reservations and confirm one shared 96-unit boundary.
- Five API contract suites confirm origin, BotID, JWT, current consent, minimized payloads, no-store responses and fail-closed quota behavior.
- `npm audit` reports 0 vulnerabilities across 576 dependencies.
- A tracked-source scan found no Anthropic, OpenAI, Gemini, ElevenLabs or JWT-style secret pattern.
- Vercel response policy includes CSP, frame denial, MIME sniffing denial and strict referrer policy (`vercel.json:37`).

## Hardening notes

- Rotate every credential that was ever pasted into a conversation, even when it was never committed. Keep replacements only in Vercel or a password vault.
- Keep native paid API calls disabled until App Attest / Play Integrity or an equivalent attestation boundary is implemented and tested.
- Keep remote Community disabled until server-side PII/spam filters, atomic actor/IP quotas, adversarial RLS tests and moderation incident procedures are deployed together.
- Validate AlarmKit permissions, scheduling, audio playback and recovery on a physical iPhone before store submission.
- Repeat this audit after native builds and remote Community are enabled. A single source audit does not cover every future deployment path.

## Positive patterns

- Provider keys are server-only and absent from the tracked source scan.
- Paid work uses distributed reservations instead of an in-memory serverless counter.
- Raw IP addresses are not stored; only a server-side HMAC reaches Supabase.
- Export/import strips cloud permission and requires fresh consent.
- Dream output is constrained against diagnosis, prediction, recovered-memory claims and graphic repetition.
- Personal media responses are private and non-cacheable; input and output sizes are bounded.
