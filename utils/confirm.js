import { Alert, Platform } from 'react-native';
import { ONB, SERIF } from '../constants/brand';

// Rótulos default quando o caller não manda os seus (hoje todos mandam via t()).
const S = {
  ok: { en: 'OK', pt: 'OK' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
};

// Modal de confirmação em DOM puro (sem React) — o window.confirm mostrava a
// caixa cinza do sistema com "celeste-jet-two.vercel.app" em cima e DESCARTAVA
// os rótulos traduzidos que o caller passou. Aqui é um cartão com as cores da
// marca, Escape/clique fora = cancelar e foco inicial no cancelar.
function confirmWeb({ title, message, confirmLabel, cancelLabel }) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    // notranslate nas duas camadas: o Google Tradutor reescreve o DOM e
    // quebraria os rótulos (lição da playbook).
    const overlay = document.createElement('div');
    overlay.className = 'notranslate';
    overlay.setAttribute('translate', 'no');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: ONB.inkSoft,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      zIndex: '2147483647',
    });

    const card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    if (title) card.setAttribute('aria-label', title);
    Object.assign(card.style, {
      background: ONB.card,
      color: ONB.surfaceInk,
      borderRadius: '22px',
      padding: '24px',
      width: '100%',
      maxWidth: '340px',
      boxShadow: '0 18px 48px rgba(27, 42, 71, 0.35)',
      fontFamily: SERIF,
    });

    if (title) {
      const h = document.createElement('div');
      h.textContent = title;
      Object.assign(h.style, { fontSize: '19px', fontWeight: '600', lineHeight: '1.3' });
      card.appendChild(h);
    }
    if (message) {
      const m = document.createElement('div');
      m.textContent = message;
      Object.assign(m.style, {
        marginTop: '10px',
        fontSize: '14.5px',
        lineHeight: '1.45',
        color: ONB.surfaceSoft,
      });
      card.appendChild(m);
    }

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '10px', marginTop: '22px' });

    const botao = (label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        flex: '1',
        border: 'none',
        borderRadius: '999px',
        padding: '12px 16px',
        fontSize: '15px',
        fontWeight: '600',
        fontFamily: 'inherit',
        cursor: 'pointer',
      });
      return b;
    };
    const btnCancel = botao(cancelLabel);
    Object.assign(btnCancel.style, { background: ONB.badgeBg, color: ONB.badgeText });
    const btnOk = botao(confirmLabel);
    Object.assign(btnOk.style, { background: ONB.cta, color: ONB.ctaInk });
    row.appendChild(btnCancel);
    row.appendChild(btnOk);
    card.appendChild(row);
    overlay.appendChild(card);

    let fim = false;
    const fechar = (val) => {
      if (fim) return;
      fim = true;
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar(false);
    });
    btnCancel.addEventListener('click', () => fechar(false));
    btnOk.addEventListener('click', () => fechar(true));

    document.body.appendChild(overlay);
    btnCancel.focus();
  });
}

// Alert.alert é NO-OP literal no react-native-web — qualquer confirmação via
// Alert simplesmente não acontece na web (bug crítico pego na auditoria 09/08).
// Use SEMPRE este helper para confirmações destrutivas; funciona nas duas
// plataformas e devolve Promise<boolean>.
export function confirmAsync({ title, message, confirmLabel, cancelLabel, destructive = true, lang = 'en' }) {
  const L = lang === 'pt' ? 'pt' : 'en';
  const okLabel = confirmLabel || S.ok[L];
  const naoLabel = cancelLabel || S.cancel[L];
  if (Platform.OS === 'web') {
    return confirmWeb({ title, message, confirmLabel: okLabel, cancelLabel: naoLabel });
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: naoLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
