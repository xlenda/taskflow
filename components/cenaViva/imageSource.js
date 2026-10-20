import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

// Imagem da cena viva: a pessoal (usePersonalVisual: blob: no site, file:// no app) ou a cena pronta empacotada.
// Site: a URL vai direto para o <img> do canvas. App: a WebView não lê arquivos do app, então vai como data URI.
export async function imageUriForCenaViva({ personalUri, readyScene }) {
  let uri = personalUri;
  if (!uri) {
    const asset = await Asset.fromModule(readyScene.source).downloadAsync();
    uri = asset.localUri || asset.uri;
  }
  if (Platform.OS === 'web') return uri;
  return `data:image/jpeg;base64,${await new File(uri).base64()}`;
}
