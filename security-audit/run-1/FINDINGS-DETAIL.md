# Findings detail

No MEDIUM-or-higher finding remains open in the final reviewed source.

The only confirmed exploit path found during the run was anonymous identity rotation against the paid-provider quota. It was reproduced, fixed and re-tested before this report was finalized. The current request path derives a pseudonymous actor key in `api/_paid-access.js`, sends it only from the server to the five-argument reserve RPC, and accounts it atomically in `supabase/migrations/008_generation_actor_quota.sql`. The legacy four-argument RPC is made fail-closed by migration 009.

Because `findings.json` has no surviving finding, there is no active exploit request to publish in this file. Operational limitations and future launch gates are listed as hardening notes in `REPORT.md`, not inflated into vulnerabilities.
