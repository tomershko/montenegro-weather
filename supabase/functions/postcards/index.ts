// No third-party runtime dependencies. Privileged keys never leave this function.
const env = name => Deno.env.get(name) || '';
const productionOrigin = env('POSTCARD_ORIGIN') || 'https://tomershko.github.io';
const allowedOrigins = new Set([productionOrigin, 'https://raw.githack.com']);
const base = env('SUPABASE_URL');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const storagePath = '/storage/v1/object/postcards/';
const maxBody = 2200000;
const commonHeaders = {'Access-Control-Allow-Headers':'content-type,x-creation-code,x-postcard-token,x-cleanup-key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Vary':'Origin','X-Content-Type-Options':'nosniff'};
const responseHeaders = req => {
  const requestOrigin=req.headers.get('origin');
  return {...commonHeaders,'Access-Control-Allow-Origin':allowedOrigins.has(requestOrigin)?requestOrigin:productionOrigin};
};
const json = (req,body,status=200) => new Response(JSON.stringify(body),{status,headers:{...responseHeaders(req),'Content-Type':'application/json'}});
const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function service(path,options={}){
  const response=await fetch(base+path,{...options,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,...options.headers}});
  if(!response.ok){const e=new Error('service_failure');e.status=response.status;e.quota=(await response.text()).includes('postcard_quota');throw e;}
  return response;
}
const db = (path,options={}) => service('/rest/v1/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
async function authorized(provided,kind){
  if(!provided||provided.length>160)return false;
  const secretHash=await hash(provided);
  const rows=await(await db('postcard_secrets?kind=eq.'+kind+'&secret_hash=eq.'+secretHash+'&select=kind&limit=1')).json();
  return rows.length===1;
}
async function remove(row){
  await service('/storage/v1/object/postcards',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[row.token_hash+'.jpg']})});
  await db('postcards?token_hash=eq.'+row.token_hash,{method:'DELETE'});
}
async function readLimited(req){
  if(Number(req.headers.get('content-length'))>maxBody)throw Object.assign(new Error('large'),{status:413});
  const reader=req.body?.getReader();if(!reader)throw Object.assign(new Error('empty'),{status:400});
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBody){await reader.cancel();throw Object.assign(new Error('large'),{status:413});}chunks.push(value);}
  return await new Response(new Blob(chunks),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();
}
function validateDetails(data){
  const required={recipient:80,place:80,date:10};const clean={};
  for(const [key,limit]of Object.entries(required)){if(typeof data?.[key]!=='string'||!data[key].trim()||data[key].length>limit)throw new Error('details');clean[key]=data[key].trim();}
  if(typeof data?.message!=='string'||data.message.length>600)throw new Error('details');
  if(typeof data?.sender!=='string'||data.sender.length>80)throw new Error('details');
  clean.message=data.message;clean.sender=data.sender.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(clean.date)||Number.isNaN(Date.parse(clean.date+'T12:00:00Z')))throw new Error('date');
  return clean;
}
export async function handler(req){
  const requestOrigin=req.headers.get('origin');
  if(requestOrigin&&!allowedOrigins.has(requestOrigin))return json(req,{error:'origin'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(req)});
  const action=new URL(req.url).searchParams.get('action');
  try{
    if(action==='cleanup'&&req.method==='POST'){
      if(!await authorized(req.headers.get('x-cleanup-key'),'cleanup'))return json(req,{error:'unauthorized'},401);
      const rows=await(await db('postcards?expires_at=lte.'+encodeURIComponent(new Date().toISOString())+'&select=token_hash&limit=200')).json();
      let removed=0;for(const row of rows){await remove(row);removed++;}return json(req,{removed});
    }
    if(action==='create'&&req.method==='POST'){
      if(!await authorized(req.headers.get('x-creation-code'),'create'))return json(req,{error:'unauthorized'},401);
      let form,details;
      try{form=await readLimited(req);details=validateDetails(JSON.parse(String(form.get('details'))));}catch(e){return json(req,{error:'invalid_input'},e.status===413?413:400);}
      const photo=form.get('photo');
      if(!(photo instanceof Blob)||photo.type!=='image/jpeg'||photo.size<4||photo.size>2097152)return json(req,{error:'invalid_photo'},400);
      const bytes=new Uint8Array(await photo.arrayBuffer());
      if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)return json(req,{error:'invalid_photo'},400);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      const tokenHash=await hash(token);
      const expiresAt=await(await db('rpc/reserve_postcard',{method:'POST',body:JSON.stringify({p_hash:tokenHash,p_details:details})})).json();
      await service(storagePath+tokenHash+'.jpg',{method:'POST',headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store'},body:bytes});
      await db('postcards?token_hash=eq.'+tokenHash,{method:'PATCH',body:JSON.stringify({ready:true})});
      return json(req,{token,expiresAt},201);
    }
    if(!['view','image','delete'].includes(action)||req.method!==(action==='delete'?'DELETE':'GET'))return json(req,{error:'not_found'},404);
    const token=req.headers.get('x-postcard-token')||'';
    if(!/^[a-f0-9]{64}$/.test(token))return json(req,{error:'not_found'},404);
    if(action==='delete'&&!await authorized(req.headers.get('x-creation-code'),'create'))return json(req,{error:'unauthorized'},401);
    const tokenHash=await hash(token);
    const rows=await(await db('postcards?token_hash=eq.'+tokenHash+'&select=token_hash,details,expires_at,ready')).json();
    const row=rows[0];if(!row)return json(req,{error:'unavailable'},410);
    if(action==='delete'){
      await db('postcards?token_hash=eq.'+tokenHash,{method:'PATCH',body:JSON.stringify({expires_at:new Date().toISOString(),ready:false})});
      await remove(row);return json(req,{deleted:true});
    }
    if(!row.ready||Date.parse(row.expires_at)<=Date.now())return json(req,{error:'expired'},410);
    if(action==='view')return json(req,{...row.details,expiresAt:row.expires_at,serverNow:new Date().toISOString()});
    const image=await service('/storage/v1/object/authenticated/postcards/'+tokenHash+'.jpg');
    const body=await image.arrayBuffer();
    if(Date.parse(row.expires_at)<=Date.now())return json(req,{error:'expired'},410);
    return new Response(body,{headers:{...responseHeaders(req),'Content-Type':'image/jpeg'}});
  }catch(e){return json(req,{error:e.quota?'quota':'service_unavailable'},e.quota?429:503);}
}
Deno.serve(handler);
