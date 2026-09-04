# Celeste security and privacy architecture

Audit date: 2026-09-02

Repository baseline: `2eda8145af6c44410d00b4a580c6289c113ea0cb`

## Scope and audit objective

- Target: `C:\Projetos\TaskFlow`.
- Product: Celeste, an Expo / React Native consumer wellbeing application exported for web and prepared for Android and iOS.
- Release under review: Android `1.0.0`, package `com.celesteapp.affirmations`, version code `2`, plus the production web application and its serverless APIs.
- Audit objective: determine whether the real Android v1, web/backend behavior, public privacy notices, Google Play declarations, deletion/retention posture and signed release evidence agree closely enough for publication.
- Prior audit: `security-audit/run-1`, dated 2026-08-28, reported no open findings after its fixes. This run does not treat that result as current because the product gained Android release boundaries, AI-content reporting, public policy pages, on-device speech, reminders, media caches and Play automation after that baseline.
- Out of scope as active Android-v1 behavior: remote Community, Android affirmation alarm, paid native AI generation, billing, ads and analytics. Their fail-closed controls remain in scope because an accidental activation would materially change privacy and cost exposure.

## Product and execution components

1. **Expo client**
   - Entry point: Expo AppEntry to `App.js`.
   - Navigation and feature gating are composed in `App.js` and `constants/releaseFeatures.js`.
   - The client handles onboarding, profile, manifestations, stories, affirmations, dreams, visions, private traces, the Celeste practice plan, reminders, sharing and optional AI-content reports.

2. **Local persistence boundary**
   - `context/AppContext.js` persists the main state in AsyncStorage under the historical key `@stella_state_v2`.
   - The stored state may include name, approximate city, age, gender, sexuality, relationship and family information, work/financial context, obstacles, wishes, free-form profile text, manifestations, generated scenes, affirmations, dreams, reflections, private traces, progress and practice receipts.
   - `services/personalVisualStorage.js` stores personal imagery in IndexedDB on web or an app-private document directory on native.
   - `services/narrationAudioStorage.js` stores generated narration in IndexedDB on web or the app-private cache on native, with a 64 MB / 40-item bound and 30-day inactivity eviction.
   - There is no application-level encryption layer. Confidentiality relies on browser/OS isolation. Android backup is disabled with `allowBackup: false`.

3. **Android and iOS native modules**
   - `celeste-practice-speech` invokes platform on-device speech recognition. Android uses `createOnDeviceSpeechRecognizer` and requests `RECORD_AUDIO`; iOS requires on-device recognition.
   - The module returns recognition candidates and confidence only. The practice receipt stores identifiers, method, score and a content fingerprint, not raw audio or transcript.
   - Android v1 uses ordinary local notifications for reminders. Exact alarm, overlay, foreground/media-service and legacy external-storage permissions are explicitly removed in `app.json`.
   - Final permission and SDK assertions still require inspection of the signed AAB's merged manifest and traffic on a real Android device.

4. **Vercel static and serverless boundary**
   - Vercel serves the web export, public privacy/support pages, CSP/HSTS/frame/content-type headers and exactly five public generation endpoints:
     - `/api/gerar-cena`
     - `/api/gerar-visual`
     - `/api/gerar-audio`
     - `/api/traduzir-cena`
     - `/api/transformar-sonho`
   - Requests pass method/body limits, exact web Origin checks, BotID for web, current adult cloud consent, anonymous Supabase JWT validation, request identifiers and per-user/per-actor quotas.
   - The server derives a quota actor with HMAC-SHA256 from Vercel's trusted forwarding header and does not persist raw IP in Supabase quota tables.
   - Responses use no-store semantics. Logs found in production code contain operational metadata and token usage, not prompts, generated content, dreams, user UUIDs or credentials.

5. **Supabase control and persistence plane**
   - The public URL and publishable key exist in the client. The service-role key is server-only.
   - Anonymous Auth supplies a persistent pseudonymous UUID and JWT. `services/celesteSupabase.js` persists and refreshes the session in AsyncStorage.
   - Paid web routes validate the JWT and use service-role-only quota RPCs.
   - The Android v1 paid generation path fails before session creation because native attestation is not implemented.
   - The deliberate Android-v1 exception is `services/aiContentReports.js`: on the first voluntary AI-content report it creates or resumes an anonymous Supabase session and sends the selected generated content/reference, reason, optional note and technical metadata through a restricted RPC.
   - `supabase/migrations/011_ai_content_reports.sql` stores the reporter UUID, evidence/hash, reason, status, moderation fields and timestamps. RLS, revoked direct access, authentication, deduplication and a 10-per-24-hour limit protect submission.
   - No code or SQL retention job currently deletes anonymous auth identities, reports, quota receipts or counters. Resetting local app data does not sign out/delete the Supabase identity and does not erase remote reports.
   - Remote Community tables and RPCs exist but require both a client feature flag and database kill switch. They are not an Android-v1 data flow.

