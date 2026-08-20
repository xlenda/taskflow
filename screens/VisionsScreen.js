import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { VISIONS, categoryMeta, localized } from '../constants/content';
import { txt } from '../constants/i18n';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { formatTime } from '../utils/date';
import { audioDur } from '../utils/audioBank';

import GradientCover from '../components/GradientCover';
import SectionHeading from '../components/SectionHeading';

const GAP = 14;

const S = {
  title: { en: 'Visions', pt: 'Visões' },
  subtitle: { en: 'Meet your future self', pt: 'Encontre quem você está se tornando' },
  leadA: { en: 'Swipe to the vision you want to ', pt: 'Deslize até a visão em que você quer ' },
  leadB: { en: 'step into…', pt: 'entrar…' },
  narration: { en: '{time} narration', pt: '{time} de narração' },
  save: { en: 'Save this vision', pt: 'Salvar esta visão' },
  unsave: { en: 'Remove from saved', pt: 'Tirar dos salvos' },
  savedTitle: { en: 'Saved visions', pt: 'Visões salvas' },
  savedEmptyTitle: { en: 'No saved visions yet', pt: 'Nenhuma visão salva ainda' },
  savedEmptyBody: {
    en: 'Tap the bookmark on any vision to keep it close.',
    pt: 'Toque no marcador de qualquer visão para deixar ela pertinho.',
  },
  recentTitle: { en: 'Recently stepped into', pt: 'Onde você entrou recentemente' },
  recentEmptyTitle: { en: 'Nothing played yet', pt: 'Nada tocado ainda' },
  recentEmptyBody: {
    en: 'Your listening history will show up here.',
    pt: 'Seu histórico de escuta vai aparecer aqui.',
  },
  replay: { en: 'Play again', pt: 'Ouvir de novo' },
};

// Rótulo das categorias (a chave em inglês continua sendo o identificador do
// conteúdo; só o que a pessoa lê é traduzido).
const CAT = {
  Love: { en: 'Love', pt: 'Amor' },
  Wealth: { en: 'Wealth', pt: 'Prosperidade' },
  Career: { en: 'Career', pt: 'Carreira' },
  Health: { en: 'Health', pt: 'Saúde' },
  Confidence: { en: 'Confidence', pt: 'Confiança' },
  Peace: { en: 'Peace', pt: 'Paz' },
};

// prettyDate() de utils/date só fala inglês; aqui a data sai no idioma da pessoa.
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

function dateLabel(iso, lang) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return String(iso || '');
  const month = (MONTHS[lang] || MONTHS.en)[d.getMonth()];
  return lang === 'pt' ? `${d.getDate()} de ${month}` : `${month} ${d.getDate()}`;
}

// O conteúdo bilíngue mora em constants/content.js e sai de lá por localized().
// Se algum campo ainda vier como { en, pt } cru, txt() resolve — a tela nunca
// renderiza um objeto nem quebra enquanto o conteúdo é traduzido.
const TEXT_FIELDS = ['title', 'caption', 'script'];
function localize(item, lang) {
  if (!item) return item;
  const out =
    typeof localized === 'function' ? { ...item, ...(localized(item, lang) || {}) } : { ...item };
  TEXT_FIELDS.forEach((k) => {
    out[k] = txt(out[k], lang);
  });
  // Chaves estruturais nunca são traduzidas: são elas que casam ícone e cor.
  out.id = item.id;
  out.category = item.category;
  out.accent = item.accent;
  // `duration` do content.js é escrito à mão e mentia na tela ("2:51" para um
  // áudio de 28s). O tempo agora vem de audioDur(id, lang), que só responde
  // quando existe MP3 de verdade — sem áudio, nenhum número aparece.
  return out;
}

