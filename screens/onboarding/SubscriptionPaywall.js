// Paywall do iPhone (Diretriz 3.1.2 da App Store). Preço, período e dias de teste vêm sempre do plano que a
// loja devolveu; nada disso está escrito aqui. A linha legal, Restaurar, Termos e Privacidade aparecem em
// todos os estados. scripts/verificar-assinatura.js lê este arquivo e recusa preço escrito, pressa e promessa.
import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import GradientCover from '../../components/GradientCover';
import { APP_NAME, APP_URL, ONB, SERIF } from '../../constants/brand';
import { tr, txt } from '../../constants/i18n';
import { SUPPORT_EMAIL } from '../../constants/legal';
import { useApp } from '../../context/AppContext';
import { useEntitlement } from '../../context/EntitlementContext';
import { useNarration } from '../../context/NarrationContext';
import { buyPlan, loadPlans, readEntitlement, restorePurchases } from '../../services/purchases';
import { trackSignup } from '../../utils/adTracking';
import { paywallDisclosure, storeOutcome } from '../../utils/entitlement';
import { useT } from '../../utils/useT';
import { OnbScreen, useOnbHeight } from './onboardingUI';

const S = {
  locked: { pt: 'Seu conteúdo continua guardado neste iPhone.', en: 'Your content stays saved on this iPhone.' },
  preview: { pt: 'PRÉVIA', en: 'PREVIEW' },
  trialBadge: { pt: '{n} dias grátis', en: '{n} days free' },
  ctaTrial: { pt: 'Começar {n} dias grátis', en: 'Start {n}-day free trial' },
  ctaPay: { pt: 'Assinar por {price}/{unit}', en: 'Subscribe for {price}/{unit}' },
  enter: { pt: 'Entrar no {app}', en: 'Enter {app}' },
  loading: { pt: 'Carregando os planos', en: 'Loading plans' },
  loadFailed: { pt: 'Não foi possível carregar os planos.', en: 'Plans could not be loaded.' },
  retry: { pt: 'Tentar de novo', en: 'Try again' },
  restore: { pt: 'Restaurar compras', en: 'Restore purchases' },
  manage: { pt: 'Gerenciar assinatura', en: 'Manage subscription' },
  support: { pt: 'Ajuda: {email}', en: 'Help: {email}' },
  terms: { pt: 'Termos', en: 'Terms' },
  termsUrl: { pt: `${APP_URL}/termos`, en: `${APP_URL}/terms` },
  privacy: { pt: 'Privacidade', en: 'Privacy' },
  privacyUrl: { pt: `${APP_URL}/privacidade`, en: `${APP_URL}/privacy` },
  info: { pt: 'Como funciona o teste', en: 'How the trial works' },
  infoToday: { pt: 'Hoje: tudo liberado', en: 'Today: everything unlocked' },
  infoCharge: { pt: 'Em {n} dias: {price} {per}', en: 'In {n} days: {price} {per}' },
  infoCancel: { pt: 'Cancelou antes? Nada é cobrado', en: 'Cancel before then: nothing is charged' },
  infoPaid: { pt: 'Como funciona a assinatura', en: 'How the subscription works' },
  infoPayToday: { pt: 'Hoje: {price} {per}', en: 'Today: {price} {per}' },
  infoRenews: { pt: 'Renova sozinha até você cancelar', en: 'Renews on its own until you cancel' },
  infoHowCancel: { pt: 'Cancele em Ajustes > seu nome > Assinaturas', en: 'Cancel in Settings > your name > Subscriptions' },
  close: { pt: 'Fechar', en: 'Close' },
};

const BENEFITS = [
  ['headset', { pt: 'Sessão de 7 minutos', en: '7-minute session' }],
  ['calendar', { pt: 'Jornada nova toda semana', en: 'A new journey every week' }],
  ['alarm', { pt: 'Despertar com a sua cena', en: 'Wake up to your scene' }],
];

const PERIOD = {
  year: { name: { pt: 'Anual', en: 'Annual' }, per: { pt: 'por ano', en: 'per year' }, unit: { pt: 'ano', en: 'year' } },
  month: { name: { pt: 'Mensal', en: 'Monthly' }, per: { pt: 'por mês', en: 'per month' }, unit: { pt: 'mês', en: 'month' } },
  week: { name: { pt: 'Semanal', en: 'Weekly' }, per: { pt: 'por semana', en: 'per week' }, unit: { pt: 'semana', en: 'week' } },
};

