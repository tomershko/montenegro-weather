'use strict';
const $ = id => document.getElementById(id);
const endpoint = window.POSTCARD_CONFIG?.endpoint || '';
const token = new URLSearchParams(location.hash.slice(1)).get('card');
let photoBlob, photoUrl, current, expiryTimer, deadline = 0, wallDeadline = 0, publishedToken = '', creationCode = '';
const say = text => { $('status').textContent = text; };
const value = id => $(id).value.trim();
const dateLabel = date => new Intl.DateTimeFormat('he-IL', { day:'numeric',month:'numeric',year:'numeric',timeZone:'Europe/Podgorica' }).format(new Date(date.length === 10 ? date + 'T12:00:00Z' : date));
function revokePhoto(){ if(photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = ''; }
function unavailable(expired=true){
  clearInterval(expiryTimer); deadline=0; revokePhoto(); current=null; photoBlob=null;
  $('cardPhoto').removeAttribute('src');
  for(const id of ['cardTo','cardMessage','cardSender','cardPlace','envelopeTo']) $(id).textContent='';
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
function display(data,preview){
  current=data;
  $('creator').hidden=true; $('unavailable').hidden=true; $('viewer').hidden=false;
  $('previewLabel').hidden=!preview; $('editBtn').hidden=!preview; $('replyBtn').hidden=true; $('replyHint').hidden=true;
  $('envelope').hidden=false; $('card').hidden=true; $('front').hidden=false; $('back').hidden=true;
  $('envelopeTo').textContent=`ל${data.recipient}, באהבה`;
  $('stampDate').textContent=dateLabel(data.date);
  $('cardPhoto').src=photoUrl;
  $('cardPlace').textContent=data.place; $('cardTo').textContent=`ל${data.recipient},`;
  $('cardMessage').textContent=data.message; $('cardSender').textContent=`באהבה, ${data.sender}`;
  $('flipBtn').textContent='להקדשה שבצד השני ↶';
  $('remaining').textContent=preview?'לאחר היצירה הגלויה תהיה זמינה ל־24 שעות.':'';
  window.scrollTo({top:0,behavior:'instant'});
}
$('openBtn').onclick=()=>{ $('envelope').hidden=true; $('card').hidden=false; $('flipBtn').focus(); $('replyBtn').hidden=$('previewLabel').hidden===false; $('replyHint').hidden=$('replyBtn').hidden; };
$('flipBtn').onclick=()=>{const back=$('back').hidden; $('back').hidden=!back; $('front').hidden=back; $('flipBtn').textContent=back?'חזרה לתמונה ↶':'להקדשה שבצד השני ↶';};
$('editBtn').onclick=()=>{ $('creator').hidden=false; $('viewer').hidden=true; $('previewBtn').focus(); };
$('photo').onchange=async()=>{
  $('photo').disabled=true; say(''); photoBlob=null; revokePhoto(); $('photoLabel').textContent='מעבדים את התמונה…'; $('previewBtn').disabled=true; $('publishBtn').disabled=true;
  try{
    const file=$('photo').files[0]; if(!file){$('photoLabel').textContent='＋ בוחרים רגע מהטיול';return;}
    if(file.size>30*1024*1024)throw new Error('בחרו תמונה קטנה מ־30MB.');
    const img=new Image(); const inputUrl=URL.createObjectURL(file);
    try{img.src=inputUrl;await img.decode();}finally{URL.revokeObjectURL(inputUrl);}
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    photoBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
    if(!photoBlob||photoBlob.size>2*1024*1024)throw new Error('לא הצלחנו להקטין את התמונה. נסו תמונה אחרת.');
    photoUrl=URL.createObjectURL(photoBlob);$('photoLabel').textContent='✓ התמונה מוכנה · לחצו להחלפה';
  }catch(e){$('photoLabel').textContent='＋ בוחרים תמונה אחרת';say('לא הצלחנו לקרוא את התמונה. נסו JPEG או PNG. '+e.message);}
  finally{$('photo').disabled=false;$('previewBtn').disabled=false;$('publishBtn').disabled=!endpoint;}
};
function formData(){
  if(!$('createForm').reportValidity())return null;
  if(!photoBlob){say('בחרו תמונה והמתינו לסיום העיבוד.');return null;}
  return Object.fromEntries(['recipient','place','date','message','sender'].map(id=>[id,value(id)]));
}
$('previewBtn').onclick=()=>{const data=formData();if(data){say('');display(data,true);}};
$('createForm').onsubmit=async event=>{
  event.preventDefault(); const data=formData();if(!data||!endpoint)return;
  if(!value('code')){say('הזינו את קוד המשתתפים כדי ליצור גלויה.');$('code').focus();return;}
  $('publishBtn').disabled=true; $('previewBtn').disabled=true; say('יוצרים את הגלויה…');
  try{
    const body=new FormData();body.set('photo',photoBlob,'photo.jpg');body.set('details',JSON.stringify(data));
    creationCode=value('code');
    const result=await (await api('create',{method:'POST',headers:{'x-creation-code':creationCode},body})).json();
    publishedToken=result.token;
    const link=new URL('postcard.html',location.href);link.hash=new URLSearchParams({card:result.token}).toString();
    $('shareUrl').value=link.href;
    $('whatsappBtn').href='https://wa.me/?text='+encodeURIComponent('שלחנו לכם גלויה ממונטנגרו 💌\nזמינה ל־24 שעות\n'+link.href);
    $('expiryText').textContent='הקישור זמין עד '+new Date(result.expiresAt).toLocaleString('he-IL');
    $('creator').hidden=true; $('published').hidden=false; $('viewer').hidden=true; say('');
    $('shareBtn').focus();
  }catch(e){say(e.message);}finally{$('publishBtn').disabled=!endpoint;$('previewBtn').disabled=false;}
};
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('shareUrl').value);say('הקישור הועתק.');}catch{$('shareUrl').select();say('לחצו לחיצה ארוכה על הקישור ובחרו העתקה.');}};
$('shareBtn').onclick=async()=>{if(!navigator.share){$('copyBtn').click();return;}try{await navigator.share({title:'גלויה ממונטנגרו 💌',text:'דרישת שלום מהטיול שלנו · זמינה ל־24 שעות',url:$('shareUrl').value});}catch(e){if(e.name!=='AbortError')say('אפשר לשתף דרך כפתור וואטסאפ או להעתיק את הקישור.');}};
$('deleteBtn').onclick=async()=>{
  if(!confirm('למחוק את הגלויה ולסגור את הקישור?'))return;
  $('deleteBtn').disabled=true;
  try{await api('delete',{method:'DELETE',headers:{'x-creation-code':creationCode,'x-postcard-token':publishedToken}});publishedToken='';creationCode='';unavailable();say('הגלויה נמחקה.');}catch(e){say(e.message);}finally{$('deleteBtn').disabled=false;}
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
    revokePhoto();photoUrl=URL.createObjectURL(blob);display(data,false);say('');tick();expiryTimer=setInterval(tick,1000);
  }catch(e){say('');unavailable(e.status===404||e.status===410);}
}
$('retryBtn').onclick=load;
document.addEventListener('visibilitychange',()=>{if(deadline&&!document.hidden)tick();});
window.addEventListener('pagehide',()=>{if(token){unavailable(false);}});
window.addEventListener('pageshow',event=>{if(token&&event.persisted)load();});
if(token){$('creator').hidden=true; if(/^[a-f0-9]{64}$/.test(token))load();else unavailable();}
else{
  $('setup').hidden=!!endpoint; $('publishBtn').disabled=!endpoint; $('codeLabel').hidden=!endpoint;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Podgorica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('date').value=today;
  let places={};fetch('./widget-data.json').then(r=>r.json()).then(data=>{places=Object.fromEntries(data.days.map(day=>[day.date,day.title]));if(!value('place'))$('place').value=places[today]||'מונטנגרו';}).catch(()=>{$('place').value='מונטנגרו';});
  $('date').onchange=()=>{$('place').value=places[value('date')]||'מונטנגרו';};
}
