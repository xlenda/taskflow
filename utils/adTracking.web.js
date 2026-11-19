import { GOOGLE_ADS_ID, GOOGLE_ADS_SIGNUP_LABEL, META_PIXEL_ID } from '../constants/ads';

// Medição dos anúncios no SITE, só depois do "Aceitar" no aviso de cookies (LGPD): antes disso nada carrega.
// Os scripts entram por <script src> (a CSP do vercel.json não aceita script inline) e os eventos levam só o
// nome do evento, nenhum dado pessoal. O app de loja usa utils/adTracking.js, que não faz nada.
export const AD_CONSENT_KEY = '@celeste_ad_consent_v1';
export const META_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
export const GOOGLE_SCRIPT_URL = 'https://www.googletagmanager.com/gtag/js';

// Cookies que a Meta e o Google gravam no site: "Recusar" apaga o que sobrou de um aceite anterior.
const AD_COOKIES = ['_fbp', '_fbc', '_gcl_au', '_gcl_aw', '_gcl_gb'];
const NINETY_DAYS = 7776000;

const landing = readLanding();
let answered = false;
let started = false;
let leadSent = false;
let leadPending = false;

function readLanding() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      // /?cookies=rever (link da política de privacidade) reabre o aviso sem carregar nada até a nova escolha.
      reviewing: params.get('cookies') === 'rever',
      // O anúncio chega com ?fbclid / ?gclid, mas a navegação do app troca a URL antes de os scripts lerem.
      // Ficam só em memória até o aceite.
      fbclid: params.get('fbclid') || '',
      gclid: params.get('gclid') || '',
    };
  } catch (_error) {
    return { reviewing: false, fbclid: '', gclid: '' };
  }
}

export function getAdConsent() {
  try {
    const value = window.localStorage.getItem(AD_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch (_error) {
    return null;
  }
}

export function shouldAskAdConsent() {
  return !answered && (landing.reviewing || getAdConsent() === null);
}

function addScript(src) {
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

// O clique do anúncio vai direto para o cookie que cada tag lê, no formato dela (_fbc da Meta, _gcl_aw do
// Google), antes de o script carregar: não depende da URL, que o app já trocou.
// ponytail: gbraid/wbraid (Google no iOS) ficam de fora; somar quando a tag do Google estiver ligada.
function saveAdClick() {
  try {
    const { hostname, protocol } = window.location;
    const attributes = `; Max-Age=${NINETY_DAYS}; path=/; SameSite=Lax${protocol === 'https:' ? '; Secure' : ''}`;
    if (landing.fbclid) {
      document.cookie = `_fbc=fb.${hostname.split('.').length - 1}.${Date.now()}.${landing.fbclid}${attributes}`;
    }
    if (landing.gclid && GOOGLE_ADS_ID) {
      document.cookie = `_gcl_aw=GCL.${Math.floor(Date.now() / 1000)}.${landing.gclid}${attributes}`;
    }
  } catch (_error) {}
}

function startMeta() {
  // Mesmo stub do código-base da Meta, só que fora de <script> inline.
  const fbq = function fbq() {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  // Um PageView por aceite ou carregamento, não um a cada troca de tela (o app muda a URL por tela).
  fbq.disablePushState = true;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  addScript(META_SCRIPT_URL);
  // Sem cliques e rótulos de botão automáticos: as respostas do questionário são botões.
  fbq('set', 'autoConfig', false, META_PIXEL_ID);
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
}

function startGoogle() {
  if (!GOOGLE_ADS_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  addScript(`${GOOGLE_SCRIPT_URL}?id=${encodeURIComponent(GOOGLE_ADS_ID)}`);
  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID); // o config já envia o page_view
}

function sendLead() {
  leadSent = true;
  window.fbq('track', 'Lead');
  if (GOOGLE_ADS_ID && GOOGLE_ADS_SIGNUP_LABEL) {
    window.gtag('event', 'conversion', { send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SIGNUP_LABEL}` });
  }
}

function start() {
  if (started) return;
  started = true;
  saveAdClick();
  startMeta();
  startGoogle();
  if (leadPending) sendLead();
}

// Apaga no host e em cada domínio-pai (num domínio próprio, a Meta e o Google gravam no domínio principal).
function clearAdCookies() {
  try {
    const labels = window.location.hostname.split('.');
    const domains = [''].concat(labels.slice(0, -1).map((_, index) => `; domain=${labels.slice(index).join('.')}`));
    AD_COOKIES.forEach((name) => {
      domains.forEach((domain) => {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
      });
    });
  } catch (_error) {}
}

export function initAdTracking() {
  if (!landing.reviewing && getAdConsent() === 'granted') start();
}

export function setAdConsent(choice) {
  const value = choice === 'granted' ? 'granted' : 'denied';
  answered = true; // o aviso fecha nesta visita mesmo se o navegador não deixar guardar a escolha
  try {
    window.localStorage.setItem(AD_CONSENT_KEY, value);
  } catch (_error) {}
  if (value === 'granted') start();
  else clearAdCookies();
}

// "Entrar no Celeste", o fim do cadastro: um Lead por visita. Se a pessoa ainda não respondeu o aviso, o Lead
// espera em memória e só sai se ela aceitar nesta visita; com recusa ou sem resposta, nunca sai.
export function trackSignup() {
  if (leadSent) return;
  if (started) sendLead();
  else leadPending = true;
}

export function trackAppStoreClick() {
  if (started) window.fbq('trackCustom', 'AppStoreClick');
}