// Avisos depois de comprar ou restaurar. Compra cancelada por ela não gera aviso.
const NOTICE = {
  confirming: { pt: 'Confirmando sua compra…', en: 'Confirming your purchase…' },
  buy_inactive: {
    pt: 'Compra recebida. Toque em Restaurar compras para liberar.',
    en: 'Purchase received. Tap Restore purchases to unlock.',
  },
  buy_pending: { pt: 'Compra aguardando aprovação.', en: 'Purchase awaiting approval.' },
  buy_failed: { pt: 'A compra não foi concluída. Tente de novo.', en: 'The purchase did not go through. Try again.' },
  restore_inactive: {
    pt: 'Nenhuma assinatura ativa nesta conta da Apple.',
    en: 'No active subscription on this Apple account.',
  },
  // Restaurar logo depois de uma compra recebida: a loja ainda não confirmou, não é "nenhuma assinatura".
  restore_received: {
    pt: 'Compra recebida. Tente de novo em instantes.',
    en: 'Purchase received. Try again in a moment.',
  },
  restore_failed: { pt: 'Não foi possível restaurar agora. Tente de novo.', en: 'Could not restore right now. Try again.' },
  // A permissão entrou e a gravação da entrada falhou: o botão já é "Entrar".
  confirmed: { pt: 'Compra confirmada. Toque para entrar.', en: 'Purchase confirmed. Tap to enter.' },
};

// A Apple cobrou e a permissão ainda não chegou (atraso do RevenueCat): esperas antes de cada nova consulta.
const CONFIRM_WAITS_MS = [2000, 4000, 8000];
const MANAGE_URL = 'https://apps.apple.com/account/subscriptions';

