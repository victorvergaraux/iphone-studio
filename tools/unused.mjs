// Auditor de código sin uso (solo lectura). Uso: node tools/unused.mjs   → escribe tools/unused-report.md y resume por consola. Sale siempre con 0.
// Analiza js/, css/, index.html, assets/, tests/, tools/ y sw.js (excluye vendor/ y node_modules/). Sin dependencias externas.
// Clasifica cada hallazgo: SEGURO (borrable) · PROBABLE · DUDOSO. Los «seguros» se re-verifican con una búsqueda cruda (palabra completa) en TODO el repo.
// Heurístico: sin AST. Los falsos negativos son preferibles a los falsos positivos, por eso las coincidencias en strings/comentarios degradan el nivel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SKIP_DIR = new Set(['node_modules', 'vendor', '.git', 'ref']);
// Archivos que otros agentes están refactorizando: sus hallazgos se etiquetan [F3-EN-CURSO] para tratarlos después
const WATCH = []; // archivos en refactorización por otros agentes (vacío: ninguno ahora)
const tagWatch = (...files) => files.some(f => WATCH.includes(f)) ? ' ⚠ toca ' + [...new Set(files.filter(f => WATCH.includes(f)))].join(' + ') : '';

function walk(dir, exts) {
  const out = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const n of fs.readdirSync(full).sort()) {
    if (SKIP_DIR.has(n)) continue;
    const r = dir ? dir + '/' + n : n;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) out.push(...walk(r, exts));
    else if (!exts || exts.some(e => r.endsWith(e))) out.push(r);
  }
  return out;
}

/* ───────────── Quitar comentarios JS conservando longitud y saltos de línea (los números de línea siguen valiendo) ───────────── */
function stripJS(src) {
  let out = '', i = 0, line = 1; const comments = [];
  const n = src.length, stack = []; // pila de contextos: 'tpl' (dentro de `...`) o 'brace' (dentro de ${ })
  let mode = 'code', lastSig = '', lastWord = '';
  const blank = s => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; comments.push({ text: src.slice(i, j), line }); out += blank(src.slice(i, j)); i = j; continue; }
      if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; const t = src.slice(i, j); comments.push({ text: t, line }); out += blank(t); line += (t.match(/\n/g) || []).length; i = j; continue; }
      if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; lastSig = 's'; lastWord = ''; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i++; continue; }
      if (c === '/') { // ¿literal regex o división? Heurística por el último token significativo
        const isRe = lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig) || /^(return|typeof|case|in|of|delete|void|throw|new)$/.test(lastWord);
        if (isRe) { let j = i + 1, cls = false; while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; } j++; while (/[a-z]/i.test(src[j] || '')) j++; out += src.slice(i, j); i = j; lastSig = 'r'; lastWord = ''; continue; }
      }
      if (c === '{') stack.push('brace');
      if (c === '}') { const top = stack.pop(); if (top === 'tpl-expr') { mode = 'tpl'; out += c; i++; continue; } }
      if (/\s/.test(c)) { out += c; if (c === '\n') line++; i++; continue; }
      if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; lastWord = src.slice(i, j); lastSig = 'w'; out += lastWord; i = j; continue; }
      lastSig = c; lastWord = ''; out += c; i++; continue;
    }
    // mode === 'tpl'
    if (c === '\\') { out += src.slice(i, i + 2); if (src[i + 1] === '\n') line++; i += 2; continue; }
    if (c === '`') { mode = 'code'; out += c; i++; lastSig = 's'; lastWord = ''; continue; }
    if (c === '$' && d === '{') { stack.push('tpl-expr'); mode = 'code'; out += '${'; i += 2; lastSig = '{'; lastWord = ''; continue; }
    if (c === '\n') line++;
    out += c; i++;
  }
  return { code: out, comments };
}
const stripCSS = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const stripHTML = s => s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
const lineOf = (text, idx) => { let l = 1; for (let k = 0; k < idx; k++) if (text.charCodeAt(k) === 10) l++; return l; };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (name, flags = 'g') => new RegExp('(?<![\\w$])' + esc(name) + '(?![\\w$])', flags);
const countWord = (text, name) => (text.match(wordRe(name)) || []).length;