6. **External AI and infrastructure processors**
   - Anthropic is the primary scene/text provider.
   - OpenAI is the scene/text fallback and is called with `store: false`.
   - Google Gemini handles translation, images and dream transformation. `api/gerar-cena.js` also contains a compatibility route that can send scene data to Gemini if no eligible text provider is configured.
   - ElevenLabs handles on-demand narration.
   - Vercel/BotID processes hosting, request, IP/user-agent and abuse signals.
   - Supabase processes anonymous authentication, quotas and reports.
   - Provider secrets remain server-side. Contractual processor role, DPA/subprocessor terms and provider retention have not yet been recorded as approved by the legal owner.

7. **Release and distribution systems**
   - GitHub stores source history.
   - Expo/EAS builds and signs the Android artifacts.
   - Google Play will use Play App Signing and distribute the AAB.
   - Vercel deploys the website/backend with validation, promotion and rollback checks.

## Release-specific feature matrix

| Capability | Android v1 | Web | Material data consequence |
| --- | --- | --- | --- |
| Local profile/journey | Enabled | Enabled | Sensitive free-form state stored locally |
| Celeste practice plan | Enabled | Enabled where supported | On-device recognition on native; local receipts |
| Ordinary reminders | Enabled | Platform-dependent | Generic local notification text |
| Android exact affirmation alarm | Disabled | Not Android | No exact-alarm/overlay foreground permission in v1 |
| Paid AI generation | Fail-closed before session | Enabled with adult current consent/JWT/quota | Web sends minimized personal prompts to processors |
| AI-content report | Enabled, optional | Enabled, optional | Creates/reuses anonymous Supabase identity and persists selected evidence |
| Remote Community | Disabled in layers | Disabled unless explicitly configured | Dormant database surface, not a v1 disclosure |
| Advertising/analytics/billing | Absent | Absent | No corresponding SDK data flows found |
| Sharing/export | Explicit user action | Explicit user action | Clear-text JSON or rendered card can leave app through a destination chosen by user |

## Actors and trust boundaries

1. **Person to local client**
   - Profile answers, dream text, manifestations, names of third parties, microphone input and imported backups are untrusted and may contain sensitive or adversarial content.
   - Rendering uses React Native `Text`; no production `dangerouslySetInnerHTML`, `eval` or `new Function` path was found.

2. **Local app sandbox to user-controlled export/share destination**
   - Web backup exports a clear-text JSON envelope of much of the private state, up to 8 MB on reimport.
   - Sharing creates a 9:16 affirmation card or text and hands it to the OS/browser share mechanism.
   - These are explicit user actions, but the privacy notice should explain that confidentiality then depends on the chosen destination.

3. **Untrusted browser/device to Vercel APIs**
   - Body, headers, locale, consent claims, anonymous JWT and request IDs remain attacker-controlled until independently validated.
   - Web Origin and BotID are defense-in-depth, not authorization. JWT, current consent and quota enforcement are the material server controls.

4. **Native client to paid APIs**
   - `services/celesteApiSession.js` rejects Android/iOS before creating a session and labels the client as requiring attestation.
   - `_paid-access.js` rejects native claims; the only bypass is explicitly limited to local development.

5. **Client to Supabase report RPC**
   - The report exception intentionally crosses the Android local-first boundary.
   - The report can include generated text containing personal details derived from earlier inputs even though raw prompts, original questionnaire answers and raw dreams are not deliberately attached.

6. **Vercel to processors**
   - Provider payloads can contain personal context. Current adult cloud consent must precede the call.
   - Dedicated third-party names are removed and free text is redacted on a best-effort basis, not guaranteed anonymized.

7. **Vercel to Supabase service role**
   - Only server-side code may reserve/finalize quota and perform privileged database operations. RLS and revoked grants must remain effective under deployment migrations.

8. **Repository/build system to signed artifact**
   - Source assertions are insufficient until dependency contents, merged manifest, network security configuration and runtime traffic of the final signed AAB are inspected.

## Important data flows

### Android local wellbeing flow

