/* Test de textos centralizados (Node puro, sin navegador): `node tests/strings.test.mjs`
   a) toast/toastOnce/showNotice/confirm en js/ no reciben literales: usan T.…
   b) T solo contiene cadenas o funciones que devuelven cadenas no vacías
   c) vocabulario prohibido (cinemática = conjunto, toma = cada ángulo)
   d) sin claves duplicadas ni valores idénticos con claves distintas (salvo whitelist)
   e) strings.js es puro (no importa nada) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = path.join(root, 'js');
const stringsPath = path.join(jsDir, 'core', 'strings.js');
const { T } = await import(pathToFileURL(stringsPath).href);

let fails = 0;
const ok = (c, msg) => { if (c) console.log('  ok  ' + msg); else { fails++; console.log('FAIL  ' + msg); } };

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'data' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []);
const files = walk(jsDir);

/* a) llamadas con literal como mensaje */
{
  const bad = [];
  const reA = /\b(toast|showNotice|confirm|alert)\(\s*(['"`])/;            // toast('…'), showNotice(`…`), confirm('…')
  const reB = /\btoastOnce\(\s*(['"`])[^'"`]*\1\s*,\s*(['"`])/;            // toastOnce('clave', '…')
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      const code = line.replace(/\s\/\/.*$/, '');                          // sin comentario final
      if (reA.test(code) || reB.test(code)) bad.push(`${path.relative(root, f)}:${i + 1}  ${t.slice(0, 110)}`);
    });
  }
  ok(bad.length === 0, 'sin literales en toast/toastOnce/showNotice/confirm' + (bad.length ? '\n    ' + bad.join('\n    ') : ''));
}

/* e) pureza */
{
  const src = fs.readFileSync(stringsPath, 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/\bimport\s*\(/.test(src), 'strings.js no importa nada');
}

/* b) tipos y valores. Recorre T y llama a cada función con varios juegos de argumentos de ejemplo */
const argSets = [[2, 'abc', 4, 5, 6], [[{ name:'a.png', why:'motivo' }, { name:'b', why:'c' }, { name:'d', why:'e' }]], [['a', 'b', 'c']], [true], [false]];
const leaves = []; // { path, value } con value string (resultado de funciones incluido)
function visit(node, p){
  if (typeof node === 'string') { leaves.push({ path:p, value:node, fixed:true }); ok(node.length > 0, `${p} no vacío`); return; }
  if (typeof node === 'function') {
    let res = null;
    for (const args of argSets) { try { const r = node(...args); if (typeof r === 'string' && r.length) { res = r; break; } } catch { /* prueba el siguiente juego */ } }
    ok(res !== null, `${p}() devuelve cadena no vacía`);
    if (res !== null) leaves.push({ path:p, value:res, fixed:false });
    return;
  }
  if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) visit(v, `${p}.${k}`); return; }
  ok(false, `${p} tiene tipo no permitido (${typeof node})`);
}
visit(T, 'T');

/* c) vocabulario antiguo / mezclado (sin excepciones) */
{
  const FORBIDDEN = [/\bshots?\b/i, /\bcinematic\b/i, /\btake\b/i, /tus tomas guardadas/i, /\bplanos?\b/i, /\bfotogramas?\b/i, /conjunto de tomas/i];
  const hits = leaves.flatMap(l => FORBIDDEN.filter(re => re.test(l.value)).map(re => `${l.path}: «${l.value}» ~ ${re}`));
  ok(hits.length === 0, 'sin vocabulario prohibido' + (hits.length ? '\n    ' + hits.join('\n    ') : ''));
}

/* d) claves duplicadas dentro de un mismo objeto (un literal las pisaría en silencio): escáner mínimo de strings.js */
{
  const s = fs.readFileSync(stringsPath, 'utf8');
  const stack = []; const dups = [];
  let last = '', i = 0;
  const top = () => stack[stack.length - 1];
  while (i < s.length) {
    const c = s[i], t = top();
    if (t?.k === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); last = '`'; i++; continue; }
      if (c === '$' && s[i + 1] === '{') { stack.push({ k:'expr' }); last = '{'; i += 2; continue; }
      i++; continue;
    }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 2; continue; }
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); continue; }
    if (c === '\'' || c === '"') { i++; while (s[i] !== c) { if (s[i] === '\\') i++; i++; } i++; last = c; continue; }
    if (c === '`') { stack.push({ k:'tpl' }); i++; continue; }
    if (c === '{') { stack.push({ k:'obj', keys:new Set() }); last = '{'; i++; continue; }
    if (c === '}') { stack.pop(); last = '}'; i++; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < s.length && /[\w$]/.test(s[j])) j++;
      const id = s.slice(i, j); let k = j; while (s[k] === ' ') k++;
      if (t?.k === 'obj' && s[k] === ':' && (last === '{' || last === ',')) { if (t.keys.has(id)) dups.push(id); t.keys.add(id); }
      last = 'a'; i = j; continue;
    }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  ok(dups.length === 0, 'sin claves duplicadas' + (dups.length ? ': ' + dups.join(', ') : ''));

  /* valores idénticos con claves distintas (solo textos fijos y salidas de función con los argumentos de ejemplo) */
  const WHITELIST = new Set([]);
  const seen = new Map(), same = [];
  for (const l of leaves) { if (WHITELIST.has(l.value)) continue; if (seen.has(l.value)) same.push(`«${l.value}»: ${seen.get(l.value)} = ${l.path}`); else seen.set(l.value, l.path); }
  ok(same.length === 0, 'sin valores idénticos con claves distintas' + (same.length ? '\n    ' + same.join('\n    ') : ''));
}

console.log(fails ? `\n${fails} FALLO(S)` : '\nOK');
process.exit(fails ? 1 : 0);
