
/* ============ STAR FIELD BACKGROUND ============ */
(function(){
  const c=document.getElementById('starcanvas'), ctx=c.getContext('2d');
  let stars=[];
  function resize(){ c.width=innerWidth; c.height=innerHeight;
    stars=Array.from({length:Math.min(400,Math.floor(innerWidth*innerHeight/4000))},()=>({
      x:Math.random()*c.width, y:Math.random()*c.height, r:Math.random()*1.3+0.2,
      p:Math.random()*Math.PI*2, s:Math.random()*0.015+0.005
    }));
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(t){
    ctx.clearRect(0,0,c.width,c.height);
    stars.forEach(s=>{
      const a = reduce?0.6:(0.5+0.5*Math.sin(s.p + t*s.s*0.06));
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,7);
      ctx.fillStyle=`rgba(230,230,230,${0.3+0.6*a})`; ctx.fill();
    });
    if(!reduce) requestAnimationFrame(draw); else requestAnimationFrame(()=>{});
  }
  addEventListener('resize',resize); resize(); requestAnimationFrame(draw);
})();

/* ============ ASTRONOMY MATH (Meeus low-precision formulas) ============ */
const RAD=Math.PI/180;
function toJulian(date){ return date.getTime()/86400000 - 0.5 + 2440588; }
function fromJulian(j){ return new Date((j+0.5-2440588)*86400000); }
function daysSinceJ2000(date){ return toJulian(date)-2451545.0; }

// Sun position (geocentric ecliptic -> equatorial), Meeus low precision
function sunCoords(d){
  const n=daysSinceJ2000(d);
  const L=(280.460+0.9856474*n)%360;
  const g=((357.528+0.9856003*n)%360)*RAD;
  const lambda=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*RAD;
  const eps=(23.439-0.0000004*n)*RAD;
  const ra=Math.atan2(Math.cos(eps)*Math.sin(lambda),Math.cos(lambda));
  const dec=Math.asin(Math.sin(eps)*Math.sin(lambda));
  return {ra,dec,lambda,eps};
}
function moonCoords(d){
  const n=daysSinceJ2000(d);
  const L=(218.316+13.176396*n)%360;
  const M=((134.963+13.064993*n)%360)*RAD;
  const F=((93.272+13.229350*n)%360)*RAD;
  const lon=(L+6.289*Math.sin(M))*RAD;
  const lat=(5.128*Math.sin(F))*RAD;
  const dist=385001-20905*Math.cos(M); //km
  const eps=(23.439-0.0000004*n)*RAD;
  const ra=Math.atan2(Math.sin(lon)*Math.cos(eps)-Math.tan(lat)*Math.sin(eps),Math.cos(lon));
  const dec=Math.asin(Math.sin(lat)*Math.cos(eps)+Math.cos(lat)*Math.sin(eps)*Math.sin(lon));
  return {ra,dec,dist,lon};
}
function siderealTime(d,lng){
  const n=daysSinceJ2000(d);
  const gmst=(280.46061837+360.98564736629*n)%360;
  return ((gmst+lng)%360+360)%360*RAD;
}
function altAz(ra,dec,d,lat,lng){
  const H=siderealTime(d,lng)-ra;
  const phi=lat*RAD;
  const alt=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H));
  const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi));
  return {alt:alt/RAD, az:(az/RAD+180)%360};
}
function moonIllumFrac(d){
  const s=sunCoords(d), m=moonCoords(d);
  const phi=Math.acos(Math.sin(s.dec)*Math.sin(m.dec)+Math.cos(s.dec)*Math.cos(m.dec)*Math.cos(m.ra-s.ra));
  const incl=Math.atan2(Math.cos(s.dec)*Math.sin(s.ra-m.ra),Math.sin(s.dec)*Math.cos(m.dec)-Math.cos(s.dec)*Math.sin(m.dec)*Math.cos(s.ra-m.ra));
  const phaseAngle=Math.atan2(Math.sin(phi),incl<0? -1:1) ; // not used precisely
  const k=(1+Math.cos(Math.PI-phi))/2;
  // waxing/waning via ecliptic longitude difference
  const diff=((m.lon/RAD - (s.lambda/RAD))%360+360)%360;
  return {frac:k, waxing: diff<180, age: diff/360*29.53059};
}
function moonPhaseName(age){
  if(age<1.84566) return "New Moon";
  if(age<5.53699) return "Waxing Crescent";
  if(age<9.22831) return "First Quarter";
  if(age<12.91963) return "Waxing Gibbous";
  if(age<16.61096) return "Full Moon";
  if(age<20.30228) return "Waning Gibbous";
  if(age<23.99361) return "Last Quarter";
  if(age<27.68493) return "Waning Crescent";
  return "New Moon";
}
// rise/set/transit search by altitude crossing, generic for any body coord function
function riseSetTransit(coordFn, date, lat, lng, targetAlt){
  targetAlt = targetAlt||0;
  const base=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),0,0,0));
  let prevAlt=null, rise=null, set=null, best=-999, transit=null;
  for(let m=0;m<=24*60;m+=5){
    const t=new Date(base.getTime()+m*60000);
    const c=coordFn(t);
    const {alt}=altAz(c.ra,c.dec,t,lat,lng);
    if(alt>best){best=alt; transit=t;}
    if(prevAlt!==null){
      if(prevAlt<targetAlt && alt>=targetAlt && !rise) rise=t;
      if(prevAlt>=targetAlt && alt<targetAlt && !set && rise) set=t;
    }
    prevAlt=alt;
  }
  return {rise,set,transit,maxAlt:best};
}
function fmtTime(d){ if(!d) return "—"; return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
function fmtTimeTz(d,tz){ if(!d) return "—"; try{ return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:tz}); }catch(e){return fmtTime(d);} }
function fmtDate(d,tz){ try{return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:tz});}catch(e){return d.toDateString();} }

