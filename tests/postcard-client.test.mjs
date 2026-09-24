import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../postcard.js',import.meta.url),'utf8');
function setup(){
  const data=new Map(), elements=new Map();
  const element=()=>({value:'',hidden:false,append(){},replaceChildren(){}});
  const localStorage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const context=vm.createContext({localStorage,URL,URLSearchParams,Intl,console,Date,location:{hash:'',href:'https://example.com/postcard.html'},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},addEventListener(){},createElement:element},window:{POSTCARD_CONFIG:{},addEventListener(){}},setInterval(){},fetch:()=>Promise.reject(new Error('offline'))});
  vm.runInContext(source,context);
  return {run:code=>vm.runInContext(code,context),data,localStorage};
}
test('history persists only supplied link metadata, deduplicates, and marks deletion',()=>{
  const {run,data}=setup();
  run(`saveHistory({token:'a'.repeat(64),createdAt:'2026-09-24T00:00:00Z',expiresAt:'2026-09-25T00:00:00Z'});saveHistory(readHistory()[0]);`);
  assert.equal(run('readHistory().length'),1);
  assert.deepEqual(Object.keys(JSON.parse([...data.values()][0])[0]).sort(),['createdAt','expiresAt','token']);
  run(`markDeleted('a'.repeat(64))`);assert.equal(run('readHistory()[0].deleted'),true);
});
test('corrupt, malformed, and unavailable storage do not break the creator',()=>{
  const {run,localStorage}=setup();
  for(const invalid of ['bad json','{}','[null,{}, {"token":"javascript:alert(1)"}]']){
    localStorage.setItem('montenegro-postcard-history-v1',invalid);assert.equal(run('readHistory().length'),0);
  }
  localStorage.setItem=()=>{throw new Error('quota')};assert.equal(run('saveHistory({})'),false);
});
test('export wraps Hebrew, long words, emoji and explicit blank lines within the image',()=>{
  const {run}=setup();
  const lines=run(`wrapExportText({measureText:text=>({width:Array.from(text).length*10})},'שלום עולם\\n\\n'+ 'א'.repeat(40)+' ❤️',100)`);
  assert.ok(lines.includes(''));assert.ok(lines.every(line=>Array.from(line).length<=10));assert.ok(lines.join('').endsWith('❤️'));
});
