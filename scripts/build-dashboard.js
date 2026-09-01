#!/usr/bin/env node
/**
 * Genera output/dashboard.html a partir de data/agg.json
 *
 *   node scripts/build-dashboard.js
 *
 * El HTML resultante lleva TUS datos de salud incrustados.
 * Está en .gitignore a proposito: no lo subas a un repo publico.
 */
const fs=require('fs');
const path=require('path');
const DIR=path.join(process.cwd(),'data');
const OUT=path.join(process.cwd(),'output');
if(!fs.existsSync(path.join(DIR,'agg.json'))){console.error('Falta data/agg.json. Ejecuta antes: node scripts/aggregate.js');process.exit(1);}
if(!fs.existsSync(OUT)) fs.mkdirSync(OUT,{recursive:true});
const A=JSON.parse(fs.readFileSync(path.join(DIR,'agg.json'),'utf8'));
const works=JSON.parse(fs.readFileSync(path.join(DIR,'workouts.json'),'utf8')).records.filter(w=>w.score_state==='SCORED');

const W=A.weeks, S=A.series;
const f1=x=>x==null?'—':(Math.round(x*10)/10).toFixed(1);
const f0=x=>x==null?'—':Math.round(x);

const sp={};
for(const w of works){const s=sp[w.sport_name]||(sp[w.sport_name]={n:0,min:0,st:0});s.n++;s.min+=(new Date(w.end)-new Date(w.start))/60000;s.st+=w.strain;}
const sports=Object.entries(sp).map(([k,v])=>({name:k,n:v.n,min:Math.round(v.min),strain:v.st/v.n})).sort((a,b)=>b.min-a.min);
const SPNAME={running:'Correr',tennis:'Tenis','paddle-tennis':'Pádel',weightlifting:'Pesas',walking:'Caminar',activity:'Actividad',dance:'Baile'};

const recs=S.filter(d=>d.recovery!=null);
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const K={
  rec:avg(recs.map(d=>d.recovery)), hrv:avg(recs.map(d=>d.hrv)), rhr:avg(recs.map(d=>d.rhr)),
  strain:avg(S.filter(d=>d.strain!=null).map(d=>d.strain)),
  sleep:avg(S.filter(d=>d.sleep_h!=null).map(d=>d.sleep_h)),
  wn:works.length, wmin:Math.round(works.reduce((a,w)=>a+(new Date(w.end)-new Date(w.start))/60000,0))
};
const band=x=>x>=67?'g':x>=34?'y':'r';
const bands={g:0,y:0,r:0}; for(const d of recs) bands[band(d.recovery)]++;

const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const MO=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const lbl=d=>{const p=d.split('-');return p[2]+' '+MO[+p[1]-1];};

