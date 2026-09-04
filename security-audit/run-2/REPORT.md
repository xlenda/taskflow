# Celeste security audit — run 2

Audit completed: 2026-09-03

## Outcome

Five exploitable issues were confirmed against the pre-fix baseline: three Medium and two Low. All five have code fixes and regression gates in the current worktree. Production rollout remains pending: migration 013 must be applied, the gateway/client deployed with the explicit `CELESTE_AI_REPORT_ROLLOUT=expansion` mode, and migration 014 applied before the normal final deploy gate can pass.

| ID | Severity | CWE | Confidence | Status | Primary fix / gate |
| --- | --- | --- | --- | --- | --- |
| PRIV-01 | Medium | CWE-201 | High | Fixed in worktree | `components/AiContentReportAction.js`, generated-only evidence in scene/vision integrations, `scripts/verificar-denuncia-ia.js` |
| ABUSE-01 | Medium | CWE-799 | High | Fixed in worktree; DB rollout pending | `api/denunciar-conteudo-ia.js`, migrations 013/014, HMAC actor and global quotas, legacy RPC revocation |
| DEEPLINK-01 | Low | CWE-400 | High | Fixed in worktree | `utils/navigationPathSafety.js`, React Navigation `filter` + guarded `getStateFromPath`, `scripts/verificar-deep-links-seguros.js` |
| REMINDER-01 | Medium | CWE-459 | Medium | Fixed in worktree | notification tag/URL sweep before reset/import, `scripts/verificar-lembrete-ritual.js` |
| QUOTA-01 | Low | CWE-770 | High | Fixed in worktree | Gemini configuration precheck before `authorizePaidRequest` in translation and dream handlers |

## Key evidence

- `PRIV-01`: the report action accepted caller-provided text, scene reporting passed the editable title and affirmation with the generated story, and the confirmation preview showed only 357 characters plus an ellipsis while the backend stored up to 4,000 characters.
- `ABUSE-01`: the authenticated legacy RPC granted ten submissions per anonymous UUID, but an attacker could discard that UUID and create another. There was no stable actor or global quota.
- `DEEPLINK-01`: both `celeste://` and HTTPS links reached React Navigation's query parser. A 1,930-character malformed `%C0` path took about 10.2 seconds locally; a malformed path segment raised `URIError`. The affected transitive package is `decode-uri-component@0.2.2` under advisory `GHSA-vcc3-ghjq-m6fr`.
- `REMINDER-01`: native scheduling completed before the identifier was persisted. If the screen unmounted in that gap, reset/import saw a null identifier and the cancellation helper returned success without querying native notifications, leaving a recurring notification behind.
- `QUOTA-01`: translation and dream handlers reserved three units before checking whether Gemini and the paid-data terms were configured, so deterministic 503 responses consumed quota.

## Fix verification

The release gates now cover the report gateway/client, exact evidence preview, generated-only evidence, service-role RPC contract, user/actor/global quotas, legacy revocation, notification orphan sweep, deep-link size/query/malformed/control cases, and provider prechecks. Deploy validation is fail-closed on report schema 2 by default; schema 1 is accepted only with the explicit expansion flag. Candidate and production probes include the required `X-Celeste-Client: web` claim.

At the time of the local review, no production deployment or remote migration had been executed. The PowerShell release helper exposes separate `report-expansion` and `report-cutover` actions so the endpoint is proven live before the legacy RPC is revoked.

## Residual and transitive risk

`npm audit --omit=dev` still reports seven Moderate transitive paths tied to `GHSA-vcc3-ghjq-m6fr`; the installed dependency graph has no available package-manager fix. The application boundary therefore remains the compensating control: paths are capped at 2,048 characters and 32 query parts, decoded once with native `decodeURIComponent`, rejected on malformed encoding or decoded controls, and the downstream parser is wrapped in `try/catch`. Keep the advisory open for dependency upgrade tracking and retain the regression gate until the vulnerable transitive dependency is removed.

Scene fallback and translation behavior were reviewed as product/privacy observations, not security findings in this run.
