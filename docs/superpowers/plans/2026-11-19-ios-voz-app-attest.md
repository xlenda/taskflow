# iPhone com a voz e os textos da nuvem (App Attest) — plano

> Pedido do Lenda (19/11/2026): "eu preciso usar o ElevenLabs" + "pode liberar tudo" no iPhone.
> Hoje o iOS está fechado de propósito no servidor (`api/_paid-access.js`: "iOS stays closed (no App Attest yet)")
> e no app (`constants/releaseFeatures.js`: `cloudNarration`/`cloudText` só web/android).

**Goal:** no iPhone, a voz da Celeste (ElevenLabs) e os textos da nuvem funcionam como no Android, protegidos pelo
App Attest da Apple no lugar do Play Integrity.

**Escopo desta rodada:** as MESMAS operações que o Android abre (`playIntegrity.NATIVE_OPERATIONS`: voz e textos — cena,
tradução). Imagens, sonhos na nuvem e Espelho Vivo continuam só no site (dependem do Gemini, que está sem crédito);
abrir no iPhone depois é trocar a lista, não a arquitetura.

**Fontes lidas (19/11/2026):** docs.expo.dev/versions/latest/sdk/app-integrity (iOS: `isSupported`, `generateKeyAsync`,
`attestKeyAsync(keyId, challenge)`, `generateAssertionAsync(keyId, challenge)`); o módulo nativo
(`node_modules/@expo/app-integrity/ios/IntegrityModule.swift`) usa `clientDataHash = SHA256(utf8(challenge))` nas duas
chamadas e devolve base64 padrão; developer.apple.com "Validating apps that connect to your server" (passos de
atestação e asserção, texto em scratchpad `docs/apple-attest.txt`); docs.expo.dev/build-reference/ios-capabilities
(EAS sincroniza a capacidade App Attest pelo entitlement `com.apple.developer.devicecheck.appattest-environment`).

## Contrato (servidor ↔ app) — os dois lados seguem exatamente isto

1. **Desafio** — `POST /api/app-attest` corpo `{"action":"challenge"}`, cabeçalhos `X-Celeste-Client: ios`, sem `Origin`.
   Resposta 200 `{"challenge":"<base64url>"}`. Sem estado: `payload = 16 bytes aleatórios || timestamp ms (8 bytes BE)`,
   `challenge = base64url(payload || primeiros 16 bytes de HMAC-SHA256(CELESTE_ACTOR_HASH_SECRET, "celeste-app-attest-challenge-v1\0" || payload))`.
   Vale 5 minutos.
2. **Registro da chave** — `POST /api/app-attest` corpo
   `{"action":"register","keyId":"<base64 do generateKeyAsync>","attestation":"<base64 do attestKeyAsync>","challenge":"<o do passo 1>"}`,
   cabeçalhos `Authorization: Bearer <sessão anônima do Supabase>`, `X-Celeste-Client: ios`, sem `Origin`.
   O app chamou `attestKeyAsync(keyId, challenge)` com a string do desafio. O servidor confere o desafio (HMAC, idade ≤ 5 min)
   e a atestação pelos passos da Apple: cadeia `x5c` até a "Apple App Attestation Root CA" (PEM embutido no código);
   `nonce = SHA256(authData || SHA256(utf8(challenge)))` igual ao octet string da extensão `1.2.840.113635.100.8.2` do credCert;
   `SHA256(chave pública do credCert, ponto não comprimido X9.62)` == keyId; `rpIdHash == SHA256("68VRL5BCA7.com.celesteapp.affirmations")`;
   `counter == 0`; `aaguid == "appattest" + 7×0x00` (produção) — `appattestdevelop` só se `CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT=1`;
   `credentialId == keyId`. Grava (key_id, user_id da sessão, chave pública SPKI DER base64, sign_count 0, ambiente, receipt)
   em `public.celeste_app_attest_keys`; chave já ligada a OUTRO usuário = recusa. Resposta 200 `{"ok":true}`; erro = 403
   `{"error":"native_attestation_required"}` com um log sem segredo (mesmo padrão do `_play-integrity.js`).