export default function SubscriptionPaywall({ locked = false }) {
  const { state, completeOnboarding } = useApp();
  const { status, refresh, setActive } = useEntitlement();
  const { stop } = useNarration();
  const { t, lang } = useT();
  const compact = useOnbHeight() < 620;
  const [phase, setPhase] = React.useState('loading'); // loading | ready | error
  const [buying, setBuying] = React.useState(false);
  const [plans, setPlans] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const alive = React.useRef(true);
  const busy = React.useRef(false);
  // Compra aceita pela Apple e a permissão não chegou nem na confirmação: esta tela não abre outra compra.
  const [received, setReceived] = React.useState(false);

  const load = React.useCallback(async () => {
    setPhase('loading');
    const result = await loadPlans();
    if (!alive.current) return;
    if (!result.ok || !result.plans.length) {
      setPhase('error');
      return;
    }
    setPlans(result.plans);
    setSelectedId(result.plans[0].id);
    setPhase('ready');
  }, []);

  React.useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // O player global de narração fica fora do portão da assinatura: aqui nada continua tocando.
  React.useEffect(() => {
    stop();
  }, [stop]);

  // Aviso também para o leitor de tela do iPhone (a região viva só existe no Android e no site).
  React.useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(tr(NOTICE[notice], lang));
  }, [notice, lang]);

  // Já tem a permissão e só falta gravar a entrada (assinante que reinstalou, ou gravação que falhou depois
  // da compra): o botão entra, sem abrir a folha da Apple de novo, e a oferta (planos, linha legal) sai da tela.
  const entitled = status === 'active';
  const selected = entitled ? null : plans.find((plan) => plan.id === selectedId) || null;
  // Mesma fonte da Home: a Cena-Âncora dela.
  const scenes = (state && state.manifestations) || [];
  const scene =
    scenes.find((item) => item.id === state.anchorSceneId) ||
    scenes.find((item) => item.origin === 'onboarding-anchor') ||
    scenes.find((item) => item.anchorOpenedAt) ||
    scenes[scenes.length - 1] ||
    null;

  const act = async (action, call) => {
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    setBuying(true);
    let outcome = 'failed';
    let entered = false;
    // Esta tela não tem "voltar": aconteça o que acontecer (até depois da cobrança), o botão volta a responder.
    try {
      outcome = storeOutcome(await call());
      if (action === 'buy' && outcome === 'inactive') {
        // Botão, planos e Restaurar seguem travados enquanto a permissão é consultada de novo.
        setNotice('confirming');
        for (const ms of CONFIRM_WAITS_MS) {
          await new Promise((resolve) => setTimeout(resolve, ms));
          if (storeOutcome(await readEntitlement({ fresh: true })) === 'unlock') {
            outcome = 'unlock';
            break;
          }
        }
        if (outcome === 'inactive') setReceived(true);
      }
      if (outcome === 'unlock') {
        setActive();
        if (state.onboardingDone === true) entered = true;
        else if (await completeOnboarding()) {
          entered = true;
          // Fim do cadastro: o Lead do anúncio (só no site e só com o aceite dos cookies).
          trackSignup();
        }
      }
    } catch {
      // o aviso abaixo sai do que já se sabe: sem resposta da loja é falha; com a permissão, falta só entrar
    } finally {
      busy.current = false;
      if (alive.current) setBuying(false);
    }
    if (!alive.current) return;
    setNotice(
      outcome === 'unlock'
        ? entered ? null : 'confirmed'
        : outcome === 'cancelled'
          ? null
          : action === 'restore' && outcome === 'inactive' && received
            ? 'restore_received'
            : `${action}_${outcome}`
    );
  };
  const buy = () => act('buy', () => (entitled ? { ok: true, active: true } : buyPlan(selected)));
  const restore = () => act('restore', restorePurchases);
  // Já cobrou e a permissão não veio: o botão principal restaura, nunca compra de novo.
  const stuck = received && !entitled;
  const retry = () => {
    refresh();
    load();
  };
  const open = (url) => Linking.openURL(url).catch(() => {});

  const price = selected ? { price: selected.priceString, per: t(PERIOD[selected.period].per) } : null;
  const cta = entitled
    ? t(S.enter, { app: APP_NAME })
    : stuck
      ? t(S.restore)
      : !selected
        ? ''
        : selected.trialDays > 0
          ? t(S.ctaTrial, { n: selected.trialDays })
          : t(S.ctaPay, { price: selected.priceString, unit: t(PERIOD[selected.period].unit) });
  const infoRows = !selected
    ? []
    : selected.trialDays > 0
      ? [
          ['lock-open-outline', t(S.infoToday)],
          ['card-outline', t(S.infoCharge, { n: selected.trialDays, ...price })],
          ['close-circle-outline', t(S.infoCancel)],
        ]
      : [
          ['card-outline', t(S.infoPayToday, price)],
          ['refresh-outline', t(S.infoRenews)],
          ['settings-outline', t(S.infoHowCancel)],
        ];
  const infoTitle = t(selected && selected.trialDays > 0 ? S.info : S.infoPaid);

  const benefits = (
    <View style={styles.benefits}>
      {BENEFITS.map(([icon, label]) => (
        <View key={icon} style={styles.benefit}>
          <Ionicons name={icon} size={20} color={ONB.cta} />
          <Text style={styles.benefitText}>{t(label)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <OnbScreen style={styles.screen} outerStyle={styles.frame}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <View style={[styles.photo, compact && styles.photoCompact]}>
            <GradientCover
              visualKey={scene?.visual?.cacheKey}
              sceneCategory={scene?.category}
              accent={typeof scene?.accent === 'number' ? scene.accent : 0}
              radius={24}
              decorative
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.photoTop, compact && styles.photoTopCompact]}>
              {selected?.preview ? <Text style={styles.previewTag}>{t(S.preview)}</Text> : <View />}
              {selected ? (
                <Pressable
                  testID="paywall-info"
                  accessibilityRole="button"
                  accessibilityLabel={infoTitle}
                  hitSlop={10}
                  onPress={() => setInfoOpen(true)}
                  style={styles.infoButton}
                >
                  <Ionicons name="information-circle-outline" size={24} color={ONB.ctaInk} />
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.photoTitle, compact && styles.photoTitleCompact]} numberOfLines={2}>
              {(scene && txt(scene.title, lang)) || APP_NAME}
            </Text>
          </View>

          {locked ? (
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed" size={16} color={ONB.surfaceInk} />
              <Text testID="paywall-locked" style={styles.lockedText}>
                {t(S.locked)}
              </Text>
            </View>
          ) : null}

          {compact ? null : benefits}

          {entitled ? null : phase === 'error' ? (
            <View style={styles.planFallback}>
              <Ionicons name="cloud-offline-outline" size={26} color={ONB.surfaceInk} />
              <Text testID="paywall-error" style={styles.errorText}>
                {t(S.loadFailed)}
              </Text>
            </View>
          ) : phase === 'loading' ? (
            <View style={styles.planFallback}>
              <ActivityIndicator color={ONB.cta} />
            </View>
          ) : (
            <View style={styles.plans} accessibilityRole="radiogroup">
              {plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  testID={`paywall-plan-${plan.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: plan.id === selectedId, disabled: buying }}
                  aria-checked={plan.id === selectedId}
                  disabled={buying}
                  onPress={() => setSelectedId(plan.id)}
                  style={[styles.plan, plan.id === selectedId && styles.planSelected]}
                >
                  <Text style={styles.planName}>{t(PERIOD[plan.period].name)}</Text>
                  <Text
                    style={[styles.planPrice, compact && styles.planPriceCompact]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {plan.priceString}
                  </Text>
                  <Text style={styles.planPer}>{t(PERIOD[plan.period].per)}</Text>
                  {plan.trialDays > 0 ? (
                    <Text testID={`paywall-trial-${plan.id}`} style={styles.trialBadge}>
                      {t(S.trialBadge, { n: plan.trialDays })}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}

          {compact ? benefits : null}
        </View>
      </ScrollView>

      {/* Fora da rolagem: botão, linha legal e os três links nunca nascem escondidos. */}
      <View style={styles.footer}>
        <View style={styles.inner}>
          {notice ? (
            <Text testID="paywall-notice" accessibilityLiveRegion="polite" style={styles.notice}>
              {t(NOTICE[notice])}
            </Text>
          ) : null}
          {phase === 'error' && !entitled ? (
            <Pressable
              testID="paywall-retry"
              accessibilityRole="button"
              disabled={buying}
              onPress={retry}
              style={({ pressed }) => [styles.cta, (pressed || buying) && styles.dim]}
            >
              <Ionicons name="refresh" size={20} color={ONB.ctaInk} style={styles.ctaIcon} />
              <Text style={styles.ctaText}>{t(S.retry)}</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="paywall-cta"
              accessibilityRole="button"
              accessibilityLabel={cta || t(S.loading)}
              accessibilityState={{ disabled: !cta || buying, busy: !cta || buying }}
              disabled={!cta || buying}
              onPress={stuck ? restore : buy}
              style={({ pressed }) => [styles.cta, (pressed || !cta || buying) && styles.dim]}
            >
              {buying || !cta ? <ActivityIndicator color={ONB.ctaInk} /> : <Text style={styles.ctaText}>{cta}</Text>}
            </Pressable>
          )}
          <Text testID="paywall-disclosure" style={styles.disclosure}>
            {paywallDisclosure(selected, lang)}
          </Text>
          <View style={styles.links}>
            <Pressable
              testID="paywall-restore"
              accessibilityRole="button"
              disabled={buying}
              onPress={restore}
              style={styles.link}
            >
              <Text style={[styles.linkText, (notice === 'buy_inactive' || notice === 'restore_received') && styles.linkStrong]}>{t(S.restore)}</Text>
            </Pressable>
            <Text style={styles.linkDot}>·</Text>
            <Pressable testID="paywall-terms" accessibilityRole="link" onPress={() => open(t(S.termsUrl))} style={styles.link}>
              <Text style={styles.linkText}>{t(S.terms)}</Text>
            </Pressable>
            <Text style={styles.linkDot}>·</Text>
            <Pressable testID="paywall-privacy" accessibilityRole="link" onPress={() => open(t(S.privacyUrl))} style={styles.link}>
              <Text style={styles.linkText}>{t(S.privacy)}</Text>
            </Pressable>
          </View>
          {stuck ? (
            <View style={styles.links}>
              <Pressable testID="paywall-manage" accessibilityRole="link" onPress={() => open(MANAGE_URL)} style={styles.link}>
                <Text style={styles.linkText}>{t(S.manage)}</Text>
              </Pressable>
              <Pressable
                testID="paywall-support"
                accessibilityRole="link"
                onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}
                style={styles.link}
              >
                <Text style={styles.linkText}>{t(S.support, { email: SUPPORT_EMAIL })}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <View accessibilityViewIsModal style={styles.sheetBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(S.close)}
            onPress={() => setInfoOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View testID="paywall-info-sheet" style={styles.sheet}>
            <Text style={styles.sheetTitle}>{infoTitle}</Text>
            {infoRows.map(([icon, label]) => (
              <View key={icon} style={styles.sheetRow}>
                <Ionicons name={icon} size={22} color={ONB.cta} />
                <Text style={styles.sheetText}>{label}</Text>
              </View>
            ))}
            <Pressable
              testID="paywall-info-close"
              accessibilityRole="button"
              onPress={() => setInfoOpen(false)}
              style={({ pressed }) => [styles.sheetClose, pressed && styles.dim]}
            >
              <Text style={styles.sheetCloseText}>{t(S.close)}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  screen: { minHeight: 0, overflow: 'hidden' },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1 },
  photo: { flexGrow: 1, minHeight: 150, maxHeight: 320, borderRadius: 24, overflow: 'hidden', justifyContent: 'space-between' },
  photoCompact: { minHeight: 84, flexGrow: 0 },
  photoTopCompact: { padding: 6 },
  photoTitleCompact: { fontSize: 19, lineHeight: 24, paddingVertical: 6 },
  photoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 },
  previewTag: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: ONB.surfaceInk,
    backgroundColor: ONB.heart,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  infoButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,25,45,0.38)' },
  photoTitle: {
    fontFamily: SERIF,
    fontSize: 22,
    lineHeight: 28,
    color: ONB.ctaInk,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(15,25,45,0.38)',
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  lockedText: { flexShrink: 1, marginLeft: 6, fontSize: 14, lineHeight: 19, color: ONB.surfaceInk },
  benefits: { marginTop: 12 },
  benefit: { flexDirection: 'row', alignItems: 'center', minHeight: 30 },
  benefitText: { flexShrink: 1, marginLeft: 12, fontSize: 16, lineHeight: 21, color: ONB.surfaceInk },
  plans: { flexDirection: 'row', marginTop: 12, marginHorizontal: -5 },
  plan: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 5,
    alignItems: 'center',
    backgroundColor: ONB.pillStrong,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  planSelected: { backgroundColor: ONB.card, borderColor: ONB.cta },
  planName: { fontSize: 13, fontWeight: '700', color: ONB.surfaceSoft, textTransform: 'uppercase', letterSpacing: 0.6 },
  planPrice: { fontSize: 25, lineHeight: 32, fontWeight: '800', color: ONB.surfaceInk, marginTop: 2 },
  planPriceCompact: { fontSize: 21, lineHeight: 28 },
  planPer: { fontSize: 13, lineHeight: 18, color: ONB.surfaceInk },
  trialBadge: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: '700',
    color: ONB.badgeText,
    backgroundColor: ONB.badgeBg,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planFallback: { marginTop: 12, minHeight: 112, alignItems: 'center', justifyContent: 'center' },
  errorText: { marginTop: 8, fontSize: 16, lineHeight: 22, color: ONB.surfaceInk, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  notice: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: ONB.surfaceInk, textAlign: 'center', marginBottom: 8 },
  cta: {
    minHeight: 54,
    backgroundColor: ONB.cta,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.6 },
  ctaIcon: { marginRight: 8 },
  ctaText: { flexShrink: 1, fontSize: 18, fontWeight: '600', color: ONB.ctaInk, textAlign: 'center' },
  disclosure: { marginTop: 8, fontSize: 12, lineHeight: 16, color: ONB.surfaceInk, opacity: 0.9, textAlign: 'center' },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  linkText: { fontSize: 13.5, color: ONB.surfaceInk, textDecorationLine: 'underline' },
  linkStrong: { fontWeight: '800' },
  linkDot: { fontSize: 13.5, color: ONB.surfaceSoft },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,25,45,0.45)' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: ONB.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 26,
  },
  sheetTitle: { fontFamily: SERIF, fontSize: 22, lineHeight: 28, color: ONB.surfaceInk, marginBottom: 10 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  sheetText: { flex: 1, marginLeft: 12, fontSize: 16, lineHeight: 22, color: ONB.surfaceInk },
  sheetClose: { marginTop: 14, minHeight: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: ONB.badgeBg },
  sheetCloseText: { fontSize: 16, fontWeight: '600', color: ONB.badgeText },
});
