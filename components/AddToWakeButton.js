import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import PrimaryButton from './PrimaryButton';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { useApp } from '../context/AppContext';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { appendToWakeSequence } from '../utils/wakeSequence';

const S = {
  add: { pt: 'Pôr no meu despertar', en: 'Add to my wake-up' },
  inSequence: { pt: 'No seu despertar', en: 'In your wake-up' },
  added: { pt: 'Adicionado ao seu despertar.', en: 'Added to your wake-up.' },
  full: {
    pt: 'Seu despertar já tem 6 itens. Tire um em Meu despertar para incluir este.',
    en: 'Your wake-up already has 6 items. Remove one in My wake-up to include this.',
  },
};

// Appends this content to the end of the wake-up sequence and confirms it.
// Hidden when the content cannot play in the wake-up.
export default function AddToWakeButton({ kind, id, campaign, accent = 0, style }) {
  const theme = useTheme();
  const { t } = useT();
  const { state, addToWakeSequence } = useApp();
  const [addedId, setAddedId] = useState(null);
  const status = useMemo(() => appendToWakeSequence(state, { kind, id }), [state, kind, id]);

  if (!RELEASE_FEATURES.wakeSequence || status.reason === 'unknown') return null;
  const inSequence = status.reason === 'duplicate';
  const full = status.reason === 'full';
  const note = full ? t(S.full) : inSequence && addedId === id ? t(S.added) : '';

  return (
    <View style={style}>
      <PrimaryButton
        testID={`add-to-wake-${campaign}`}
        label={inSequence ? S.inSequence : S.add}
        icon={inSequence ? 'checkmark-circle' : 'alarm-outline'}
        accent={accent}
        variant="soft"
        disabled={inSequence || full}
        onPress={() => {
          if (addToWakeSequence({ kind, id }).ok) setAddedId(id);
        }}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.note, !note && styles.hidden, { color: theme.textMuted }]}
      >
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 8, letterSpacing: 0 },
  hidden: { marginTop: 0 },
});