// Simplified planet visibility (approx using mean orbital elements — good enough for "visible tonight" style app, not precision ephemeris)
const PLANETS = [
 {name:"Mercury", emoji:"☿", a:0.387,e:0.206,i:7.00,L:252.25,peri:77.46,node:48.33, period:87.97},
 {name:"Venus", emoji:"♀️", a:0.723,e:0.007,i:3.39,L:181.98,peri:131.53,node:76.68, period:224.70},
 {name:"Mars", emoji:'<span class="mini-planet" style="background:radial-gradient(circle at 32% 28%, #e2a184, #c1603f 45%, #5c2a18 115%);"></span>', a:1.524,e:0.093,i:1.85,L:355.43,peri:336.04,node:49.56, period:686.98},
 {name:"Jupiter", emoji:'<span class="mini-planet" style="background:radial-gradient(circle at 32% 28%, rgba(255,255,255,.35), transparent 40%), repeating-linear-gradient(4deg, #e7c9a0 0 8%, #c9a06a 8% 16%, #a97f4c 16% 24%, #dbb98a 24% 32%, #c9a06a 32% 42%, #b58c5c 42% 50%, #e7c9a0 50% 58%, #c9a06a 58% 68%, #a97f4c 68% 78%, #dbb98a 78% 88%, #c9a06a 88% 100%);"></span>', a:5.203,e:0.048,i:1.30,L:34.35,peri:14.75,node:100.49, period:4332.59},
 {name:"Saturn", emoji:'<span class="mini-planet has-ring" style="background:radial-gradient(circle at 32% 28%, rgba(255,255,255,.35), transparent 40%), repeating-linear-gradient(4deg, #f2e6c4 0 12%, #d9c79a 12% 24%, #e8dcb2 24% 36%, #d0bd8c 36% 50%, #f2e6c4 50% 62%, #d9c79a 62% 76%, #e8dcb2 76% 88%, #d0bd8c 88% 100%);"></span>', a:9.537,e:0.054,i:2.49,L:50.08,peri:92.43,node:113.66, period:10759.22},
];
function planetGeoRaDec(p,d){
  // heliocentric mean anomaly propagate + earth heliocentric, low precision (mean elements, no perturbation) - sufficient for rough alt/az
  const n=daysSinceJ2000(d);
  const M=((p.L - p.peri) + (360/p.period)*n)%360*RAD;
  let E=M; for(let k=0;k<5;k++){ E = M + p.e*Math.sin(E); }
  const xv=p.a*(Math.cos(E)-p.e), yv=p.a*(Math.sqrt(1-p.e*p.e)*Math.sin(E));
  const v=Math.atan2(yv,xv), r=Math.sqrt(xv*xv+yv*yv);
  const peri=p.peri*RAD, node=p.node*RAD, inc=p.i*RAD;
  const xh=r*(Math.cos(node)*Math.cos(v+peri-node)-Math.sin(node)*Math.sin(v+peri-node)*Math.cos(inc));
  const yh=r*(Math.sin(node)*Math.cos(v+peri-node)+Math.cos(node)*Math.sin(v+peri-node)*Math.cos(inc));
  const zh=r*(Math.sin(v+peri-node)*Math.sin(inc));
  // earth heliocentric (approx circular)
  const Me=((357.5291+0.98560028*n))*RAD;
  const Le=(280.4665+0.98564736*n)*RAD;
  const eEarth=0.0167;
  const ve = Le + 2*eEarth*Math.sin(Me);
  const re=1.00000261*(1-eEarth*eEarth)/(1+eEarth*Math.cos(Me-Le+ (Le)));
  const xe=Math.cos(Le)*1.00001, ye=Math.sin(Le)*1.00001;
  const xg=xh-xe, yg=yh-ye, zg=zh;
  const eps=23.439*RAD;
  const xeq=xg, yeq=yg*Math.cos(eps)-zg*Math.sin(eps), zeq=yg*Math.sin(eps)+zg*Math.cos(eps);
  const ra=Math.atan2(yeq,xeq), dec=Math.atan2(zeq,Math.sqrt(xeq*xeq+yeq*yeq));
  return {ra:(ra+2*Math.PI)%(2*Math.PI), dec};
}

/* ============ LOCATION ============ */
const CITIES=[
 {name:"Pune, India", lat:18.5204, lng:73.8567, tz:"Asia/Kolkata"},
 {name:"Mumbai, India", lat:19.0760, lng:72.8777, tz:"Asia/Kolkata"},
 {name:"Delhi, India", lat:28.6139, lng:77.2090, tz:"Asia/Kolkata"},
 {name:"Bengaluru, India", lat:12.9716, lng:77.5946, tz:"Asia/Kolkata"},
 {name:"Hyderabad, India", lat:17.3850, lng:78.4867, tz:"Asia/Kolkata"},
 {name:"Chennai, India", lat:13.0827, lng:80.2707, tz:"Asia/Kolkata"},
 {name:"Kolkata, India", lat:22.5726, lng:88.3639, tz:"Asia/Kolkata"},
 {name:"Ahmedabad, India", lat:23.0225, lng:72.5714, tz:"Asia/Kolkata"},
 {name:"Jaipur, India", lat:26.9124, lng:75.7873, tz:"Asia/Kolkata"},
 {name:"Nashik, India", lat:19.9975, lng:73.7898, tz:"Asia/Kolkata"},
 {name:"New York, USA", lat:40.7128, lng:-74.0060, tz:"America/New_York"},
 {name:"Los Angeles, USA", lat:34.0522, lng:-118.2437, tz:"America/Los_Angeles"},
 {name:"London, UK", lat:51.5074, lng:-0.1278, tz:"Europe/London"},
 {name:"Tokyo, Japan", lat:35.6762, lng:139.6503, tz:"Asia/Tokyo"},
 {name:"Sydney, Australia", lat:-33.8688, lng:151.2093, tz:"Australia/Sydney"},
 {name:"Singapore", lat:1.3521, lng:103.8198, tz:"Asia/Singapore"},
 {name:"Dubai, UAE", lat:25.2048, lng:55.2708, tz:"Asia/Dubai"},
 {name:"Cape Town, South Africa", lat:-33.9249, lng:18.4241, tz:"Africa/Johannesburg"},
];
let USER_LOC = JSON.parse(localStorage.getItem('as_loc')||'null');

