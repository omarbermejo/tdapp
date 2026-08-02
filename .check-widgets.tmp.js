/**
 * Rearma los CUATRO widgets como lo hace la extension y los evalua en todas sus familias.
 * Comprueba que ninguno lanza y que el nodo RAIZ declara `containerBackground`.
 */
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');

const root = '/Users/omarbermejo/tdapp';

/** Los globals que `bundle/index.ts` vuelca con Object.assign: swift-ui + modifiers + jsx + react. */
const known = new Set();
const fs = require('fs');
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.d.ts')) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const m of text.matchAll(/export declare (?:const|function) (\w+)/g)) known.add(m[1]);
    for (const m of text.matchAll(/^export \{ ([^}]+) \}/gm)) {
      for (const part of m[1].split(',')) known.add(part.trim().split(/\s+as\s+/).pop().trim());
    }
  }
};
walk(path.join(root, 'node_modules/@expo/ui/build/swift-ui'));

const node = (type, props) => ({ type: typeof type === 'string' ? type : String(type), props });

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

const load = (file) => {
  const code = babel.transformFileSync(file, {
    cwd: root,
    root,
    presets: [require.resolve('babel-preset-expo')],
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

/** El scope del JSContext: cualquier identificador libre sale de aqui, como el globalThis real. */
const scope = new Proxy(
  {},
  {
    has: (_, key) => typeof key === 'string',
    get: (_, key) => {
      if (typeof key !== 'string') return undefined;
      const name = String(key);
      if (name === 'Symbol') return Symbol;
      if (name.startsWith('_jsx')) return name === '_jsxFileName' ? 'widget' : node;
      if (name === '_Fragment') return 'Fragment';
      if (['Object', 'Array', 'Math', 'Date', 'String', 'Number', 'JSON', 'Boolean', 'undefined', 'NaN', 'Infinity', 'isNaN', 'parseInt', 'parseFloat'].includes(name)) {
        return globalThis[name];
      }
      if (!known.has(name)) {
        throw new ReferenceError(`"${name}" NO existe en el bundle de la extension`);
      }
      return /^[A-Z]/.test(name) ? name : (...args) => ({ modifier: name, args });
    },
  }
);

const build = (source) =>
  new Function('__scope', `with (__scope) { return (${source}); }`)(scope);

const WIDGETS = {
  'today-widget': {
    families: ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular', 'accessoryInline'],
    props: {
      nextTitle: 'Terminar el informe', nextTime: '18:00', pending: 3, done: 2, running: '',
      soonTitles: ['Comprar pan', 'Llamar al banco'], soonTimes: ['19:00', '20:00'],
      tint: '#556b2f', tintDark: '#aac987', bg: '#ffffff', bgDark: '#141414',
    },
  },
  'streak-widget': {
    families: ['systemSmall', 'systemMedium', 'accessoryRectangular', 'accessoryInline'],
    props: {
      days: 5, best: 12, week: [1, 1, 0, 2, 1, 0, 0], labels: ['L','M','M','J','V','S','D'],
      todayIndex: 4, tint: '#556b2f', tintDark: '#aac987', bg: '#ffffff', bgDark: '#141414',
    },
  },
  'focus-widget': {
    families: ['systemSmall', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'],
    props: {
      live: true, phase: 'Enfoque', resting: false, task: 'Rediseñar el widget',
      startedAt: Date.now() - 600000, endsAt: Date.now() + 900000, pausedAt: 0,
      done: 2, rounds: 4, tint: '#556b2f', tintDark: '#aac987', bg: '#ffffff', bgDark: '#141414',
    },
  },
  'capture-widget': {
    families: ['systemSmall', 'accessoryInline'],
    props: { pending: 4, tint: '#556b2f', tintDark: '#aac987', bg: '#ffffff', bgDark: '#141414' },
  },
};

const MODES = ['fullColor', 'accented', 'vibrant'];
let failed = 0;

for (const [name, spec] of Object.entries(WIDGETS)) {
  const file = path.join(root, 'src/widgets', `${name}.tsx`);
  const exported = load(file);
  if (typeof exported.layout !== 'string') {
    console.error(`FALLO ${name}: el layout no es un string, ¿se perdio el directive 'widget'?`);
    failed++;
    continue;
  }
  const layout = build(exported.layout);

  for (const family of spec.families) {
    for (const scheme of ['light', 'dark']) {
      for (const mode of MODES) {
        for (const [label, props] of [['llenos', spec.props], ['vacios', {}], ['sin bloque', { ...spec.props, live: false }]]) {
          const env = { widgetFamily: family, colorScheme: scheme, widgetRenderingMode: mode, isLuminanceReduced: false };
          let out;
          try {
            out = layout(props, env);
          } catch (error) {
            console.error(`FALLO ${name} · ${family} · ${scheme} · ${mode} · props ${label}: ${error.message}`);
            failed++;
            continue;
          }
          const mods = out?.props?.modifiers ?? [];
          const bg = mods.find((m) => m && m.modifier === 'containerBackground');
          if (!bg) {
            console.error(`FALLO ${name} · ${family} · ${scheme} · ${mode} · props ${label}: la raiz (${out?.type}) SIN containerBackground`);
            failed++;
            continue;
          }
          const color = bg.args[0];
          const lock = family.startsWith('accessory');
          if (lock && color !== 'clear') {
            console.error(`FALLO ${name} · ${family}: la pantalla de bloqueo deberia ir 'clear', va '${color}'`);
            failed++;
          }
          if (!lock && (!color || color === 'clear')) {
            console.error(`FALLO ${name} · ${family} · ${scheme} · props ${label}: la baldosa sin papel ('${color}')`);
            failed++;
          }
        }
      }
    }
  }
  console.log(`OK ${name} · ${spec.families.length} familias × 2 esquemas × 3 modos × 3 juegos de props`);
}

process.exit(failed ? 1 : 0);
