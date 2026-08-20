import { Alert, Platform } from 'react-native';

// Alert.alert é NO-OP literal no react-native-web — qualquer confirmação via
// Alert simplesmente não acontece na web (bug crítico pego na auditoria 09/08).
// Use SEMPRE este helper para confirmações destrutivas; funciona nas duas
// plataformas e devolve Promise<boolean>.
export function confirmAsync({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = true }) {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(message ? `${title}\n\n${message}` : title);
    return Promise.resolve(!!ok);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
