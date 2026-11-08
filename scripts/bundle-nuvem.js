// O bundle servido precisa do Supabase público embutido (EXPO_PUBLIC_SUPABASE_URL + chave, lidos do
// .env.production.local no export). Sem ele, voz, tradução e imagem falham antes de qualquer pedido de rede
// ("cloud_session_not_configured") e o E2E só estoura minutos depois, num timeout que parece bug do app.
// Acontece ao exportar fora do checkout principal (worktree sem o .env.production.local, que é gitignored).
async function assertBundleCloudConfig(baseUrl, expectedUrl = process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const html = await (await fetch(new URL('/', baseUrl))).text();
  const src = (html.match(/src="([^"]*_expo\/static\/js\/web\/[^"]+\.js)"/) || [])[1];
  if (!src) throw new Error(`index.html de ${baseUrl} sem o bundle do Expo`);
  const js = await (await fetch(new URL(src, baseUrl))).text();
  const configured = expectedUrl ? js.includes(expectedUrl) : /"https:\/\/[a-z0-9-]+\.supabase\.co"/.test(js);
  if (!configured) {
    throw new Error(
      `O bundle de ${baseUrl} saiu sem o Supabase público (EXPO_PUBLIC_SUPABASE_URL + chave): voz, tradução e ` +
        'imagem falham antes da rede. Exporte com o .env.production.local do checkout principal.'
    );
  }
}

module.exports = { assertBundleCloudConfig };
