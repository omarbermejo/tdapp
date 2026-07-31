/**
 * Comprueba el contrato de serializacion de la Live Activity. `node scripts/check-widget-layout.js`.
 *
 * El layout de un widget no se ejecuta en la app: el directive `'widget'` lo convierte en un STRING
 * con su propio codigo fuente, y quien lo evalua es otro proceso con un JSContext pelado. Asi que un
 * layout que use algo de fuera de su funcion —un helper, una constante, un import— compila, pasa el
 * lint, y sale vacio en el telefono. Es el error mas caro de este directorio y no se ve leyendo.
 *
 * Esto lo rearma igual que la extension (y que `app/la-preview.tsx`, que pinta las mismas secciones
 * dentro de la app) y lo llama: si el layout toca un nombre que nadie inyecta, revienta aqui.
 *
 * Sin framework a proposito: son asserts sobre un objeto plano y corre en un segundo.
 */
/* global __dirname -- corre en node, no en la app; el config de eslint es el de Expo. */
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src/widgets/focus-activity.tsx');

const code = babel.transformFileSync(file, {
  cwd: root,
  root,
  presets: [require.resolve('babel-preset-expo')],
  // supportsStaticESM: false -> el preset emite CommonJS, que es lo que este script puede cargar.
  caller: { name: 'metro', platform: 'ios', isDev: true, supportsStaticESM: false },
  babelrc: false,
  configFile: false,
}).code;

/** Un nodo pelado, como el que el stub de la extension le pasa al lado nativo. */
const node = (type, props) => ({ type: typeof type === 'string' ? type : String(type), props });

/**
 * Los imports que un layout puede tener, y ninguno mas: el `throw` es la mitad del valor de este
 * script. Cada componente se representa por su nombre y cada modifier por su llamada.
 */
const stubs = {
  '@expo/ui/swift-ui': new Proxy({}, { get: (_, key) => String(key) }),
  '@expo/ui/swift-ui/modifiers': new Proxy(
    {},
    { get: (_, key) => (...args) => ({ modifier: String(key), args }) }
  ),
  'expo-widgets': { createLiveActivity: (name, layout) => ({ name, layout }) },
  'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
  'react/jsx-dev-runtime': { jsxDEV: node, Fragment: 'Fragment' },
};

const mod = new Module(file);
mod.filename = file;
mod.require = (request) => {
  if (stubs[request]) return stubs[request];
  throw new Error(`import que la extension no puede resolver: ${request}`);
};
mod._compile(code, file);

const source = mod.exports.FocusActivity;
const fail = (message) => {
  console.error(`FALLO: ${message}`);
  process.exit(1);
};

if (typeof source !== 'string') fail('FocusActivity no es un string. ¿Se perdió el directive "widget"?');

/** Los mismos nombres que inyecta `app/la-preview.tsx`. Si el layout usa otro, `new Function` lanza. */
const names = [
  'Capsule', 'Circle', 'HStack', 'Image', 'ProgressView', 'Rectangle', 'Spacer', 'Text', 'VStack', 'ZStack',
  'font', 'foregroundColor', 'frame', 'kerning', 'lineLimit', 'monospacedDigit',
  'multilineTextAlignment', 'opacity', 'padding', 'textCase', 'tint',
  '_jsx', '_jsxs', '_jsxDEV', '_Fragment', '_jsxFileName',
];
const values = names.map((name) => {
  if (name.startsWith('_jsx') && name !== '_jsxFileName') return node;
  if (name === '_Fragment') return 'Fragment';
  if (name === '_jsxFileName') return 'widget';
  if (/^[A-Z]/.test(name)) return name;
  return (...args) => ({ modifier: name, args });
});

const layout = new Function(...names, `return (${source});`)(...values);

const now = Date.now();
// El peor caso: la fase de nombre mas largo, con titulo largo y el ciclo a la mitad.
const props = {
  phase: 'Descanso largo',
  resting: true,
  task: 'Terminar el rediseño de la pantalla de bloqueo',
  startedAt: now - 10 * 60_000,
  endsAt: now + 15 * 60_000,
  pausedAt: 0,
  tint: '#d5e4c3',
  done: 2,
  rounds: 4,
};

const dark = { colorScheme: 'dark' };
const sections = layout(props, dark);

const need = [
  'banner', 'compactLeading', 'compactTrailing', 'minimal',
  'expandedLeading', 'expandedTrailing', 'expandedBottom',
];
const missing = need.filter((key) => !sections[key]);
if (missing.length) fail(`faltan secciones: ${missing.join(', ')}`);

// La minima es un CIRCULO de ~24pt: un glifo, nunca 'm:ss' — iOS recorta lo que no cabe.
if (sections.minimal.type !== 'Image') fail(`la mínima debería ser un glifo, es ${sections.minimal.type}`);

// En pausa cambia el icono, no el tipo de vista.
const held = layout({ ...props, pausedAt: now }, dark);
if (held.minimal.props.systemName !== 'pause.fill') {
  fail(`en pausa la mínima debería ser pause.fill, es ${held.minimal.props.systemName}`);
}

// El rótulo de la Isla es de UNA palabra —su región leading no da para más— y el largo vive en el banner.
const islandLabel = sections.expandedLeading.props.children[1].props.children;
if (islandLabel !== 'Descanso') fail(`el rótulo de la Isla debería ser "Descanso", es "${islandLabel}"`);

const bannerLabel = sections.banner.props.children[0].props.children[0].props.children;
if (bannerLabel !== 'Descanso largo') fail(`el banner debería decir la fase entera, dice "${bannerLabel}"`);

/**
 * El reloj SIEMPRE dentro de una caja de ancho fijo, y esto es el guard que de verdad importa.
 *
 * `Text(timerInterval:)` no se puede medir, asi que se queda con todo el ancho que le propongan: sin
 * la caja, la cápsula compacta pedia los 120.67pt de cada region y la Isla salia estirada de lado a
 * lado (367pt medidos, contra ~190 con la caja). Un `frame` flexible —`maxWidth` en vez de `width`—
 * es el mismo bug con otro nombre, asi que tambien falla aqui.
 */
const boxOf = (node, where) => {
  if (node.type !== 'HStack') fail(`el reloj de ${where} debería ir en un HStack, es ${node.type}`);
  const box = node.props.modifiers.find((m) => m.modifier === 'frame');
  if (!box) fail(`el reloj de ${where} sin caja: la Isla se estira hasta el ancho máximo`);
  if (typeof box.args[0].width !== 'number') {
    fail(`la caja del reloj de ${where} no es de ancho fijo: ${JSON.stringify(box.args[0])}`);
  }
  return box.args[0].width;
};

const boxes = {
  compacta: boxOf(sections.compactTrailing, 'la compacta'),
  expandida: boxOf(sections.expandedTrailing, 'la expandida'),
};

// Y una línea sola: un reloj partido en dos engorda la cápsula de alto, y ahí no hay alto que dar.
const clock = sections.compactTrailing.props.children.props.modifiers.map((m) => m.modifier);
if (!clock.includes('lineLimit')) fail(`el reloj compacto sin lineLimit: ${clock.join(', ')}`);

console.log('OK · layout rearmado, 7 secciones, isla afinada');
console.log(`  mínima          ${sections.minimal.props.systemName} · ${sections.minimal.props.size}pt`);
console.log(`  rótulos         isla "${islandLabel}" · banner "${bannerLabel}"`);
console.log(`  caja del reloj  compacta ${boxes.compacta}pt · expandida ${boxes.expandida}pt`);
