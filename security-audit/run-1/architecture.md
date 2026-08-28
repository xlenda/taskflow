# Celeste security architecture

Audit date: 2026-08-28

## Scope

- Target: `D:\Projetos\TaskFlow`
- Product: Expo / React Native application exported for web and prepared for iOS and Android.
- Public deployment: Vercel static web bundle plus five paid serverless API routes and one dream route.
- Prior audit runs: none in this repository. A later run should deliberately revisit different code paths.

## Components

1. **Expo client**
   - React Native screens run on web, iOS and Android.
   - AsyncStorage and IndexedDB hold onboarding answers, Anchor data, generated content, local Community stories, consent state and media receipts.
   - The client creates or resumes an anonymous Supabase Auth session before calling a paid API.

2. **Vercel edge and serverless boundary**
   - Vercel serves the static export, security headers and BotID challenge routes.
   - `api/gerar-cena.js` creates Anchor scenes and the personalized 6+6 suite.
   - `api/gerar-visual.js` creates personalized imagery.
   - `api/gerar-audio.js` creates speech.
   - `api/traduzir-cena.js` translates user content.
   - `api/transformar-sonho.js` turns a dream into a constructive reflection and affirmation.
   - Shared modules validate origins, sessions, request IDs, consent versions, quotas, response formats and provider output.

3. **Supabase control plane**
   - Anonymous Auth supplies a signed JWT for paid routes.
   - Service-role-only RPCs maintain distributed generation reservations and daily budgets.
   - Public Community sync is disabled by default. The product currently works local-first and the remote Community tables are not active in production.

4. **External processors**
   - Anthropic is the primary text provider for personalized scenes.
   - OpenAI is the configured text failover.
   - Gemini handles translation, dream transformation and personalized images.
   - ElevenLabs handles personalized text-to-speech.
   - Provider credentials remain in Vercel server-side environment variables and must never enter the client bundle.

## Trust boundaries

- **Untrusted device to Vercel:** body, headers, locale, Anchor answers, dream text and anonymous JWT are attacker-controlled until validated.
- **Vercel to Supabase:** only server-side service credentials may reserve, finalize or release paid generation credits.
- **Vercel to AI providers:** prompts contain personal user input; disclosure requires current, explicit cloud-processing consent.
- **Local Community to future remote Community:** local drafts are private by default. A remote launch requires an explicit feature flag, database kill switch, moderation and server-side abuse controls.
- **Web to native:** native paid API access is intentionally fail-closed until App Attest / Play Integrity or an equivalent attestation design is deployed.

## Important data flows

### Personalized generation

1. The client records the current cloud-consent version.
2. It obtains a Supabase anonymous session and sends a unique request ID.
3. Vercel validates method, origin/client class, BotID where applicable, JWT, request size and consent version.
4. A distributed quota reservation is committed before any provider request.
5. The provider result is schema-validated and returned with `Cache-Control: no-store`.
6. The reservation is finalized after a billed dispatch or released only when no provider billing occurred.

### Personalized narration

1. The client selects a narrator and sends at most 800 characters per request.
2. The API charges proportional quota units before calling ElevenLabs.
3. Audio is returned only after MIME and response-size checks; it is not publicly cached.

### Dreams

1. Raw dream text is sent only after current cloud consent.
2. The prompt treats the dream as the primary source, with the Anchor as secondary context.
3. The model must not diagnose, predict, quote graphic material or use a symbol dictionary.
4. Only the constructive reflection and affirmation are eligible to seed a generated image.

## Primary attack surfaces reviewed

- Anonymous identity rotation and paid-provider cost exhaustion.
- Origin spoofing, native client impersonation and direct API calls.
- Duplicate request IDs, concurrent quota reservations and billed failure semantics.
- Oversized audio, prompt and image payloads.
- Stale or forged cloud consent.
- Prompt injection and unsafe dream literalization.
- Community privacy, moderation, RLS and feature-flag bypass.
- Secret leakage in source, bundles, logs and export/import data.
- Dependency vulnerabilities and browser security headers.

## Baseline

Comparable consumer AI wellness apps commonly combine anonymous onboarding, personalized LLM text, generated media and cloud narration. Celeste has the same material risks: personal-data disclosure, provider-cost exhaustion, unsafe generated guidance and accidental public sharing. The audit therefore weights authorization, atomic cost controls, consent provenance and privacy above generic scanner findings.