/* CHART 1 */
const CW=920, PADL=52, PADR=16, BW=Math.floor((CW-PADL-PADR)/W.length);
const H1=150, H2=150;
const maxStrain=Math.max.apply(null,W.map(w=>w.strain_avg))*1.15;
const sx=i=>PADL+i*BW+BW/2;
let c1='';
[0,5,10,15].forEach(g=>{const y=H1-(g/maxStrain)*(H1-20);if(y<0)return;
  c1+='<line class="grid" x1="'+PADL+'" y1="'+y.toFixed(1)+'" x2="'+(CW-PADR)+'" y2="'+y.toFixed(1)+'"/>'+
      '<text class="ax" x="'+(PADL-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end">'+g+'</text>';});
W.forEach((w,i)=>{const h=(w.strain_avg/maxStrain)*(H1-20);const x=PADL+i*BW+3, y=H1-h;
  c1+='<rect class="bar hit" data-i="'+i+'" x="'+x+'" y="'+y.toFixed(1)+'" width="'+(BW-6)+'" height="'+Math.max(h,2).toFixed(1)+'" rx="4"/>';});

const OY=H1+42;
const ry=v=>OY+(H2-20)-((v/100)*(H2-20));
let linePath='';
W.forEach((w,i)=>{linePath+=(i?' L':'M')+sx(i).toFixed(1)+' '+ry(w.recovery_avg).toFixed(1);});
const area=linePath+' L'+sx(W.length-1).toFixed(1)+' '+(OY+H2-20).toFixed(1)+' L'+sx(0).toFixed(1)+' '+(OY+H2-20).toFixed(1)+' Z';
let c2='';
[0,34,67,100].forEach(g=>{const y=ry(g);
  c2+='<line class="grid" x1="'+PADL+'" y1="'+y.toFixed(1)+'" x2="'+(CW-PADR)+'" y2="'+y.toFixed(1)+'"/>'+
      '<text class="ax" x="'+(PADL-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end">'+g+'</text>';});
c2+='<path class="area" d="'+area+'"/><path class="line" d="'+linePath+'"/>';
W.forEach((w,i)=>{c2+='<circle class="dot hit" data-i="'+i+'" cx="'+sx(i).toFixed(1)+'" cy="'+ry(w.recovery_avg).toFixed(1)+'" r="4.5"/>';});
let cx='';
W.forEach((w,i)=>{if(i%2)return;cx+='<text class="ax" x="'+sx(i).toFixed(1)+'" y="'+(OY+H2+2).toFixed(1)+'" text-anchor="middle">'+lbl(w.week)+'</text>';});
// semana con el recovery medio mas bajo del periodo
const iSick=W.reduce((b,w,i)=>w.recovery_avg<W[b].recovery_avg?i:b,0);
const sickBand='<rect class="evt" x="'+(PADL+iSick*BW)+'" y="0" width="'+BW+'" height="'+(OY+H2-20)+'"/>';

/* CHART 2 */
const CELL=8, GAP=2, SW=S.length*(CELL+GAP);
let strip='';
S.forEach((d,i)=>{const cls=d.recovery==null?'nd':band(d.recovery);
  strip+='<rect class="cell c-'+cls+' hit2" data-d="'+i+'" x="'+i*(CELL+GAP)+'" y="0" width="'+CELL+'" height="34" rx="2"/>';});
// dia con el recovery mas bajo del periodo, y ventana de +-3 dias alrededor
const scored=S.filter(d=>d.recovery!=null);
const worst=scored.reduce((a,b)=>b.recovery<a.recovery?b:a);
const iJul=S.findIndex(d=>d.day===worst.day);
const wIdx=S.findIndex(d=>d.day===worst.day);
const evtWin=S.slice(Math.max(0,wIdx-2),Math.min(S.length,wIdx+5));
const prev=S.slice(0,wIdx).filter(d=>d.recovery!=null).pop()||null;
// dias de CALENDARIO hasta recuperar (no indices: puede haber dias sin dato)
const backDay=S.find((d,i)=>i>wIdx&&d.recovery!=null&&d.recovery>=60);
const diasVuelta=backDay?Math.round((new Date(backDay.day)-new Date(worst.day))/86400000):null;
const jx=(iJul*(CELL+GAP)+CELL/2).toFixed(1);

/* CHART 3 */
const SCW=440, SCH=300, SPAD=46;
const pts=[];
for(let i=0;i<S.length-1;i++){const a=S[i],b=S[i+1];
  if((new Date(b.day)-new Date(a.day))/86400000===1&&a.strain!=null&&b.recovery!=null) pts.push([a.strain,b.recovery,a.day]);}
const mxS=Math.max.apply(null,pts.map(p=>p[0]))*1.08;
const px=v=>SPAD+(v/mxS)*(SCW-SPAD-14), py=v=>SCH-30-((v/100)*(SCH-30-14));
let sc='';
[0,25,50,75,100].forEach(g=>{const y=py(g);
  sc+='<line class="grid" x1="'+SPAD+'" y1="'+y.toFixed(1)+'" x2="'+(SCW-14)+'" y2="'+y.toFixed(1)+'"/>'+
      '<text class="ax" x="'+(SPAD-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end">'+g+'</text>';});
[0,5,10,15,20].forEach(g=>{if(g>mxS)return;
  sc+='<text class="ax" x="'+px(g).toFixed(1)+'" y="'+(SCH-10)+'" text-anchor="middle">'+g+'</text>';});
const mx=avg(pts.map(p=>p[0])),my=avg(pts.map(p=>p[1]));
let num=0,den=0;pts.forEach(p=>{num+=(p[0]-mx)*(p[1]-my);den+=Math.pow(p[0]-mx,2);});
const slope=num/den, icpt=my-slope*mx;
sc+='<line class="fit" x1="'+px(0).toFixed(1)+'" y1="'+py(icpt).toFixed(1)+'" x2="'+px(mxS).toFixed(1)+'" y2="'+py(slope*mxS+icpt).toFixed(1)+'"/>';
pts.forEach(p=>{sc+='<circle class="pt" cx="'+px(p[0]).toFixed(1)+'" cy="'+py(p[1]).toFixed(1)+'" r="4"><title>'+p[2]+' · strain '+f1(p[0])+' → recovery '+p[1]+'</title></circle>';});

const mxMin=Math.max.apply(null,sports.map(s=>s.min));
const spRows=sports.map(s=>'<tr><th scope="row">'+esc(SPNAME[s.name]||s.name)+'</th><td class="num">'+s.n+'</td><td class="num">'+s.min+'</td><td class="num">'+f1(s.strain)+'</td><td class="barcell"><span class="minibar" style="width:'+(s.min/mxMin*100).toFixed(1)+'%"></span></td></tr>').join('');

const rows=W.map((w,i)=>'<tr'+(i===iSick?' class="rw-evt"':'')+'><th scope="row">'+lbl(w.week)+'</th><td class="num">'+w.days+'</td><td class="num">'+f1(w.strain_avg)+'</td><td class="num"><span class="chip b-'+band(w.recovery_avg)+'">'+f0(w.recovery_avg)+'</span></td><td class="num">'+f1(w.hrv_avg)+'</td><td class="num">'+f0(w.rhr_avg)+'</td><td class="num">'+f1(w.sleep_h_avg)+'</td><td class="num">'+w.workouts+'</td><td class="num">'+w.workout_min+'</td></tr>').join('');

const evtRows=evtWin.map(d=>'<tr'+(d.day===worst.day?' class="rw-evt"':'')+'><th scope="row">'+lbl(d.day)+'</th><td class="num">'+f1(d.strain)+'</td><td class="num">'+(d.recovery==null?'—':'<span class="chip b-'+band(d.recovery)+'">'+d.recovery+'</span>')+'</td><td class="num">'+f1(d.hrv)+'</td><td class="num">'+f0(d.rhr)+'</td><td class="num">'+f1(d.sleep_h)+'</td></tr>').join('');

const WDATA=JSON.stringify(W.map(w=>({w:lbl(w.week),s:w.strain_avg,r:w.recovery_avg,hv:w.hrv_avg,rh:w.rhr_avg,sl:w.sleep_h_avg,wk:w.workouts,mn:w.workout_min})));
const SDATA=JSON.stringify(S.map(d=>({d:lbl(d.day),r:d.recovery,s:d.strain==null?null:Math.round(d.strain*10)/10})));
const R=A.correlations.strain_vs_next_day_recovery;

const CSS=[
':root{--bg:#f7f8f9;--surf:#ffffff;--surf2:#eef1f3;--line:#dde2e6;--line2:#c8d0d6;--ink:#12171c;--ink2:#4a555f;--ink3:#78848d;--strain:#2a78d6;--rec:#1baf7a;--g:#1baf7a;--y:#eda100;--r:#e34948;--evt:rgba(227,73,72,.09);--shadow:0 1px 2px rgba(18,23,28,.06),0 8px 24px -12px rgba(18,23,28,.13)}',
'@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1214;--surf:#171d20;--surf2:#1f262a;--line:#2b3439;--line2:#3d484e;--ink:#eef2f4;--ink2:#a5b2ba;--ink3:#78868f;--strain:#3987e5;--rec:#199e70;--g:#199e70;--y:#c98500;--r:#e34948;--evt:rgba(227,73,72,.14);--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6)}}',
':root[data-theme="dark"]{--bg:#0e1214;--surf:#171d20;--surf2:#1f262a;--line:#2b3439;--line2:#3d484e;--ink:#eef2f4;--ink2:#a5b2ba;--ink3:#78868f;--strain:#3987e5;--rec:#199e70;--g:#199e70;--y:#c98500;--r:#e34948;--evt:rgba(227,73,72,.14);--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6)}',
'*{box-sizing:border-box}',
'body{margin:0;background:var(--bg);color:var(--ink);font-family:"IBM Plex Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.6;-webkit-font-smoothing:antialiased}',
'.wrap{max-width:1000px;margin:0 auto;padding:44px 22px 80px;display:flex;flex-direction:column;gap:30px}',
'h1,h2{font-family:"IBM Plex Serif",Georgia,serif;text-wrap:balance;margin:0;letter-spacing:-.01em}',
'h1{font-size:clamp(30px,5vw,46px);font-weight:600;line-height:1.1}',
'h2{font-size:22px;font-weight:600}',
'p{margin:0}',
'.eyebrow{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)}',
'.num,.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}',
'.sub{color:var(--ink2);max-width:66ch}',
'header{display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--line);padding-bottom:26px}',
'.card{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:22px;box-shadow:var(--shadow)}',
'section{display:flex;flex-direction:column;gap:14px}',
'.shead{display:flex;flex-direction:column;gap:5px}',
'.finding{background:var(--surf);border:1px solid var(--line);border-left:3px solid var(--strain);border-radius:12px;padding:26px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--shadow)}',
'.rbig{font-family:"IBM Plex Mono",monospace;font-size:clamp(38px,7vw,58px);font-weight:600;line-height:1;color:var(--strain);font-variant-numeric:tabular-nums}',
'.rrow{display:flex;gap:26px;flex-wrap:wrap;align-items:baseline}',
'.rlab{font-size:13px;color:var(--ink2);max-width:34ch}',
'.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}',
'.kpi{background:var(--surf);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);padding:15px 17px;display:flex;flex-direction:column;gap:5px}',
'.kpi .v{font-family:"IBM Plex Mono",monospace;font-size:25px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}',
'.kpi .k{font-size:11.5px;color:var(--ink3);font-family:"IBM Plex Mono",monospace;letter-spacing:.05em;text-transform:uppercase}',
'.kpi .u{font-size:13px;color:var(--ink3);font-weight:400}',
'.scroll{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}',
'svg{display:block;max-width:100%;height:auto}',
'.grid{stroke:var(--line);stroke-width:1}',
'.ax{fill:var(--ink3);font-family:"IBM Plex Mono",monospace;font-size:10.5px;font-variant-numeric:tabular-nums}',
'.bar{fill:var(--strain)}',
'.line{fill:none;stroke:var(--rec);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}',
'.area{fill:var(--rec);opacity:.13}',
'.dot{fill:var(--rec);stroke:var(--surf);stroke-width:2}',
'.evt{fill:var(--evt)}',
'.fit{stroke:var(--ink3);stroke-width:2;stroke-dasharray:5 4}',
'.pt{fill:var(--strain);opacity:.62;stroke:var(--surf);stroke-width:1.5}',
'.hit,.hit2{cursor:pointer}',
'.bar:hover,.dot:hover{opacity:.75}',
'.plab{fill:var(--ink2);font-family:"IBM Plex Mono",monospace;font-size:11px;font-weight:500}',
'.c-g{fill:var(--g)}.c-y{fill:var(--y)}.c-r{fill:var(--r)}.c-nd{fill:var(--surf2)}',
'.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2);align-items:center}',
'.lg{display:inline-flex;align-items:center;gap:7px}',
'.sw{width:11px;height:11px;border-radius:3px;flex:none}',
'.swl{width:16px;height:3px;border-radius:2px;flex:none}',
'table{width:100%;border-collapse:collapse;font-size:13.5px}',
'th,td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--line)}',
'thead th{font-family:"IBM Plex Mono",monospace;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);font-weight:500;white-space:nowrap}',
'tbody th{font-family:"IBM Plex Mono",monospace;font-weight:500;white-space:nowrap;color:var(--ink)}',
'td.num{font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;text-align:right}',
'thead th.num{text-align:right}',
'tbody tr:hover{background:var(--surf2)}',
'.rw-evt{background:var(--evt)}',
'.chip{display:inline-block;min-width:34px;text-align:center;padding:2px 7px;border-radius:5px;font-weight:600;font-size:12.5px;color:#fff}',
'.b-g{background:var(--g)}.b-y{background:var(--y);color:#2a1c00}.b-r{background:var(--r)}',
'.barcell{width:26%}',
'.minibar{display:block;height:7px;border-radius:4px;background:var(--strain);opacity:.75}',
'.note{background:var(--surf2);border:1px solid var(--line);border-radius:10px;padding:16px 18px;font-size:13.5px;color:var(--ink2);display:flex;flex-direction:column;gap:8px}',
'.note strong{color:var(--ink)}',
'.evtcard{border-left:3px solid var(--r)}',
'footer{border-top:1px solid var(--line);padding-top:18px;font-size:12.5px;color:var(--ink3);display:flex;flex-direction:column;gap:6px}',
'code{font-family:"IBM Plex Mono",monospace;font-size:.92em;background:var(--surf2);padding:1px 5px;border-radius:4px}',
'#tip{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;z-index:50;background:var(--ink);color:var(--bg);padding:8px 11px;border-radius:7px;font-size:12px;font-family:"IBM Plex Mono",monospace;line-height:1.5;white-space:pre;box-shadow:0 4px 16px rgba(0,0,0,.3)}',
'@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}',
':focus-visible{outline:2px solid var(--strain);outline-offset:2px;border-radius:3px}'
].join('\n');

const JS=[
'(function(){',
'var W='+WDATA+', S='+SDATA+', tip=document.getElementById("tip");',
'function show(e,t){tip.textContent=t;tip.style.opacity="1";',
'var r=tip.getBoundingClientRect(),x=e.clientX+14,y=e.clientY+14;',
'if(x+r.width>innerWidth-8)x=e.clientX-r.width-14;',
'if(y+r.height>innerHeight-8)y=e.clientY-r.height-14;',
'tip.style.left=x+"px";tip.style.top=y+"px";}',
'function hide(){tip.style.opacity="0";}',
'document.querySelectorAll(".hit").forEach(function(el){',
'el.addEventListener("mousemove",function(e){var d=W[+el.dataset.i];',
'show(e,"Semana del "+d.w+"\\nStrain    "+d.s+"\\nRecovery  "+d.r+"\\nHRV       "+d.hv+" ms\\nFC rep.   "+d.rh+" bpm\\nSueno     "+d.sl+" h\\nSesiones  "+d.wk+" ("+d.mn+" min)");});',
'el.addEventListener("mouseleave",hide);});',
'document.querySelectorAll(".hit2").forEach(function(el){',
'el.addEventListener("mousemove",function(e){var d=S[+el.dataset.d];',
'show(e,d.d+"\\nRecovery  "+(d.r==null?"sin dato":d.r)+"\\nStrain    "+(d.s==null?"sin dato":d.s));});',
'el.addEventListener("mouseleave",hide);});',
'addEventListener("scroll",hide,{passive:true});',
'})();'
].join('\n');

const H=[];
H.push('<title>Carga y Recuperación</title>');
H.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
H.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
H.push('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400;600&display=swap">');
H.push('<style>'+CSS+'</style>');
H.push('<div class="wrap">');
H.push('<header><span class="eyebrow">WHOOP · '+A.range.days+' días · '+lbl(A.range.from)+' – '+lbl(A.range.to)+' 2026</span>');
H.push('<h1>Carga y Recuperación</h1>');
H.push('<p class="sub">Tres meses cruzando actividad física contra recuperación fisiológica. La pregunta: ¿está tu entrenamiento afectando tu recuperación?</p></header>');

H.push('<div class="finding"><span class="eyebrow">Respuesta</span>');
H.push('<div class="rrow"><span class="rbig">r = '+R.r+'</span>');
H.push('<p class="rlab">Correlación entre el strain de un día y la recuperación del día siguiente, sobre '+R.n+' pares.</p></div>');
H.push('<p class="sub"><strong>Prácticamente no existe relación.</strong> Una correlación de '+R.r+' significa que tu carga de entrenamiento explica alrededor del '+Math.round(R.r*R.r*100)+'&nbsp;% de la variación en tu recuperación. Tu cuerpo está absorbiendo bien el entrenamiento que le das: lo que mueve tu recuperación es otra cosa.</p></div>');

H.push('<div class="kpis">');
H.push('<div class="kpi"><span class="k">Recovery medio</span><span class="v">'+f0(K.rec)+'</span></div>');
H.push('<div class="kpi"><span class="k">Strain medio</span><span class="v">'+f1(K.strain)+'</span></div>');
H.push('<div class="kpi"><span class="k">HRV medio</span><span class="v">'+f0(K.hrv)+'<span class="u"> ms</span></span></div>');
H.push('<div class="kpi"><span class="k">FC reposo</span><span class="v">'+f0(K.rhr)+'<span class="u"> bpm</span></span></div>');
H.push('<div class="kpi"><span class="k">Sueño medio</span><span class="v">'+f1(K.sleep)+'<span class="u"> h</span></span></div>');
H.push('<div class="kpi"><span class="k">Sesiones</span><span class="v">'+K.wn+'</span></div>');
H.push('<div class="kpi"><span class="k">Entrenado</span><span class="v">'+Math.round(K.wmin/60)+'<span class="u"> h</span></span></div>');
H.push('<div class="kpi"><span class="k">Días medidos</span><span class="v">'+recs.length+'<span class="u"> / '+A.range.days+'</span></span></div>');
H.push('</div>');

H.push('<section><div class="shead"><h2>Semana a semana</h2>');
H.push('<p class="sub">Strain y recuperación en paneles separados sobre el mismo eje temporal. Comparten eje X pero no escala: superponerlos en un solo gráfico daría una lectura falsa.</p></div>');
H.push('<div class="card"><div class="legend" style="margin-bottom:14px">');
H.push('<span class="lg"><span class="sw" style="background:var(--strain)"></span>Strain medio diario</span>');
H.push('<span class="lg"><span class="swl" style="background:var(--rec)"></span>Recovery medio</span>');
H.push('<span class="lg"><span class="sw" style="background:var(--evt);border:1px solid var(--r)"></span>Evento del 15 jul</span></div>');
H.push('<div class="scroll"><svg viewBox="0 0 '+CW+' '+(OY+H2+14)+'" width="'+CW+'" role="img" aria-label="Strain semanal y recuperación semanal">');
H.push(sickBand+'<g>'+c1+'</g>');
H.push('<text class="plab" x="'+PADL+'" y="'+(OY-14)+'">Recovery medio (0–100)</text>');
H.push('<g>'+c2+'</g><g>'+cx+'</g></svg></div></div></section>');

H.push('<section><div class="shead"><h2>Cada día, uno a uno</h2>');
H.push('<p class="sub">Los '+A.range.days+' días en orden. Cada celda es una mañana; el color es la banda de recuperación de WHOOP.</p></div>');
H.push('<div class="card"><div class="legend" style="margin-bottom:14px">');
H.push('<span class="lg"><span class="sw" style="background:var(--g)"></span>Verde · 67–100 <span class="mono">('+bands.g+' d, '+Math.round(bands.g/recs.length*100)+'%)</span></span>');
H.push('<span class="lg"><span class="sw" style="background:var(--y)"></span>Amarillo · 34–66 <span class="mono">('+bands.y+' d, '+Math.round(bands.y/recs.length*100)+'%)</span></span>');
H.push('<span class="lg"><span class="sw" style="background:var(--r)"></span>Rojo · 0–33 <span class="mono">('+bands.r+' d, '+Math.round(bands.r/recs.length*100)+'%)</span></span>');
H.push('<span class="lg"><span class="sw" style="background:var(--surf2);border:1px solid var(--line2)"></span>Sin dato</span></div>');
H.push('<div class="scroll"><svg viewBox="0 -24 '+SW+' 64" width="'+SW+'" role="img" aria-label="Tira diaria de bandas de recuperación">');
H.push('<line x1="'+jx+'" y1="-14" x2="'+jx+'" y2="-3" stroke="var(--r)" stroke-width="1.5"/>');
H.push('<text class="plab" x="'+jx+'" y="-18" text-anchor="middle">'+lbl(worst.day)+'</text>'+strip+'</svg></div></div></section>');

H.push('<section><div class="shead"><h2>Tu peor día: '+lbl(worst.day)+'</h2>');
H.push('<p class="sub">El recovery más bajo del periodo, en contexto: los días de antes y de después.</p></div>');
H.push('<div class="card evtcard"><div class="scroll"><table>');
H.push('<thead><tr><th>Día</th><th class="num">Strain</th><th class="num">Recovery</th><th class="num">HRV (ms)</th><th class="num">FC reposo</th><th class="num">Sueño (h)</th></tr></thead>');
H.push('<tbody>'+evtRows+'</tbody></table></div>');
H.push('<div class="note" style="margin-top:16px">');
if(prev){
  const dHrv=prev.hrv&&worst.hrv?Math.round((worst.hrv/prev.hrv-1)*100):null;
  const dRhr=prev.rhr&&worst.rhr?worst.rhr-prev.rhr:null;
  H.push('<p>El '+lbl(prev.day)+' cerraste con recovery <strong>'+prev.recovery+'</strong>, HRV <strong>'+f1(prev.hrv)+'&nbsp;ms</strong> y pulso en reposo <strong>'+f0(prev.rhr)+'&nbsp;bpm</strong>. El '+lbl(worst.day)+' el recovery cayó a <strong>'+worst.recovery+'</strong>, el HRV a <strong>'+f1(worst.hrv)+'&nbsp;ms</strong>'+(dHrv!=null?' ('+dHrv+'&nbsp;%)':'')+' y el pulso en reposo '+(dRhr>0?'subió a':'quedó en')+' <strong>'+f0(worst.rhr)+'&nbsp;bpm</strong>'+(dRhr>0?' (+'+dRhr+')':'')+'.</p>');
}
H.push('<p>El strain de ese día fue <strong>'+f1(worst.strain)+'</strong>, frente a una media de '+f1(K.strain)+' en el periodo. Dormiste <strong>'+f1(worst.sleep_h)+'&nbsp;h</strong>, frente a una media de '+f1(K.sleep)+'&nbsp;h.</p>');
H.push('<p><strong>Cómo leerlo:</strong> si el strain de los días previos fue alto y el sueño bajo, la caída es carga acumulada y se corrige descansando. Si en cambio la carga fue normal o baja y aun así el pulso en reposo subió con fuerza mientras el HRV se desplomaba —sobre todo si dormiste <em>más</em> de lo habitual— el patrón apunta a un <strong>estresor fisiológico agudo</strong>, del tipo que deja una infección o un cuadro febril, y no al entrenamiento.'+(diasVuelta?' Aquí el recovery tardó <strong>'+diasVuelta+' día'+(diasVuelta>1?'s':'')+'</strong> en volver por encima de 60.':'')+' Esto es lectura de rendimiento, no diagnóstico médico.</p>');
H.push('</div></div></section>');

H.push('<section><div class="shead"><h2>La prueba: carga contra recuperación</h2>');
H.push('<p class="sub">Cada punto es un día: el strain que acumulaste frente al recovery con el que amaneciste al día siguiente. Si entrenar te estuviera desgastando, la nube caería hacia la derecha.</p></div>');
H.push('<div class="card"><div class="scroll"><svg viewBox="0 0 '+SCW+' '+SCH+'" width="'+SCW+'" role="img" aria-label="Dispersión de strain contra recuperación del día siguiente">');
H.push('<text class="plab" x="'+SPAD+'" y="12">Recovery del día siguiente</text>'+sc);
H.push('<text class="ax" x="'+Math.round(SCW/2)+'" y="'+(SCH-1)+'" text-anchor="middle" style="font-size:11px">Strain del día</text></svg></div>');
H.push('<p class="sub" style="font-size:13.5px;margin-top:10px">La recta de ajuste es casi horizontal: pendiente de <span class="mono">'+slope.toFixed(2)+'</span> puntos de recovery por cada punto de strain. En la práctica, plana.</p></div></section>');

H.push('<section><div class="shead"><h2>En qué se va la actividad</h2>');
H.push('<p class="sub">'+K.wn+' sesiones detectadas en '+A.range.days+' días — una media de '+f1(K.wn/(A.range.days/7))+' por semana.</p></div>');
H.push('<div class="card scroll"><table><thead><tr><th>Deporte</th><th class="num">Sesiones</th><th class="num">Minutos</th><th class="num">Strain medio</th><th>Reparto por tiempo</th></tr></thead>');
H.push('<tbody>'+spRows+'</tbody></table></div></section>');

H.push('<section><div class="shead"><h2>Tabla semanal completa</h2>');
H.push('<p class="sub">Las '+W.length+' semanas del periodo. La primera y la última están incompletas.</p></div>');
H.push('<div class="card scroll"><table><thead><tr><th>Semana</th><th class="num">Días</th><th class="num">Strain</th><th class="num">Recovery</th><th class="num">HRV</th><th class="num">FC rep.</th><th class="num">Sueño</th><th class="num">Sesiones</th><th class="num">Min.</th></tr></thead>');
H.push('<tbody>'+rows+'</tbody></table></div></section>');

H.push('<div class="note">');
H.push('<p><strong>Sobre los pasos:</strong> no aparecen en este informe porque la API pública de WHOOP no los expone. WHOOP mide carga cardiovascular (strain), no cuenta de pasos. El strain diario y los minutos de sesión son su equivalente funcional y es lo que se ha usado aquí.</p>');
H.push('<p><strong>Método:</strong> '+A.range.days+' días naturales en horario local (UTC−06:00). Cada recovery se asocia a su ciclo fisiológico; la correlación con desfase empareja el strain del día <code>N</code> con el recovery del día <code>N+1</code>, que es cuando se manifiesta el efecto de la carga. Solo registros con <code>score_state = SCORED</code>. Correlación de Pearson.</p>');
H.push('<p><strong>Cobertura:</strong> '+recs.length+' de '+A.range.days+' días con recovery puntuado. Los huecos corresponden a noches sin sueño registrado.</p></div>');

H.push('<footer><p>Generado desde tu propia cuenta WHOOP vía API oficial · '+lbl(A.range.from)+' – '+lbl(A.range.to)+' de 2026</p>');
H.push('<p>Contexto de rendimiento y recuperación. No es consejo médico ni diagnóstico.</p></footer>');
H.push('</div>');
H.push('<div id="tip" role="status" aria-live="polite"></div>');
H.push('<script>'+JS+'<\/script>');

const HTML = H.join('\n');
fs.writeFileSync(path.join(OUT, 'dashboard.html'), HTML);
console.log('Dashboard generado -> output/dashboard.html (' + Math.round(HTML.length / 1024) + ' KB)');
console.log('  '+W.length+' semanas · '+S.length+' dias · '+sports.length+' deportes · pendiente ajuste '+slope.toFixed(2));
