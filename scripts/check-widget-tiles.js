/**
 * Comprueba las cuatro BALDOSAS. `node scripts/check-widget-tiles.js`.
 *
 * El hermano de `check-widget-layout.js`, que hace lo mismo con la Live Activity. La diferencia es
 * el eje: una actividad tiene siete secciones y una sola forma de dibujarse; un widget tiene UNA
 * forma y quince maneras de que el sistema se la pida — cinco familias, dos esquemas y tres modos de
 * dibujo. Cada combinacion es una rama distinta del layout, y una que lance sale como una baldosa
 * VACIA sin un solo log: `DynamicView.swift` solo mapea `RedBoxView` dentro de `#if DEBUG`, y en
 * Release cae en `default: EmptyView()`.
 *
 * Lo que verifica, y las dos cosas que ya se rompieron de verdad:
 *
 * 1. **Que ningun layout lance**, tambien con los props VACIOS. `TimelineProvider.placeholder(in:)`
 *    pasa `props: nil`, asi que la galeria de widgets y todo arranque en frio entran sin datos: un
 *    `p.nextTitle.length` sin suelo dejaba la baldosa en blanco.
 *
 * 2. **Que la raiz declare `containerBackground`.** Desde iOS 17 un widget que no declara su fondo
 *    NO SE DIBUJA: iOS lo sustituye por una tarjeta blanca que dice «Please adopt containerBackground
 *    API». Salio en un telefono real y no en el simulador, porque la galeria pinta un preview.
 *    En las familias `accessory*` tiene que ir 'clear' — ahi el fondo lo pone el sistema.
 *
 * 3. **Que no toque nada que la extension no tenga.** El layout se serializa como fuente y se evalua
 *    en un JSContext pelado donde lo unico que existe es lo que `bundle/index.ts` de expo-widgets
 *    vuelca en el global: `@expo/ui/swift-ui`, sus modifiers y poco mas. Un helper o una constante de
 *    modulo compila, pasa el lint, y lanza un ReferenceError en el telefono. Aqui el scope es un
 *    Proxy con esa MISMA lista, leida de los `.d.ts` de @expo/ui, asi que un import nuevo que la
 *    extension no exponga revienta en esta linea y no en la pantalla de inicio de alguien.
 *
 * Sin framework, igual que su hermano: son asserts sobre objetos planos y corre en un segundo.
 */
/* global __dirname -- corre en node, no en la app; el config de eslint es el de Expo. */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

/**
 * Todo lo que la extension expone como global, sacado de los tipos de @expo/ui.
 *
 * Se LEE en vez de escribirse a mano a proposito: la lista a mano del checker de la Live Activity
 * hay que ampliarla cada vez que un layout usa un modifier nuevo, y olvidarla da un falso fallo. Con
 * los `.d.ts` como fuente, esto sigue a la version de @expo/ui que haya instalada — que es
 * exactamente lo que `bundle/index.ts` empaqueta con `Object.assign(globalThis, ...modifiers)`.
 */
const exposed = new Set();
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const hit of text.matchAll(/export declare (?:const|function) (\w+)/g)) exposed.add(hit[1]);
    for (const hit of text.matchAll(/^export \{ ([^}]+) \}/gm)) {
      for (const part of hit[1].split(',')) exposed.add(part.trim().split(/\s+as\s+/).pop().trim());
    }
  }
};
collect(path.join(root, 'node_modules/@expo/ui/build/swift-ui'));

/** Lo que JavaScript trae de serie y un JSContext tambien tiene. */
const BUILTINS = ['Object', 'Array', 'Math', 'Date', 'String', 'Number', 'Boolean', 'JSON',
  'undefined', 'NaN', 'Infinity', 'isNaN', 'parseInt', 'parseFloat', 'Symbol'];

/** Un nodo pelado, como el que el stub de la extension le pasa al lado nativo. */
const node = (type, props) => ({ type: typeof type === 'string' ? type : String(type), props });

/** Los imports que un layout puede tener, y ninguno mas. El `throw` es la mitad del valor. */
const stubs = {
  '@expo/ui/swift-ui': new Proxy({}, { get: (_, key) => String(key) }),
  '@expo/ui/swift-ui/modifiers': new Proxy(
    {},
    { get: (_, key) => (...args) => ({ modifier: String(key), args }) }
  ),
  'expo-widgets': { createWidget: (name, layout) => ({ name, layout }) },
  'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
  'react/jsx-dev-runtime': { jsxDEV: node, Fragment: 'Fragment' },
};

/** Compila el archivo con el preset de la app y lo carga, con la extension como unico proveedor. */
const load = (file) => {
  const code = babel.transformFileSync(file, {
    cwd: root,
    root,
    presets: [require.resolve('babel-preset-expo')],
    // supportsStaticESM: false -> el preset emite CommonJS, que es lo que este script puede cargar.
    caller: { name: 'metro', platform: 'ios', isDev: true, supportsStaticESM: false },
    babelrc: false,
    configFile: false,
  }).code;

  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod.require = (request) => {
    if (stubs[request]) return stubs[request];
    throw new Error(`import que la extension no puede resolver: ${request}`);
  };
  mod._compile(code, file);
  return mod.exports.default;
};

/**
 * El global del JSContext, como Proxy: cualquier identificador LIBRE del layout pasa por aqui.
 *
 * Es un `with (scope)` y no una lista de parametros como en el checker de la Live Activity, y por eso
 * ve mas: con parametros solo se comprueban los nombres que alguien recordo poner en la lista, y con
 * `with` se intercepta TODO — incluido el helper de modulo que meta un transpilador sin avisar.
 */