export default function VisionsScreen() {
  const th = useTheme();
  const { t, lang } = useT();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { state, loading, toggleSavedVision } = useApp();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  const CARD_W = width - 72;

  const visions = useMemo(() => VISIONS.map((v) => localize(v, lang)), [lang]);

  // Ouvir a mesma visão três vezes hoje não pode comer os três slots do
  // histórico: uma linha por visão, guardando a escuta mais recente.
  const recent = useMemo(() => {
    if (!state) return [];
    const ultima = new Map();
    state.visionPlays.forEach((p) => {
      const atual = ultima.get(p.visionId);
      if (!atual || String(p.date) > String(atual.date)) ultima.set(p.visionId, p);
    });
    return Array.from(ultima.values())
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5)
      .map((p) => ({ ...p, vision: visions.find((v) => v.id === p.visionId) }))
      .filter((p) => p.vision);
  }, [state, visions]);

  const catLabel = (key) => (CAT[key] ? t(CAT[key]) : String(key || ''));

  if (loading || !state) {
    return (
      <Screen>
        <Header title={t(S.title)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={th.accent} />
        </View>
      </Screen>
    );
  }

  const saved = visions.filter((v) => state.savedVisions.includes(v.id));

  // onMomentumScrollEnd nunca dispara no react-native-web: as bolinhas ficavam
  // travadas na primeira para sempre. onScroll acompanha o dedo na web e o
  // momentum continua fechando a conta no nativo.
  const syncIndex = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const bruto = Math.round(x / (CARD_W + GAP));
    const i = Math.max(0, Math.min(visions.length - 1, bruto));
    if (i !== index) {
      setIndex(i);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  return (
    <Screen>
      <Header title={t(S.title)} subtitle={t(S.subtitle)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={[styles.lead, { color: th.textMuted }]}>
          {t(S.leadA)}
          <Text style={[styles.leadItalic, { color: th.text }]}>{t(S.leadB)}</Text>
        </Text>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + GAP}
          decelerationRate="fast"
          onScroll={syncIndex}
          scrollEventThrottle={16}
          onMomentumScrollEnd={syncIndex}
          contentContainerStyle={styles.carousel}
        >
          {visions.map((v) => {
            const isSaved = state.savedVisions.includes(v.id);
            const dur = audioDur(v.id, lang);
            return (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('VisionPlayer', { visionId: v.id })}
                style={{ width: CARD_W, marginRight: GAP }}
              >
                <GradientCover accent={v.accent} radius={26} style={styles.slide}>
                  <View style={styles.slideTop}>
                    <View style={[styles.pill, { backgroundColor: alpha('#FFFFFF', 0.28) }]}>
                      <Ionicons name={categoryMeta(v.category).icon} size={12} color="#FFFFFF" />
                      <Text style={styles.pillText}>{catLabel(v.category)}</Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        toggleSavedVision(v.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isSaved ? t(S.unsave) : t(S.save)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={20}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.slideBody}>
                    <Text style={styles.caption}>{v.caption}</Text>
                  </View>

                  <View style={styles.slideBottom}>
                    <View style={[styles.playCircle, { backgroundColor: alpha('#FFFFFF', 0.92) }]}>
                      <Ionicons name="play" size={20} color={accentAt(th, v.accent)} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={styles.slideTitle}>
                        {v.title}
                      </Text>
                      {dur != null ? (
                        <Text style={styles.slideDur}>
                          {t(S.narration, { time: formatTime(dur) })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </GradientCover>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.dots}>
          {visions.map((v, i) => (
            <View
              key={v.id}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? accentAt(th, i) : alpha(th.textMuted, 0.25),
                  width: i === index ? 20 : 7,
                },
              ]}
            />
          ))}
        </View>

        <SectionHeading title={t(S.savedTitle)} />
        {saved.length === 0 ? (
          <EmptyState
            icon="bookmark-outline"
            title={t(S.savedEmptyTitle)}
            body={t(S.savedEmptyBody)}
          />
        ) : (
          saved.map((v) => {
            const dur = audioDur(v.id, lang);
            return (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('VisionPlayer', { visionId: v.id })}
              >
                <Card style={[styles.row, { backgroundColor: th.surface }]}>
                  <GradientCover accent={v.accent} radius={12} style={styles.thumb} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: th.text }]}>
                      {v.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: th.textMuted }]}>
                      {dur != null ? `${catLabel(v.category)} · ${formatTime(dur)}` : catLabel(v.category)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      toggleSavedVision(v.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t(S.unsave)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={styles.rowAction}
                  >
                    <Ionicons name="bookmark" size={20} color={accentAt(th, v.accent)} />
                  </TouchableOpacity>
                  <Ionicons name="play-circle" size={26} color={accentAt(th, v.accent)} />
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        <SectionHeading title={t(S.recentTitle)} />
        {recent.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t(S.recentEmptyTitle)}
            body={t(S.recentEmptyBody)}
          />
        ) : (
          recent.map((p) => (
            // A linha inteira toca, igual à de salvas — antes só o ícone de
            // ~20px navegava e o resto da linha parecia clicável sem ser.
            <TouchableOpacity
              key={p.visionId}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('VisionPlayer', { visionId: p.visionId })}
              accessibilityRole="button"
              accessibilityLabel={`${p.vision.title} — ${t(S.replay)}`}
            >
              <Card style={[styles.row, { backgroundColor: th.surface }]}>
                <View
                  style={[styles.histIcon, { backgroundColor: alpha(accentAt(th, p.vision.accent), 0.15) }]}
                >
                  <Ionicons name="headset" size={17} color={accentAt(th, p.vision.accent)} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text numberOfLines={1} style={[styles.rowTitle, { color: th.text }]}>
                    {p.vision.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: th.textMuted }]}>{dateLabel(p.date, lang)}</Text>
                </View>
                <Ionicons name="refresh" size={20} color={th.textMuted} />
              </Card>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 28 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { fontSize: 15, textAlign: 'center', marginBottom: 16, marginTop: 4 },
  leadItalic: { fontStyle: 'italic', fontWeight: '600' },
  carousel: { paddingRight: 16 },
  slide: { height: 380, padding: 18, justifyContent: 'space-between' },
  slideTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pillText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', marginLeft: 5 },
  slideBody: { flex: 1, justifyContent: 'center' },
  caption: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 36,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  slideBottom: { flexDirection: 'row', alignItems: 'center' },
  playCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  slideTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  slideDur: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  dot: { height: 7, borderRadius: 4, marginHorizontal: 3 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, marginBottom: 10 },
  thumb: { width: 48, height: 48 },
  histIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowAction: { paddingHorizontal: 8 },
  rowTitle: { fontSize: 14.5, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 3 },
});