function openLocationModal(){ document.getElementById('locModal').classList.remove('hidden'); renderCityResults(''); }
function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
let mapboxSearchTimer = null;
function tzFromLng(lng){
  let off = Math.round(lng/15);
  off = Math.max(-12, Math.min(14, off));
  if(off===0) return 'Etc/UTC';
  return off>0 ? `Etc/GMT-${off}` : `Etc/GMT+${Math.abs(off)}`;
}
async function mapboxSearch(q){
  try{
    const url = `/api/mapbox?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('mapbox geocoding fetch failed');
    const data = await res.json();
    return (data.features||[]).map(f=>({ name:f.place_name, lat:f.center[1], lng:f.center[0], tz:f.tz || tzFromLng(f.center[0]) }));
  }catch(e){ return []; }
}
function renderCityResults(q){
  q=(q||'').toLowerCase();
  const list=CITIES.filter(c=>c.name.toLowerCase().includes(q));
  document.getElementById('cityResults').innerHTML = list.map(c=>
    `<div class="cityopt" onclick='setLocation(${JSON.stringify(c)})'>📍 ${c.name}</div>`).join('') || '<div class="muted" style="padding:8px;">No matches</div>';
  clearTimeout(mapboxSearchTimer);
  if(q.trim().length<2) return;
  mapboxSearchTimer = setTimeout(async ()=>{
    const results = await mapboxSearch(q);
    if(!results.length) return;
    const container = document.getElementById('cityResults');
    if(!container) return;
    const extra = results.map(c=>
      `<div class="cityopt" onclick='setLocation(${JSON.stringify(c)})'>🌍 ${c.name}</div>`).join('');
    container.innerHTML += `<div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:.5px; margin:10px 0 4px;">More results</div>${extra}`;
  }, 350);
}
function useMyLocation(){
  if(!navigator.geolocation){ alert("Geolocation not supported — please choose a city."); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setLocation({name:"My Location", lat:pos.coords.latitude, lng:pos.coords.longitude, tz});
  }, ()=> alert("Couldn't get your location — please choose a city instead."));
}
function setLocation(loc){
  USER_LOC=loc; localStorage.setItem('as_loc', JSON.stringify(loc));
  document.getElementById('watchingFrom').textContent = `📍 Watching from ${loc.name}`;
  document.getElementById('locPill').textContent = `📍 ${loc.name}`;
  closeModal('locModal');
  renderAll();
}
if(USER_LOC){ } // will render on load

/* ============ EVENTS DATABASE (real dates) ============ */
let EVENTS = [];
let CATEGORIES = [];

let FAVORITES = JSON.parse(localStorage.getItem('as_favs')||'[]');
function toggleFav(id){
  if(FAVORITES.includes(id)) FAVORITES=FAVORITES.filter(x=>x!==id); else FAVORITES.push(id);
  localStorage.setItem('as_favs', JSON.stringify(FAVORITES));
  renderEvents(); renderFavorites(); renderNextEvent();
}