1. A person enters private profile, dream, vision and affirmation information.
2. State and media remain in application-private storage.
3. The practice plan reads the displayed affirmation/vision and invokes on-device speech recognition only after an explicit microphone action.
4. Audio/transcript is discarded after matching; a non-text receipt records completion.
5. Generic notifications can reopen the relevant local screen.

### Optional Android AI-content report

1. The person opens the report action on generated content and sees the disclosure.
2. On confirmation, the client creates or reuses an anonymous Supabase Auth session.
3. It submits selected generated evidence, reason, optional note, locale, model/source, platform and app version to a restricted RPC.
4. Supabase stores evidence against the pseudonymous reporter UUID for moderation.
5. Current code offers no remote deletion request flow or automated retention window. Local reset does not affect this remote record.

### Web paid generation

1. The person gives current adult consent for cloud processing.
2. The web client obtains a Supabase anonymous JWT and sends a bounded request with a unique operation ID.
3. Vercel validates origin/BotID, input, current consent, JWT and quota, then reserves cost.
4. A minimized payload is dispatched to the configured processor.
5. Output is bounded and schema/safety checked, quota is finalized according to billed-dispatch semantics, and the response is marked no-store.
6. The user-visible result is persisted locally; narration/images can also enter bounded private media storage.

### Backup and sharing

1. On web, the person explicitly exports a clear-text JSON backup or imports one after a destructive confirmation.
2. Import parses JSON, validates version/shape/size, resets cloud consent and disables restored reminder scheduling.
3. An affirmation can be shared as text/card through the system share sheet. Temporary Android card files are removed on a best-effort short timer.

## Public representations and current mismatches to test

1. Public policy says there is no remote/personal account to delete, while a first AI report creates a persistent technical Supabase identity and remote evidence tied to that UUID.
2. No retention schedule or deletion process exists for AI reports, anonymous identities or quota records. The Play draft correctly leaves deletion and legal decisions unresolved.
3. Public/internal consent wording describes separate cloud permissions, while current UI exposes a single toggle that jointly covers scenes, dreams and narration.
4. `constants/legal.js` says a compatible Android can request/use the affirmation alarm, but Android v1 hides that feature and removes its permissions.
5. Internal legal text does not clearly cover the new AI-content reporting flow already described on the public policy page and report modal.
6. The public provider mapping assigns scenes to Anthropic/OpenAI and Gemini to translation/image/dream, while a configuration compatibility path can send a scene to Gemini.
7. Public policy does not clearly explain clear-text backup export, system sharing, or that reported generated output can itself contain derived personal details.
8. Data Safety draft lists pseudonymous user ID, other user-generated content and other actions, but final classification must assess derived name, approximate location, health, financial/work and relationship content. System “Contacts” is not implicated because no address-book access exists.
9. Legal name, public support/privacy email, organization/territories, D-U-N-S, asset-rights record and processor-contract decisions remain owner-supplied submission blockers.
10. The production readiness record confirms migrations through 011; migration 012's production status should be verified before relying on its visual-capacity change.

## Primary attack and validation surfaces for this run

- Anonymous report identity lifecycle, deletion, retention and misleading account/reset representations.
- Data Safety classification of voluntarily reported AI output containing derived sensitive data.
- Consent granularity, version invalidation, minor handling and activation paths.
- Unexpected paid native-generation access, native-client spoofing, origin/BotID bypass and quota/cost abuse.
- Dormant Community activation or RLS/kill-switch bypass.
- Gemini scene-compatibility configuration, disclosure mismatch and fail-open provider selection.
- Prompt injection, provider response validation, unsafe rendered content and secret/log leakage.
- Deep-link parsing and the transitive `decode-uri-component` denial-of-service advisory.
- Backup import parser/merge safety, clear-text export risk, share-file lifecycle and path/URI handling.
- On-device microphone claims, permission minimization and absence of a silent network fallback.
- Supabase RLS/RPC grants, anonymous-user authorization, report rate limit/deduplication and quota migration parity.
- Signed AAB merged permissions, bundled SDK inventory, cleartext/network behavior and runtime evidence.

## Current publication blockers versus security hypotheses

The following are already confirmed administrative or evidence blockers and do not require exploit language:

- real legal owner/contact/support details;
- D-U-N-S and organization verification;
- processor contract/retention decisions;
- asset-rights record;
- native screenshots;
- signed AAB and physical-device validation;
- final Data Safety/Health/Content declarations and review contact.

Potential security/privacy findings remain hypotheses until Phase 2 reproduces an impact and Phase 3 independently attempts to disprove them. In particular, a dependency advisory alone, dormant code, a wording preference or missing defense-in-depth control is not a confirmed vulnerability.
