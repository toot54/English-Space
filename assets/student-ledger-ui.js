/* Teacher-owned lesson ledger. Payment is always an explicit teacher action. */
const ledgerWrites=new Set();
function studentHistory(student){return OrbitaLedger.history(student,getMergedScheduleList());}
function ledgerCurrency(value){return value.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';}
async function writeLedger(updates){
    if(!currentUser || currentUserData?.role!=='teacher' || isPlatformAdmin)return false;
    try {
        if(db)await db.ref().update(updates);
        for(const [path,value] of Object.entries(updates)){
            const prefix=`users/${currentUser.uid}/`;
            if(!path.startsWith(prefix))continue;
            const keys=path.slice(prefix.length).split('/');let obj=currentUserData;
            for(const key of keys.slice(0,-1))obj=obj[key]??=( {} );
            if(value===null)delete obj[keys.at(-1)];else obj[keys.at(-1)]=value;
        }
        setLocalUserCache(currentUser.uid,currentUserData);renderAllSections();return true;
    } catch(_){showToast('Изменения не сохранены. Проверьте интернет и повторите.');return false;}
}
function syncCompletedLessonHistory(){
    if(!db || demoMode || currentUserData?.role!=='teacher' || isPlatformAdmin)return;
    for(const student of getContactsArray())for(const row of studentHistory(student)){
        if(!row.automatic || student.lessonHistory?.[row.id])continue;
        const path=`users/${currentUser.uid}/students/${student.uid}/lessonHistory/${row.id}`;
        if(ledgerWrites.has(path))continue;
        ledgerWrites.add(path);
        db.ref(path).transaction(existing=>existing||row,undefined,false)
            .catch(()=>showToast('История пока не синхронизирована. Проверьте интернет.'))
            .finally(()=>ledgerWrites.delete(path));
    }
}
async function completeScheduledLesson(scheduleId){
    const lesson=getMergedScheduleList().find(s=>s.id===scheduleId);
    if(!lesson || lesson.cancelled || currentUserData?.role!=='teacher')return;
    const student=currentUserData.students?.[lesson.studentUid];if(!student)return;
    const id='scheduled_'+scheduleId, row=student.lessonHistory?.[id]||{
        id,scheduleId,date:lesson.date,time:lesson.time,topic:lesson.topic,
        amount:OrbitaLedger.money(lesson.lessonPrice)??OrbitaLedger.price(student),paid:false
    };
    const updates={
        [`users/${currentUser.uid}/students/${student.uid}/lessonHistory/${id}`]:row,
        [`users/${currentUser.uid}/schedule/${scheduleId}/completed`]:true,
        [`boards/${getPairKey(student.uid)}/schedule/${scheduleId}/completed`]:true
    };
    if(await writeLedger(updates))showToast('Урок в истории. Оплату отметьте после получения денег.');
}
function renderCabinetSection(){
    const students=getContactsArray();
    const active=students.find(s=>s.uid===activeCabinetStudentUid)||students[0];
    if(active)activeCabinetStudentUid=active.uid;
    const totals=OrbitaLedger.totals(students,getMergedScheduleList());
    document.getElementById('cabinet-kpi-row').innerHTML=[
        ['Ученики',students.length,'В вашем кабинете'],
        ['План на этот месяц',ledgerCurrency(totals.forecast),'Проведённые и запланированные занятия'],
        ['Оплачено по истории',ledgerCurrency(totals.paid),'Только отмеченные вами занятия'],
        ['Ожидают оплаты',ledgerCurrency(totals.unpaid),'Проведённые неоплаченные занятия']
    ].map(([label,value,caption])=>`<div class="kpi-card"><span class="kpi-label">${label}</span><div class="kpi-val font-mono">${value}</div><small class="ledger-caption">${caption}</small></div>`).join('');
    const roster=document.getElementById('cabinet-students-roster');
    roster.innerHTML=students.map(s=>`<button class="st-roster-item ledger-student ${active?.uid===s.uid?'active':''}" onclick="selectLedgerStudent('${escAttr(s.uid)}')"><span class="avatar">${renderAvatarHtml(s.name,s.avatar)}</span><span><span class="row-title">${escHtml(s.name)}</span><span class="row-sub">${OrbitaLedger.price(s)===null?'Цена не задана':ledgerCurrency(OrbitaLedger.price(s))+' / урок'}</span></span></button>`).join('')||'<div class="empty-box">Пригласите первого ученика</div>';
    const dossier=document.getElementById('cabinet-student-dossier');
    if(!active){dossier.innerHTML='<div class="empty-box">Здесь появятся занятия и оплаты ваших учеников</div>';return;}
    // Realtime presence/payment events must not replace a field being edited.
    if(dossier.dataset.student===active.uid && dossier.contains(document.activeElement) && document.activeElement.matches('input,textarea'))return;
    dossier.dataset.student=active.uid;
    const rows=studentHistory(active),paid=rows.filter(h=>h.paid).reduce((sum,h)=>sum+OrbitaLedger.amount(h,active),0);
    dossier.innerHTML=`<div class="ledger-person"><div><span class="eyebrow">КАРТОЧКА УЧЕНИКА</span><h2>${escHtml(active.name)}</h2><p>${escHtml(active.goal||'Индивидуальные занятия')}</p></div><div class="ledger-actions"><button class="btn btn-jade btn-sm" onclick="openEnterClassModal('${escAttr(active.uid)}')">В класс ↗</button><button class="btn btn-sm" onclick="activeChatPeerUid='${escAttr(active.uid)}';switchSection('messages')">Чат</button><button class="btn btn-icon" aria-label="Удалить ученика" onclick="requestDeleteStudent('${escAttr(active.uid)}','${escAttr(active.name)}')">✕</button></div></div>
    <div class="ledger-pricing"><div><label class="field-label" for="st-sub-price-input">Стоимость одного занятия, ₽</label><div class="ledger-price-input"><input id="st-sub-price-input" class="field-input font-mono" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Например, 300" value="${OrbitaLedger.price(active)??''}"><button class="btn btn-jade btn-sm" onclick="saveStudentSubscriptionPrice('${escAttr(active.uid)}')">Сохранить</button></div><small>Для каждого ученика — своя цена. Стоимость записанных уроков сохраняется отдельно.</small></div><div><span class="field-label">Оплачено этим учеником</span><strong class="ledger-total">${ledgerCurrency(paid)}</strong><small>${rows.filter(h=>h.paid).length} из ${rows.length} занятий</small></div></div>
    <details class="ledger-notes"><summary>Заметки преподавателя</summary><textarea class="form-textarea" aria-label="Заметки преподавателя" placeholder="Цели, прогресс, договорённости…" onblur="saveStudentDiaryNotes('${escAttr(active.uid)}',this.value)">${escHtml(active.teacherNotes||'')}</textarea></details>
    <div class="ledger-history-head"><div><h3>История занятий</h3><small>Занятия появляются после окончания по расписанию. Оплату отмечаете вы.</small></div><button class="btn btn-sm" onclick="addManualHistoryLesson('${escAttr(active.uid)}')">+ Занятие</button></div>
    <div class="ledger-history">${rows.map(h=>`<article class="ledger-row"><div><span class="ledger-date">${escHtml(formatHumanDate(h.date,h.time))}</span><strong>${escHtml(h.topic||'Занятие')}</strong><small>Завершено${h.automatic?' · из расписания':''}</small></div><div class="ledger-row-actions"><button class="ledger-amount" title="Изменить цену этого занятия" onclick="editHistoryAmount('${escAttr(active.uid)}','${escAttr(h.id)}')">${OrbitaLedger.money(h.amount)===null && OrbitaLedger.price(active)===null?'Указать цену':ledgerCurrency(OrbitaLedger.amount(h,active))} ✎</button><button class="btn ${h.paid?'btn-jade':'btn-sm'}" onclick="toggleHistoryLessonPaid('${escAttr(active.uid)}','${escAttr(h.id)}')">${h.paid?'✓ Оплачено':'Отметить оплату'}</button><button class="btn btn-icon" aria-label="Удалить занятие" onclick="deleteHistoryLesson('${escAttr(active.uid)}','${escAttr(h.id)}')">✕</button></div></article>`).join('')||'<div class="empty-box">После первого занятия здесь появится история. Можно добавить прошедший урок вручную.</div>'}</div>`;
}
function selectLedgerStudent(uid){activeCabinetStudentUid=uid;document.activeElement?.blur();renderCabinetSection();}
async function saveStudentSubscriptionPrice(uid){
    const input=document.getElementById('st-sub-price-input'),value=Number(input.value);
    if(input.value.trim()==='' || OrbitaLedger.money(value)===null){showToast('Укажите цену от 0 ₽');return;}
    const student=currentUserData.students?.[uid];if(!student)return;
    const updates={[`users/${currentUser.uid}/students/${uid}/lessonPrice`]:OrbitaLedger.money(value)};
    // Preserve old amounts before changing the price for future lessons.
    for(const row of studentHistory(student))if(OrbitaLedger.money(row.amount)===null && OrbitaLedger.price(student)!==null){
        updates[`users/${currentUser.uid}/students/${uid}/lessonHistory/${row.id}`]={...row,amount:OrbitaLedger.price(student)};
    }
    for(const lesson of getMergedScheduleList())if(lesson.studentUid===uid && !lesson.completed && OrbitaLedger.endTime(lesson)>Date.now()){
        updates[`users/${currentUser.uid}/schedule/${lesson.id}/lessonPrice`]=OrbitaLedger.money(value);
        updates[`boards/${getPairKey(uid)}/schedule/${lesson.id}/lessonPrice`]=OrbitaLedger.money(value);
    }
    if(await writeLedger(updates))showToast('Цена сохранена для будущих занятий. История не изменена.');
}

function exportLessonLedger(){
    if(currentUserData?.role!=='teacher' || isPlatformAdmin)return;
    const rows=[['Ученик','Дата','Время','Тема','Стоимость, ₽','Оплата']];
    for(const student of getContactsArray())for(const row of studentHistory(student))rows.push([student.name,row.date,row.time,row.topic,OrbitaLedger.amount(row,student),row.paid?'Оплачено':'Ожидает оплаты']);
    const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Орбита — история занятий.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function toggleHistoryLessonPaid(uid,id){
    const student=currentUserData.students?.[uid],row=student && studentHistory(student).find(h=>h.id===id);
    if(!row || ledgerWrites.has(id))return;
    if(OrbitaLedger.money(row.amount)===null && OrbitaLedger.price(student)===null){editHistoryAmount(uid,id);showToast('Сначала укажите стоимость занятия');return;}
    ledgerWrites.add(id);
    await writeLedger({[`users/${currentUser.uid}/students/${uid}/lessonHistory/${id}`]:{...row,amount:OrbitaLedger.amount(row,student),paid:!row.paid,paidAt:row.paid?null:Date.now()}});
    ledgerWrites.delete(id);
}
function openLedgerDialog(title,fields,onSave){
    let dialog=document.getElementById('ledger-dialog');if(dialog)dialog.remove();
    dialog=document.createElement('dialog');dialog.id='ledger-dialog';dialog.className='ledger-dialog';
    dialog.innerHTML=`<form><h2>${escHtml(title)}</h2>${fields}<div class="ledger-actions"><button type="button" class="btn" data-cancel>Отмена</button><button class="btn btn-jade" type="submit">Сохранить</button></div></form>`;
    document.body.appendChild(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{if(await onSave(new FormData(event.target)))dialog.close();}finally{button.disabled=false;}};
    dialog.showModal();
}
function addManualHistoryLesson(uid){
    const student=currentUserData.students?.[uid];if(!student)return;
    const date=new Date(),iso=formatIsoDate(date.getFullYear(),date.getMonth()+1-1,date.getDate());
    openLedgerDialog('Прошедшее занятие',`<label>Тема<input class="field-input" name="topic" required value="Занятие"></label><label>Дата<input class="field-input" type="date" name="date" required value="${iso}" max="${iso}"></label><label>Время<input class="field-input" type="time" name="time" required value="12:00"></label><label>Цена занятия, ₽<input class="field-input" type="number" name="amount" min="0" step="0.01" required value="${OrbitaLedger.price(student)??''}"></label>`,async data=>{
        const id='manual_'+Date.now();return writeLedger({[`users/${currentUser.uid}/students/${uid}/lessonHistory/${id}`]:{id,topic:data.get('topic').trim(),date:data.get('date'),time:data.get('time'),amount:Number(data.get('amount')),paid:false}});
    });
}
function editHistoryAmount(uid,id){
    const student=currentUserData.students?.[uid],row=student && studentHistory(student).find(h=>h.id===id);if(!row)return;
    openLedgerDialog('Цена этого занятия',`<p>${escHtml(row.topic)}</p><label>Стоимость, ₽<input class="field-input" name="amount" type="number" min="0" step="0.01" required value="${OrbitaLedger.money(row.amount)??OrbitaLedger.price(student)??''}"></label>`,data=>writeLedger({[`users/${currentUser.uid}/students/${uid}/lessonHistory/${id}`]:{...row,amount:Number(data.get('amount'))}}));
}
function deleteHistoryLesson(uid,id){
    const student=currentUserData.students?.[uid],row=student && studentHistory(student).find(h=>h.id===id);if(!row)return;
    askConfirmDelete('Удалить занятие из истории?','Оно будет исключено из доходов и оплат и не появится повторно из расписания.',async()=>{
        const updates={[`users/${currentUser.uid}/students/${uid}/lessonHistory/${id}`]:{...row,voided:true,paid:false}};
        const lesson=getMergedScheduleList().find(s=>s.id===row.scheduleId || (!row.scheduleId && s.studentUid===uid && s.date===row.date && s.time===row.time && s.topic===row.topic));
        if(lesson){updates[`users/${currentUser.uid}/schedule/${lesson.id}/cancelled`]=true;updates[`boards/${getPairKey(uid)}/schedule/${lesson.id}/cancelled`]=true;}
        if(await writeLedger(updates))showToast('Занятие удалено из истории и расчётов');
    });
}
function showLowBalanceStudentsPanel(){switchSection('cabinet');showToast('Задолженность показана в истории каждого ученика');}