/* ============ RENDER: TONIGHT ============ */
async function renderAPOD(){
  const body = document.getElementById('apodBody');
  if(!body) return;
  body.textContent = 'Loading…';
  try{
    const res = await fetch('/api/apod');
    if(!res.ok) throw new Error('apod fetch failed');
    const data = await res.json();
    const mediaHtml = data.media_type==='image'
      ? `<img src="${data.url}" alt="${(data.title||'').replace(/"/g,'')}" style="width:100%; border-radius:12px; margin-bottom:12px; display:block;">`
      : (data.media_type==='video' ? `<div style="margin-bottom:12px;"><a href="${data.url}" target="_blank" rel="noopener" class="pill">▶ Watch today's video</a></div>` : '');
    body.innerHTML = `
      ${mediaHtml}
      <div style="font-weight:700; font-size:15px; color:var(--ink); margin-bottom:4px;">${data.title||''}</div>
      <div class="muted" style="font-size:11.5px; margin-bottom:8px;">${data.date||''}${data.copyright?' · © '+data.copyright.trim():''}</div>
      <div style="font-size:13px; line-height:1.6;">${data.explanation||''}</div>
    `;
  }catch(e){
    body.textContent = 'NASA picture of the day unavailable.';
  }
}
async function renderWeather(){
  const body = document.getElementById('weatherBody');
  if(!USER_LOC || !body) return;
  body.textContent = 'Loading weather…';
  try{
    const url = `/api/weather?lat=${encodeURIComponent(USER_LOC.lat)}&lon=${encodeURIComponent(USER_LOC.lng)}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('weather fetch failed');
    const data = await res.json();
    const clouds = data.clouds?.all;
    const humidity = data.main?.humidity;
    const visKm = data.visibility!=null ? (data.visibility/1000).toFixed(1) : null;
    const desc = data.weather?.[0]?.description;
    body.innerHTML = `
      <div class="condrow" style="margin-bottom:0;">
        <div class="card c"><div class="l">Cloud Cover</div><div class="v">${clouds!=null?clouds+'%':'—'}</div></div>
        <div class="card c"><div class="l">Humidity</div><div class="v">${humidity!=null?humidity+'%':'—'}</div></div>
        <div class="card c"><div class="l">Visibility</div><div class="v">${visKm!=null?visKm+' km':'—'}</div></div>
        <div class="card c"><div class="l">Conditions</div><div class="v" style="font-size:13px; text-transform:capitalize;">${desc||'—'}</div></div>
      </div>`;
  }catch(e){
    body.textContent = 'Weather conditions unavailable.';
  }
}
async function bomSpaceWeather(method, options){
  const res = await fetch('/api/space-weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ method, options: options || null })
  });
  if(!res.ok) throw new Error(method+' fetch failed');
  const json = await res.json();
  return json.data || [];
}
async function renderSpaceWeather(){
  const body = document.getElementById('spaceWeatherBody');
  if(!body) return;
  body.textContent = 'Loading space weather…';
  try{
    const [kData, auroraWatch, auroraAlert] = await Promise.all([
      bomSpaceWeather('get-k-index', { location: 'Australian region' }),
      bomSpaceWeather('get-aurora-watch'),
      bomSpaceWeather('get-aurora-alert')
    ]);
    const k = kData[0]?.index;
    let level = '—';
    if(k!=null){
      level = k<=2 ? 'Quiet' : k<=4 ? 'Unsettled' : k<=5 ? 'Minor storm (G1)' : k<=6 ? 'Moderate storm (G2)' : k<=7 ? 'Strong storm (G3)' : k<=8 ? 'Severe storm (G4)' : 'Extreme storm (G5)';
    }
    const activeAurora = auroraAlert[0] || auroraWatch[0] || null;
    const auroraChance = activeAurora ? `${activeAurora.lat_band || ''} latitudes`.trim() : 'Low';
    const comment = activeAurora?.description || activeAurora?.comments || null;
    body.innerHTML = `
      <div class="condrow" style="margin-bottom:0;">
        <div class="card c"><div class="l">K-Index (AU)</div><div class="v">${k!=null?k:'—'}</div></div>
        <div class="card c"><div class="l">Geomagnetic Level</div><div class="v" style="font-size:13px;">${level}</div></div>
        <div class="card c"><div class="l">Aurora Chance</div><div class="v" style="font-size:13px; text-transform:capitalize;">${auroraChance}</div></div>
      </div>
      ${comment ? `<div class="muted" style="font-size:12px; margin-top:10px; line-height:1.5;">${comment}</div>` : ''}
    `;
  }catch(e){
    body.textContent = 'Space weather data unavailable.';
  }
}
function renderTonight(){
  if(!USER_LOC) return;
  const now=new Date();
  const {lat,lng,tz}=USER_LOC;
  document.getElementById('tonightDate').textContent = fmtDate(now,tz)+' · '+ (USER_LOC.name);

  const sunRS = riseSetTransit(sunCoords, now, lat, lng, -0.83);
  const twilightRS = riseSetTransit(sunCoords, now, lat, lng, -18);
  const moonRS = riseSetTransit(moonCoords, now, lat, lng, 0);
  const moonI = moonIllumFrac(now);

  document.getElementById('condRow').innerHTML = [
    ['Sunrise', fmtTimeTz(sunRS.rise,tz)],
    ['Sunset', fmtTimeTz(sunRS.set,tz)],
    ['Astro Twilight Ends', fmtTimeTz(twilightRS.set,tz)],
    ['Moonrise', fmtTimeTz(moonRS.rise,tz)],
    ['Moonset', fmtTimeTz(moonRS.set,tz)],
    ['Moon Illum.', Math.round(moonI.frac*100)+'%'],
  ].map(([l,v])=>`<div class="card c"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');

  let cards=`<div class="card obj-card"><div class="emoji">🌙</div><div class="name">Moon</div>
    <div class="stat">${moonPhaseName(moonI.age)} · ${Math.round(moonI.frac*100)}% lit</div>
    <div class="stat">Rise ${fmtTimeTz(moonRS.rise,tz)} · Set ${fmtTimeTz(moonRS.set,tz)}</div></div>`;

  PLANETS.forEach(p=>{
    const rs = riseSetTransit(t=>planetGeoRaDec(p,t), now, lat, lng, 0);
    const visible = rs.maxAlt>10;
    cards += `<div class="card obj-card"><div class="emoji">${p.emoji}</div><div class="name">${p.name}</div>
      <div class="stat"><span class="status-dot" style="background:${visible?'var(--good)':'var(--ink-dim2)'}"></span>${visible?'Visible':'Below horizon'}</div>
      <div class="stat">${fmtTimeTz(rs.rise,tz)} → ${fmtTimeTz(rs.set,tz)}</div>
      <div class="stat">Peak altitude ${Math.round(rs.maxAlt)}°</div></div>`;
  });
  cards += `<div class="card obj-card"><div class="emoji"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 21 L13 11" stroke="#ff9d5c" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/><path d="M7 21 L15 13" stroke="#ff9d5c" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/><circle cx="17" cy="7" r="3.6" fill="#ffb066"/></svg></div><div class="name">Meteor Activity</div>
      <div class="stat">${meteorActivityTonight()}</div></div>`;
  document.getElementById('objGrid').innerHTML = cards;
}
function meteorActivityTonight(){
  const now=new Date();
  const showers=EVENTS.filter(e=>e.category==='Meteor Shower');
  let closest=null, minDiff=999;
  showers.forEach(e=>{ const diff=Math.abs((e._date-now)/86400000); if(diff<minDiff){minDiff=diff; closest=e;} });
  if(minDiff<3) return `Elevated — ${closest.subtype} peak nearby`;
  if(minDiff<10) return `Moderate — ${closest.subtype} approaching`;
  return 'Low — background rate only';
}

/* ============ RENDER: NEXT EVENT ============ */
function renderNextEvent(){
  const now=new Date();
  const upcoming = EVENTS.filter(e=>e._date>now).sort((a,b)=>a._date-b._date)[0];
  if(!upcoming){ document.getElementById('nextEventCard').innerHTML='<div class="muted">No upcoming events in database.</div>'; return; }
  const diff = upcoming._date-now;
  const days=Math.floor(diff/86400000), hours=Math.floor((diff%86400000)/3600000), mins=Math.floor((diff%3600000)/60000);
  const tz = USER_LOC? USER_LOC.tz : undefined;
  document.getElementById('nextEventCard').innerHTML = `
    <div class="thumb">${categoryEmoji(upcoming.category)}</div>
    <div style="flex:1; min-width:220px;">
      <div class="muted" style="font-size:11px; text-transform:uppercase; letter-spacing:.5px;">Next Event ${USER_LOC?'Visible From Your Location':''}</div>
      <h3 style="font-size:20px; margin-top:4px;">${upcoming.name}</h3>
      <div class="muted" style="font-size:13.5px; margin-top:2px;">${fmtDate(upcoming._date,tz)} · ${USER_LOC?USER_LOC.name:'Set your location'}</div>
      <div class="countdown">
        <div class="c"><div class="n">${days}</div><div class="u">days</div></div>
        <div class="c"><div class="n">${hours}</div><div class="u">hrs</div></div>
        <div class="c"><div class="n">${mins}</div><div class="u">min</div></div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="openEvent('${upcoming.id}')">View Observation Guide</button>
  `;
}
function categoryEmoji(cat){ return {Eclipse:'🌘','Meteor Shower':'<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align:-0.15em;"><path d="M3 21 L13 11" stroke="#ff9d5c" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/><path d="M7 21 L15 13" stroke="#ff9d5c" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/><circle cx="17" cy="7" r="3.6" fill="#ffb066"/></svg>',Seasonal:'☀️',Planet:'🪐',Moon:'🌙'}[cat]||'✨'; }

/* ============ RENDER: EVENTS GRID ============ */
function renderEvents(){
  const cat=document.getElementById('fCategory').value;
  const vis=document.getElementById('fVisibility').value;
  const range=parseInt(document.getElementById('fRange').value);
  const now=new Date();
  let list=EVENTS.filter(e=> e._date>now && (e._date-now)/86400000<=range);
  if(cat) list=list.filter(e=>e.category===cat);
  if(vis==='visible') list=list.filter(e=>e.worldwide);
  document.getElementById('evGrid').innerHTML = list.length? list.map(e=>eventCardHTML(e)).join('') : '<div class="muted" style="padding:20px;">No events match these filters.</div>';
}
function eventCardHTML(e){
  const fav=FAVORITES.includes(e.id);
  const visBadge = e.worldwide ? '<span class="badge badge-good">🟢 Widely visible</span>' : '<span class="badge badge-warn">🟡 Regional visibility</span>';
  return `<div class="card evcard" onclick="openEvent('${e.id}')">
    <div style="display:flex; justify-content:space-between;">
      <span class="cat">${e.category}</span>
      <button class="star-fav ${fav?'active':''}" onclick="event.stopPropagation(); toggleFav('${e.id}')">${fav?'★':'☆'}</button>
    </div>
    <h3>${e.name}</h3>
    <div class="date">${e._date.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
    <div class="vis">${visBadge}</div>
  </div>`;
}
function renderFavorites(){
  const list=EVENTS.filter(e=>FAVORITES.includes(e.id));
  document.getElementById('favGrid').innerHTML = list.length? list.map(e=>eventCardHTML(e)).join('') : '<div class="muted" style="padding:20px;">No saved events yet — tap ☆ on any event to save it here.</div>';
}

/* ============ EVENT DETAIL MODAL ============ */
function openEvent(id){
  const e=EVENTS.find(x=>x.id===id); if(!e) return;
  const tz=USER_LOC?USER_LOC.tz:undefined;
  const peak=new Date(e.peak);
  let visSection='';
  if(USER_LOC){
    const alt = e.category==='Eclipse' ? altAz(moonCoords(peak).ra, moonCoords(peak).dec, peak, USER_LOC.lat, USER_LOC.lng).alt : null;
    visSection = `<div class="card" style="padding:16px; margin-top:12px;">
      <div class="muted" style="font-size:11px; text-transform:uppercase;">Your Visibility — ${USER_LOC.name}</div>
      ${alt!==null ? `<div style="margin-top:6px;">${alt>0?'🟢 Above horizon at peak':'🔴 Below horizon — not visible locally'} · altitude ${Math.round(alt)}°</div>` : `<div style="margin-top:6px;">${e.worldwide?'🟢 Generally visible worldwide (weather permitting)':'🟡 Check regional visibility maps'}</div>`}
      <div class="muted" style="font-size:12px; margin-top:6px;">Cloud conditions: not available · Light pollution: varies by exact site</div>
    </div>`;
  }
  document.getElementById('eventModalBody').innerHTML = `
    <button class="iconbtn modal-close" onclick="closeModal('eventModal')">✕</button>
    <span class="cat" style="color:var(--cyan);">${e.category} · ${e.subtype||''}</span>
    <h2 style="margin-top:6px;">${e.name}</h2>
    <div class="muted" style="font-size:13.5px; margin:6px 0 14px;">${e._date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
    <p style="font-size:14px; line-height:1.6;">${e.desc}</p>
    <div class="condrow" style="margin-top:16px;">
      <div class="card c"><div class="l">Peak (UTC)</div><div class="v" style="font-size:13px;">${peak.toUTCString().slice(17,22)}</div></div>
      <div class="card c"><div class="l">Naked Eye</div><div class="v" style="font-size:13px;">${e.naked?'Yes':'No'}</div></div>
      <div class="card c"><div class="l">Telescope</div><div class="v" style="font-size:13px;">${e.telescope?'Recommended':'Optional'}</div></div>
      <div class="card c"><div class="l">Photography</div><div class="v" style="font-size:13px;">${e.photo?'Recommended':'—'}</div></div>
    </div>
    ${visSection}
    ${e.safety? `<div class="card" style="padding:14px; margin-top:12px; border-color:var(--ink);"><b style="color:var(--ink);">⚠ Safety Warning</b><div style="font-size:13px; margin-top:4px; color:var(--ink-dim);">Never look directly at the Sun without appropriate certified solar viewing equipment.</div></div>`:''}
    <div style="margin-top:16px; display:flex; gap:10px;">
      <button class="btn btn-primary" onclick="toggleFav('${e.id}'); openEvent('${e.id}')">${FAVORITES.includes(e.id)?'★ Saved':'☆ Save Event'}</button>
    </div>
    <div class="muted" style="font-size:11px; margin-top:14px;">Source: NASA/JPL Eclipse Canon (Espenak & Meeus) · IAU Meteor Data Center</div>
  `;
  document.getElementById('eventModal').classList.remove('hidden');
}

/* ============ TIMELINE ============ */
function renderTimeline(){
  const now=new Date();
  const list=EVENTS.filter(e=>e._date>now).slice(0,10);
  document.getElementById('tlList').innerHTML = list.map(e=>`
    <div class="tl-item" style="cursor:pointer;" onclick="openEvent('${e.id}')">
      <div class="d">${e._date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
      <div class="t">${categoryEmoji(e.category)} ${e.name}</div>
    </div>`).join('');
}

/* ============ CALENDAR ============ */
let calCursor = new Date();
function calShift(dir){ calCursor.setMonth(calCursor.getMonth()+dir); renderCalendar(); }
function renderCalendar(){
  const y=calCursor.getFullYear(), m=calCursor.getMonth();
  document.getElementById('calLabel').textContent = calCursor.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const first=new Date(y,m,1);
  const startDay=(first.getDay()+6)%7; // Monday first
  const daysInMonth=new Date(y,m+1,0).getDate();
  const evByDay={};
  EVENTS.forEach(e=>{ if(e._date.getFullYear()===y && e._date.getMonth()===m) evByDay[e._date.getDate()]=e; });
  let html='<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px; font-size:11px; color:var(--ink-dim2); text-transform:uppercase; margin-bottom:8px;">'+
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div style="text-align:center;">${d}</div>`).join('')+'</div>';
  html+='<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:6px;">';
  for(let i=0;i<startDay;i++) html+='<div></div>';
  for(let d=1;d<=daysInMonth;d++){
    const ev=evByDay[d];
    html+=`<div class="card" style="min-height:64px; padding:6px; font-size:12px; ${ev?'border-color:var(--accent); cursor:pointer;':''}" ${ev?`onclick="openEvent('${ev.id}')"`:''}>
      <div class="muted">${d}</div>
      ${ev?`<div style="font-size:10.5px; margin-top:4px; color:var(--cyan); line-height:1.3;">${categoryEmoji(ev.category)} ${ev.name.length>16?ev.subtype||ev.name.slice(0,14)+'…':ev.name}</div>`:''}
    </div>`;
  }
  html+='</div>';
  document.getElementById('calGrid').innerHTML=html;
}

/* ============ FUTURE SKY ============ */
function renderFuture(){
  const yearSel=document.getElementById('futureYear');
  const years=[2026,2027,2028,2029,2030];
  if(!yearSel.options.length) yearSel.innerHTML = years.map(y=>`<option>${y}</option>`).join('');
  const y=parseInt(yearSel.value)||2026;
  const list=EVENTS.filter(e=>e._date.getFullYear()===y);
  document.getElementById('futureGrid').innerHTML = list.length? list.map(e=>eventCardHTML(e)).join('') :
    `<div class="muted" style="padding:16px;">No cataloged events for ${y} yet — high-confidence events like eclipses and equinoxes for this year will be added as canon data is published.</div>`;
}

/* ============ MOON MODULE ============ */
function renderMoon(){
  const now=new Date();
  const m=moonIllumFrac(now);
  const md=moonCoords(now);
  document.getElementById('moonSub').textContent = USER_LOC?('As seen from '+USER_LOC.name):'Set your location for rise/set times';
  document.getElementById('moonPhaseName').textContent = moonPhaseName(m.age);
  document.getElementById('moonIllum').textContent = Math.round(m.frac*100)+'%';
  document.getElementById('moonAge').textContent = m.age.toFixed(1)+' days';
  document.getElementById('moonDist').textContent = Math.round(md.dist).toLocaleString()+' km';
  // find next full/new moon by scanning illum fraction crossing
  let nf=null, nn=null;
  for(let d=1; d<40; d++){
    const t=new Date(now.getTime()+d*86400000);
    const mi=moonIllumFrac(t);
    const name=moonPhaseName(mi.age);
    if(!nf && name==='Full Moon') nf=t;
    if(!nn && name==='New Moon') nn=t;
    if(nf&&nn) break;
  }
  document.getElementById('nextFull').textContent = nf? nf.toLocaleDateString('en-US',{month:'long',day:'numeric'}) : '—';
  document.getElementById('nextNew').textContent = nn? nn.toLocaleDateString('en-US',{month:'long',day:'numeric'}) : '—';
  // simple moon visual: shift shadow based on phase
  const pct = m.frac;
  const dir = m.waxing? 'right':'left';
  document.getElementById('moonVis').innerHTML = `<div style="position:absolute; inset:0; background:radial-gradient(circle at 35% 30%, #e8e8e8, #999 70%);"></div>
    <div style="position:absolute; top:0; bottom:0; ${dir}:0; width:${Math.round((1-pct)*100)}%; background:#000;"></div>`;
}
async function renderMoonImage(){
  const body = document.getElementById('moonRenderBody');
  if(!body) return;
  if(!USER_LOC){ body.textContent = "Select a location to render tonight's Moon."; return; }
  body.textContent = 'Loading render…';
  try{
    const dateStr = new Date().toISOString().slice(0,10);
    const res = await fetch('/api/moon-phase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: USER_LOC.lat, longitude: USER_LOC.lng, date: dateStr })
    });
    if(!res.ok) throw new Error('astronomyapi fetch failed');
    const data = await res.json();
    const url = data?.data?.imageUrl;
    if(!url) throw new Error('no image url returned');
    body.innerHTML = `<img src="${url}" alt="Rendered Moon phase" style="max-width:220px; width:100%; border-radius:12px; display:block; margin:0 auto;">`;
  }catch(e){
    body.textContent = 'Live render unavailable.';
  }
}

/* ============ LEARN ============ */
const LEARN_TOPICS=[
 {t:'Why do eclipses happen?', d:'The Sun, Earth and Moon must align near the Moon\'s orbital nodes — otherwise the Moon\'s shadow misses Earth (or vice versa) most months.'},
 {t:'What causes meteor showers?', d:'Earth passes through a stream of dust left by a comet\'s orbit; the debris burns up in our atmosphere as meteors.'},
 {t:'What is a planetary conjunction?', d:'Two planets appear close together in our sky due to perspective — they are usually still hundreds of millions of km apart in reality.'},
 {t:'Why does the Moon have phases?', d:'As the Moon orbits Earth every 29.5 days, we see varying amounts of its sunlit half, from New Moon to Full Moon and back.'},
 {t:'What is a supermoon?', d:'A Full Moon that coincides with the Moon\'s closest approach to Earth (perigee), appearing slightly larger and brighter.'},
 {t:'Astronomical vs actual visibility', d:'An object can be mathematically above the horizon yet invisible due to clouds, haze, light pollution or obstructions.'},
];
document.getElementById('learnGrid').innerHTML = LEARN_TOPICS.map(x=>`<div class="card" style="padding:18px;"><h3 style="font-size:15px;">${x.t}</h3><p class="muted" style="font-size:13px; margin-top:6px; line-height:1.5;">${x.d}</p></div>`).join('');

/* ============ SEARCH ============ */
function openSearch(){ document.getElementById('searchModal').classList.remove('hidden'); document.getElementById('globalSearch').value=''; renderSearch(''); setTimeout(()=>document.getElementById('globalSearch').focus(),50); }
function renderSearch(q){
  q=(q||'').toLowerCase().trim();
  let results;
  if(!q) results=EVENTS.filter(e=>e._date>new Date()).slice(0,6);
  else if(q.includes('eclipse')) results=EVENTS.filter(e=>e.category==='Eclipse');
  else if(q.includes('meteor')||q.includes('shower')) results=EVENTS.filter(e=>e.category==='Meteor Shower');
  else if(q.includes('full moon')) results=EVENTS.filter(e=>false); // handled specially below
  else if(q.includes('tonight')) results=[];
  else results=EVENTS.filter(e=> e.name.toLowerCase().includes(q) || (e.subtype||'').toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  if(q.includes('next') && results.length){ results=[results.filter(e=>e._date>new Date()).sort((a,b)=>a._date-b._date)[0]].filter(Boolean); }
  document.getElementById('searchResults').innerHTML = results.length? results.map(e=>`
    <div class="cityopt" onclick="closeModal('searchModal'); openEvent('${e.id}')">
      <b>${e.name}</b> <span class="muted" style="font-size:12px;">— ${e._date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
    </div>`).join('') : '<div class="muted" style="padding:10px;">No matches. Try "eclipse", "meteor shower", or "next event".</div>';
}

/* ============ INIT ============ */
function scrollToId(id){ document.getElementById(id).scrollIntoView({behavior:'smooth'}); }
document.getElementById('fCategory').onchange=renderEvents;
document.getElementById('fVisibility').onchange=renderEvents;
document.getElementById('fRange').onchange=renderEvents;

function renderAll(){
  renderTonight(); renderNextEvent(); renderEvents(); renderTimeline(); renderCalendar(); renderFuture(); renderMoon(); renderFavorites(); renderWeather(); renderSpaceWeather(); renderMoonImage(); renderAPOD();
}
document.getElementById('futureYear').addEventListener('change', renderFuture);

if(USER_LOC){
  document.getElementById('watchingFrom').textContent = `📍 Watching from ${USER_LOC.name}`;
  document.getElementById('locPill').textContent = `📍 ${USER_LOC.name}`;
} else {
  setTimeout(openLocationModal, 600);
}
window.__ASTROSCOPE_BOOT_PENDING__ = true;

// PAGE ROUTING (sideways page-switching nav instead of scrolling)
const PAGE_MAP = {
  home: ['hero'],
  tonight: ['nextEventSection','tonight','whySection'],
  events: ['events','timelineSection'],
  calendar: ['calendar'],
  future: ['future'],
  moon: ['moon'],
  facts: ['facts'],
  learn: ['learn'],
  mysky: ['mysky'],
};
const ALL_PAGE_SECTION_IDS = [...new Set(Object.values(PAGE_MAP).flat())];
function showPage(key){
  if(!PAGE_MAP[key]) return;
  ALL_PAGE_SECTION_IDS.forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.add('hidden');
  });
  PAGE_MAP[key].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.remove('hidden');
  });
  [...document.querySelectorAll('.navlinks a')].forEach(a=> a.classList.toggle('active', a.dataset.nav===key));
  [...document.querySelectorAll('.mobilenav a')].forEach(a=>{
    const href=a.getAttribute('href').slice(1);
    const match = (key==='home' && href==='hero') || href===key;
    a.classList.toggle('active', match);
  });
  window.scrollTo({top:0, behavior:'instant' in window? 'instant':'auto'});
}
function gotoPage(evt, key){ if(evt) evt.preventDefault(); showPage(key); return false; }
showPage('home');

/* ============ INTERACTIVE SOLAR SYSTEM (homepage) ============ */
const PLANET_DATA = [
  {name:'Mercury', color:'#b5aca2', size:14, rx:70, period:28.9, facts:[
    'Mercury is the smallest planet in our solar system and the closest to the Sun.',
    'A year on Mercury takes just 88 Earth days.',
    'Despite being closest to the Sun, Mercury is not the hottest planet — Venus is.',
    'Mercury has almost no atmosphere, so temperatures swing wildly between day and night.']},
  {name:'Venus', color:'#e0c28c', size:20, rx:100, period:74.8, facts:[
    'Venus spins backwards compared to most planets, a motion called retrograde rotation.',
    'A day on Venus is longer than its year.',
    'Venus is the hottest planet in the solar system due to a runaway greenhouse effect.',
    'Venus is often called Earth\'s "twin" because of its similar size and mass.']},
  {name:'Earth', color:'#5b8ec9', size:21, rx:132, period:120, facts:[
    'Earth is the only known planet with liquid water on its surface.',
    'Earth\'s atmosphere is about 78% nitrogen and 21% oxygen.',
    'A day on Earth is slowly getting longer due to the Moon\'s gravitational pull.',
    'Earth is the only planet not named after a Greek or Roman deity.']},
  {name:'Mars', color:'#c1603f', size:17, rx:166, period:225.6, facts:[
    'Mars is home to Olympus Mons, the tallest volcano in the solar system.',
    'Mars has two small moons, Phobos and Deimos.',
    'A year on Mars lasts about 687 Earth days.',
    'Mars\' red color comes from iron oxide — essentially rust — covering its surface.']},
  {name:'Jupiter', color:'#c9a06a', size:38, rx:224, period:1423.2, facts:[
    'Jupiter is the largest planet in our solar system — over 1,300 Earths could fit inside it.',
    'Jupiter\'s Great Red Spot is a giant storm that has raged for centuries.',
    'Jupiter has at least 95 known moons.',
    'Jupiter has the shortest day of any planet, rotating once in about 10 hours.']},
  {name:'Saturn', color:'#d9c79a', size:35, rx:276, period:3535.2, facts:[
    'Saturn\'s rings are made mostly of ice particles, with some rock and dust.',
    'Saturn is the least dense planet — it would float in water if you had a big enough bathtub.',
    'Saturn has 146 confirmed moons, the most of any planet.',
    'A year on Saturn lasts about 29 Earth years.']},
  {name:'Uranus', color:'#8fd0d6', size:29, rx:322, period:10080, facts:[
    'Uranus rotates on its side, with an axial tilt of about 98 degrees.',
    'Uranus was the first planet discovered using a telescope, in 1781.',
    'Uranus has faint rings, discovered in 1977.',
    'Uranus appears pale blue-green due to methane in its atmosphere.']},
  {name:'Neptune', color:'#5a7fd6', size:27, rx:366, period:19776, facts:[
    'Neptune has the strongest winds in the solar system, reaching up to 2,100 km/h.',
    'Neptune was the first planet located through mathematical prediction rather than direct observation.',
    'A year on Neptune lasts about 165 Earth years.',
    'Neptune has 16 known moons, the largest being Triton.']},
];
// visual texture add-ons (kept separate so orbit/period/fact data above stays untouched)
PLANET_DATA[0].hi='#d8d0c6'; PLANET_DATA[0].lo='#6b645c';
PLANET_DATA[1].hi='#f3dfb0'; PLANET_DATA[1].lo='#8a6a2e';
PLANET_DATA[2].hi='#bcd9ef'; PLANET_DATA[2].lo='#1f3a5f';
PLANET_DATA[3].hi='#e2a184'; PLANET_DATA[3].lo='#5c2a18';
PLANET_DATA[4].bands=['#e7c9a0 0 8%','#c9a06a 8% 16%','#a97f4c 16% 24%','#dbb98a 24% 32%','#c9a06a 32% 42%','#b58c5c 42% 50%','#e7c9a0 50% 58%','#c9a06a 58% 68%','#a97f4c 68% 78%','#dbb98a 78% 88%','#c9a06a 88% 100%'];
PLANET_DATA[5].bands=['#f2e6c4 0 12%','#d9c79a 12% 24%','#e8dcb2 24% 36%','#d0bd8c 36% 50%','#f2e6c4 50% 62%','#d9c79a 62% 76%','#e8dcb2 76% 88%','#d0bd8c 88% 100%'];
PLANET_DATA[5].ring=true;
PLANET_DATA[6].hi='#c9edf0'; PLANET_DATA[6].lo='#356266';
PLANET_DATA[6].ring=true;
PLANET_DATA[7].hi='#a9c1f2'; PLANET_DATA[7].lo='#22336b';
const RY_RATIO = 0.42; // flatten factor for tilted-orbit look

function planetGradient(p){
  // richer, more "textured" sphere look per planet, banded for gas giants
  if(p.bands){
    return `radial-gradient(circle at 32% 28%, rgba(255,255,255,.35), transparent 40%),
      repeating-linear-gradient(4deg, ${p.bands.join(',')})`;
  }
  return `radial-gradient(circle at 32% 28%, ${p.hi||'#fff'}, ${p.color} 45%, ${p.lo||'#000'} 115%)`;
}
function buildSolarSystem(){
  const sys = document.getElementById('solarSystem');
  if(!sys || sys.dataset.built) return;
  sys.dataset.built = '1';
  PLANET_DATA.forEach((p,i)=>{
    const ring = document.createElement('div');
    ring.className = 'orbit-ring';
    ring.style.width = (p.rx*2)+'px';
    ring.style.height = (p.rx*2*RY_RATIO)+'px';
    sys.appendChild(ring);

    const btn = document.createElement('button');
    btn.className = 'planet-btn';
    const hitSize = Math.max(p.size, 40); // enlarge tap target without changing the visible planet size
    btn.style.width = hitSize+'px';
    btn.style.height = hitSize+'px';
    btn.title = p.name;
    btn.setAttribute('aria-label', p.name);
    btn.dataset.index = i;
    btn.onclick = ()=> showPlanetFact(i);

    const sphere = document.createElement('span');
    sphere.className = 'planet-sphere' + (p.ring? ' has-ring':'');
    sphere.style.width = p.size+'px';
    sphere.style.height = p.size+'px';
    sphere.style.display = 'block';
    sphere.style.background = planetGradient(p);
    btn.appendChild(sphere);

    const label = document.createElement('span');
    label.className = 'planet-label';
    label.textContent = p.name;
    sphere.appendChild(label);
    sys.appendChild(btn);
    p._el = btn;
  });
}
const reduceMotionSolar = matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateSolarSystem(t){
  PLANET_DATA.forEach(p=>{
    const angle = reduceMotionSolar ? 0 : (t/1000) * (2*Math.PI/p.period);
    const x = Math.cos(angle) * p.rx;
    const y = Math.sin(angle) * p.rx * RY_RATIO;
    if(p._el){
      p._el.style.setProperty('--orbit-x', `${x}px`);
      p._el.style.setProperty('--orbit-y', `${y}px`);
      p._el.style.zIndex = y > 0 ? '4' : '3';
    }
  });
  requestAnimationFrame(animateSolarSystem);
}
const SUN_FACTS=[
  'The Sun accounts for about 99.86% of the total mass of the solar system.',
  'The Sun is a middle-aged star, about 4.6 billion years old.',
  'Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.',
  'The Sun\'s core reaches temperatures of about 15 million °C.'];
function openPlanetPanel(){
  document.getElementById('planetPanel').classList.add('open');
  document.getElementById('planetPanelScrim').classList.add('open');
}
function closePlanetPanel(){
  document.getElementById('planetPanel').classList.remove('open');
  document.getElementById('planetPanelScrim').classList.remove('open');
}
function showPlanetFact(i){
  const p = PLANET_DATA[i];
  const fact = p.facts[Math.floor(Math.random()*p.facts.length)];
  document.getElementById('planetModalBody').innerHTML = `
    <div style="width:56px; height:56px; border-radius:50%; background:${planetGradient(p)}; box-shadow:inset -4px -4px 6px rgba(0,0,0,.5), inset 3px 3px 4px rgba(255,255,255,.25); margin-bottom:16px;"></div>
    <div class="pp-name">${p.name}</div>
    <div class="pp-sub">Planet</div>
    <p style="font-size:14.5px; line-height:1.6; margin-top:18px; color:var(--ink-dim);">${fact}</p>
    <button class="btn btn-ghost" style="margin-top:18px;" onclick="showPlanetFact(${i})">Another fact</button>
  `;
  openPlanetPanel();
}
function showSunFact(){
  const fact = SUN_FACTS[Math.floor(Math.random()*SUN_FACTS.length)];
  document.getElementById('planetModalBody').innerHTML = `
    <div style="width:56px; height:56px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #fff8e6, #ffcf6b 35%, #ff9d3d 65%, #d9611a 100%); box-shadow:0 0 16px 4px rgba(255,180,90,.5); margin-bottom:16px;"></div>
    <div class="pp-name">The Sun</div>
    <div class="pp-sub">Star</div>
    <p style="font-size:14.5px; line-height:1.6; margin-top:18px; color:var(--ink-dim);">${fact}</p>
    <button class="btn btn-ghost" style="margin-top:18px;" onclick="showSunFact()">Another fact</button>
  `;
  openPlanetPanel();
}
buildSolarSystem();
requestAnimationFrame(animateSolarSystem);

/* Quick-fact flashcard (Facts page) */
const QUICK_FACTS=[
  'The Moon is slowly moving away from Earth by about 3.8 centimeters every year.',
  'The Moon takes about 27.3 Earth days to orbit our planet.',
  'We usually see the same side of the Moon because its rotation period matches its orbital period.',
  'The Moon has an extremely thin atmosphere called an exosphere.',
  'Mercury completes one trip around the Sun in about 88 Earth days.',
  'Venus rotates more slowly than it travels around the Sun.',
  'Mars is approximately half the diameter of Earth.',
  'Jupiter is more massive than all the other planets combined.',
  'Saturn is the second-largest planet in the solar system.',
  'Neptune is the farthest recognized planet from the Sun.',
  'The solar system is located in the Milky Way\u2019s Orion Arm.',
  'Pluto takes about 248 Earth years to orbit the Sun.',
  'The solar system includes eight planets, dwarf planets, moons, asteroids, and comets.',
  'Earth\u2019s Moon helps influence the tides in Earth\u2019s oceans.',
  'The Moon\u2019s surface contains craters formed by impacts from space rocks.',
  'Sagittarius A* is the supermassive black hole at the center of the Milky Way.',
  'A black hole is not an ordinary empty hole; it is an object with extremely strong gravity.',
  'Light cannot escape from inside a black hole\u2019s event horizon.',
  'The solar system takes roughly 230 million years to orbit the center of the Milky Way.',
  'The universe includes space, time, matter, and energy.'
];
let ffFlipped=false, ffLastIndex=-1;
const ffSeen=new Set();
function ffPickFact(){
  if(QUICK_FACTS.length<2) return 0;
  let idx;
  do{ idx=Math.floor(Math.random()*QUICK_FACTS.length); }while(idx===ffLastIndex);
  ffLastIndex=idx;
  return idx;
}
function ffCategory(text){
  const t=text.toLowerCase();
  if(t.includes('moon')) return 'Moon';
  if(t.includes('black hole')||t.includes('sagittarius')) return 'Black Holes';
  if(t.includes('mercury')||t.includes('venus')||t.includes('mars')||t.includes('jupiter')||t.includes('saturn')||t.includes('neptune')||t.includes('pluto')) return 'Planets';
  return 'Cosmos';
}
function flipFact(){
  const inner=document.getElementById('flipInner');
  const front=document.getElementById('flipFront');
  const back=document.getElementById('flipBack');
  const counter=document.getElementById('ffCounter');
  if(!inner||!front||!back) return;
  const target = ffFlipped ? front : back;
  const idx=ffPickFact();
  const text=QUICK_FACTS[idx];
  target.innerHTML = `<div class="ff-tag">${ffCategory(text)}</div><div class="ff-text">${text}</div>`;
  ffFlipped=!ffFlipped;
  inner.classList.toggle('flipped');
  ffSeen.add(idx);
  if(counter) counter.textContent = `${ffSeen.size} of ${QUICK_FACTS.length} cosmic curiosities explored`;
}