/* ───────────── Carga de archivos ───────────── */
const jsFiles = [...walk('js', ['.js']), ...walk('tests', ['.mjs', '.js']), ...walk('tools', ['.mjs', '.js']).filter(f => f !== 'tools/unused.mjs'), ...(fs.existsSync(path.join(ROOT, 'sw.js')) ? ['sw.js'] : [])];
const cssFiles = walk('css', ['.css']);
const htmlFiles = fs.existsSync(path.join(ROOT, 'index.html')) ? ['index.html'] : [];
const isData = f => f.startsWith('js/data/');   // blobs base64: se analizan solo por exports, no por comentarios/identificadores
const isTest = f => f.startsWith('tests/');
const isTool = f => f.startsWith('tools/');
const isProd = f => f.startsWith('js/') || f === 'sw.js';
const raw = {}, code = {}, comments = {};
for (const f of jsFiles) {
  raw[f] = read(f);
  if (isData(f)) { code[f] = raw[f].length > 200000 ? raw[f].slice(0, 2000) + '\n' + raw[f].slice(-2000) : raw[f]; comments[f] = []; continue; }
  const s = stripJS(raw[f]); code[f] = s.code; comments[f] = s.comments;
}
const cssRaw = {}, cssCode = {};
for (const f of cssFiles) { cssRaw[f] = read(f); cssCode[f] = stripCSS(cssRaw[f]); }
const htmlRaw = {}, htmlCode = {};
for (const f of htmlFiles) { htmlRaw[f] = read(f); htmlCode[f] = stripHTML(htmlRaw[f]); }
const extraFiles = ['manifest.webmanifest', 'README.md', 'CLAUDE.md'].filter(f => fs.existsSync(path.join(ROOT, f)));
const extraRaw = Object.fromEntries(extraFiles.map(f => [f, read(f)]));
const allRawText = () => [...jsFiles.filter(f => !isData(f)).map(f => [f, raw[f]]), ...cssFiles.map(f => [f, cssRaw[f]]), ...htmlFiles.map(f => [f, htmlRaw[f]]), ...extraFiles.map(f => [f, extraRaw[f]])];

const findings = { exports: [], exportsTest: [], imports: [], css: [], orphans: [], hooksA: [], hooksR: [], params: [], comments: [] };
const add = (cat, level, what, evidence, why) => findings[cat].push({ level, what, evidence, why });

