const { fetchWithTimeout, serverConfig, serviceRoleHeaders } = require('./_paid-access');

// Cron diário da Vercel: o Supabase grátis pausa após 7 dias sem consulta (derrubou imagem e voz em 09/2026).
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers && req.headers.authorization) !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const config = serverConfig();
  if (!config.url || !config.serviceKey) return res.status(503).json({ error: 'supabase_not_configured' });
  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/celeste_generation_policy?select=*&limit=1`,
      { headers: serviceRoleHeaders(config) }
    );
    return res.status(response.ok ? 200 : 502).json({ ok: response.ok });
  } catch (_error) {
    return res.status(502).json({ ok: false });
  }
}

module.exports = handler;
module.exports.default = handler;
