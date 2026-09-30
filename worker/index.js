const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const COVER_FILE=/^[a-z0-9_-]{1,100}\.(?:jpg|jpeg|png|webp)$/i;
export function imageTarget(id,file){return UUID.test(id)&&COVER_FILE.test(file)?'https://uploads.mangadex.org/covers/'+id+'/'+file+'.512.jpg':null}
async function serveCoverImage(request,url){
 const id=url.searchParams.get('id')||'';if(!UUID.test(id))return json({error:'Couverture invalide.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  let file=url.searchParams.get('file')||'';
  if(url.pathname==='/api/catalogue/series-image'){
   const p=new URLSearchParams({limit:'100'});p.append('manga[]',id);
   const result=await fetch('https://api.mangadex.org/cover?'+p,{signal:controller.signal,headers:{'Accept':'application/json','User-Agent':'MangaNotebook/1.0'}});if(!result.ok)return json({error:'Couverture indisponible.'},502);
   const data=await result.json(),covers=(data.data||[]).map(x=>x.attributes||{}).filter(x=>COVER_FILE.test(x.fileName));
   covers.sort((a,b)=>{const score=c=>(Number(c.volume)===1?100:0)+(c.locale==='fr'?20:c.locale==='ja'?10:0);return score(b)-score(a)});file=covers[0]?.fileName||'';
  }
  const target=imageTarget(id,file);if(!target)return json({error:'Couverture non répertoriée.'},404);
  const response=await fetch(target,{signal:controller.signal,headers:{'User-Agent':'MangaNotebook/1.0','Accept':'image/avif,image/webp,image/*,*/*;q=0.8'}});const type=response.headers.get('Content-Type')||'';
  if(!response.ok||!type.startsWith('image/'))return json({error:'Couverture indisponible.',upstreamStatus:response.status,upstreamType:type},502);
  const imageBytes=await response.arrayBuffer();if(imageBytes.byteLength>5000000)return json({error:'Couverture trop volumineuse.'},502);
  return new Response(request.method==='HEAD'?null:imageBytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch(e){return json({error:'Impossible de charger la couverture.',reason:e.name,detail:String(e.message).slice(0,200)},502)}finally{clearTimeout(timer)}
}
export function catalogueTarget(url){
 const path=url.pathname,q=(url.searchParams.get('q')||'').trim(),id=url.searchParams.get('id')||'';
 if(path==='/api/catalogue/search'){
  if(!q||q.length>200)return null;
  const params=new URLSearchParams({title:q,limit:'25'});['author','artist','cover_art'].forEach(type=>params.append('includes[]',type));
  return 'https://api.mangadex.org/manga?'+params;
 }
 if(path==='/api/catalogue/covers'){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return null;
  const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>1000)return null;const params=new URLSearchParams({limit:'100',offset:String(offset)});params.append('manga[]',id);return 'https://api.mangadex.org/cover?'+params;
 }
 if(path==='/api/catalogue/jikan-search'){
  if(!q||q.length>200)return null;
  return 'https://api.jikan.moe/v4/manga?'+new URLSearchParams({q,limit:'15'});
 }
 if(path==='/api/catalogue/jikan-detail'){
  if(!/^\d{1,10}$/.test(id))return null;
  return 'https://api.jikan.moe/v4/manga/'+id;
 }
 return null;
}
let releasesCache=null;
function quotedField(text,key){const m=text.match(new RegExp('(?:^|,)'+key+':("(?:[^"\\\\]|\\\\.)*")'));if(!m)return '';try{return JSON.parse(m[1])}catch{return ''}}
export function parseReleases(html){const rows=[];const seen=new Set();for(const match of html.matchAll(/\{id:"[^"\r\n]+",date:"\d{4}-\d{2}-\d{2}",hasExactDate:[\s\S]*?editionVariant:[^}]*\}/g)){const raw=match[0].slice(1,-1),id=quotedField(raw,'id'),date=quotedField(raw,'date'),title=quotedField(raw,'title'),bookSlug=quotedField(raw,'bookSlug'),editionSlug=quotedField(raw,'editionSlug');if(!id||!title||!date||!/^[-a-z0-9]+$/.test(bookSlug)||seen.has(id))continue;seen.add(id);const image=quotedField(raw,'coverUrl');rows.push({id,date,title,bookSlug,editionSlug,publisher:quotedField(raw,'publisher'),coverUrl:/^https:\/\/cdn\.mangabase\.fr\//.test(image)?image:'',volumeNumber:Number(raw.match(/,volumeNumber:(\d+)/)?.[1])||null,hasExactDate:/(?:^|,)hasExactDate:(?:!0|true)/.test(raw),isNew:/(?:^|,)isNew:(?:!0|true)/.test(raw)})}return rows.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'fr'))}
async function serveReleases(){if(releasesCache&&Date.now()-releasesCache.at<3600000)return new Response(JSON.stringify(releasesCache.data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=900'}});const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const response=await fetch('https://www.mangabase.fr/planning',{signal:controller.signal,headers:{'User-Agent':'MangaNotebook/1.0','Accept':'text/html'}});if(!response.ok)throw new Error('source unavailable');const html=await response.text();if(html.length>5000000)throw new Error('source too large');const releases=parseReleases(html);if(!releases.length)throw new Error('calendar format changed');const data={releases,source:'MangaBase',sourceURL:'https://www.mangabase.fr/planning',fetchedAt:new Date().toISOString()};releasesCache={at:Date.now(),data};return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=900'}})}catch{if(releasesCache)return json({...releasesCache.data,stale:true});return json({error:'Le calendrier est temporairement indisponible.'},502)}finally{clearTimeout(timer)}}

const frenchSeriesCache=new Map();
export function parseFrenchSeries(html,slug){
 const editions=[];for(const m of html.matchAll(/\{id:"[^"\r\n]+",slug:"[^"\r\n]+",title:(?:null|"(?:[^"\\]|\\.)*"),format:"[^"\r\n]+",[\s\S]*?collection:[^}]*\}/g)){const raw=m[0].slice(1,-1);if(quotedField(raw,'language')!=='fr')continue;editions.push({id:quotedField(raw,'id'),slug:quotedField(raw,'slug'),format:quotedField(raw,'format'),publisher:quotedField(raw,'publisherName'),variant:quotedField(raw,'variant'),isDefault:/(?:^|,)isDefault:!0/.test(raw)})}
 const volumes=[];for(const m of html.matchAll(/\{id:"([^"\r\n]+)",editionId:"([^"\r\n]+)",editionSlug:"([^"\r\n]+)",number:(\d+),numberEnd:([^,]+),title:[\s\S]*?releaseDate:("(?:[^"\\]|\\.)*"|null),coverUrl:("(?:[^"\\]|\\.)*"|null)/g)){const date=m[6]==='null'?'':JSON.parse(m[6]),cover=m[7]==='null'?'':JSON.parse(m[7]);volumes.push({id:m[1],editionId:m[2],editionSlug:m[3],number:Number(m[4]),numberEnd:m[5]==='null'?null:Number(m[5]),date,coverUrl:/^https:\/\/cdn\.mangabase\.fr\//.test(cover)?cover:''})}
 return {slug,editions,volumes,sourceURL:'https://www.mangabase.fr/book/'+slug,fetchedAt:new Date().toISOString()};
}
async function serveFrenchSeries(url){const slug=url.searchParams.get('slug')||'';if(!/^[a-z0-9][a-z0-9-]{0,160}$/.test(slug))return json({error:'Série invalide.'},400);const cached=frenchSeriesCache.get(slug);if(cached&&Date.now()-cached.at<3600000)return json(cached.data);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetch('https://www.mangabase.fr/book/'+slug,{signal:controller.signal,headers:{'User-Agent':'MangaNotebook/1.0','Accept':'text/html'}});if(!r.ok)return json({error:'Édition française non répertoriée.'},404);const html=await r.text();if(html.length>5000000)throw new Error('too large');const data=parseFrenchSeries(html,slug);if(!data.editions.length||!data.volumes.length)return json({error:'Édition française non renseignée.'},404);if(frenchSeriesCache.size>200)frenchSeriesCache.clear();frenchSeriesCache.set(slug,{at:Date.now(),data});return json(data)}catch{return json({error:'Catalogue français indisponible.'},502)}finally{clearTimeout(timer)}}

const handler = {
 async handle(request,env,ctx){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  if(url.pathname==='/api/catalogue/french-series')return serveFrenchSeries(url);
  if(url.pathname==='/api/releases')return serveReleases();
  if(['/api/catalogue/cover-image','/api/catalogue/series-image'].includes(url.pathname))return serveCoverImage(request,url);
  if(url.pathname.startsWith('/api/catalogue/')){
   const target=catalogueTarget(url);if(!target)return json({error:'Recherche invalide.'},400);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const upstream=await fetch(target,{signal:controller.signal,headers:{'Accept':'application/json','User-Agent':'MangaNotebook/1.0'}});
    if(!upstream.ok)return json({error:'Le catalogue est temporairement indisponible.'},upstream.status===429?429:502);
    const body=await upstream.json();
    const response=new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'}});
    return response;
   }catch{return json({error:'Le catalogue ne répond pas. Réessaie dans un instant.'},502)}finally{clearTimeout(timer)}
  }
  if(url.pathname==='/')return json({service:'Catalogue public du carnet de mangas'});
  return new Response('Page introuvable',{status:404});
 }
};

const catalogueWorker = { async fetch(request, env, ctx) {
 const origin=request.headers.get('Origin')||'';
 const allowed=origin==='https://nyastur.github.io';
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Vary':'Origin'}:{}});
 const response=await handler.handle(request,env,ctx);
 const headers=new Headers(response.headers);
 if(allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin')}
 return new Response(response.body,{status:response.status,headers});
}};
export default catalogueWorker;
