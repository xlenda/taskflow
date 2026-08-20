#!/usr/bin/env bash
# Deploy do Celeste (web) → Vercel, projeto "celeste" (xlendas-projects).
# Uso: bash scripts/deploy-web.sh
# NUNCA rodar `vercel deploy` solto em outra pasta — este script cuida do link
# e ABORTA se a verificação ao vivo falhar (regra do new-app-playbook).
set -e
cd "$(dirname "$0")/.."

npx expo export --platform web

# Enxuga as fontes de ícone: o export copia as 19 famílias (4 MB) mesmo usando
# uma só, e serve o Ionicons inteiro (381 KB) quando o app precisa de algumas
# dezenas de glifos.
node scripts/enxugar-fontes.js

cp vercel.json dist/vercel.json
cp .vercelignore dist/.vercelignore

# A função de locução sob demanda vai junto: o deploy é da pasta dist/, então
# ela precisa do api/ e de um package.json com a dependência para a Vercel
# instalar e construir a função.
mkdir -p dist/api
cp api/*.js dist/api/
node -e "
const fs=require('fs');
const raiz=JSON.parse(fs.readFileSync('package.json','utf8'));
const dep=(raiz.dependencies||{})['msedge-tts'] || (raiz.devDependencies||{})['msedge-tts'];
if(!dep){ console.error('❌ msedge-tts não está no package.json'); process.exit(1); }
fs.writeFileSync('dist/package.json', JSON.stringify({
  name:'celeste-web', private:true, version:'1.0.0',
  dependencies:{ 'msedge-tts': dep }
},null,2));
console.log('api/ + package.json da função preparados (msedge-tts '+dep+')');
" || exit 1

# Blindagem anti Google Tradutor no HTML estático (camada 1; App.js é a camada 2)
sed -i 's/<html lang="en">/<html lang="en" translate="no" class="notranslate">/' dist/index.html
sed -i 's#</title>#</title><meta name="google" content="notranslate" />#' dist/index.html
grep -q 'notranslate' dist/index.html || { echo "❌ patch notranslate não aplicou"; exit 1; }

# Altura dinâmica: o export do Expo serve height:100%, que no Safari/WhatsApp NÃO
# desconta a barra do navegador — o pé de toda tela (botão Continuar, campo de
# texto) fica embaixo dela sem gesto de recuperação. 100dvh acompanha a barra.
# viewport-fit=cover é o que faz env(safe-area-inset-*) valer no iPhone.
sed -i 's/initial-scale=1, shrink-to-fit=no/initial-scale=1, shrink-to-fit=no, viewport-fit=cover/' dist/index.html
sed -i 's|</head>|<style id="celeste-dvh">html,body,#root{height:100dvh;max-height:100dvh}</style></head>|' dist/index.html
grep -q 'celeste-dvh' dist/index.html || { echo "❌ patch de altura (dvh) não aplicou"; exit 1; }
grep -q 'viewport-fit=cover' dist/index.html || { echo "❌ patch de viewport-fit não aplicou"; exit 1; }

# Splash instantâneo: o bundle do React Native Web leva ~4s para pintar no 4G e
# até lá a tela fica BRANCA. Este bloco entra dentro do #root e é substituído
# sozinho quando o React monta — o usuário vê a marca em ~0,5s.
python - "$PWD/dist/index.html" <<'PY'
import io, sys
p = sys.argv[1]
html = io.open(p, encoding='utf-8').read()
splash = (
  '<div id="celeste-splash" style="position:fixed;inset:0;display:flex;align-items:center;'
  'justify-content:center;background:linear-gradient(180deg,#AFC8E7,#C9DBEF,#E6EFF8);'
  'font-family:Georgia,serif;font-size:44px;color:#1C2E4F;letter-spacing:.01em">Celeste</div>'
)
marker = '<div id="root">'
if marker in html and 'celeste-splash' not in html:
    html = html.replace(marker, marker + splash, 1)
    io.open(p, 'w', encoding='utf-8').write(html)
    print('splash injetado')
else:
    print('splash ja presente ou #root nao encontrado')
PY
grep -q 'celeste-splash' dist/index.html || { echo "❌ splash não aplicou"; exit 1; }

# Tags de compartilhamento: sem elas o link colado no WhatsApp/Instagram aparece
# pelado, sem título nem imagem — e compartilhar é o único laço de aquisição
# orgânica do app hoje.
python - "$PWD/dist/index.html" <<'PY'
import io, sys
p = sys.argv[1]
html = io.open(p, encoding='utf-8').read()
if 'og:title' not in html:
    tags = (
      '<meta property="og:title" content="Celeste — manifeste a vida que você deseja" />'
      '<meta property="og:description" content="Afirmações e visualizações guiadas, criadas a partir das suas próprias respostas." />'
      '<meta property="og:type" content="website" />'
      '<meta property="og:url" content="https://celeste-jet-two.vercel.app" />'
      '<meta property="og:image" content="https://celeste-jet-two.vercel.app/og.png" />'
      '<meta name="twitter:card" content="summary_large_image" />'
      '<meta name="description" content="Afirmações e visualizações guiadas, criadas a partir das suas próprias respostas." />'
    )
    html = html.replace('</head>', tags + '</head>', 1)
    io.open(p, 'w', encoding='utf-8').write(html)
    print('og tags injetadas')
else:
    print('og tags ja presentes')
PY
grep -q 'og:title' dist/index.html || { echo "❌ og tags não aplicaram"; exit 1; }

# Portão de paridade EN/PT: nenhum texto vai ao ar só em inglês
node scripts/i18n-parity.js || { echo "❌ PARIDADE DE IDIOMA REPROVOU O DEPLOY"; exit 1; }

cd dist
vercel link --yes --project celeste >/dev/null
vercel deploy --prod --yes

PROD="https://celeste-jet-two.vercel.app"
HASH_LOCAL=$(ls _expo/static/js/web/AppEntry-*.js | xargs -n1 basename)
code_root=$(curl -s -o /dev/null -w "%{http_code}" "$PROD/")
code_deep=$(curl -s -o /dev/null -w "%{http_code}" "$PROD/rota-interna-f5")
HASH_LIVE=$(curl -s "$PROD/" | grep -o 'AppEntry-[a-f0-9]*\.js' | head -1)

# fonte dos ícones precisa voltar como fonte, não como index.html
FONT_PATH=$(find assets -iname "Ionicons.*.ttf" | head -1)
FONT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" "$PROD/$FONT_PATH")

echo "raiz=$code_root rota-interna=$code_deep"
echo "bundle local=$HASH_LOCAL"
echo "bundle live =$HASH_LIVE"
echo "fonte icones: $FONT_TYPE ($FONT_PATH)"

if [ "$code_root" != "200" ] || [ "$code_deep" != "200" ] || [ "$HASH_LOCAL" != "$HASH_LIVE" ]; then
  echo "❌ VERIFICACAO AO VIVO FALHOU — produção pode estar quebrada"
  exit 1
fi
case "$FONT_TYPE" in
  *html*) echo "❌ FONTE DOS ICONES sendo servida como HTML (node_modules ignorado no upload)"; exit 1 ;;
esac
echo "✅ Verificado ao vivo: $PROD"

# Portão E2E: percorre o onboarding inteiro em produção e ABORTA se algo sumir.
cd ..
node scripts/e2e-prod.js || { echo "❌ PORTÃO E2E FALHOU — investigar antes de divulgar"; exit 1; }

# Portão do app interno: 4 abas em português, botão de áudio vivo e altura
# dinâmica, verificados num viewport de iPhone real.
node scripts/verify-app-pt.js || { echo "❌ PORTÃO DO APP INTERNO FALHOU"; exit 1; }

# Portão anti-quadradinho: prova que o subset da fonte não comeu nenhum ícone.
node scripts/verificar-icones.js || { echo "❌ ÍCONES QUEBRADOS EM PRODUÇÃO"; exit 1; }

# Portão bilíngue: nem inglês vazando no PT, nem português vazando no EN.
node scripts/auditoria-idiomas.js || { echo "❌ VAZAMENTO DE IDIOMA"; exit 1; }
