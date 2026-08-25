import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { CATEGORIES, categoryMeta, localized } from '../constants/content';
import { APP_NAME, APP_URL } from '../constants/brand';
import { accentAt, alpha } from '../utils/colors';
import { todayISO } from '../utils/date';
import { useT } from '../utils/useT';
import {
  narrate,
  stopSpeaking,
  warmUpVoices,
  isSpeechAvailable,
} from '../utils/speech';

import AffirmationCard from '../components/AffirmationCard';
import SectionHeading from '../components/SectionHeading';
import PrimaryButton from '../components/PrimaryButton';

const S = {
  title: { en: 'Affirmations', pt: 'Afirmações' },
  subtitle: { en: 'Come back once daily', pt: 'Volte aqui uma vez por dia' },
  all: { en: 'All', pt: 'Todas' },
  fromDreams: { en: 'From your dreams', pt: 'Dos seus sonhos' },
  fromDream: { en: 'From your dream', pt: 'Do seu sonho' },
  fromIntention: { en: 'From your intention', pt: 'Da sua intenção' },
  listen: { en: 'Listen to this affirmation', pt: 'Ouvir esta afirmação' },
  stopListen: { en: 'Stop the audio', pt: 'Parar o áudio' },
  share: { en: 'Share this affirmation', pt: 'Compartilhar esta afirmação' },
  copied: { en: 'Copied ✓', pt: 'Copiado ✓' },
  emptyTitle: { en: 'No affirmations here', pt: 'Nenhuma afirmação por aqui' },
  emptyBody: {
    en: 'Create a manifestation or share a dream to receive an affirmation made for you.',
    pt: 'Crie uma manifestação ou conte um sonho para receber uma afirmação feita para você.',
  },
  readTitle: { en: 'Today’s affirmation received', pt: 'Afirmação de hoje recebida' },
  readPrompt: { en: 'Read one to keep your streak', pt: 'Leia uma para manter sua sequência' },
  markToday: { en: 'I received this affirmation', pt: 'Recebi esta afirmação' },
  copyManual: {
    en: 'Sharing is off in this browser. Copy the text below:',
    pt: 'Compartilhar não funciona neste navegador. Copie o texto abaixo:',
  },
  copyDone: { en: 'Done', pt: 'Pronto' },
  removeFav: { en: 'Remove from favourites', pt: 'Tirar das favoritas' },
  logged: { en: '{n} days of affirmations logged', pt: '{n} dias de afirmações registrados' },
  loggedOne: { en: '1 day of affirmations logged', pt: '1 dia de afirmações registrado' },
  favTitle: { en: 'Favourites ({n})', pt: 'Favoritas ({n})' },
  favEmptyTitle: { en: 'No favourites yet', pt: 'Nenhuma favorita ainda' },
  favEmptyBody: {
    en: 'Tap the heart on an affirmation to keep it in your pocket.',
    pt: 'Toque no coração de uma afirmação para guardá-la com você.',
  },
  privateAudioUnavailable: {
    en: 'Private audio is unavailable on this device. Your affirmation remains here in text.',
    pt: 'A voz privada não está disponível neste aparelho. Sua afirmação continua aqui em texto.',
  },
};

const DREAMS_FILTER = 'Dreams';

// O conteúdo (afirmações e categorias) guarda os campos como { en, pt } e
// `localized` devolve o item já resolvido no idioma da pessoa. O guard mantém a
// tela de pé caso um ambiente ainda esteja com o conteúdo antigo em string.
const loc = (item, lang) => (typeof localized === 'function' ? localized(item, lang) : item);

// "Afirmação do dia" de verdade: o índice inicial nasce da DATA, não de zero.
// Todo dia abre numa afirmação diferente, a mesma o dia inteiro e em qualquer
// sessão — as setas seguem livres para navegar a partir dali.
const dayHash = (iso) => {
  let h = 0;
  for (let i = 0; i < iso.length; i++) h = (h * 31 + iso.charCodeAt(i)) % 100003;
  return h;
};

const seedIndex = (len) => (len > 0 ? dayHash(todayISO()) % len : 0);

