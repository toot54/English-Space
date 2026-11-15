let workflowUploads={},workflowAnswers={},workflowStudents={},workflowTrial=null,workflowProfile=null,workflowCommerce={};
function boardDialog(title,html,onSave){
    closePopovers();let dialog=document.getElementById('board-workflow-dialog');if(dialog)dialog.remove();
    dialog=document.createElement('dialog');dialog.id='board-workflow-dialog';dialog.className='board-workflow-dialog';
    dialog.innerHTML=`<form><div class="workflow-heading"><h2>${boardText(title)}</h2><button type="button" aria-label="Закрыть" data-close>×</button></div>${html}<p role="status" id="workflow-status"></p>${onSave?'<button type="submit" class="top-btn workflow-primary">Сохранить</button>':''}</form>`;
    document.body.appendChild(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    if(onSave)dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{if(await onSave(new FormData(event.target)))dialog.close();}catch(_){document.getElementById('workflow-status').textContent='Не сохранено. Проверьте соединение и тариф.';}finally{button.disabled=false;}};
    dialog.showModal();return dialog;
}
function workflowStatus(text){const status=document.getElementById('workflow-status');if(status)status.textContent=text;else setRtcStatus(text);}
async function initBoardWorkflow(){
    if(!boardReady||!auth.currentUser)return;
    document.getElementById('workflow-teacher-tools').hidden=role!=='teacher';
    document.getElementById('workflow-photo-button').hidden=false;
    db.ref(`companionUploads/${ROOM_ID}`).on('value',snap=>{workflowUploads=OrbitaLearning.records(snap.val());document.getElementById('workflow-photo-count').textContent=Object.keys(workflowUploads).length?` (${Object.keys(workflowUploads).length})`:'';},()=>setRtcStatus('Фото с телефона недоступны для этой доски'));
    if(role==='teacher'){
        db.ref(`commerce/accounts/${auth.currentUser.uid}`).on('value',snap=>{workflowCommerce=snap.val()||{};});
        db.ref(`teaching/${auth.currentUser.uid}/boardAnswers/${ROOM_ID}`).on('value',snap=>{workflowAnswers=snap.val()||{};});
        try{const [profile,trial]=(await Promise.all([db.ref(`users/${auth.currentUser.uid}`).once('value'),db.ref(`trials/${auth.currentUser.uid}`).once('value')]));workflowProfile=profile.val()||{};workflowStudents=workflowProfile.students||{};workflowTrial=trial.val();}catch(_){}
    }
}
function workflowOptions(){return Object.values(workflowStudents).map(s=>`<option value="${boardText(s.uid)}">${boardText(s.name)}</option>`).join('');}
async function saveBoardTemplate(){
    if(role!=='teacher'||!boardReady)return;
    if(await flushBoardStateImmediate()===false){setRtcStatus('Сначала восстановите соединение и сохраните доску');return;}
    let snapshot;try{snapshot=(await roomRef.child('snapshot').once('value')).val()||{};}catch(_){setRtcStatus('Не удалось прочитать сохранённую доску. Повторите попытку.');return;}
    const items=(snapshot.items||[]).filter(item=>['subject','essay','sticker','photo','text'].includes(item.type));
    snapshot.items=items;
    boardDialog('Сохранить в библиотеку',`<p>Выберите нужные блоки. Созданные из шаблона занятия будут отдельными. Ответ и ход решения в виджете задачи будут скрыты от ученика.</p><label>Название<input name="title" maxlength="150" value="${boardText(boardTitleParam)}" required></label><label>Предмет<input name="subject" maxlength="80"></label><div class="workflow-blocks">${items.map((item,i)=>`<label><input type="checkbox" name="item" value="${boardText(item.id)}" checked> ${boardText(({subject:subjectDefinitions[item.subjectKind]?.title,essay:'Текст',photo:'Изображение',sticker:'Стикер',text:'Надпись'})[item.type]||'Материал')} ${i+1}</label>`).join('')}</div><label class="workflow-check"><input type="checkbox" name="strokes" checked> Включить рисунки и линии доски</label><p class="workflow-muted">Перед сохранением уберите личные данные и ответы ученика из текстовых блоков. Переписка в шаблон не включается.</p>`,async data=>{
        const selected=data.getAll('item'),parts=OrbitaLearning.templateParts(snapshot,selected);
        if(data.get('strokes'))parts.snapshot.strokeHistory=snapshot.strokeHistory||[];
        const snapshotJson=JSON.stringify(parts.snapshot);if(snapshotJson.length>700000){workflowStatus('Шаблон слишком большой. Уберите часть изображений.');return false;}
        const privateAnswers=Object.fromEntries(Object.entries(workflowAnswers).filter(([id])=>selected.includes(id)));
        const template={title:OrbitaLearning.text(data.get('title'),150),subject:OrbitaLearning.text(data.get('subject'),80),snapshotJson,answers:{...privateAnswers,...parts.answers},createdAt:Date.now()},limit=(OrbitaLearning.paid(workflowProfile,workflowTrial)||OrbitaCommerce.expiry(workflowCommerce)>Date.now())?100:3;
        const result=await db.ref(`teaching/${auth.currentUser.uid}/templates`).transaction(current=>{for(let i=0;i<limit;i++)if(!current?.[i])return {...(current||{}),[i]:template};return undefined;},undefined,false);
        if(!result.committed){workflowStatus('Лимит шаблонов достигнут. Управление библиотекой — в разделе «Обучение».');return false;}
        setRtcStatus('Шаблон сохранён в вашей библиотеке');return true;
    });
}
function showPrivateAnswers(){
    if(role!=='teacher')return;
    const items=Object.entries(workflowAnswers);
    boardDialog('Ответы преподавателя',`<p>Эта панель доступна только вам. Нажмите «Показать на доске», когда ученик будет готов.</p>${items.map(([id,a],i)=>`<article class="workflow-answer"><strong>Задача ${i+1}</strong><p>${boardText([a.solution,a.answer].filter(Boolean).join('\n'))}</p><button type="button" class="top-btn" onclick="revealWorkflowAnswer('${boardText(id)}')">Показать на доске</button></article>`).join('')||'<p>У этой доски нет сохранённых ответов из шаблона.</p>'}`);
}
function revealWorkflowAnswer(id){
    if(role!=='teacher'||!workflowAnswers[id])return;
    const answer=workflowAnswers[id],widget=document.getElementById(id);
    if(widget?.dataset.subjectKind==='problem'){
        for(const key of ['solution','answer']){const input=widget.querySelector(`[data-field="${key}"]`);if(input){input.value=answer[key]||'';broadcastEvent({type:'subject_update',id,key,value:input.value});}}
        saveBoardState();
    }else{const pos=screenToWorld(viewport.clientWidth/2,viewport.clientHeight/2);createSticker({id:'answer-'+Date.now(),left:pos.x,top:pos.y,width:320,height:250,text:[answer.solution,answer.answer].filter(Boolean).join('\n'),theme:'yellow'},true,true);saveBoardState();}
    workflowStatus('Ответ теперь виден участникам на доске');
}
function rememberBoardDifficulty(){
    if(role!=='teacher')return;
    const selected=window.getSelection()?.toString()||'';
    boardDialog('Вернуться к трудности',`<label>Ученик<select name="student" required>${workflowOptions()}</select></label><label>Тема трудности<input name="title" maxlength="150" required></label><label>Пример или ошибка<textarea name="example" maxlength="10000">${boardText(selected)}</textarea></label><label>Объяснение и подсказка<textarea name="explanation" maxlength="10000"></textarea></label>`,async data=>{
        const uid=data.get('student');if(!uid){workflowStatus('Добавьте ученика в кабинете');return false;}
        const value={title:OrbitaLearning.text(data.get('title'),150),example:OrbitaLearning.text(data.get('example')),explanation:OrbitaLearning.text(data.get('explanation')),dueAt:Date.now(),status:'repeat',streak:0,boardId:ROOM_ID};
        const limit=(OrbitaLearning.paid(workflowProfile,workflowTrial)||OrbitaCommerce.expiry(workflowCommerce)>Date.now())?500:10,result=await db.ref(`learning/${auth.currentUser.uid}/${uid}/mistakes`).transaction(current=>{for(let i=0;i<limit;i++)if(!current?.[i])return {...(current||{}),[i]:value};return undefined;},undefined,false);
        if(!result.committed){workflowStatus('Достигнут лимит трудностей. Откройте «Обучение → Повторение».');return false;}return true;
    });
}
function openPhoneCompanion(){
    if(!boardReady)return;
    const url=new URL('phone.html',location.href);url.searchParams.set('room',ROOM_ID);
    const dialog=boardDialog('Фото с телефона',`<p>Отсканируйте QR-код и войдите на телефоне в аккаунт участника урока. Доступ к комнате проверяется после входа.</p><div id="phone-qr" class="workflow-qr"></div><input readonly value="${boardText(url.href)}" aria-label="Ссылка для телефона" onclick="this.select()"><h3>Входящие фотографии</h3><div class="workflow-photos">${Object.entries(workflowUploads).map(([id,upload])=>`<article><img src="${boardText(upload.src)}" alt="Фото решения из тетради"><div>${role==='teacher'?`<button type="button" class="top-btn" onclick="placeCompanionPhoto('${boardText(id)}')">На доску</button>`:''}${role==='teacher'||upload.uid===auth.currentUser.uid?`<button type="button" class="top-btn" onclick="discardCompanionPhoto('${boardText(id)}')">Удалить</button>`:''}</div></article>`).join('')||'<p>Пока нет фотографий. После отправки откройте это окно снова.</p>'}</div>`);
    if(typeof qrcode==='function'){const qr=qrcode(0,'M');qr.addData(url.href);qr.make();dialog.querySelector('#phone-qr').innerHTML=qr.createSvgTag({cellSize:4,margin:12,scalable:true});}
}
async function placeCompanionPhoto(id){
    const photo=workflowUploads[id];if(!photo||role!=='teacher')return;
    const pos=screenToWorld(viewport.clientWidth/2-150,viewport.clientHeight/2-150),itemId='phone-'+photo.createdAt+'-'+id;
    spawnPhotoWidget({id:itemId,left:pos.x,top:pos.y,width:340,height:Math.round(328/photo.aspect)+32,aspect:photo.aspect,src:photo.src},true,true);
    try{if(await flushBoardStateImmediate()===false)throw Error('save');await db.ref(`companionUploads/${ROOM_ID}/${id}`).remove();document.getElementById('board-workflow-dialog').close();}catch(_){workflowStatus('Фото добавлено, но сохранение не подтверждено. Проверьте соединение.');}
}
async function discardCompanionPhoto(id){try{await db.ref(`companionUploads/${ROOM_ID}/${id}`).remove();openPhoneCompanion();}catch(_){workflowStatus('Не удалось удалить фото');}}
async function finishLessonAndReview(){
    if(role!=='teacher'){exitToCabinet();return;}
    try{if(await flushLessonNotes()===false)throw Error('notes');if(await flushBoardStateImmediate()===false)throw Error('board');cleanupWebRTC();
        if(window.parent!==window&&typeof window.parent.finishBoardAndReview==='function'){
            window.parent.finishBoardAndReview(ROOM_ID);
        }else location.href='index.html?finish='+encodeURIComponent(ROOM_ID);
    }catch(_){setRtcStatus('Не удалось сохранить урок. Проверьте соединение перед завершением.');}
}
function togglePenOnly(value){window.orbitaPenOnly=!!value;localStorage.setItem('orbita_pen_only',value?'yes':'no');}
function initWorkflowGestures(){
    window.orbitaPenOnly=localStorage.getItem('orbita_pen_only')==='yes';document.getElementById('workflow-pen-only').checked=window.orbitaPenOnly;
    let last=null;
    const interactive=e=>e.target.closest('input,textarea,button,dialog,.widget,.lesson-notebook-panel');
    viewport.addEventListener('touchstart',e=>{if(e.touches.length!==2||interactive(e)){last=null;return;}cancelBoardGesture();last={x:(e.touches[0].clientX+e.touches[1].clientX)/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2,d:Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)};e.stopImmediatePropagation();},{passive:false,capture:true});
    viewport.addEventListener('touchmove',e=>{if(!last||e.touches.length!==2||interactive(e))return;e.preventDefault();e.stopImmediatePropagation();const x=(e.touches[0].clientX+e.touches[1].clientX)/2,y=(e.touches[0].clientY+e.touches[1].clientY)/2,d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);boardX+=x-last.x;boardY+=y-last.y;const rect=viewport.getBoundingClientRect();if(last.d>0)changeZoom(boardScale*(d/last.d-1),x-rect.left,y-rect.top);applyBoardTransform();last={x,y,d};},{passive:false,capture:true});
    viewport.addEventListener('touchend',()=>{last=null;},true);
}
