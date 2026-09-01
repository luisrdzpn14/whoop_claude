#!/usr/bin/env node
/**
 * Agrega los datos de ./data/ en una serie diaria, un resumen semanal
 * y correlaciones carga-vs-recuperación. Escribe ./data/agg.json
 *
 *   node scripts/aggregate.js
 *
 * Nota metodológica: la correlación relevante es con DESFASE. El efecto
 * de la carga de un día se manifiesta en la recuperación de la mañana
 * siguiente, así que se empareja strain(N) con recovery(N+1).
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'data');
const load = n => {
  const f = path.join(DIR, n + '.json');
  if (!fs.existsSync(f)) {
    console.error(`Falta ${f}. Ejecuta antes: node scripts/fetch-data.js`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')).records || [];
};

const cycles = load('cycles'), recs = load('recoveries'),
      sleeps = load('sleeps'), works = load('workouts');

/** Fecha natural local, usando el offset que trae cada registro. */
function localDay(iso, off) {
  const sign = off && off.startsWith('-') ? -1 : 1;
  const [h, m] = (off || '+00:00').slice(1).split(':').map(Number);
  return new Date(new Date(iso).getTime() + sign * (h * 60 + m) * 60000)
    .toISOString().slice(0, 10);
}
/** Lunes de la semana ISO a la que pertenece el día. */
function weekKey(day) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const r1 = x => x == null ? null : Math.round(x * 10) / 10;

// ── serie diaria ────────────────────────────────────────────
const days = {};
const D = k => days[k] || (days[k] = { day: k });

for (const c of cycles) {
  if (c.score_state !== 'SCORED') continue;
  const d = D(localDay(c.start, c.timezone_offset));
  d.strain = c.strain; d.kj = c.kilojoule;
  d.avg_hr = c.average_heart_rate; d.max_hr = c.max_heart_rate; d.cycle_id = c.id;
}
const recByCycle = {};
for (const r of recs) if (r.score_state === 'SCORED') recByCycle[r.cycle_id] = r;
for (const k of Object.keys(days)) {
  const r = recByCycle[days[k].cycle_id];
  if (r) { days[k].recovery = r.recovery_score; days[k].hrv = r.hrv_rmssd_milli; days[k].rhr = r.resting_heart_rate; }
}
for (const s of sleeps) {
  if (s.score_state !== 'SCORED' || s.nap) continue;
  const d = D(localDay(s.start, s.timezone_offset));
  d.sleep_h = (s.total_in_bed_time_milli - s.total_awake_time_milli) / 3600000;
  d.sleep_perf = s.sleep_performance_percentage;
}
for (const w of works) {
  if (w.score_state !== 'SCORED') continue;
  const d = D(localDay(w.start, w.timezone_offset));
  d.w_count = (d.w_count || 0) + 1;
  d.w_min = (d.w_min || 0) + (new Date(w.end) - new Date(w.start)) / 60000;
  (d.sports = d.sports || []).push(w.sport_name);
}
const series = Object.values(days).sort((a, b) => a.day < b.day ? -1 : 1);

// ── resumen semanal ─────────────────────────────────────────
const buckets = {};
for (const d of series) {
  const k = weekKey(d.day);
  const w = buckets[k] || (buckets[k] = { week: k, days: 0, strain: [], rec: [], hrv: [], rhr: [], sleep: [], perf: [], wc: 0, wm: 0, sports: {} });
  w.days++;
  if (d.strain != null) w.strain.push(d.strain);
  if (d.recovery != null) w.rec.push(d.recovery);
  if (d.hrv != null) w.hrv.push(d.hrv);
  if (d.rhr != null) w.rhr.push(d.rhr);
  if (d.sleep_h != null) w.sleep.push(d.sleep_h);
  if (d.sleep_perf != null) w.perf.push(d.sleep_perf);
  w.wc += d.w_count || 0; w.wm += d.w_min || 0;
  for (const s of d.sports || []) w.sports[s] = (w.sports[s] || 0) + 1;
}
const weeks = Object.values(buckets).sort((a, b) => a.week < b.week ? -1 : 1).map(w => ({
  week: w.week, days: w.days,
  strain_avg: r1(avg(w.strain)), recovery_avg: r1(avg(w.rec)),
  hrv_avg: r1(avg(w.hrv)), rhr_avg: r1(avg(w.rhr)),
  sleep_h_avg: r1(avg(w.sleep)), sleep_perf_avg: r1(avg(w.perf)),
  workouts: w.wc, workout_min: Math.round(w.wm)
}));

// ── correlaciones ───────────────────────────────────────────
function pearson(pairs) {
  if (pairs.length < 3) return null;
  const mx = avg(pairs.map(p => p[0])), my = avg(pairs.map(p => p[1]));
  let num = 0, dx = 0, dy = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  return Math.round(num / Math.sqrt(dx * dy) * 1000) / 1000;
}
const byDay = Object.fromEntries(series.map(d => [d.day, d]));
const next = k => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

const mismo = [], lag1 = [], suenio = [];
for (const d of series) {
  if (d.strain != null && d.recovery != null) mismo.push([d.strain, d.recovery]);
  const nx = byDay[next(d.day)];
  if (d.strain != null && nx && nx.recovery != null) lag1.push([d.strain, nx.recovery]);
  if (d.sleep_h != null && nx && nx.recovery != null) suenio.push([d.sleep_h, nx.recovery]);
}

const out = {
  range: { from: series[0].day, to: series[series.length - 1].day, days: series.length },
  weeks,
  correlations: {
    strain_vs_same_day_recovery: { r: pearson(mismo), n: mismo.length },
    strain_vs_next_day_recovery: { r: pearson(lag1), n: lag1.length },
    sleep_h_vs_next_day_recovery: { r: pearson(suenio), n: suenio.length }
  },
  series
};
fs.writeFileSync(path.join(DIR, 'agg.json'), JSON.stringify(out, null, 1));

console.log(`${out.range.from} → ${out.range.to} · ${out.range.days} días · ${weeks.length} semanas\n`);
console.log('Correlaciones (|r| < 0.3 = relación débil o inexistente):');
for (const [k, v] of Object.entries(out.correlations)) console.log(`  ${k.padEnd(30)} r = ${v.r}  (n=${v.n})`);
console.log('\nListo → ahora: node scripts/build-dashboard.js');
