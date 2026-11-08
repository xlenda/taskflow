// Portão da Barra Pérola (components/PearlTabBar.js), a barra de abas de vidro perolado com a pílula deslizante.
// Monta o componente DE VERDADE (Babel) com React/react-native de mentira e confere o comportamento:
//  1) cinco abas com role "tab", rótulo, testID estável (o E2E clica por eles) e só a aba ativa "selected";
//  2) tocar numa aba emite tabPress e navega; tocar na ativa ou com preventDefault não navega;
//  3) a pílula desliza até a aba nova (timing 280 ms, curva com passada) e o toque encolhe a aba (0,92) e volta;
//  4) reduzir movimento: a pílula pula direto (setValue), sem animação nem encolher; vale também se mudar com o app aberto;
//  5) teclado aberto esconde a barra SEM sair do fluxo (View de altura 0, nunca null/absolute — ARMADILHAS.md);
//  6) área segura e larguras estreitas (fonte 10 abaixo de 390 px, medida no Chrome);
//  7) contraste dos rótulos >= 4,5:1 sobre a pérola em todos os temas do app;
//  8) App.js usa a barra e o arquivo não usa backdrop-filter.
// Uso (cwd = raiz do app): node scripts/verificar-barra-perola.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const BAR = 'components/PearlTabBar.js';

function loadWith(relative, mocks) {
  const cache = new Map();
  const compile = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const code = transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, loaded);
    loaded._compile(code, file);
    return loaded.exports;
  };
  const original = Module._load;
  Module._load = (request, parent, isMain) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (request.startsWith('.') && !/[\\/]node_modules[\\/]/.test(parent.filename)) {
      return compile(require.resolve(path.resolve(path.dirname(parent.filename), request)));
    }
    return original(request, parent, isMain);
  };
  try {
    return compile(path.join(root, relative));
  } finally {
    Module._load = original;
  }
}

// React de mentira: estado, refs, memo e efeitos na ordem do React, para um componente só
function fakeReact() {
  let current = null;
  const changed = (prev, next) =>
    !prev || !next || prev.length !== next.length || next.some((value, i) => !Object.is(value, prev[i]));
  const slot = (make) => {
    const i = current.cursor++;
    if (!current.slots[i]) current.slots[i] = make();
    return current.slots[i];
  };
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const React = {
    useState(initial) {
      const instance = current;
      const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      state.set =
        state.set ||
        ((next) => {
          const value = typeof next === 'function' ? next(state.value) : next;
          if (Object.is(value, state.value)) return;
          state.value = value;
          instance.dirty = true;
        });
      return [state.value, state.set];
    },
    useRef: (initial) => slot(() => ({ current: initial })),
    useMemo(make, deps) {
      const memo = slot(() => ({}));
      if (!('value' in memo) || changed(memo.deps, deps)) Object.assign(memo, { value: make(), deps });
      return memo.value;
    },
    useCallback: (fn, deps) => React.useMemo(() => fn, deps),
    useEffect(effect, deps) {
      const instance = current;
      const hook = slot(() => ({ effect: true }));
      if (hook.ran && deps && !changed(hook.deps, deps)) return;
      Object.assign(hook, { ran: true, deps });
      instance.queue.push(() => {
        if (hook.cleanup) hook.cleanup();
        hook.cleanup = effect();
      });
    },
    createContext: (value) => ({ Provider: 'ContextProvider', Consumer: 'ContextConsumer', value }),
    useContext: (context) => context.value,
    createElement: (type, props, ...children) => element(type, { ...props, children }),
  };
  React.default = React;
  function mount(Component, props) {
    const instance = { slots: [], cursor: 0, queue: [], dirty: false, props };
    instance.flush = () => {
      for (let pass = 0; pass < 40; pass++) {
        instance.dirty = false;
        instance.cursor = 0;
        current = instance;
        try {
          instance.tree = Component(instance.props);
        } finally {
          current = null;
        }
        instance.queue.splice(0).forEach((run) => run());
        if (!instance.dirty) return instance;
      }
      throw new Error('renderização em laço');
    };
    instance.unmount = () => instance.slots.forEach((hook) => hook && hook.effect && hook.cleanup && hook.cleanup());
    return instance.flush();
  }
  return { React, jsxRuntime: { jsx: element, jsxs: element, Fragment: 'Fragment' }, mount };
}

