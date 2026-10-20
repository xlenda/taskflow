import React, { forwardRef } from 'react';

import ShareCard, { SHARE_CARD_ASPECT_RATIO, SHARE_CARD_LAYOUT_SIZE } from './ShareCard';

export const AFFIRMATION_SHARE_ASPECT_RATIO = SHARE_CARD_ASPECT_RATIO;
export const AFFIRMATION_SHARE_LAYOUT_SIZE = SHARE_CARD_LAYOUT_SIZE;

const affirmationValue = (affirmation) =>
  String((typeof affirmation === 'string' ? affirmation : affirmation && affirmation.text) || '').trim();

/**
 * Cartão vertical da afirmação = o ShareCard (mesma assinatura: Traço Celeste + Celeste + link). Mantém a API e os
 * testIDs de antes; exporta apenas a afirmação que a pessoa conferiu, o rótulo, a marca e a URL.
 */
const AffirmationShareCard = forwardRef(function AffirmationShareCard(
  {
    affirmation,
    categoryLabel,
    accent = 0,
    visualKey,
    style,
    testID = 'affirmation-share-card',
    onLayout,
    onVisualReady,
    onVisualError,
  },
  ref
) {
  return (
    <ShareCard
      ref={ref}
      phrase={affirmationValue(affirmation)}
      kindLabel={categoryLabel}
      accent={accent}
      visualKey={visualKey}
      testID={testID}
      onLayout={onLayout}
      onVisualReady={onVisualReady}
      onVisualError={onVisualError}
      style={style}
    />
  );
});

export default AffirmationShareCard;
