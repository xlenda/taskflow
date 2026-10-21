import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

// Imagem da cena viva: a pessoal (usePersonalVisual: blob: no site, file:// no app) ou a cena pronta empacotada.
// Site: a URL vai direto para o <img> do canvas. App: a WebView não lê arquivos do app, então vai como data URI.
export async function imageUriForCenaViva({ personalUri, readyScene }) {
  let uri = personalUri;
  if (!uri) {
    const asset = Asset.fromModule(readyScene.source);
    // Android release (sem Expo Go nem expo-updates): a imagem empacotada chega com o nome do drawable como localUri
    // e "já baixada" — serve ao <Image>, não ao File. Sem esquema, o downloader nativo do expo-asset copia o recurso
    // (raw ou drawable) para cache/ExponentAsset-<hash>.jpg
    if (Platform.OS === 'android' && asset.localUri && !asset.localUri.includes(':')) {
      asset.downloaded = false;
      asset.localUri = null;
    }
    const downloaded = await asset.downloadAsync();
    uri = downloaded.localUri || downloaded.uri;
  }
  if (Platform.OS === 'web') return uri;
  return `data:image/jpeg;base64,${await new File(uri).base64()}`;
}