const nodes = (tree, out = []) => {
  if (Array.isArray(tree)) tree.forEach((child) => nodes(child, out));
  else if (tree && typeof tree === 'object' && 'type' in tree) {
    out.push(tree);
    nodes(tree.props.children, out);
  }
  return out;
};
const flat = (style) => (Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : style || {});
const texts = (tree) => nodes(tree).filter((n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));
const tick = () => new Promise((resolve) => setImmediate(resolve));

// contraste WCAG com transparência composta sobre o fundo
function rgba(color) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const m = /^rgba?\(([^)]+)\)$/.exec(color);
  assert.ok(m, `cor ilegível: ${color}`);
  const parts = m[1].split(',').map(Number);
  return parts.length === 4 ? parts : parts.concat(1);
}
const over = (top, bottom) => {
  const [r, g, b, a] = rgba(top);
  const base = rgba(bottom);
  return `#${[r, g, b].map((c, i) => Math.round(c * a + base[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
};
const luminance = (color) => {
  const [r, g, b] = rgba(color).map((c) => c / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TITLES = ['Manifestar', 'Visões', 'Afirmações', 'Jornada', 'Comunidade'];
const NAMES = ['Manifest', 'Visions', 'Affirm', 'Journey', 'Community'];
const IDS = ['tab-manifest', 'tab-visions', 'tab-affirmations', 'tab-journey', 'tab-community'];

async function main() {
  // temas reais do app (ThemeProvider com o mesmo accent do App.js)
  const themeApp = fakeReact();
  const themeMocks = { react: themeApp.React, 'react-native': { Platform: { OS: 'web', select: (o) => o.web ?? o.default } } };
  const { ThemeProvider } = loadWith('ui/theme.js', themeMocks);
  const THEMES = ['midnight', 'violet', 'ember', 'forest', 'paper', 'cloud', 'blossom', 'mono'].map(
    (name) => themeApp.mount(ThemeProvider, { theme: name, accent: '#4A80C9' }).tree.props.value
  );
  const cloud = THEMES.find((t) => t.name === 'cloud');

  const device = { reduce: false, width: 390, insets: { top: 0, bottom: 0, left: 0, right: 0 }, theme: cloud };
  const log = [];
  const motionListeners = [];
  const keyboard = new Map();
  class Value {
    constructor(value) {
      this.value = value;
    }
    setValue(value) {
      this.value = value;
      log.push({ kind: 'set', node: this, value });
    }
  }
  const animation = (kind) => (node, config) => ({
    start() {
      log.push({ kind, node, config });
      node.value = config.toValue;
    },
    stop() {},
  });
  const RN = (os) => ({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(device.reduce),
      addEventListener: (name, fn) => {
        assert.strictEqual(name, 'reduceMotionChanged');
        motionListeners.push(fn);
        return { remove: () => motionListeners.splice(motionListeners.indexOf(fn), 1) };
      },
    },
    Animated: {
      Value,
      View: 'Animated.View',
      multiply: (a, b) => ({ multiply: [a, b] }),
      timing: animation('timing'),
      spring: animation('spring'),
    },
    Easing: { bezier: (...args) => ({ bezier: args }) },
    Keyboard: {
      addListener: (name, fn) => {
        keyboard.set(name, fn);
        return { remove: () => keyboard.delete(name) };
      },
    },
    Platform: { OS: os, select: (o) => (o[os] !== undefined ? o[os] : o.default) },
    Pressable: 'Pressable',
    StyleSheet: { create: (s) => s, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
    Text: 'Text',
    View: 'View',
    useWindowDimensions: () => ({ width: device.width, height: 800 }),
  });
  const load = (os) => {
    const app = fakeReact();
    const mocks = {
      react: app.React,
      'react/jsx-runtime': app.jsxRuntime,
      'react/jsx-dev-runtime': { ...app.jsxRuntime, jsxDEV: app.jsxRuntime.jsx },
      'react-native': RN(os),
      'react-native-safe-area-context': { useSafeAreaInsets: () => device.insets },
      '@react-navigation/native': { CommonActions: { navigate: (payload) => ({ type: 'NAVIGATE', payload }) } },
      'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
      'expo-haptics': { selectionAsync: () => Promise.resolve() },
      '../ui/theme': { useTheme: () => device.theme },
    };
    return { app, mod: loadWith(BAR, mocks) };
  };

  const routes = NAMES.map((name) => ({ key: `${name}-k`, name }));
  const descriptors = Object.fromEntries(
    routes.map((route, i) => [
      route.key,
      {
        options: {
          title: TITLES[i],
          tabBarTestID: IDS[i],
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ focused, color, size }) => ({ type: 'Ionicons', props: { focused, color, size } }),
        },
      },
    ])
  );
  const emitted = [];
  const dispatched = [];
  let prevent = false;
  const navigation = {
    emit: (event) => (emitted.push(event), { defaultPrevented: prevent && event.type === 'tabPress' }),
    dispatch: (action) => dispatched.push(action),
  };
  const props = (index) => ({ state: { key: 'tabs-k', index, routes }, descriptors, navigation });
  const setup = async (os = 'web') => {
    const { app, mod } = load(os);
    const view = app.mount(mod.default, props(0));
    await tick();
    view.flush();
    const all = () => nodes(view.tree);
    const tabs = () => all().filter((n) => n.props.accessibilityRole === 'tab');
    const indicator = () => all().find((n) => n.props.testID === 'pearl-tab-indicator');
    const layout = (width) => {
      all().find((n) => n.props.accessibilityRole === 'tablist').props.onLayout({ nativeEvent: { layout: { width } } });
      view.flush();
    };
    const go = (index) => {
      view.props = props(index);
      view.flush();
    };
    return { view, mod, all, tabs, indicator, layout, go };
  };
  const slideNode = (bar) => bar.indicator().props.style[1].transform[0].translateX.multiply[0];

  // 1) cinco abas acessíveis, rótulos e testIDs que o E2E usa
  let bar = await setup();
  assert.strictEqual(bar.all().filter((n) => n.props.accessibilityRole === 'tablist').length, 1, 'uma tablist');
  assert.strictEqual(bar.tabs().length, 5, 'cinco abas');
  assert.deepStrictEqual(bar.tabs().map((t) => t.props.testID), IDS, 'testIDs estáveis das abas');
  assert.deepStrictEqual(bar.tabs().map((t) => t.props.accessibilityLabel), TITLES, 'rótulo acessível = título');
  assert.deepStrictEqual(texts(bar.view.tree), TITLES, 'o texto visível de cada aba é o título (o E2E clica nele)');
  assert.deepStrictEqual(bar.tabs().map((t) => t.props['aria-selected']), [true, false, false, false, false], 'só a ativa selecionada (aria-selected: o RN-web 0.21 ignora accessibilityState)');
  assert.ok(!flat(bar.view.tree.props.style).position, 'a barra fica no fluxo (sem position)');
  assert.strictEqual(bar.indicator(), undefined, 'sem largura medida, sem pílula');
  bar.layout(350);
  assert.strictEqual(flat(bar.indicator().props.style).width, 70, 'pílula com a largura de uma aba');
  assert.strictEqual(bar.indicator().props.style[1].transform[0].translateX.multiply[1], 70, 'desloca em múltiplos da aba');
  assert.strictEqual(slideNode(bar).value, 0, 'pílula começa na aba ativa');
  const icons = () => bar.all().filter((n) => n.type === 'Ionicons').map((n) => n.props);
  const palette = bar.mod.pearlPalette(cloud);
  assert.deepStrictEqual(icons().map((i) => i.focused), [true, false, false, false, false]);
  assert.strictEqual(icons()[0].color, palette.iconOn);
  assert.strictEqual(icons()[1].color, palette.off);

  // 2) toque: encolhe, volta com mola, emite tabPress e navega
  log.length = 0;
  bar.tabs()[2].props.onPressIn();
  const shrink = log.find((e) => e.kind === 'timing');
  assert.ok(shrink && shrink.config.toValue === 0.92 && shrink.node !== slideNode(bar), 'apertar encolhe a aba');
  bar.tabs()[2].props.onPressOut();
  assert.ok(log.some((e) => e.kind === 'spring' && e.config.toValue === 1 && e.node === shrink.node), 'soltar volta com mola');
  bar.tabs()[2].props.onPress();
  assert.deepStrictEqual(emitted.pop(), { type: 'tabPress', target: 'Affirm-k', canPreventDefault: true });
  assert.deepStrictEqual(dispatched.pop(), { type: 'NAVIGATE', payload: { name: 'Affirm', merge: true }, target: 'tabs-k' });
  bar.tabs()[3].props.onLongPress();
  assert.deepStrictEqual(emitted.pop(), { type: 'tabLongPress', target: 'Journey-k' });

  // 3) a pílula desliza até a aba nova
  log.length = 0;
  bar.go(2);
  const slide = log.find((e) => e.kind === 'timing' && e.node === slideNode(bar));
  assert.ok(slide, 'pílula anima ao trocar de aba');
  assert.strictEqual(slide.config.toValue, 2, 'pílula vai até a aba tocada');
  assert.strictEqual(slide.config.duration, 280, 'deslize de 280 ms');
  assert.deepStrictEqual(slide.config.easing, { bezier: [0.34, 1.36, 0.64, 1] }, 'curva com passada (cara de mola)');
  assert.strictEqual(slide.config.useNativeDriver, false, 'no site sem native driver');
  assert.ok(!log.some((e) => e.kind === 'set' && e.node === slideNode(bar)), 'com movimento, nada de pulo');
  assert.deepStrictEqual(bar.tabs().map((t) => t.props['aria-selected']), [false, false, true, false, false]);
  const label = (i) => flat(bar.all().filter((n) => n.type === 'Text')[i].props.style).color;
  assert.strictEqual(label(2), palette.labelOn, 'rótulo ativo na cor de tinta');
  assert.strictEqual(label(0), palette.off, 'rótulo inativo');
  // tocar a aba ativa ou com preventDefault não navega
  bar.tabs()[2].props.onPress();
  assert.strictEqual(emitted.pop().type, 'tabPress');
  assert.strictEqual(dispatched.length, 0, 'aba ativa não navega de novo');
  prevent = true;
  bar.tabs()[4].props.onPress();
  prevent = false;
  assert.strictEqual(dispatched.length, 0, 'preventDefault segura a navegação');

  // 5) teclado: some sem sair do fluxo, volta depois
  keyboard.get('keyboardDidShow')();
  bar.view.flush();
  assert.strictEqual(bar.view.tree.type, 'View', 'teclado aberto: ainda um View');
  assert.strictEqual(flat(bar.view.tree.props.style).height, 0, 'teclado aberto: altura zero no fluxo');
  assert.strictEqual(bar.tabs().length, 0, 'teclado aberto: sem abas');
  keyboard.get('keyboardDidHide')();
  bar.view.flush();
  assert.strictEqual(bar.tabs().length, 5, 'teclado fechado: barra de volta');

  // 4b) reduzir movimento ligado com o app aberto
  motionListeners.forEach((fn) => fn(true));
  bar.view.flush();
  log.length = 0;
  bar.go(4);
  assert.ok(log.some((e) => e.kind === 'set' && e.node === slideNode(bar) && e.value === 4), 'reduzir movimento: pílula pula');
  assert.ok(!log.some((e) => e.kind === 'timing' || e.kind === 'spring'), 'reduzir movimento: nenhuma animação');
  bar.view.unmount();
  assert.strictEqual(motionListeners.length, 0, 'desmontar solta o ouvinte de movimento');

  // 4) reduzir movimento desde o início: sem deslize e sem encolher
  device.reduce = true;
  bar = await setup();
  bar.layout(350);
  log.length = 0;
  bar.tabs()[1].props.onPressIn();
  bar.tabs()[1].props.onPressOut();
  bar.go(1);
  assert.ok(!log.some((e) => e.kind === 'timing' || e.kind === 'spring'), 'reduzir movimento: nada anima');
  assert.strictEqual(slideNode(bar).value, 1, 'reduzir movimento: pílula já na aba nova');
  bar.view.unmount();
  device.reduce = false;

  // nativo: native driver e iOS escuta keyboardWill*
  bar = await setup('ios');
  bar.layout(350);
  log.length = 0;
  bar.go(3);
  assert.strictEqual(log.find((e) => e.kind === 'timing').config.useNativeDriver, true, 'nativo usa native driver');
  assert.ok(keyboard.has('keyboardWillShow') && keyboard.has('keyboardWillHide'), 'iOS esconde antes do teclado subir');
  bar.view.unmount();

  // 6) área segura e larguras estreitas
  device.insets = { top: 0, bottom: 34, left: 0, right: 0 };
  bar = await setup();
  assert.strictEqual(flat(bar.view.tree.props.style).paddingBottom, 28, 'respeita a barra de gestos do iPhone');
  bar.view.unmount();
  device.insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const sizes = async (width) => {
    device.width = width;
    const b = await setup();
    const out = {
      font: flat(b.all().find((n) => n.type === 'Text').props.style).fontSize,
      icon: b.all().find((n) => n.type === 'Ionicons').props.size,
      side: flat(b.view.tree.props.style).paddingHorizontal,
      bottom: flat(b.view.tree.props.style).paddingBottom,
    };
    b.view.unmount();
    return out;
  };
  assert.deepStrictEqual(await sizes(390), { font: 11, icon: 22, side: 12, bottom: 10 });
  assert.deepStrictEqual(await sizes(375), { font: 10, icon: 22, side: 8, bottom: 10 });
  assert.deepStrictEqual(await sizes(320), { font: 10, icon: 19, side: 4, bottom: 10 });
  device.width = 390;

  // 7) contraste dos rótulos sobre a pérola, em todos os temas
  for (const theme of THEMES) {
    const p = bar.mod.pearlPalette(theme);
    const capsule = p.capsule.map((stop) => over(stop, p.dock));
    const pill = p.pill.map((stop) => over(stop, capsule[0]));
    for (const bg of pill) assert.ok(contrast(p.labelOn, bg) >= 4.5, `${theme.name}: rótulo ativo ${contrast(p.labelOn, bg).toFixed(2)}:1`);
    for (const bg of capsule) assert.ok(contrast(p.off, bg) >= 4.5, `${theme.name}: rótulo inativo ${contrast(p.off, bg).toFixed(2)}:1`);
    for (const bg of pill) assert.ok(contrast(p.iconOn, bg) >= 3, `${theme.name}: ícone ativo ${contrast(p.iconOn, bg).toFixed(2)}:1`);
  }

  // 8) ligação no App.js e nada de backdrop-filter
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.ok(/tabBar=\{\(props\) => <PearlTabBar \{\.\.\.props\} \/>\}/.test(app), 'App.js usa a Barra Pérola');
  const source = fs.readFileSync(path.join(root, BAR), 'utf8');
  assert.ok(!/backdropFilter|backdrop-filter|WebkitBackdrop/.test(source.replace(/^\s*\/\/.*$/gm, '')), 'sem backdrop-filter');

  console.log('OK barra perola: 5 abas acessiveis, pilula desliza, reduzir movimento, teclado no fluxo, contraste em 8 temas');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
