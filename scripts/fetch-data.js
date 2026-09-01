#!/usr/bin/env node
/**
 * Descarga tus datos de WHOOP a ./data/ usando el MCP whoop-mcp-unofficial.
 *
 *   node scripts/fetch-data.js [dias]
 *
 * Por defecto 90 días. Requiere haber completado `setup` y `auth` antes
 * (ver README). Los archivos que genera contienen datos personales de
 * salud y están excluidos por .gitignore.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIAS = parseInt(process.argv[2] || '90', 10);
const PKG = 'whoop-mcp-unofficial@0.6.5';
const OUT = path.join(process.cwd(), 'data');

// En Windows hay que invocar npx.cmd: el `npx` pelado es un script .ps1
// que PowerShell bloquea por política de ejecución.
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const desde = new Date(Date.now() - DIAS * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

console.log(`Descargando ${DIAS} días desde ${desde.slice(0, 10)}\n`);

let fallos = 0;
for (const dominio of ['cycles', 'recoveries', 'sleeps', 'workouts']) {
  process.stdout.write(`  ${dominio.padEnd(12)}`);

  const args = JSON.stringify({
    start: desde, limit: 25, all_pages: true, max_pages: 20, response_format: 'json'
  });

  const r = spawnSync(NPX, ['-y', PKG, 'call', `whoop_list_${dominio}`, '--json', args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32'
  });

  if (r.error || !r.stdout) {
    console.log('ERROR:', (r.error && r.error.message) || (r.stderr || '').slice(0, 120));
    fallos++; continue;
  }

  let json;
  try { json = JSON.parse(r.stdout); }
  catch { console.log('ERROR: respuesta no es JSON —', r.stdout.slice(0, 120)); fallos++; continue; }

  if (json.error) { console.log('ERROR:', json.error); fallos++; continue; }

  fs.writeFileSync(path.join(OUT, `${dominio}.json`), JSON.stringify(json, null, 1));
  console.log(`${(json.records || []).length} registros`);
}

if (fallos) {
  console.log(`\n${fallos} dominio(s) fallaron. Comprueba la conexión con:`);
  console.log(`  ${NPX} -y ${PKG} doctor`);
  process.exit(1);
}
console.log(`\nListo. Datos en ./data/  →  ahora: node scripts/aggregate.js`);
