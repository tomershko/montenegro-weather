import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const secrets={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',POSTCARD_CREATION_CODE:'long-random-participant-code',POSTCARD_CLEANUP_KEY:'separate-cleanup-key'};
globalThis.Deno={serve:()=>{},env:{get:name=>secrets[name]}};
const source=await readFile(new URL('../supabase/functions/postcards/index.ts',import.meta.url),'utf8');
const {handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='a'.repeat(64);
const details={recipient:'משפחה',place:'דורמיטור',date:'2026-09-24',message:'שלום <script>alert(1)</script>',sender:'רני והבנים'};
let calls=[];
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
function request(action,method='GET',headers={},body){return new Request('https://example.supabase.co/functions/v1/postcards?action='+action,{method,headers,body});}
function installMock(fn){calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url,options});return fn(String(url),options);};}
test('writes and cleanup require distinct credentials before any storage access',async()=>{
  installMock(()=>{throw Error('must not run');});
  for(const action of ['create','cleanup'])assert.equal((await handler(request(action,'POST'))).status,401);
  assert.equal((await handler(request('cleanup','POST',{'x-cleanup-key':secrets.POSTCARD_CREATION_CODE}))).status,401);
  assert.equal(calls.length,0);
});
test('expired cards block both metadata and image even before cleanup',async()=>{
  installMock(()=>reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:'2000-01-01T00:00:00Z'}]));
  for(const action of ['view','image'])assert.equal((await handler(request(action,'GET',{'x-postcard-token':token}))).status,410);
  assert.equal(calls.filter(c=>c.url.includes('/storage/')).length,0);
});
test('live image is proxied without public URL or browser caching',async()=>{
  installMock(url=>url.includes('/rest/')?reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:new Date(Date.now()+60000).toISOString()}]):new Response(new Uint8Array([255,216,255,217])));
  const response=await handler(request('image','GET',{'x-postcard-token':token}));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.url.includes(token)));
});
test('create accepts sanitized fields, ignores client expiry, uses database expiry',async()=>{
  const expiresAt='2026-09-22T12:00:00Z';
  installMock(url=>url.includes('/rpc/')?reply(expiresAt):reply({}));
  const form=new FormData();form.set('details',JSON.stringify({...details,expiresAt:'2099-01-01'}));form.set('photo',new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}),'p.jpg');
  const response=await handler(request('create','POST',{'x-creation-code':secrets.POSTCARD_CREATION_CODE},form));
  assert.equal(response.status,201);const result=await response.json();assert.match(result.token,/^[0-9a-f]{64}$/);assert.equal(result.expiresAt,expiresAt);
  const reserved=JSON.parse(calls[0].options.body);assert.deepEqual(reserved.p_details,details);assert.notEqual(reserved.p_hash,result.token);
});
test('cleanup removes bytes through Storage API before deleting metadata',async()=>{
  installMock((url,options)=>options.method?reply({}):reply([{token_hash:'b'.repeat(64)}]));
  assert.equal((await handler(request('cleanup','POST',{'x-cleanup-key':secrets.POSTCARD_CLEANUP_KEY}))).status,200);
  assert.match(calls[1].url,/storage\/v1\/object\/postcards$/);assert.equal(calls[1].options.method,'DELETE');assert.match(calls[2].url,/rest\/v1\/postcards/);
});
test('failed storage deletion keeps row for retry',async()=>{
  installMock((url,options)=>options.method?reply({error:'failure'},500):reply([{token_hash:'b'.repeat(64)}]));
  assert.equal((await handler(request('cleanup','POST',{'x-cleanup-key':secrets.POSTCARD_CLEANUP_KEY}))).status,503);
  assert.equal(calls.length,2);
});
test('manual deletion revokes access before removing the file',async()=>{
  installMock((url,options)=>options.method?reply({}):reply([{token_hash:'b'.repeat(64),ready:true,details,expires_at:new Date(Date.now()+60000).toISOString()}]));
  const response=await handler(request('delete','DELETE',{'x-postcard-token':token,'x-creation-code':secrets.POSTCARD_CREATION_CODE}));
  assert.equal(response.status,200);assert.equal(calls[1].options.method,'PATCH');assert.equal(JSON.parse(calls[1].options.body).ready,false);
});
