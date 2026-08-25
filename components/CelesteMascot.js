import React from 'react';
import { Image } from 'react-native';

const MASCOT = require('../assets/mascot/celi.png');

export default function CelesteMascot({ size = 64, style, testID, accessibilityLabel }) {
  return (
    <Image
      source={MASCOT}
      resizeMode="contain"
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityIgnoresInvertColors
      style={[{ width: size, height: size }, style]}
    />
  );
}
