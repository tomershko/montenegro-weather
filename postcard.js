'use strict';
const $ = id => document.getElementById(id);
const endpoint = window.POSTCARD_CONFIG?.endpoint || '';
const token = new URLSearchParams(location.hash.slice(1)).get('card');
let sourceBlob, postcardBlob, photoUrl, current, expiryTimer, deadline = 0, wallDeadline = 0, publishedToken = '', creationCode = '';
let exportBlob=null, exportVersion=0;
const say = text => { $('status').textContent = text; };
const value = id => $(id).value.trim();
const dateLabel = date => new Intl.DateTimeFormat('he-IL', { day:'numeric',month:'numeric',year:'numeric',timeZone:'Europe/Podgorica' }).format(new Date(date.length === 10 ? date + 'T12:00:00Z' : date));
function revokePhoto(){ if(photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = ''; }
function unavailable(expired=true){
  clearInterval(expiryTimer); deadline=0; exportBlob=null; exportVersion++; $('exportBtn').disabled=true; revokePhoto(); current=null; sourceBlob=null; postcardBlob=null;
  $('cardPhoto').removeAttribute('src');
  for(const id of ['cardTo','cardMessage','cardSender','envelopeTo']) $(id).textContent='';
  for(const id of ['creator','viewer','published']) $(id).hidden=true;
  $('unavailable').hidden=false;
  $('unavailableTitle').textContent=expired?'הגלויה הזו כבר פגה או אינה זמינה.':'לא הצלחנו לפתוח את הגלויה.';
  $('unavailableText').textContent=expired?'הגלויות שלנו זמינות ל־24 שעות. ניפגש בדרישת השלום הבאה.':'בדקו את החיבור לאינטרנט ונסו שוב.';
  $('retryBtn').hidden=expired;
}
function tick(){
  const left=Math.min(deadline-performance.now(),wallDeadline-Date.now());
  if(left<=0){ unavailable(); return; }
  const minutes=Math.ceil(left/60000);
  $('remaining').textContent=`הגלויה זמינה לעוד ${Math.floor(minutes/60)} שעות ו־${minutes%60} דקות`;
}
async function api(action, options={}){
  const url=new URL(endpoint); url.searchParams.set('action',action);
  const response=await fetch(url,{...options,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const e=new Error(response.status===401?'קוד המשתתפים אינו נכון.':response.status===429?'הגענו למכסת הגלויות להיום. נסו שוב מחר.':response.status===413?'התמונה גדולה מדי. בחרו תמונה אחרת.':'לא הצלחנו להשלים את הפעולה. נסו שוב.');e.status=response.status;throw e;}
  return response;
}
function roundedRect(ctx,x,y,w,h,r){
  const radius=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();
}
async function decodeBlob(blob){
  const img=new Image(), url=URL.createObjectURL(blob);
  try{img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
}
function drawCover(ctx,img,x,y,w,h){
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
  const sw=w/scale, sh=h/scale, sx=(img.naturalWidth-sw)/2, sy=(img.naturalHeight-sh)/2;
  ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}
async function jpeg(canvas){
  for(const quality of [.88,.78,.68]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob&&blob.size<=2*1024*1024)return blob;
  }
  throw new Error('הגלויה גדולה מדי. נסו תמונה אחרת.');
}
async function renderPostcard(data){
  if(!sourceBlob)throw new Error('בחרו תמונה והמתינו לסיום העיבוד.');
  const img=await decodeBlob(sourceBlob);
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fffdf6';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='#cedbd3';ctx.lineWidth=3;ctx.strokeRect(24,24,1152,1452);
  ctx.save();ctx.translate(1025,112);ctx.rotate(-.1);ctx.strokeStyle='#9b5139';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,112,56,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#85402b';ctx.textAlign='center';ctx.direction='ltr';ctx.font='700 25px system-ui,-apple-system,sans-serif';ctx.fillText('MONTENEGRO',0,-5);ctx.font='600 22px system-ui,-apple-system,sans-serif';ctx.fillText(dateLabel(data.date),0,26);ctx.restore();
  const x=65,y=205,w=1070,h=1030;
  ctx.save();roundedRect(ctx,x,y,w,h,20);ctx.clip();ctx.fillStyle='#e5ebe4';ctx.fillRect(x,y,w,h);drawCover(ctx,img,x,y,w,h);ctx.restore();
  ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#123e3a';ctx.font='700 42px system-ui,-apple-system,sans-serif';ctx.fillText(data.place,1135,1310);
  ctx.font='500 28px system-ui,-apple-system,sans-serif';ctx.fillStyle='#516660';ctx.fillText('דרישת שלום מהדרך',1135,1360);
  ctx.direction='ltr';ctx.textAlign='left';ctx.font='700 24px system-ui,-apple-system,sans-serif';ctx.fillStyle='#53736a';ctx.fillText('MONTENEGRO 2026',65,1418);
  postcardBlob=await jpeg(canvas);
  revokePhoto();photoUrl=URL.createObjectURL(postcardBlob);
  return postcardBlob;
}
function display(data,preview){
  current=data;
  prepareExport(data);
  $('history').hidden=true;
  $('creator').hidden=true; $('unavailable').hidden=true; $('viewer').hidden=false;
  $('previewLabel').hidden=!preview; $('editBtn').hidden=!preview; $('replyBtn').hidden=true; $('replyHint').hidden=true;
  $('envelope').hidden=false; $('card').hidden=true; $('front').hidden=false; $('back').hidden=true;
  $('envelopeTo').textContent=data.recipient;
  $('cardPhoto').src=photoUrl;
  $('cardTo').textContent=data.recipient;
  $('cardMessage').textContent=data.message; $('cardSender').textContent=data.sender?`באהבה, ${data.sender}`:'';
  $('flipBtn').hidden=!data.message&&!data.sender;
  $('flipBtn').textContent='להקדשה שבצד השני ↶';
  $('remaining').textContent=preview?'לאחר היצירה הגלויה תהיה זמינה ל־24 שעות.':'';
  window.scrollTo({top:0,behavior:'instant'});
}
$('openBtn').onclick=()=>{ $('envelope').hidden=true; $('card').hidden=false; if(!$('flipBtn').hidden)$('flipBtn').focus(); $('replyBtn').hidden=$('previewLabel').hidden===false; $('replyHint').hidden=$('replyBtn').hidden; };
$('flipBtn').onclick=()=>{const back=$('back').hidden; $('back').hidden=!back; $('front').hidden=back; $('flipBtn').textContent=back?'חזרה לתמונה ↶':'להקדשה שבצד השני ↶';};
$('editBtn').onclick=()=>{ $('creator').hidden=false; $('viewer').hidden=true; $('history').hidden=false; renderHistory(); $('previewBtn').focus(); };
$('photo').onchange=async()=>{
  $('photo').disabled=true; say(''); sourceBlob=null; postcardBlob=null; revokePhoto(); $('photoLabel').textContent='מעבדים את התמונה…'; $('previewBtn').disabled=true; $('publishBtn').disabled=true;
  try{
    const file=$('photo').files[0]; if(!file){$('photoLabel').textContent='＋ בוחרים רגע מהטיול';return;}
    if(file.size>30*1024*1024)throw new Error('בחרו תמונה קטנה מ־30MB.');
    const img=await decodeBlob(file);
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    sourceBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.84));
    if(!sourceBlob||sourceBlob.size>2*1024*1024)throw new Error('לא הצלחנו להקטין את התמונה. נסו תמונה אחרת.');
    $('photoLabel').textContent='✓ התמונה מוכנה · לחצו להחלפה';
  }catch(e){$('photoLabel').textContent='＋ בוחרים תמונה אחרת';say('לא הצלחנו לקרוא את התמונה. נסו JPEG או PNG. '+e.message);}
  finally{$('photo').disabled=false;$('previewBtn').disabled=false;$('publishBtn').disabled=!endpoint;}
};
function formData(){
  if(!$('createForm').reportValidity())return null;
  if(!sourceBlob){say('בחרו תמונה והמתינו לסיום העיבוד.');return null;}
  return {recipient:value('recipient'),place:value('place'),date:value('date'),message:$('message').value,sender:value('sender')};
}
$('previewBtn').onclick=async()=>{
  const data=formData();if(!data)return;
  $('previewBtn').disabled=true; say('מכינים תצוגה מקדימה…');
  try{await renderPostcard(data);say('');display(data,true);}catch(e){say(e.message);}finally{$('previewBtn').disabled=false;}
};
$('createForm').onsubmit=async event=>{
  event.preventDefault(); const data=formData();if(!data||!endpoint)return;
  if(!value('code')){say('הזינו את קוד המשתתפים כדי ליצור גלויה.');$('code').focus();return;}
  $('publishBtn').disabled=true; $('previewBtn').disabled=true; say('מעצבים ושומרים את הגלויה…');
  try{
    await renderPostcard(data);
    const body=new FormData();body.set('photo',postcardBlob,'montenegro-postcard.jpg');body.set('details',JSON.stringify(data));
    creationCode=value('code');
    const result=await (await api('create',{method:'POST',headers:{'x-creation-code':creationCode},body})).json();
    publishedToken=result.token;
    const link=new URL('postcard.html',location.href);link.hash=new URLSearchParams({card:result.token}).toString();
    $('shareUrl').value=link.href;
    $('publishedOpen').href=link.href;
    const saved=saveHistory({token:result.token,createdAt:new Date().toISOString(),expiresAt:result.expiresAt});
    $('history').hidden=false; renderHistory();
    $('whatsappBtn').href='https://wa.me/?text='+encodeURIComponent('שלחנו לכם גלויה ממונטנגרו 💌\nזמינה ל־24 שעות\n'+link.href);
    $('expiryText').textContent='הקישור זמין עד '+new Date(result.expiresAt).toLocaleString('he-IL');
    $('creator').hidden=true; $('published').hidden=false; $('viewer').hidden=true; say(saved?'':'הקישור נוצר, אבל לא הצלחנו לשמור היסטוריה במכשיר הזה. העתיקו את הקישור.');
    $('shareBtn').focus();
  }catch(e){say(e.message);}finally{$('publishBtn').disabled=!endpoint;$('previewBtn').disabled=false;}
};
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('shareUrl').value);say('הקישור הועתק.');}catch{$('shareUrl').select();say('לחצו לחיצה ארוכה על הקישור ובחרו העתקה.');}};
$('shareBtn').onclick=async()=>{
  if(!navigator.share){$('copyBtn').click();return;}
  const url=$('shareUrl').value;
  try{
    const file=postcardBlob?new File([postcardBlob],'montenegro-postcard.jpg',{type:'image/jpeg'}):null;
    if(file&&navigator.canShare?.({files:[file]})){
      await navigator.share({title:'גלויה ממונטנגרו 💌',text:'דרישת שלום מהטיול שלנו · זמינה ל־24 שעות\n'+url,files:[file]});
    }else{
      await navigator.share({title:'גלויה ממונטנגרו 💌',text:'דרישת שלום מהטיול שלנו · זמינה ל־24 שעות',url});
    }
  }catch(e){if(e.name!=='AbortError')say('אפשר לשתף דרך כפתור וואטסאפ או להעתיק את הקישור.');}
};
$('deleteBtn').onclick=async()=>{
  if(!confirm('למחוק את הגלויה ולסגור את הקישור?'))return;
  $('deleteBtn').disabled=true;
  try{await api('delete',{method:'DELETE',headers:{'x-creation-code':creationCode,'x-postcard-token':publishedToken}});markDeleted(publishedToken);publishedToken='';creationCode='';unavailable();renderHistory();say('הגלויה נמחקה.');}catch(e){say(e.message);}finally{$('deleteBtn').disabled=false;}
};
async function load(){
  if(!endpoint){unavailable(false);$('unavailableText').textContent='שירות הגלויות עדיין לא מחובר. נסו שוב בהמשך.';return;}
  $('unavailable').hidden=true;say('פותחים את דרישת השלום…');
  const start=performance.now(), wallStart=Date.now();
  try{
    const headers={'x-postcard-token':token};
    const data=await(await api('view',{headers})).json();
    const ttl=Math.max(0,Date.parse(data.expiresAt)-Date.parse(data.serverNow));
    deadline=start+ttl; wallDeadline=wallStart+ttl;
    const blob=await(await api('image',{headers})).blob();
    if(performance.now()>=deadline){unavailable();say('');return;}
    postcardBlob=blob;revokePhoto();photoUrl=URL.createObjectURL(blob);display(data,false);say('');tick();expiryTimer=setInterval(tick,1000);
  }catch(e){say('');unavailable(e.status===404||e.status===410);}
}
const HISTORY_KEY='montenegro-postcard-history-v1';
function readHistory(){
  try{
    const rows=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');
    return Array.isArray(rows)?rows.filter(row=>row&&/^[a-f0-9]{64}$/.test(row.token)&&Number.isFinite(Date.parse(row.createdAt))&&Number.isFinite(Date.parse(row.expiresAt))).slice(0,200):[];
  }catch{return [];}
}
function saveHistory(entry){
  try{localStorage.setItem(HISTORY_KEY,JSON.stringify([entry,...readHistory().filter(row=>row.token!==entry.token)].slice(0,200)));return true;}catch{return false;}
}
function markDeleted(cardToken){
  const row=readHistory().find(row=>row.token===cardToken);
  if(row)saveHistory({...row,deleted:true});
}
function renderHistory(){
  const rows=readHistory().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  $('historyNotice').textContent=rows.length?'נשמרים עד 200 קישורים. ניקוי נתוני הדפדפן ימחק את ההיסטוריה.':'עדיין אין גלויות בהיסטוריה.';
  $('historyList').replaceChildren();
  for(const row of rows){
    const li=document.createElement('li');
    const expired=Date.parse(row.expiresAt)<=Date.now();
    for(const text of [row.deleted?'נמחקה':expired?'פג תוקף':'פעילה', 'נוצרה: '+new Date(row.createdAt).toLocaleString('he-IL'), 'תפוגה: '+new Date(row.expiresAt).toLocaleString('he-IL')]){
      const line=document.createElement('p');line.textContent=text;li.append(line);
    }
    if(!expired&&!row.deleted){
      const link=document.createElement('a');const url=new URL('postcard.html',location.href);url.hash=new URLSearchParams({card:row.token});
      link.href=url.href;link.className='button secondary';link.textContent='פתיחה ושמירה כתמונה';li.append(link);
    }
    $('historyList').append(li);
  }
}
function wrapExportText(ctx,text,width){
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';
    const words=paragraph.match(/\S+\s*|\s+/gu)||[''];
    for(const word of words){
      if(ctx.measureText(line+word).width<=width){line+=word;continue;}
      if(line){lines.push(line.trimEnd());line='';}
      // Split exceptionally long words without breaking emoji or combining marks.
      const parts=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('he',{granularity:'grapheme'}).segment(word),part=>part.segment):Array.from(word);
      for(const part of parts){
        if(line&&ctx.measureText(line+part).width>width){lines.push(line.trimEnd());line='';}
        line+=part;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
async function makeLongImage(blob,data){
  const img=await decodeBlob(blob), canvas=document.createElement('canvas');
  canvas.width=1200;
  const ctx=canvas.getContext('2d'), blocks=[];
  for(const [text,bold] of [[data.recipient,true],[data.message,false],[data.sender?`באהבה, ${data.sender}`:'',true]]){
    if(!text)continue;
    ctx.font=`${bold?700:400} 38px system-ui,-apple-system,sans-serif`;
    blocks.push({bold,lines:wrapExportText(ctx,text,1040)});
  }
  const photoHeight=Math.round(1200*img.naturalHeight/img.naturalWidth);
  const logicalHeight=photoHeight+80+blocks.reduce((sum,block)=>sum+block.lines.length*60+32,0);
  const scale=Math.min(1,8000/logicalHeight);
  canvas.width=Math.round(1200*scale);canvas.height=Math.ceil(logicalHeight*scale);ctx.scale(scale,scale);
  ctx.fillStyle='#fffdf6';ctx.fillRect(0,0,1200,logicalHeight);ctx.drawImage(img,0,0,1200,photoHeight);
  ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='top';ctx.fillStyle='#123e3a';
  let y=photoHeight+40;
  for(const block of blocks){
    ctx.font=`${block.bold?700:400} 38px system-ui,-apple-system,sans-serif`;
    for(const line of block.lines){ctx.fillText(line,1120,y);y+=60;}y+=32;
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('לא הצלחנו להכין את התמונה.')),'image/jpeg',.92));
}
async function prepareExport(data){
  const version=++exportVersion;exportBlob=null;$('exportBtn').disabled=true;
  try{
    const blob=await makeLongImage(postcardBlob,data);
    if(version!==exportVersion)return;
    exportBlob=blob;$('exportBtn').disabled=false;
  }catch{if(version===exportVersion)say('לא הצלחנו להכין תמונה לשמירה. נסו לפתוח שוב את הגלויה.');}
}
$('exportBtn').onclick=async()=>{
  if(deadline&&Math.min(deadline-performance.now(),wallDeadline-Date.now())<=0){unavailable();return;}
  if(!exportBlob)return;
  const file=new File([exportBlob],'montenegro-postcard-long.jpg',{type:'image/jpeg'});
  if(navigator.canShare?.({files:[file]})&&navigator.share){
    try{await navigator.share({files:[file],title:'גלויה ממונטנגרו'});return;}catch(e){if(e.name==='AbortError')return;}
  }
  const url=URL.createObjectURL(exportBlob),link=document.createElement('a');
  link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
};
$('retryBtn').onclick=load;
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(deadline)tick();renderHistory();}});
window.addEventListener('storage',renderHistory);
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).get('card')!==token)location.reload();});
setInterval(()=>{if(!document.hidden&&!$('history').hidden)renderHistory();},30000);
window.addEventListener('pagehide',()=>{if(token){clearInterval(expiryTimer);revokePhoto();}});
window.addEventListener('pageshow',event=>{if(token&&event.persisted)load();});
if(token){$('creator').hidden=true; $('history').hidden=true; if(/^[a-f0-9]{64}$/.test(token))load();else unavailable();}
else{
  renderHistory();
  $('setup').hidden=!!endpoint; $('publishBtn').disabled=!endpoint; $('codeLabel').hidden=!endpoint;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Podgorica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('date').value=today;
  let places={};fetch('./widget-data.json').then(r=>r.json()).then(data=>{places=Object.fromEntries(data.days.map(day=>[day.date,day.title]));if(!value('place'))$('place').value=places[today]||'מונטנגרו';}).catch(()=>{$('place').value='מונטנגרו';});
  $('date').onchange=()=>{$('place').value=places[value('date')]||'מונטנגרו';};
}