export default function AffirmationsScreen() {
  const theme = useTheme();
  const { t, lang } = useT();
  const { state, loading, toggleFavoriteAffirmation, markAffirmationRead } = useApp();
  const narratorId = state?.narration?.narratorId;
  // `null` significa "a pessoa ainda não escolheu um filtro". Todo deck desta
  // tela nasce das manifestações e dos sonhos salvos pela própria pessoa.
  const [filter, setFilter] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(null);
  const isFocused = useIsFocused();

  // O dia SÓ é registrado por ação real: ouvir a afirmação até o fim, guardar
  // nas favoritas ou tocar em "Recebi esta afirmação". Antes bastava ENTRAR na
  // aba — um efeito de montagem marcava o dia e a sequência do app inteiro
  // subia sozinha, dizendo que a pessoa fez algo que ela não fez.
  //
  // Trava necessária: na web, cancelar a fala do aparelho dispara o mesmo
  // "onend" do fim natural. Sem isto, parar no meio contaria como ouvido até o
  // fim. Todo caminho que interrompe a voz de propósito liga a trava.
  const abortedRef = useRef(false);
  const audioRunRef = useRef(0);

  // A lista de vozes do navegador chega assíncrona; aquecer aqui garante que o
  // PRIMEIRO toque já saia com a voz escolhida, não com a padrão robótica.
  useEffect(() => {
    warmUpVoices(lang, { localOnly: true, narratorId });
  }, [lang, narratorId]);

  // A voz nunca sobrevive à tela: para ao perder o foco (troca de aba) e no
  // cleanup, que cobre também o desmonte.
  useEffect(() => {
    if (!isFocused) {
      audioRunRef.current += 1;
      abortedRef.current = true;
      stopSpeaking();
      setSpeaking(false);
    }
    return () => {
      audioRunRef.current += 1;
      abortedRef.current = true;
      stopSpeaking();
    };
  }, [isFocused]);

  // A afirmação da intenção nasce no onboarding ou na criação de uma nova
  // manifestação; os relatos do ritual entram logo abaixo no mesmo deck.
  const manifestationAffirmations = useMemo(
    () =>
      ((state && state.manifestations) || [])
        .filter((m) => typeof m.affirmation === 'string' && m.affirmation.trim())
        .map((m) => ({
          id: `manifestation:${m.id}`,
          manifestationId: m.id,
          sourceTitle: m.title,
          category: m.category,
          accent: m.accent,
          text: m.affirmation.trim(),
          speechLang: m.lang,
          personalized: true,
          source: 'manifestation',
        })),
    [state && state.manifestations]
  );

  const dreamAffirmations = useMemo(
    () =>
      (((state && state.morningRitual) || {}).entries || [])
        .filter((entry) => typeof entry.affirmation === 'string' && entry.affirmation.trim())
        .map((entry) => ({
          id: `ritual:${entry.id}`,
          ritualEntryId: entry.id,
          sourceTitle: entry.dreamAnchor || entry.dream,
          accent: 1,
          text: entry.affirmation.trim(),
          speechLang: entry.lang,
          personalized: true,
          source: 'dream',
        })),
    [state && state.morningRitual]
  );

  const allAffirmations = useMemo(
    () => [...manifestationAffirmations, ...dreamAffirmations],
    [manifestationAffirmations, dreamAffirmations]
  );

  const activeFilter = filter || 'All';

  const listFor = useCallback(
    (key) => {
      if (key === DREAMS_FILTER) return dreamAffirmations;
      if (key === 'All') return allAffirmations;
      return allAffirmations.filter((a) => a.category === key);
    },
    [allAffirmations, dreamAffirmations]
  );

  const list = useMemo(() => listFor(activeFilter), [activeFilter, listFor]);

  const chips = useMemo(
    () => [
      ...(dreamAffirmations.length > 0
        ? [{ key: DREAMS_FILTER, label: t(S.fromDreams), accent: 3 }]
        : []),
      { key: 'All', label: t(S.all), accent: 0 },
      ...CATEGORIES.map((c) => ({
        key: c.key,
        label: loc(c, lang).label || c.key,
        accent: c.accent,
      })),
    ],
    [dreamAffirmations.length, t, lang]
  );

  const stopSpeech = useCallback(() => {
    audioRunRef.current += 1;
    abortedRef.current = true;
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const seededIndex = list.length > 0 ? seedIndex(list.length) : 0;
  const selectedIndex = selectedId ? list.findIndex((item) => item.id === selectedId) : -1;
  const safeIndex = selectedIndex >= 0 ? selectedIndex : seededIndex;
  const current = list[safeIndex];
  const currentId = current && current.id;

  // Se uma manifestação for criada, removida ou reordenada enquanto a aba
  // continua montada, a frase visível não pode trocar por baixo de um áudio ou
  // fallback antigo. A identidade estável também evita índices fora da lista.
  useEffect(() => {
    stopSpeech();
    setAudioFailed(false);
    setManual(null);
    setCopied(false);
  }, [currentId, stopSpeech]);

  useEffect(() => {
    if (current && current.personalized) {
      warmUpVoices(current.speechLang || lang, { localOnly: true, narratorId });
    }
  }, [current, lang, narratorId]);

  if (loading || !state) {
    return (
      <Screen>
        <Header title={t(S.title)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Screen>
    );
  }

  const currentLoc = current ? loc(current, lang) : null;
  const category = current && current.source !== 'dream'
    ? categoryMeta(current.category)
    : { accent: current && typeof current.accent === 'number' ? current.accent : 1 };
  const meta = {
    ...category,
    accent:
      current && typeof current.accent === 'number' ? current.accent : category.accent,
  };
  const favorites = allAffirmations.filter((a) => state.favoriteAffirmations.includes(a.id));
  const readToday = state.affirmationDates.includes(todayISO());
  const daysLogged = state.affirmationDates.length;
  const catLabel = (key) => loc(categoryMeta(key), lang).label || key;
  const currentPersonal = !!current;
  const currentCategoryLabel = current
    ? current.source === 'dream'
      ? t(S.fromDream)
      : `${t(S.fromIntention)} · ${catLabel(current.category)}`
    : '';
  // A ação principal da tela é OUVIR — botão grande com rótulo, não um ícone
  // cinza de 20px no canto do card. Texto pessoal só pode usar uma voz local
  // comprovável; no nativo, onde essa garantia não existe, permanece em texto.
  const canHear = current ? Platform.OS === 'web' && isSpeechAvailable() : false;

  // Compartilhar é o único laço de aquisição orgânica do app — e no desktop
  // (Firefox, boa parte do Chrome) Share.share simplesmente rejeita porque a
  // API não existe. Aí sim vale a área de transferência. A URL vai junto:
  // mensagem sem link não traz ninguém de volta.
  //
  // Dispensar a folha nativa TAMBÉM chega aqui como rejeição (AbortError na
  // web, dismissedAction no aparelho) — e copiar nesse caso anunciava
  // "Copiado ✓" de algo que a pessoa acabou de recusar. Desistir é desistir:
  // sai calado.
  const shareIt = async () => {
    if (!currentLoc) return;
    const texto = `“${currentLoc.text}” — ${APP_NAME}\n${APP_URL}`;
    setManual(null);
    try {
      const r = await Share.share({ message: texto });
      if (r && r.action === Share.dismissedAction) return;
      return;
    } catch (e) {
      const nome = (e && e.name) || '';
      const msg = String((e && e.message) || '');
      if (nome === 'AbortError' || /abort|cancel/i.test(msg)) return;
      // qualquer outra rejeição = compartilhar indisponível, segue no fallback
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
        return;
      }
    } catch (e2) {
      // clipboard bloqueado (http, permissão negada) — cai no texto manual
    }
    // Sem compartilhar e sem área de transferência o botão terminava em
    // silêncio. Mostrar o texto para copiar à mão é o mínimo honesto.
    setManual(texto);
  };

  // No Safari a fala só nasce dentro do gesto: speak() é chamado direto aqui,
  // nunca por efeito ou timeout.
  const toggleSpeak = () => {
    if (speaking) {
      stopSpeech();
      return;
    }
    const body = currentLoc && currentLoc.text;
    if (!body) return;
    setAudioFailed(false);
    setSpeaking(true);
    abortedRef.current = false;
    const run = audioRunRef.current + 1;
    audioRunRef.current = run;
    // Conteúdo pessoal nunca recebe um id do antigo catálogo de MP3. Enquanto
    // a voz dinâmica não está ativa, usa apenas uma voz local do navegador.
    const ok = narrate(null, body, {
      lang: current.speechLang || lang,
      narratorId,
      localOnly: true,
      // Ouviu até o FIM = recebeu a afirmação de hoje. Parar no meio, trocar de
      // afirmação ou sair da aba liga a trava e não conta.
      onDone: () => {
        if (run !== audioRunRef.current) return;
        setSpeaking(false);
        if (!abortedRef.current) markAffirmationRead();
      },
      onError: () => {
        if (run !== audioRunRef.current) return;
        setSpeaking(false);
        if (currentPersonal) setAudioFailed(true);
      },
    });
    if (!ok) {
      setSpeaking(false);
      if (currentPersonal) setAudioFailed(true);
    }
  };

  const next = (step) => {
    if (list.length === 0) return;
    stopSpeech();
    // O card de cópia manual guarda o texto de UMA afirmação: se a exibida
    // muda, ele precisa sumir — senão a pessoa copia a frase anterior achando
    // que é a que está vendo.
    setManual(null);
    Haptics.selectionAsync().catch(() => {});
    setAudioFailed(false);
    const nextIndex = (safeIndex + step + list.length * 10) % list.length;
    setSelectedId(list[nextIndex].id);
  };

  return (
    <Screen>
      <Header title={t(S.title)} subtitle={t(S.subtitle)} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const active = chip.key === activeFilter;
            const c = accentAt(theme, chip.accent);
            return (
              <TouchableOpacity
                key={chip.key}
                activeOpacity={0.8}
                onPress={() => {
                  stopSpeech();
                  setAudioFailed(false);
                  setManual(null);
                  setFilter(chip.key);
                  const nextList = listFor(chip.key);
                  setSelectedId(nextList[seedIndex(nextList.length)]?.id || null);
                  Haptics.selectionAsync().catch(() => {});
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? c : alpha(c, 0.12),
                    borderColor: alpha(c, 0.3),
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#FFFFFF' : c }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {current ? (
          <>
            <AffirmationCard
              affirmation={currentLoc}
              categoryLabel={currentCategoryLabel}
              accent={meta.accent}
              favorite={state.favoriteAffirmations.includes(current.id)}
              onToggleFavorite={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                const guardando = !state.favoriteAffirmations.includes(current.id);
                toggleFavoriteAffirmation(current.id);
                // Guardar uma afirmação é ação real: conta o dia. Tirar não.
                if (guardando) markAffirmationRead();
              }}
              // Sem onToggleSpeak: o ícone cinza de 20px saiu do card — ouvir
              // agora é o botão grande logo abaixo.
              onShare={shareIt}
            />

            <View style={styles.navRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => next(-1)}
                style={[
                  styles.navBtn,
                  { backgroundColor: alpha(accentAt(theme, meta.accent), 0.12) },
                ]}
              >
                <Ionicons name="chevron-back" size={20} color={accentAt(theme, meta.accent)} />
              </TouchableOpacity>
              <Text style={[styles.counter, { color: theme.textMuted }]}>
                {safeIndex + 1} / {list.length}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => next(1)}
                style={[
                  styles.navBtn,
                  { backgroundColor: alpha(accentAt(theme, meta.accent), 0.12) },
                ]}
              >
                <Ionicons name="chevron-forward" size={20} color={accentAt(theme, meta.accent)} />
              </TouchableOpacity>
            </View>

            {/* Invertido: OUVIR é a ação principal, grande e com rótulo — era
                um ícone cinza de 20px enquanto o botão dourado compartilhava. */}
            {canHear ? (
              <PrimaryButton
                label={speaking ? t(S.stopListen) : t(S.listen)}
                icon={speaking ? 'stop' : 'volume-high'}
                accent={meta.accent}
                onPress={toggleSpeak}
                style={{ marginTop: 16 }}
              />
            ) : null}
            {currentPersonal && (!canHear || audioFailed) ? (
              <Text style={[styles.privateAudioNote, { color: theme.textMuted }]}>
                {t(S.privateAudioUnavailable)}
              </Text>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="sparkles-outline"
            title={t(S.emptyTitle)}
            body={t(S.emptyBody)}
          />
        )}

        {/* O status do dia mora logo abaixo do card da afirmação — antes
            ficava em y=616, fora da tela. */}
        <Card style={[styles.todayCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.todayIcon, { backgroundColor: alpha(accentAt(theme, 3), 0.15) }]}>
            <Ionicons
              name={readToday ? 'checkmark-circle' : 'notifications-outline'}
              size={20}
              color={accentAt(theme, 3)}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.todayTitle, { color: theme.text }]}>
              {readToday ? t(S.readTitle) : t(S.readPrompt)}
            </Text>
            {daysLogged > 0 ? (
              <Text style={[styles.todaySub, { color: theme.textMuted }]}>
                {daysLogged === 1 ? t(S.loggedOne) : t(S.logged, { n: daysLogged })}
              </Text>
            ) : null}
          </View>
        </Card>

        {/* O botão explícito é o caminho mais curto para registrar o dia sem
            precisar ouvir tudo nem favoritar — e só aparece enquanto o dia de
            hoje ainda não foi registrado. */}
        {current && !readToday ? (
          <PrimaryButton
            label={t(S.markToday)}
            icon="checkmark-circle-outline"
            accent={3}
            variant="soft"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              markAffirmationRead();
            }}
            style={{ marginTop: 12 }}
          />
        ) : null}

        {current ? (
          <>
            {/* Compartilhar agora é o secundário. */}
            <PrimaryButton
              label={copied ? t(S.copied) : t(S.share)}
              icon="share-outline"
              accent={meta.accent}
              variant="ghost"
              onPress={shareIt}
              style={{ marginTop: 12 }}
            />

            {manual ? (
              <Card style={[styles.manualCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.manualTitle, { color: theme.text }]}>{t(S.copyManual)}</Text>
                <Text selectable style={[styles.manualText, { color: theme.textMuted }]}>
                  {manual}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setManual(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t(S.copyDone)}
                  style={styles.manualClose}
                >
                  <Text style={[styles.manualCloseText, { color: accentAt(theme, meta.accent) }]}>
                    {t(S.copyDone)}
                  </Text>
                </TouchableOpacity>
              </Card>
            ) : null}
          </>
        ) : null}

        <SectionHeading title={t(S.favTitle, { n: favorites.length })} />
        {favorites.length === 0 ? (
          <EmptyState
            icon="heart-outline"
            title={t(S.favEmptyTitle)}
            body={t(S.favEmptyBody)}
          />
        ) : (
          favorites.map((a) => {
            const c = accentAt(
              theme,
              a.source === 'dream' ? a.accent : categoryMeta(a.category).accent
            );
            return (
              <Card key={a.id} style={[styles.favRow, { backgroundColor: theme.surface }]}>
                <View style={[styles.favBar, { backgroundColor: c }]} />
                <View style={{ flex: 1, paddingLeft: 12 }}>
                  <Text style={[styles.favText, { color: theme.text }]}>{loc(a, lang).text}</Text>
                  <Text style={[styles.favCat, { color: c }]}>
                    {(a.source === 'dream'
                      ? t(S.fromDream)
                      : `${t(S.fromIntention)} · ${catLabel(a.category)}`
                    ).toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleFavoriteAffirmation(a.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t(S.removeFav)}
                  style={styles.favBtn}
                >
                  <Ionicons name="heart" size={19} color={c} />
                </TouchableOpacity>
              </Card>
            );
          })
        )}
        <View style={{ height: 28 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chips: { paddingRight: 8, paddingBottom: 16, paddingTop: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    marginRight: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  navBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 13, fontWeight: '700', marginHorizontal: 20 },
  privateAudioNote: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    marginTop: 16,
  },
  todayIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  todayTitle: { fontSize: 14.5, fontWeight: '700' },
  todaySub: { fontSize: 12.5, marginTop: 3 },
  favRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, marginBottom: 10 },
  favBar: { width: 4, height: 40, borderRadius: 2 },
  // 44px de alvo real: hitSlop não aumenta área nenhuma no react-native-web.
  // A margem negativa devolve o ícone ao alinhamento antigo da borda do card.
  favBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  manualCard: { padding: 16, borderRadius: 18, marginTop: 12 },
  manualTitle: { fontSize: 13.5, fontWeight: '700' },
  manualText: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  manualClose: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  manualCloseText: { fontSize: 13.5, fontWeight: '700' },
  favText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  favCat: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.2, marginTop: 6 },
});
