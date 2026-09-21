import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const testCredential = () => crypto.randomUUID();
const secrets={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:testCredential(),CREATE:testCredential(),CLEANUP:testCredential()};
globalThis.Deno={serve:()=>{},env:{get:name=>secrets[name]}};
const source=await readFile(new URL('../supabase/functions/postcards/index.ts',import.meta.url),'utf8');
const {handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

const token='a'.repeat(64);
const details={recipient:'משפחה',place:'דורמיטור',date:'2026-09-24',message:'שלום <script>alert(1)</script>',sender:'רני והבנים'};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const createHash=await digest(secrets.CREATE);
const cleanupHash=await digest(secrets.CLEANUP);

let calls=[];
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function request(action,method='GET',headers={},body){return new Request('https://example.supabase.co/functions/v1/postcards?action='+action,{method,headers,body});}
function installMock(fn){calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});return fn(String(url),options);};}
function authReply(url){
  if(url.includes('/postcard_secrets?kind=eq.create')&&url.includes('secret_hash=eq.'+createHash))return reply([{kind:'create'}]);
  if(url.includes('/postcard_secrets?kind=eq.cleanup')&&url.includes('secret_hash=eq.'+cleanupHash))return reply([{kind:'cleanup'}]);
  if(url.includes('/postcard_secrets?'))return reply([]);
  return null;
}

test('writes and cleanup require valid distinct credentials',async()=>{
  installMock(url=>authReply(url)??reply({}));
  assert.equal((await handler(request('create','POST'))).status,401);
  assert.equal((await handler(request('cleanup','POST'))).status,401);
  assert.equal((await handler(request('cleanup','POST',{'x-cleanup-key':secrets.CREATE}))).status,401);
});

test('expired cards block both metadata and image before cleanup',async()=>{
  installMock(url=>reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:'2000-01-01T00:00:00Z'}]));
  for(const action of ['view','image'])assert.equal((await handler(request(action,'GET',{'x-postcard-token':token}))).status,410);
  assert.equal(calls.filter(c=>c.url.includes('/storage/')).length,0);
});

test('live image is proxied without public URL or browser caching',async()=>{
  installMock(url=>url.includes('/rest/')?reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:new Date(Date.now()+60000).toISOString()}]):new Response(new Uint8Array([255,216,255,217])));
  const response=await handler(request('image','GET',{'x-postcard-token':token}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('content-type'),'image/jpeg');
});

test('create ignores client expiry and uses database expiry',async()=>{
  const expiresAt='2026-09-22T12:00:00Z';
  installMock(url=>authReply(url)??(url.includes('/rpc/')?reply(expiresAt):reply({})));
  const form=new FormData();
  form.set('details',JSON.stringify({...details,expiresAt:'2099-01-01'}));
  form.set('photo',new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}),'p.jpg');
  const response=await handler(request('create','POST',{'x-creation-code':secrets.CREATE},form));
  assert.equal(response.status,201);
  const result=await response.json();
  assert.match(result.token,/^[0-9a-f]{64}$/);
  assert.equal(result.expiresAt,expiresAt);
});

test('cleanup removes bytes through Storage API before row',async()=>{
  installMock((url,options)=>authReply(url)??(url.includes('expires_at=lte.')?reply([{token_hash:'b'.repeat(64)}]):reply({})));
  const response=await handler(request('cleanup','POST',{'x-cleanup-key':secrets.CLEANUP}));
  assert.equal(response.status,200);
  const storageIndex=calls.findIndex(c=>c.url.includes('/storage/v1/object/postcards'));
  const deleteIndex=calls.findIndex(c=>c.url.includes('/rest/v1/postcards?token_hash=eq.'));
  assert.ok(storageIndex>=0&&deleteIndex>storageIndex);
});

test('manual deletion revokes access before removing file',async()=>{
  installMock((url,options)=>authReply(url)??(url.includes('&select=token_hash,details,expires_at,ready')?reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:new Date(Date.now()+60000).toISOString()}]):reply({})));
  const response=await handler(request('delete','DELETE',{'x-postcard-token':token,'x-creation-code':secrets.CREATE}));
  assert.equal(response.status,200);
  assert.ok(calls.some(c=>c.options.method==='PATCH'&&JSON.parse(c.options.body).ready===false));
});

test('upstream failures never expose credentials or token',async()=>{
  installMock(()=>reply({error:Object.values(secrets).join(' ')},500));
  const response=await handler(request('view','GET',{'x-postcard-token':token}));
  assert.equal(response.status,503);
  const body=await response.text();
  for(const secret of Object.values(secrets))assert.ok(!body.includes(secret));
  assert.ok(!body.includes(token));
});