const scope = new Proxy(
  {},
  {
    // Solo strings: `with` consulta Symbol.unscopables y ese no es un identificador del layout.
    has: (_, key) => typeof key === 'string',
    get: (_, key) => {
      if (typeof key !== 'string') return undefined;
      if (BUILTINS.includes(key)) return globalThis[key];
      // Lo que emite el runtime de JSX de babel; el bundle de la extension lo tiene stubbeado.
      if (key.startsWith('_jsx')) return key === '_jsxFileName' ? 'widget' : node;
      if (key === '_Fragment') return 'Fragment';
      if (!exposed.has(key)) {
        throw new ReferenceError(`"${key}" no existe en el bundle de la extensión`);
      }
      // Los componentes se representan por su nombre y los modifiers por su llamada.
      return /^[A-Z]/.test(key) ? key : (...args) => ({ modifier: key, args });
    },
  }
);

const build = (source) => new Function('__scope', `with (__scope) { return (${source}); }`)(scope);

let failures = 0;
const fail = (message) => {
  console.error(`FALLO: ${message}`);
  failures++;
};

/** El acento y el papel llegan siempre por props: son los dos hex que cruzan desde `theme.ts`. */
const skin = { tint: '#556b2f', tintDark: '#aac987', bg: '#ffffff', bgDark: '#141414' };
const now = Date.now();

/** Las familias de cada widget son las MISMAS que declara `app.json`: si divergen, el check miente. */
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const declared = config.expo.plugins
  .find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-widgets')[1]
  .widgets.reduce((all, widget) => Object.assign(all, { [widget.name]: widget.supportedFamilies }), {});

/** El peor caso de cada uno: titulos largos, la semana a medias, el ciclo por la mitad. */
const TILES = {
  TodayWidget: {
    file: 'today-widget',
    props: {
      nextTitle: 'Terminar el rediseño de la pantalla de bloqueo',
      nextTime: '18:00', pending: 3, done: 2, running: '',
      soonTitles: ['Comprar pan', 'Llamar al banco'], soonTimes: ['19:00', '20:00'],
      ...skin,
    },
  },
  StreakWidget: {
    file: 'streak-widget',
    props: {
      days: 5, best: 12, week: [1, 1, 0, 2, 1, 0, 0],
      labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], todayIndex: 4, ...skin,
    },
  },
  FocusWidget: {
    file: 'focus-widget',
    props: {
      live: true, phase: 'Descanso largo', resting: true, task: 'Rediseñar el widget',
      startedAt: now - 10 * 60_000, endsAt: now + 15 * 60_000, pausedAt: 0,
      done: 2, rounds: 4, ...skin,
    },
  },
  CaptureWidget: { file: 'capture-widget', props: { pending: 4, ...skin } },
};

/**
 * Los tres modos de dibujo, y estan los tres porque el acento se decide por AQUI y no por la familia:
 * en la pantalla de inicio teñida (iOS 18+) la familia sigue siendo `systemSmall` pero el modo es
 * 'accented', y ahi `ink` se vuelve undefined — otra rama del layout.
 */
const MODES = ['fullColor', 'accented', 'vibrant'];

for (const [name, tile] of Object.entries(TILES)) {
  const families = declared[name];
  if (!families) {
    fail(`${name} no esta declarado en app.json`);
    continue;
  }

  const exported = load(path.join(root, 'src/widgets', `${tile.file}.tsx`));
  if (typeof exported.layout !== 'string') {
    fail(`${name}: el layout no es un string. ¿Se perdió el directive "widget"?`);
    continue;
  }
  const layout = build(exported.layout);

  let checks = 0;
  for (const family of families) {
    // El sistema pinta las `accessory*` (pantalla de bloqueo) y no admite un fondo propio.
    const lock = family.startsWith('accessory');
    for (const colorScheme of ['light', 'dark']) {
      for (const mode of MODES) {
        // Con props y SIN props: `placeholder(in:)` entra con `{}`, y ahi es donde se queda en blanco.
        for (const [label, props] of [['llenos', tile.props], ['vacíos', {}]]) {
          const where = `${name} · ${family} · ${colorScheme} · ${mode} · props ${label}`;
          const environment = {
            widgetFamily: family,
            colorScheme,
            widgetRenderingMode: mode,
            isLuminanceReduced: false,
          };

          let root;
          try {
            root = layout(props, environment);
          } catch (error) {
            fail(`${where}: ${error.message}`);
            continue;
          }

          const modifiers = root?.props?.modifiers ?? [];
          const background = modifiers.find((m) => m && m.modifier === 'containerBackground');
          if (!background) {
            fail(`${where}: la raíz (${root?.type}) sin containerBackground — iOS la tacha`);
            continue;
          }

          const paper = background.args[0];
          if (lock && paper !== 'clear') fail(`${where}: la pantalla de bloqueo va 'clear', no '${paper}'`);
          if (!lock && (!paper || paper === 'clear')) fail(`${where}: la baldosa sin papel ('${paper}')`);
          checks++;
        }
      }
    }
  }
  if (!failures) console.log(`OK · ${name} · ${checks} combinaciones`);
}

if (failures) process.exit(1);
console.log('OK · las cuatro baldosas se dibujan en todas sus presentaciones');
