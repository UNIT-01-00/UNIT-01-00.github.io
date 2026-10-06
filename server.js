const http=require('http');
const fs=require('fs');const path=require('path');const {URL}=require('url');
const ROOT=__dirname; const PORT=process.env.PORT||3000;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
async function upstream(url,opts={}){const r=await fetch(url,opts);const text=await r.text();if(!r.ok)throw new Error(`${r.status} ${text.slice(0,160)}`);try{return JSON.parse(text)}catch{return text}}
function need(name){const v=process.env[name];if(!v)throw new Error(`Server environment variable ${name} is not configured`);return v}
let eventsCache={at:0,data:null};
async function eventsFeed(){
  const local=JSON.parse(fs.readFileSync(path.join(ROOT,'data/events.json'),'utf8'));
  const remote=process.env.ASTRONOMY_EVENTS_URL;if(!remote)return local;
  if(eventsCache.data&&Date.now()-eventsCache.at<6*3600000)return eventsCache.data;
  try{const r=await upstream(remote);const incoming=Array.isArray(r)?r:(r.events||[]);const map=new Map(local.events.map(e=>[e.id,e]));for(const e of incoming){if(e&&e.id&&e.date&&e.name)map.set(e.id,e)}eventsCache={at:Date.now(),data:{updated:new Date().toISOString(),source:'remote + local normalized catalog',events:[...map.values()]}};return eventsCache.data}catch(e){return local}
}
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(u.pathname==='/api/events')return json(res,200,await eventsFeed());
  if(u.pathname==='/api/mapbox'){const q=u.searchParams.get('q')||'';const token=need('MAPBOX_TOKEN');const data=await upstream(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}&types=place,locality&limit=5`);return json(res,200,data)}
  if(u.pathname==='/api/apod'){const key=need('NASA_API_KEY');return json(res,200,await upstream(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`))}
  if(u.pathname==='/api/weather'||u.pathname==='/api/forecast'){const key=need('OPENWEATHER_API_KEY'),lat=u.searchParams.get('lat'),lon=u.searchParams.get('lon');if(!lat||!lon)return json(res,400,{error:'lat/lon required'});const endpoint=u.pathname.endsWith('forecast')?'forecast':'weather';return json(res,200,await upstream(`https://api.openweathermap.org/data/2.5/${endpoint}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&units=metric&appid=${encodeURIComponent(key)}`))}
  if(u.pathname==='/api/space-weather'&&req.method==='POST'){let b='';for await(const ch of req)b+=ch;const {method,options}=JSON.parse(b||'{}');if(!/^[a-z0-9-]+$/i.test(method||''))return json(res,400,{error:'invalid method'});const key=need('BOM_SPACE_WEATHER_API_KEY');return json(res,200,await upstream(`https://sws-data.sws.bom.gov.au/api/v1/${method}`,{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify(options?{api_key:key,options}:{api_key:key})}))}
  if(u.pathname==='/api/moon-phase'&&req.method==='POST'){let b='';for await(const ch of req)b+=ch;const {latitude,longitude,date}=JSON.parse(b||'{}');const id=need('ASTRONOMY_APP_ID'),secret=need('ASTRONOMY_APP_SECRET');const auth=Buffer.from(`${id}:${secret}`).toString('base64');return json(res,200,await upstream('https://api.astronomyapi.com/api/v2/studio/moon-phase',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Basic ${auth}`},body:JSON.stringify({format:'png',style:{moonStyle:'sketch',backgroundStyle:'solid',backgroundColor:'black',headingColor:'white',textColor:'white'},observer:{latitude,longitude,date},view:{type:'portrait-simple'}})}))}
  let rel=decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname);const fp=path.normalize(path.join(ROOT,rel));if(!fp.startsWith(ROOT))return json(res,403,{error:'forbidden'});if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('Not found')}const ext=path.extname(fp);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-cache':'public, max-age=3600'});fs.createReadStream(fp).pipe(res);
}catch(e){json(res,500,{error:e.message})}});
server.listen(PORT,()=>console.log(`AstroScope running at http://localhost:${PORT}`));