3. **Cada pedido pago do iPhone** (voz e textos) leva, além do `Authorization` e do `X-Celeste-Request-Id` de sempre:
   `X-Celeste-Client: ios`, `X-Celeste-Attest-Key: <keyId>`, `X-Celeste-Attest-Time: <ms>`, `X-Celeste-Attest-Assertion: <base64>`.
   O app calcula `challenge = sha256Hex(["celeste-app-attest-v1", operation, requestId, sessionHash, bodyHash, attestTimeMs].join("\n"))`
   (mesmos `sessionHash`/`bodyHash` do Play Integrity: sha256 hex do access token e do JSON exato enviado) e chama
   `generateAssertionAsync(keyId, challenge)`. O servidor recalcula o `challenge` do pedido recebido, confere `|agora - attestTime| ≤ 5 min`,
   carrega a chave por (key_id, user_id da sessão), decodifica a asserção CBOR `{signature, authenticatorData}`,
   `nonce = SHA256(authenticatorData || SHA256(utf8(challenge)))`, verifica a assinatura ECDSA (`crypto.verify('sha256', nonce, chave, assinatura)`),
   `rpIdHash`, e sobe o contador de forma atômica (RPC: só grava se o novo contador for MAIOR que o guardado). Qualquer falha = 403
   `native_attestation_required`. Só as operações de `NATIVE_OPERATIONS`.
4. **Extensões novas do authData** (`apple_validation_category_01`, `apple_bundle_version_01`): ler se vierem, registrar no log,
   NÃO exigir (iOS mais antigo não manda; a Apple não publica os valores esperados). Limite documentado.

## Tarefas

### A — Servidor (agente 1)
- `api/_app-attest.js`: CBOR mínimo (mapa, array, bytes, texto, inteiros), DER mínimo para a extensão do nonce, verificação
  da atestação e da asserção, desafio sem estado. Sem dependência nova (Node `crypto`/`X509Certificate`).
- `api/app-attest.js` (rota nova: desafio e registro; mesmo padrão de erro e de log das outras rotas).
- `api/_paid-access.js`: `isNativeRequest` passa o iOS só com os 3 cabeçalhos do contrato; `authorizePaidRequest` verifica a
  asserção (com a sessão já autenticada) antes da cota; o comentário "iOS stays closed" vira a explicação nova.
- `supabase/migrations/015_app_attest_keys.sql`: tabela + RLS sem políticas + RPC do contador (security definer, só service_role)
  e a ação nova no `scripts/apply-supabase-migrations-from-vercel.ps1` (mesmo padrão das existentes; NÃO aplicar em produção:
  o coordenador aplica depois da revisão).
- Verificador `scripts/verificar-app-attest.js` com cadeia de certificados SINTÉTICA (raiz de teste injetada só no teste) cobrindo
  atestação válida e cada recusa (nonce, rpId, aaguid, counter, keyId, cadeia, desafio vencido/adulterado) e asserção válida/
  repetida/contador menor/assinatura errada/tempo fora; provar por mutação. Incluir no `verify:store` e nos portões que já
  rodam o `_paid-access` (procurar os verificadores existentes de paid-access/native-api-boundary e manter todos verdes).

### B — App (agente 2)
- `services/appIntegrity.js`: ramo iOS (`AppIntegrity.isSupported`): chave por usuário da sessão guardada em SecureStore
  (keyId + "registrada"), desafio → `attestKeyAsync` → registro; em `ERR_APP_INTEGRITY_SERVER_UNAVAILABLE` tenta depois com a
  mesma chave, em outro erro descarta e gera outra; `integrityHeaderFor` devolve os 3 cabeçalhos do contrato no iOS
  (e continua igual no Android). Nunca lança: sem atestação, o pedido sai sem cabeçalho e o servidor recusa (texto local/voz do
  aparelho seguem como hoje).
- `constants/releaseFeatures.js`: `cloudNarration` e `cloudText` também no iOS. Consentimento: o iPhone usa o mesmo
  consentimento adulto do Android (copy que nomeia voz e textos e os provedores); ajustar `constants/cloudConsent.js` /
  `utils/useCloudMediaConsent.js` para valer nos dois nativos.
- `app.json`: `ios.entitlements["com.apple.developer.devicecheck.appattest-environment"] = "production"`.
- Atualizar os verificadores do app que travam o iOS fechado (procurar por `cloudNarration`, `cloudText`, `ios` nos
  `scripts/verificar-*.js`) para o comportamento novo, com teste do ramo iOS do `appIntegrity`.

### C — Coordenador
- Revisar A e B (/code-review), aplicar a migração 015 em produção pelo script, publicar o site pelo
  `scripts/deploy-web-from-vercel.ps1`, build iOS 1.0.2 pelo `scripts/publicar-app-store.ps1 -StartBuild -Submit`,
  testar no iPhone do Lenda pelo TestFlight ANTES de mandar para revisão; atualizar notas de revisão e privacidade da loja.
