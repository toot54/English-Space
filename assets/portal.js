/* Shared authentication for family reports and authenticated phone uploads. */
const portalParams=new URLSearchParams(location.search),portalMode=document.body.dataset.portal;
let portalUser=null,portalDb=null,portalAuth=null,portalReady=null,portalImage=null,portalFamilyRef=null;
const portalEsc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function portalMessage(text){document.getElementById('portal-message').textContent=text;}
function portalInit(){
    if(typeof firebase==='undefined'){portalMessage('Не удалось загрузить вход. Проверьте интернет и обновите страницу.');return;}
    firebase.initializeApp(ORBItA_FIREBASE_CONFIG);portalAuth=firebase.auth();portalDb=firebase.database();
    portalAuth.languageCode='ru';
    portalAuth.onAuthStateChanged(async user=>{
        portalUser=user;document.getElementById('portal-content').innerHTML='';
        document.getElementById('portal-auth').hidden=!!user;document.getElementById('portal-verify').hidden=!user||user.emailVerified;
        document.getElementById('portal-logout').hidden=!user;
        if(!user){portalMessage('Войдите в свой аккаунт, чтобы продолжить.');return;}
        if(user.uid===OrbitaAccess.ADMIN_UID){location.replace('index.html');return;}
        if(!user.emailVerified){portalMessage('Подтвердите почту '+user.email+' перед продолжением.');return;}
        portalMessage('');if(portalMode==='family')loadFamilyInvite();else loadPhoneRoom();
    });
}
async function portalLogin(event){
    event.preventDefault();const data=new FormData(event.target),button=event.submitter;
    button.disabled=true;
    try{
        const email=String(data.get('email')).trim(),password=String(data.get('password'));
        if(button.value==='register'){const result=await portalAuth.createUserWithEmailAndPassword(email,password);await result.user.sendEmailVerification();portalMessage('Письмо отправлено. Откройте ссылку в письме.');}
        else await portalAuth.signInWithEmailAndPassword(email,password);
    }catch(error){portalMessage(error.code==='auth/email-already-in-use'?'Аккаунт уже существует. Нажмите «Войти».':error.code==='auth/weak-password'?'Пароль должен содержать не меньше 6 символов.':'Не удалось войти. Проверьте почту, пароль и соединение.');}
    finally{button.disabled=false;}
}
async function portalGoogle(){try{await portalAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());}catch(_){portalMessage('Вход Google не завершён. Попробуйте вход по почте.');}}
async function portalVerify(send){
    try{if(send){await portalAuth.currentUser.sendEmailVerification();portalMessage('Письмо отправлено. Проверьте входящие и «Спам».');}else{await portalAuth.currentUser.reload();if(portalAuth.currentUser.emailVerified){await portalAuth.currentUser.getIdToken(true);location.reload();}else portalMessage('Почта пока не подтверждена. Откройте ссылку в письме.');}}catch(_){portalMessage('Не удалось выполнить действие. Попробуйте немного позже.');}
}
async function portalResetPassword(){const email=document.getElementById('portal-email').value.trim();if(!email){portalMessage('Укажите почту в форме');return;}try{await portalAuth.sendPasswordResetEmail(email);portalMessage('Если аккаунт существует, письмо для восстановления отправлено.');}catch(_){portalMessage('Не удалось отправить письмо. Попробуйте позже.');}}
async function portalLogout(){if(portalFamilyRef)portalFamilyRef.off();await portalAuth.signOut();}
async function loadFamilyInvite(){
    const token=portalParams.get('invite'),content=document.getElementById('portal-content');
    if(!token){content.innerHTML='<article class="learning-card"><h2>Откройте приглашение преподавателя</h2><p>Для доступа нужна персональная ссылка, привязанная к вашей почте.</p></article>';return;}
    if(!/^[A-Za-z0-9_-]{20,128}$/.test(token)){portalMessage('Некорректная ссылка приглашения');return;}
    try{
        const invite=(await portalDb.ref('familyInvites/'+token).once('value')).val();
        if(!invite||invite.email!==portalUser.email){portalMessage('Приглашение недоступно для этой почты. Войдите с адресом, который указал преподаватель.');return;}
        portalReady={...invite,token};
        const access=(await portalDb.ref(`guardianAccess/${invite.teacherUid}/${invite.studentUid}/${portalUser.uid}`).once('value')).val();
        if(access?.inviteToken===token){showFamilyReports();return;}
        if(invite.expiresAt<Date.now()){portalMessage('Срок приглашения истёк. Попросите преподавателя создать новую ссылку.');return;}
        content.innerHTML='<article class="learning-card"><h2>Приглашение к отчётам об обучении</h2><p>Вы сможете видеть опубликованные итоги и навыки ученика. Переписка и личные заметки преподавателя недоступны.</p><button class="btn btn-jade" onclick="acceptFamilyInvite()">Принять приглашение</button></article>';
    }catch(_){portalMessage('Приглашение недоступно. Проверьте почту аккаунта и уточните у преподавателя, действует ли ссылка.');}
}
async function acceptFamilyInvite(){
    if(!portalReady)return;
    try{await portalDb.ref(`guardianAccess/${portalReady.teacherUid}/${portalReady.studentUid}/${portalUser.uid}`).set({inviteToken:portalReady.token});showFamilyReports();}catch(_){portalMessage('Не удалось принять приглашение. Возможно, его срок истёк или доступ отозван.');}
}
function showFamilyReports(){
    if(portalFamilyRef)portalFamilyRef.off();
    portalFamilyRef=portalDb.ref(`familyReports/${portalReady.teacherUid}/${portalReady.studentUid}`);
    portalFamilyRef.on('value',snap=>{
        const reports=Object.values(snap.val()||{}).sort((a,b)=>b.month.localeCompare(a.month));
        document.getElementById('portal-content').innerHTML=reports.length?`<button class="btn no-print" onclick="window.print()">Распечатать / сохранить PDF</button>`+reports.map(report=>`<article class="learning-card learning-report"><header><span class="learning-badge">${portalEsc(report.month)}</span><h2>${portalEsc(report.studentName)}</h2><p>${portalEsc(report.teacherName)} · обновлено ${new Date(report.publishedAt).toLocaleDateString('ru-RU')}</p></header><p class="learning-text">${portalEsc(report.comment)}</p><h3>Навыки</h3>${Object.values(report.skills||{}).map(s=>`<div class="learning-skill"><div><strong>${portalEsc(s.title)}</strong><p>${{learning:'Разбираем',hint:'С подсказкой',independent:'Самостоятельно'}[s.status]||''}</p><p>${portalEsc(s.evidence)}</p></div></div>`).join('')||'<p>Отметки ещё не опубликованы.</p>'}<h3>Занятия за месяц</h3>${Object.values(report.lessons||{}).map(s=>`<details><summary>${portalEsc(s.date)} · ${portalEsc(s.topic)}</summary>${[['Разобрали',s.summary],['Главное',s.rules],['Домашняя работа',s.homework],['Следующий шаг',s.next]].filter(v=>v[1]).map(([label,value])=>`<strong>${label}</strong><p class="learning-text">${portalEsc(value)}</p>`).join('')}</details>`).join('')||'<p>Опубликованных итогов пока нет.</p>'}${report.billing?`<div class="learning-help">Занятий: ${Number(report.billing.lessons)} · Стоимость: ${Number(report.billing.total).toLocaleString('ru-RU')} ₽ · Отмечено оплаченным: ${Number(report.billing.paid).toLocaleString('ru-RU')} ₽</div>`:''}</article>`).join(''):'<article class="learning-card"><h2>Доступ открыт</h2><p>Здесь появится отчёт, когда преподаватель его опубликует.</p></article>';
    },()=>{document.getElementById('portal-content').innerHTML='';portalMessage('Доступ к отчётам закрыт или временно недоступен. Уточните у преподавателя.');});
}
async function loadPhoneRoom(){
    const room=portalParams.get('room');if(!room||!/^[A-Za-z0-9_-]{1,160}$/.test(room)){portalMessage('Откройте QR-код из меню доски «Фото с телефона».');return;}
    try{
        await portalDb.ref(`boards/${room}/participants`).once('value');portalReady={room};
        document.getElementById('portal-content').innerHTML='<article class="learning-card"><h2>Бумажная тетрадь → доска урока</h2><p>Сфотографируйте решение целиком, при хорошем свете. Фото появится во входящих на доске, преподаватель выберет, куда его разместить.</p><label class="btn">Сделать фото или выбрать изображение<input id="phone-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="preparePhonePhoto(this.files[0])"></label><img id="phone-preview" class="portal-preview" alt="Предпросмотр фотографии" hidden><button id="phone-send" class="btn btn-jade" disabled onclick="sendPhonePhoto()">Отправить на доску</button><p class="learning-muted">Изображение уменьшается на устройстве. До отправки его видите только вы. Не добавляйте документы и личные данные, не относящиеся к уроку.</p></article>';
    }catch(_){portalMessage('У этого аккаунта нет доступа к доске. Войдите как участник урока или попросите преподавателя выдать доступ.');}
}
async function preparePhonePhoto(file){
    portalImage=null;document.getElementById('phone-send').disabled=true;
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){portalMessage('Выберите JPG, PNG или WebP размером до 12 МБ.');return;}
    const url=URL.createObjectURL(file),img=new Image();
    try{
        await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
        const canvas=document.createElement('canvas');let scale=Math.min(1,1600/Math.max(img.width,img.height)),src='';
        for(let n=0;n<5;n++){canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);src=canvas.toDataURL('image/jpeg',.78);if(src.length<=600000)break;scale*=.75;}
        if(src.length>600000)throw Error('size');
        portalImage={src,aspect:canvas.width/canvas.height};const preview=document.getElementById('phone-preview');preview.src=src;preview.hidden=false;document.getElementById('phone-send').disabled=false;portalMessage('Фото подготовлено. Проверьте читаемость и нажмите «Отправить».');
    }catch(_){portalMessage('Не удалось подготовить фото. Попробуйте другое изображение.');}finally{URL.revokeObjectURL(url);}
}
async function sendPhonePhoto(){
    if(!portalImage||!portalReady||!portalUser)return;
    const button=document.getElementById('phone-send');button.disabled=true;
    try{let sent=false;for(let slot=0;slot<8;slot++){const result=await portalDb.ref(`companionUploads/${portalReady.room}/${slot}`).transaction(current=>current?undefined:{...portalImage,uid:portalUser.uid,createdAt:Date.now()},undefined,false);if(result.committed){sent=true;break;}}if(!sent)throw Error('full');portalImage=null;portalMessage('Фото отправлено. Преподаватель увидит его во входящих на доске.');}
    catch(_){button.disabled=false;portalMessage('Фото не отправлено. Проверьте интернет; во входящих доски может быть максимум 8 фотографий.');}
}
document.addEventListener('DOMContentLoaded',portalInit);