/* ───────────── Resolución de rutas ───────────── */
function resolveSpec(fromFile, spec) {
  if (!spec) return null;
  let p;
  if (/^https?:\/\//.test(spec)) { const m = spec.match(/\/(js|tests|tools)\/.*$/); if (!m) return null; p = m[0].slice(1); }
  else if (spec.startsWith('/')) p = spec.slice(1);
  else if (spec.startsWith('.')) p = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  else return null; // bare (three, tweakpane…) → vendor, fuera de alcance
  p = p.split('?')[0].split('#')[0];
  return p;
}

/* ───────────── 1 · Exports / imports ───────────── */
const exportsOf = {};   // file → [{name, line, kind}]
const imports = [];     // {from, to, names:[{name,local}], ns, dyn, line, loose}
function parseExports(f) {
  const c = code[f], list = []; const seen = new Set();
  const push = (name, idx, kind) => { if (!name || seen.has(name)) return; seen.add(name); list.push({ name, line: lineOf(c, idx), kind }); };
  let m;
  const re1 = /(^|[;\n}])\s*export\s+(?:async\s+)?(function\*?|const|let|var|class)\s+([\w$]+)/g;
  while ((m = re1.exec(c))) push(m[3], m.index + m[0].indexOf('export'), m[2]);
  const re2 = /(^|[;\n}])\s*export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g;
  while ((m = re2.exec(c))) {
    const idx = m.index + m[0].indexOf('export');
    for (const part of m[2].split(',')) { const t = part.trim(); if (!t) continue; const mm = t.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/); if (mm) push(mm[2] || mm[1], idx, m[3] ? 'reexport' : 'list'); }
    if (m[3]) imports.push({ from: f, to: resolveSpec(f, m[3]), names: m[2].split(',').map(t => t.trim()).filter(Boolean).map(t => ({ name: t.split(/\s+as\s+/)[0] })), line: lineOf(c, idx), reexport: true });
  }
  const re3 = /(^|[;\n}])\s*export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  while ((m = re3.exec(c))) imports.push({ from: f, to: resolveSpec(f, m[2]), ns: true, line: lineOf(c, m.index), reexport: true });
  if (/(^|[;\n}])\s*export\s+default\b/.test(c)) { const mm = /(^|[;\n}])\s*export\s+default\b/.exec(c); push('default', mm.index, 'default'); }
  return list;
}
function parseImports(f) {
  const c = code[f]; let m;
  const re = /(^|[;\n}])\s*import\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = re.exec(c))) {
    const clause = m[2]; if (clause.length > 600 || /\bimport\b/.test(clause)) continue;
    const to = resolveSpec(f, m[3]); const entry = { from: f, to, names: [], line: lineOf(c, m.index + m[0].indexOf('import')), spec: m[3], locals: [] };
    const ns = clause.match(/\*\s*as\s+([\w$]+)/); if (ns) { entry.ns = true; entry.locals.push({ name: '*', local: ns[1] }); }
    const def = clause.match(/^([\w$]+)\s*(,|$)/); if (def) { entry.names.push({ name: 'default', local: def[1] }); entry.locals.push({ name: 'default', local: def[1] }); }
    const br = clause.match(/\{([^}]*)\}/);
    if (br) for (const part of br[1].split(',')) { const t = part.trim(); if (!t) continue; const mm = t.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/); if (mm) { entry.names.push({ name: mm[1], local: mm[2] || mm[1] }); entry.locals.push({ name: mm[1], local: mm[2] || mm[1] }); } }
    imports.push(entry);
  }
  // import 'x' (solo efectos)
  const re0 = /(^|[;\n}])\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = re0.exec(c))) imports.push({ from: f, to: resolveSpec(f, m[2]), names: [], sideEffect: true, line: lineOf(c, m.index), spec: m[2] });
  // import() dinámico: si el archivo menciona la palabra, cuenta como uso (laxo a propósito)
  const reD = /import\(\s*(['"`])([^'"`$]+)\1\s*\)/g;
  while ((m = reD.exec(c))) imports.push({ from: f, to: resolveSpec(f, m[2]), names: [], dyn: true, line: lineOf(c, m.index), spec: m[2] });
}
for (const f of jsFiles) { if (isTool(f) && false) continue; exportsOf[f] = parseExports(f); parseImports(f); }
const known = new Set(jsFiles);
const importsTo = {};
for (const im of imports) { if (im.to && known.has(im.to)) (importsTo[im.to] ||= []).push(im); }

// Quién usa cada export. Producción = js/ ; tests = tests/ + tools/
function usesOf(file, name) {
  const prod = [], test = [];
  for (const im of importsTo[file] || []) {
    let hit = false;
    if (im.ns) hit = true;
    else if (im.names.some(n => n.name === name)) hit = true;
    else if (im.dyn) { // dinámico: la palabra aparece en el archivo importador
      hit = countWord(code[im.from], name) > 0 || countWord(raw[im.from], name) > 0;
    }
    if (hit && im.from !== file) (isTest(im.from) || isTool(im.from) ? test : prod).push(`${im.from}:${im.line}`);
  }
  return { prod, test };
}
function rawMentionsElsewhere(file, name) { // búsqueda cruda (strings/comentarios incluidos) en el resto del repo
  const hits = [];
  for (const [f, t] of allRawText()) { if (f === file) continue; if (wordRe(name, '').test(t)) hits.push(f); }
  return hits;
}
for (const [file, list] of Object.entries(exportsOf)) {
  if (isTest(file) || isTool(file) || file === 'sw.js' || file === 'js/main.js') continue;
  for (const ex of list) {
    const { prod, test } = usesOf(file, ex.name);
    if (prod.length) continue;
    const localUses = isData(file) ? 0 : Math.max(0, countWord(code[file], ex.name) - 1 - (exportsOf[file].some(e => e.name === ex.name && e.kind === 'list') ? 1 : 0));
    const ev = `${file}:${ex.line}`;
    const mentions = rawMentionsElsewhere(file, ex.name).filter(f => !isTest(f) || test.length === 0);
    if (test.length) { add('exportsTest', 'probable', `${ex.name} (${ex.kind})`, `${ev} · usado por ${test.slice(0, 4).join(', ')}`, localUses ? 'solo lo importan tests/tools (también se usa dentro del módulo): si es API de test, déjalo; si no, quitar `export`' : 'solo lo importan tests/tools; ningún módulo de js/ lo usa'); continue; }
    if (ex.name === 'default') { add('exports', 'dudoso', `default`, ev, 'export default sin importador resuelto'); continue; }
    if (localUses > 0) add('exports', mentions.length ? 'dudoso' : 'probable', `${ex.name} (${ex.kind})`, ev, `no lo importa nadie, pero se usa dentro del módulo (${localUses} ref.) → quitar solo \`export\`` + (mentions.length ? `; menciones crudas en ${mentions.slice(0, 3).join(', ')}` : ''));
    else if (mentions.length) add('exports', 'dudoso', `${ex.name} (${ex.kind})`, ev, `sin importadores ni usos locales, pero la palabra aparece en ${mentions.slice(0, 4).join(', ')} (¿string/comentario/acceso dinámico?)`);
    else add('exports', 'seguro', `${ex.name} (${ex.kind})`, ev, 'sin importadores, sin usos locales y sin menciones crudas en el repo → borrable');
  }
}
// Re-verificación final de «seguros» (export)
for (const f of findings.exports) if (f.level === 'seguro') {
  const name = f.what.split(' ')[0]; let cnt = 0;
  for (const [, t] of allRawText()) cnt += countWord(t, name);
  if (cnt > 1) { f.level = 'probable'; f.why += ` (re-verificación: la palabra aparece ${cnt} veces en total → revisar)`; }
}

/* ───────────── 2 · Imports sin uso ───────────── */
for (const f of jsFiles) {
  if (isData(f)) continue;
  const c = code[f];
  for (const im of imports.filter(i => i.from === f && !i.reexport && i.locals && i.locals.length)) {
    // texto del archivo sin las sentencias import
    const body = c.replace(/(^|[;\n}])\s*import\s+[\s\S]*?\s*from\s*['"][^'"]+['"]/g, m => m.replace(/[^\n]/g, ' '));
    for (const l of im.locals) {
      const local = l.local; const n = countWord(body, local);
      if (n === 0) {
        const inExport = new RegExp('export\\s*\\{[^}]*\\b' + esc(local) + '\\b').test(c);
        if (inExport) continue;
        const inRaw = countWord(raw[f], local) - 1;  // menciones en comentarios/strings (descontando la propia sentencia)
        add('imports', inRaw > 0 ? 'probable' : 'seguro', `${l.name === '*' ? '* as ' : ''}${local}${l.local !== l.name && l.name !== '*' ? ` (de ${l.name})` : ''}`, `${f}:${im.line} · from '${im.spec}'`, 'importado y no usado en el cuerpo del archivo' + (inRaw > 0 ? ` (aparece ${inRaw}× en comentarios/strings)` : ''));
      }
    }
  }
}

/* ───────────── 3 · CSS: clases e IDs sin uso ───────────── */
const selectors = new Map(); // '.clase' | '#id' → [{file,line}]
for (const f of cssFiles) {
  const c = cssCode[f];
  // recorrer preludios de reglas: texto entre `}`/`{`/`;` previo y el `{`. Se ignora el interior de @keyframes/@font-face
  let i = 0, depth = 0; const skipBlocks = [];
  const re = /([^{};]+)\{/g; let m;
  const kfRanges = [];
  while ((m = re.exec(c))) {
    const prelude = m[1].trim();
    if (/^@(keyframes|-webkit-keyframes|font-face|property)/i.test(prelude)) { // saltar el bloque entero
      let d = 1, j = re.lastIndex; while (j < c.length && d > 0) { if (c[j] === '{') d++; else if (c[j] === '}') d--; j++; }
      re.lastIndex = j; continue;
    }
    if (prelude.startsWith('@')) continue;
    // el prelude puede arrastrar valores de declaraciones previas sin `;` (no ocurre en CSS válido): se toma tal cual
    const stripped = prelude.replace(/"[^"]*"|'[^']*'/g, '').replace(/\[[^\]]*\]/g, '');
    const idx0 = m.index + m[0].indexOf(m[1]);
    for (const t of stripped.matchAll(/([.#])(-?[_a-zA-Z][\w-]*)/g)) {
      const name = t[1] + t[2];
      if (/^\.tp-/.test(name) || /^#[0-9a-f]{3,8}$/i.test(name) && t[1] === '#' && /^[0-9a-f]+$/i.test(t[2]) && false) continue;
      if (/^\.tp-/.test(name)) continue;
      (selectors.get(name) || selectors.set(name, []).get(name)).push({ file: f, line: lineOf(c, idx0 + prelude.indexOf(t[0])) });
    }
  }
}
// Texto donde buscar usos: index.html + js/ de producción (sin data) ; aparte tests
const useText = [...htmlFiles.map(f => [f, htmlCode[f]]), ...jsFiles.filter(f => isProd(f) && !isData(f)).map(f => [f, code[f]])];
const testText = jsFiles.filter(f => isTest(f)).map(f => [f, raw[f]]);
// Prefijos de construcción dinámica ('btn-' + x, `chip-${x}`)
const dynPrefixes = new Map();
for (const [f, t] of useText) {
  for (const m of t.matchAll(/['"`]([\w-]*-)['"`]\s*\+/g)) (dynPrefixes.get(m[1]) || dynPrefixes.set(m[1], []).get(m[1])).push(f);
  for (const m of t.matchAll(/`([\w-]*[-_])\$\{/g)) (dynPrefixes.get(m[1]) || dynPrefixes.set(m[1], []).get(m[1])).push(f);
  for (const m of t.matchAll(/\+\s*['"`](-[\w-]+)['"`]/g)) (dynPrefixes.get('*' + m[1]) || dynPrefixes.set('*' + m[1], []).get('*' + m[1])).push(f); // sufijos
}
// Clases/ids declaradas en CSS que se usan desde otros selectores CSS del mismo archivo no cuentan como uso real (hace falta HTML/JS)
for (const [sel, defs] of selectors) {
  const name = sel.slice(1);
  const re = wordRe(name, '');
  const hit = useText.filter(([, t]) => re.test(t)).map(([f]) => f);
  if (hit.length) continue;
  const testHit = testText.filter(([, t]) => re.test(t)).map(([f]) => f);
  const dynP = [...dynPrefixes.keys()].filter(p => (p.startsWith('*') ? name.endsWith(p.slice(1)) : name.startsWith(p) && name.length > p.length));
  const ev = defs.slice(0, 3).map(d => `${d.file}:${d.line}`).join(', ') + (defs.length > 3 ? ` (+${defs.length - 3})` : '');
  const files = defs.map(d => d.file);
  if (dynP.length) add('css', 'dudoso', sel, ev, `posible construcción dinámica con prefijo/sufijo ${dynP.map(p => `'${p}'`).join(', ')} (${[...new Set(dynP.flatMap(p => dynPrefixes.get(p)))].slice(0, 2).join(', ')})`);
  else if (testHit.length) add('css', 'probable', sel, ev, `solo aparece en tests (${testHit.slice(0, 2).join(', ')}); no en index.html ni js/`);
  else if (sel.startsWith('#') && /^[0-9a-f]{3,8}$/i.test(name)) continue; // #fff dentro de un selector raro
  else {
    // Regla de seguridad extra: estados typicos de librerías externas
    const lvl = /^(is|has)-|^(active|open|on|off|hidden|show|visible|disabled|loading|ready)$/.test(name) ? 'dudoso' : 'seguro';
    // Re-verificación cruda: ¿aparece la palabra en cualquier archivo crudo (incluye comentarios y vendor no)?
    const rawHits = []; for (const [f, t] of allRawText()) if (!cssFiles.includes(f) && re.test(t)) rawHits.push(f);
    if (rawHits.length) add('css', 'dudoso', sel, ev, `sin uso en código, pero la palabra aparece en ${rawHits.slice(0, 3).join(', ')} (¿comentario/string?)`);
    else add('css', lvl, sel, ev, lvl === 'seguro' ? 'definido en CSS; no aparece en index.html, js/, tests ni docs → borrable' : 'nombre de estado habitual; confirmar que no lo añade una librería');
    void files;
  }
}

/* ───────────── 4 · Archivos huérfanos ───────────── */
{
  // alcanzabilidad de JS desde las entradas de index.html
  const entries = new Set(); for (const f of htmlFiles) for (const m of htmlCode[f].matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) { const p = resolveSpec('index.html', m[1].startsWith('.') || m[1].startsWith('/') ? m[1] : './' + m[1]); if (p) entries.add(p); }
  const reach = new Set(), q = [...entries];
  while (q.length) { const f = q.pop(); if (reach.has(f) || !known.has(f)) continue; reach.add(f); for (const im of imports) if (im.from === f && im.to && known.has(im.to) && !reach.has(im.to)) q.push(im.to); }
  // sw.js se registra con navigator.serviceWorker.register(...) → cuenta como entrada
  if (jsFiles.some(f => /serviceWorker\.register\(/.test(code[f]))) reach.add('sw.js');
  const refText = [...jsFiles.filter(f => !isData(f)).map(f => [f, raw[f]]), ...cssFiles.map(f => [f, cssRaw[f]]), ...htmlFiles.map(f => [f, htmlRaw[f]]), ['manifest.webmanifest', extraRaw['manifest.webmanifest'] || '']];
  const swPre = /\/\/ >>> PRECACHE[\s\S]*?\/\/ <<< PRECACHE/;
  const refersTo = (target, scope) => refText.filter(([f]) => f !== target && scope(f)).filter(([f, t]) => { const tt = f === 'sw.js' ? t.replace(swPre, '') : t; const base = path.posix.basename(target); return tt.includes(target) || wordRe(base, '').test(tt) && true; }).map(([f]) => f);
  for (const f of jsFiles.filter(f => f.startsWith('js/'))) {
    if (reach.has(f)) continue;
    const refs = refersTo(f, x => isProd(x) || x.startsWith('css/') || x === 'index.html' || x === 'manifest.webmanifest');
    const trefs = refersTo(f, x => isTest(x) || isTool(x));
    if (refs.length) add('orphans', 'dudoso', f, f, `no alcanzable por imports desde main.js pero su nombre aparece en ${refs.slice(0, 3).join(', ')}`);
    else if (trefs.length) add('orphans', 'probable', f, f, `solo lo referencian tests/tools (${trefs.slice(0, 3).join(', ')}); ningún módulo de producción`);
    else add('orphans', 'seguro', f, f, 'no alcanzable desde index.html/main.js ni referenciado por nombre en ningún archivo');
  }
  for (const f of cssFiles) {
    const base = path.posix.basename(f);
    const refs = refText.filter(([x, t]) => x !== f && (t.includes(f) || (x === 'index.html' && t.includes(base)) || (t.includes('@import') && t.includes(base)))).map(([x]) => x);
    if (!refs.length) add('orphans', trefsHas(f) ? 'probable' : 'seguro', f, f, 'ningún <link>, @import ni string lo referencia');
  }
  function trefsHas(f) { return refersTo(f, x => isTest(x) || isTool(x)).length > 0; }
  const assets = walk('assets', null);
  for (const f of assets) {
    const base = path.posix.basename(f);
    const refs = refText.filter(([x, t]) => x !== 'sw.js' ? (t.includes(f) || wordRe(base, '').test(t)) : (t.replace(swPre, '').includes(f) || wordRe(base, '').test(t.replace(swPre, '')))).map(([x]) => x);
    if (refs.length) continue;
    const trefs = [...jsFiles.filter(x => isTest(x) || isTool(x)).map(x => [x, raw[x]]), ...['README.md', 'CLAUDE.md'].filter(x => extraRaw[x]).map(x => [x, extraRaw[x]])].filter(([, t]) => t.includes(f) || wordRe(base, '').test(t)).map(([x]) => x);
    // tools/*.py no se leen en jsFiles: se buscan aparte
    const pyRefs = walk('tools', ['.py']).filter(x => read(x).includes(base) || read(x).includes(path.posix.dirname(f))).map(x => x);
    const dirPrefix = path.posix.dirname(f) + '/';
    const dirMention = refText.filter(([x, t]) => t.includes(dirPrefix)).map(([x]) => x);
    if (trefs.length || pyRefs.length) add('orphans', 'probable', f, f, `solo lo referencian tools/tests/docs (${[...trefs, ...pyRefs].slice(0, 3).join(', ')}); la app no lo carga por nombre`);
    else if (dirMention.length) add('orphans', 'dudoso', f, f, `nombre no referenciado, pero la carpeta '${dirPrefix}' aparece en ${dirMention.slice(0, 2).join(', ')} (¿construcción dinámica?)`);
    else add('orphans', 'seguro', f, f, 'ni la ruta ni el nombre aparecen en html/css/js/manifest/tests/tools (sw.js PRECACHE no cuenta: se autogenera)');
  }
  // tests/ y tools/: archivos de tests que run-all no ejecuta
  const runAll = fs.existsSync(path.join(ROOT, 'tests/run-all.mjs')) ? raw['tests/run-all.mjs'] : '';
  for (const f of jsFiles.filter(f => /^tests\/.*\.test\.mjs$/.test(f))) {
    const b = path.posix.basename(f); if (!runAll.includes(b) && !/readdirSync|glob/i.test(runAll)) add('orphans', 'dudoso', f, f, 'test no listado en tests/run-all.mjs');
  }
}

/* ───────────── 5 · Hooks ───────────── */
{
  const assigned = new Map(), read_ = new Map(), readTests = new Map();
  const hookFiles = jsFiles.filter(f => !isData(f));
  for (const f of hookFiles) {
    const c = code[f];
    for (const m of c.matchAll(/(?<![\w$/.'\"-])hooks\s*\.\s*([\w$]+)(\s*(?:\|\||&&|\?\?)?=(?!=))?/g)) {
      const name = m[1], ln = `${f}:${lineOf(c, m.index)}`;
      const isAssign = !!m[2];
      const bucket = isAssign ? assigned : (isTest(f) || isTool(f) ? readTests : read_);
      (bucket.get(name) || bucket.set(name, []).get(name)).push(ln);
    }
    for (const m of c.matchAll(/\bhooks\s*\[\s*([^\]]+)\]/g)) (read_.get('[dinámico]') || read_.set('[dinámico]', []).get('[dinámico]')).push(`${f}:${lineOf(c, m.index)}`);
    for (const m of c.matchAll(/Object\.assign\(\s*hooks\s*,\s*\{([\s\S]*?)\}\s*\)/g)) for (const k of m[1].matchAll(/(?:^|[,{\s])([\w$]+)\s*[:,(]/g)) (assigned.get(k[1]) || assigned.set(k[1], []).get(k[1])).push(`${f}:${lineOf(c, m.index)} (Object.assign)`);
  }
  const dyn = read_.has('[dinámico]');
  for (const [name, ev] of assigned) {
    if (read_.has(name)) continue;
    if (readTests.has(name)) { add('hooksA', 'probable', `hooks.${name}`, `asignado en ${ev.slice(0, 2).join(', ')}`, `solo lo leen tests/tools (${readTests.get(name).slice(0, 2).join(', ')})`); continue; }
    const m = rawMentionsElsewhere('', 'hooks.' + name);
    add('hooksA', dyn ? 'dudoso' : 'seguro', `hooks.${name}`, `asignado en ${ev.slice(0, 3).join(', ')}`, 'asignado y nunca leído en js/ ni tests' + (dyn ? ' (pero hay accesos dinámicos hooks[...])' : ' → borrable junto con su función'));
    void m;
  }
  for (const [name, ev] of read_) {
    if (name === '[dinámico]' || assigned.has(name)) continue;
    // una lectura sin asignación puede ser asignación vía Object.assign o hooks.x ??= ; ya contemplados
    add('hooksR', 'probable', `hooks.${name}`, `leído en ${ev.slice(0, 3).join(', ')}`, 'se lee/invoca pero nunca se asigna → siempre undefined (¿código muerto o hook no registrado?)');
  }
  // re-verificación cruda de «seguros»
  for (const f of findings.hooksA) if (f.level === 'seguro') { const nm = f.what.slice(6); let cnt = 0; for (const [, t] of allRawText()) cnt += (t.match(new RegExp('hooks\\s*\\.\\s*' + esc(nm) + '(?![\\w$])', 'g')) || []).length; if (cnt > (assigned.get(nm) || []).length) { f.level = 'probable'; f.why += ' (re-verificación: más menciones crudas que asignaciones)'; } }
}

/* ───────────── 6 · Claves de P ───────────── */
{
  const c = code['js/core/params.js'];
  const start = c.indexOf('export const P'); const open = c.indexOf('{', start);
  const groups = []; // {group, key, line}
  let depth = 0, i = open, curGroup = null, prevSig = '{';
  while (i < c.length) {
    const ch = c[i];
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < c.length && c[i] !== q) i += c[i] === '\\' ? 2 : 1; i++; prevSig = 's'; continue; }
    if (ch === '{') { depth++; prevSig = '{'; i++; continue; }
    if (ch === '}') { depth--; if (depth === 0) break; if (depth === 1) curGroup = null; prevSig = '}'; i++; continue; }
    if (ch === '(' || ch === '[') { let d = 1, j = i + 1; while (j < c.length && d > 0) { if ('([{'.includes(c[j])) d++; else if (')]}'.includes(c[j])) d--; else if (c[j] === "'" || c[j] === '"') { const q = c[j]; j++; while (j < c.length && c[j] !== q) j++; } j++; } i = j; prevSig = ')'; continue; }
    if (/[\w$]/.test(ch)) {
      let j = i; while (j < c.length && /[\w$]/.test(c[j])) j++;
      const word = c.slice(i, j); let k = j; while (/\s/.test(c[k])) k++;
      if (c[k] === ':' && (prevSig === '{' || prevSig === ',')) { if (depth === 1) curGroup = word; else if (depth === 2 && curGroup) groups.push({ group: curGroup, key: word, line: lineOf(c, i) }); }
      prevSig = 'w'; i = j; continue;
    }
    if (!/\s/.test(ch)) prevSig = ch;
    i++;
  }
  const others = jsFiles.filter(f => f.startsWith('js/') && f !== 'js/core/params.js' && !isData(f));
  const iterates = others.filter(f => /Object\.(keys|entries|assign)\(\s*P\b|for\s*\(\s*const\s*\[?\w+[^)]*\bof\s+Object\.entries\(\s*P|\bin\s+P\b/.test(code[f]));
  for (const { group, key, line } of groups) {
    const strong = [], weak = [], inTests = [];
    const reDot = new RegExp('\\.\\s*' + esc(key) + '(?![\\w$])'), reStr = new RegExp('[\'"`]' + esc(key) + '[\'"`]'), reDestr = new RegExp('[{,]\\s*' + esc(key) + '\\s*(?:[,}=:]|$)');
    for (const f of others) {
      const t = code[f];
      if (reDot.test(t) || reStr.test(t) || reDestr.test(t)) strong.push(f); else if (wordRe(key, '').test(t)) weak.push(f);
    }
    for (const f of jsFiles.filter(isTest)) if (reDot.test(raw[f]) || reStr.test(raw[f])) inTests.push(f);
    const ev = `js/core/params.js:${line}`;
    const dotted = others.filter(f => new RegExp('P\\s*\\.\\s*' + group + '\\s*\\.\\s*' + esc(key) + '(?![\\w$])').test(code[f]));
    if (dotted.length || strong.length && (new RegExp('\\b' + group + '\\b').test(strong.map(f => code[f]).join('\n')) && false)) continue;
    // Construcción dinámica del nombre (P.scene[k + 'X'], `${k}X`): la clave termina en un sufijo concatenado → dudoso, no seguro
    const sufs = new Set(); for (const f of others) for (const m of code[f].matchAll(/\+\s*['"`]([\w]{1,8})['"`]|\$\{[^}]*\}([\w]{1,8})/g)) sufs.add(m[1] || m[2]);
    const dynSuf = [...sufs].find(sf => key.endsWith(sf) && key.length > sf.length);
    if (dynSuf && !strong.length) { add('params', 'dudoso', `P.${group}.${key}`, ev, `sin lectura por nombre, pero se concatena el sufijo '${dynSuf}' en js/ (p. ej. P.${group}[k + '${dynSuf}']) → probablemente se lee dinámicamente`); continue; }
    if (strong.length) continue; // referenciada por nombre en algún sitio (laxo): no se reporta
    const rawOther = allRawText().filter(([f, t]) => f !== 'js/core/params.js' && !isTest(f) && wordRe(key, '').test(t)).map(([f]) => f);
    const iterNote = iterates.length ? ` ⚠ hay iteración genérica sobre P (${iterates.slice(0, 3).join(', ')}) → igualmente se persiste/serializa` : '';
    if (inTests.length) add('params', 'probable', `P.${group}.${key}`, ev, `solo se lee desde tests (${inTests.slice(0, 2).join(', ')})` + iterNote);
    else if (weak.length || rawOther.length) add('params', 'dudoso', `P.${group}.${key}`, ev, `no hay lectura por nombre (.${key}, '${key}', desestructuración); la palabra suelta aparece en ${[...new Set([...weak, ...rawOther])].slice(0, 3).join(', ')}` + iterNote);
    else add('params', iterates.length ? 'probable' : 'seguro', `P.${group}.${key}`, ev, 'ninguna lectura por nombre en js/ ni tests' + iterNote + (iterates.length ? '' : ' → borrable (y de la persistencia)'));
  }
}

/* ───────────── 7 · Comentarios obsoletos ───────────── */
{
  const existsFile = p => fs.existsSync(path.join(ROOT, p));
  const baseNames = new Set(); // todos los nombres de archivo del repo + vendor
  const allFiles = [...walk('', null).filter(f => !f.startsWith('node_modules/')), ...(fs.existsSync(path.join(ROOT, 'vendor')) ? (function w(d) { const o = []; for (const n of fs.readdirSync(path.join(ROOT, d))) { const r = d + '/' + n; fs.statSync(path.join(ROOT, r)).isDirectory() ? o.push(...w(r)) : o.push(r); } return o; })('vendor') : [])];
  for (const f of allFiles) baseNames.add(path.posix.basename(f));
  // identificadores definidos en cualquier archivo de código (aprox.: aparecen como palabra en código no comentado de ≥1 archivo, descontando el propio comentario)
  const allCode = jsFiles.filter(f => !isData(f)).map(f => code[f]).join('\n') + '\n' + cssFiles.map(f => cssCode[f]).join('\n') + '\n' + Object.values(htmlCode).join('\n');
  const srcs = [...jsFiles.filter(f => !isData(f)).map(f => [f, comments[f]]), ...cssFiles.map(f => [f, [...cssRaw[f].matchAll(/\/\*[\s\S]*?\*\//g)].map(m => ({ text: m[0], line: lineOf(cssRaw[f], m.index) }))]), ...htmlFiles.map(f => [f, [...htmlRaw[f].matchAll(/<!--[\s\S]*?-->/g)].map(m => ({ text: m[0], line: lineOf(htmlRaw[f], m.index) }))])];
  const seen = new Set();
  for (const [f, list] of srcs) for (const cm of list) {
    const addC = (lvl, what, why, off = 0) => { const key = f + ':' + (cm.line + off) + what; if (seen.has(key)) return; seen.add(key); add('comments', lvl, what, `${f}:${cm.line + off}`, why); };
    cm.text.split('\n').forEach((ln, off) => {
      for (const m of ln.matchAll(/\b((?:js|css|assets|tests|tools)\/[\w./-]+\.(?:js|mjs|css|py|jpg|png|woff2?|json))\b/g)) if (!existsFile(m[1])) addC('seguro', m[1], 'comentario cita una ruta que no existe en el repo', off);
      for (const m of ln.matchAll(/(?<![\w/.-])([\w-]+\.(?:js|mjs|css))\b/g)) { const b = m[1]; if (/^(three|gsap|ex)\./.test(b) || baseNames.has(b) || /\.min\.js$|\.module\.js$/.test(b)) continue; if (/\b(js|css|assets|tests|tools)\/[\w./-]*$/.test(ln.slice(0, m.index + b.length))) continue; addC('probable', b, 'comentario menciona un archivo cuyo nombre no existe en el repo (ni en vendor/)', off); }
      for (const m of ln.matchAll(/\bhooks\.([\w$]+)/g)) if (!new RegExp('hooks\\s*\\.\\s*' + esc(m[1]) + '(?![\\w$])').test(allCode)) addC('probable', `hooks.${m[1]}`, 'comentario cita un hook que ya no existe en el código', off);
      for (const m of ln.matchAll(/\bP\.([a-z]\w*)\.([\w$]+)/g)) { const g = m[1], k = m[2]; const pc = code['js/core/params.js']; if (!new RegExp('\\b' + g + '\\s*:').test(pc) || !wordRe(k, '').test(pc)) { if (['js', 'css', 'assets'].includes(g)) continue; addC('probable', `P.${g}.${k}`, 'comentario cita una clave de P que no existe en params.js', off); } }
      for (const m of ln.matchAll(/\b(?:ver|see|cf\.?|v[ée]ase)\s+(?:`)?([A-Za-z_$][\w$]{3,})\(\)/g)) if (!wordRe(m[1], '').test(allCode)) addC('probable', `${m[1]}()`, 'comentario remite a una función que no aparece en ningún código', off);
    });
  }
}

/* ───────────── Informe ───────────── */
const ORDER = { seguro: 0, probable: 1, dudoso: 2 };
for (const k of Object.keys(findings)) findings[k].sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.evidence.localeCompare(b.evidence));
const evFiles = ev => [...new Set([...ev.matchAll(/((?:js|css|tests|tools)\/[\w./-]+?\.\w+|sw\.js|index\.html)(?::\d+)?/g)].map(m => m[1]))];
for (const k of Object.keys(findings)) for (const f of findings[k]) f.watch = tagWatch(...evFiles(f.evidence), ...evFiles(f.what));
const titles = {
  exports: '1 · Exports sin uso (ningún otro archivo los importa)', exportsTest: '1b · Exports usados solo por tests/tools',
  imports: '2 · Imports sin uso dentro del archivo', css: '3 · Clases / IDs CSS sin uso', orphans: '4 · Archivos huérfanos',
  hooksA: '5a · Hooks asignados y nunca leídos', hooksR: '5b · Hooks leídos y nunca asignados', params: '6 · Claves de P nunca leídas', comments: '7 · Comentarios obsoletos'
};
const cnt = k => ['seguro', 'probable', 'dudoso'].map(l => findings[k].filter(f => f.level === l).length);
let md = `# Informe de código sin uso\n\nGenerado por \`node tools/unused.mjs\` (solo lectura, heurístico, sin AST). Niveles: **seguro** = borrable (re-verificado con búsqueda cruda de palabra completa en todo el repo) · **probable** · **dudoso**.\n` +
  `Marca ⚠ = el hallazgo toca \`${WATCH.join('`, `')}\` (en refactorización por otros agentes: tratar después).\n\n## Resumen\n\n| Categoría | Seguro | Probable | Dudoso | Total |\n|---|---:|---:|---:|---:|\n`;
for (const k of Object.keys(findings)) { const [a, b, c2] = cnt(k); md += `| ${titles[k]} | ${a} | ${b} | ${c2} | ${a + b + c2} |\n`; }
md += '\n';
for (const k of Object.keys(findings)) {
  md += `## ${titles[k]}\n\n`;
  if (!findings[k].length) { md += '_Sin hallazgos._\n\n'; continue; }
  md += '| Nivel | Elemento | Evidencia | Razón |\n|---|---|---|---|\n';
  for (const f of findings[k]) md += `| ${f.level} | \`${f.what.replace(/\|/g, '\\|')}\` | ${f.evidence.replace(/\|/g, '\\|')} | ${f.why.replace(/\|/g, '\\|')}${f.watch} |\n`;
  md += '\n';
}
fs.writeFileSync(path.join(ROOT, 'tools/unused-report.md'), md);
console.log('tools/unused-report.md escrito');
for (const k of Object.keys(findings)) { const [a, b, c2] = cnt(k); console.log(`${titles[k].padEnd(60)} seguro ${a} · probable ${b} · dudoso ${c2}`); }
const w = Object.values(findings).flat().filter(f => f.watch).length;
console.log(`Hallazgos que tocan ${WATCH.join(' / ')}: ${w}`);
process.exit(0);
