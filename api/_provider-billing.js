// A provider that refuses for billing is not an outage. Gemini answers a depleted prepaid account with HTTP 402
// RESOURCE_EXHAUSTED "Your prepayment credits are depleted" (08/11: every Gemini route failed in production until the
// owner recharges). The routes answer 503 provider_billing — the apps treat it like any 503 — and log one structured
// line without key or body. A 429 counts only when its text names prepaid credits or the billing account: a plain
// rate limit ("check your plan and billing details") stays an ordinary failure.
const BILLING_TEXT = /prepay|credits? (?:are |is )?(?:depleted|exhausted)|billing account|insufficient (?:credit|funds)/i;
const MAX_BILLING_TEXT = 4_000;

async function isBillingRefusal(response) {
  if (!response || response.ok) return false;
  if (response.status === 402) return true;
  if (response.status !== 429 || typeof response.text !== 'function') return false;
  try {
    return BILLING_TEXT.test(String(await response.text()).slice(0, MAX_BILLING_TEXT));
  } catch (_error) {
    return false;
  }
}

function logBillingRefusal(provider, route) {
  console.info(JSON.stringify({ event: 'celeste_provider_billing', provider, route }));
}

module.exports = { isBillingRefusal, logBillingRefusal };
