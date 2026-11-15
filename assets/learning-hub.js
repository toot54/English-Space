/* Lesson workflow. Private drafts/answers never enter learner or family views. */
let learningPrivate={},learningShared={},learningSlots={},learningRequests={},learningTrial=null;
let learningTab='lessons',learningStudent='',learningStarted=false,learningTimer=null;
const learningSubscriptions=new Set(),learningNotified=new Set();
const L=()=>OrbitaLearning;
const learningTeacher=()=>currentUserData?.role==='teacher'&&!isPlatformAdmin;
const learningPro=()=>demoMode||L().paid(currentUserData,learningTrial)||OrbitaCommerce.expiry(myCommerce)>Date.now();
function needPractice(){if(learningPro())return true;openTariffsModal();showToast('Эта автоматизация доступна в «Практике» и пробном периоде');return false;}
function learningId(){return L().key();}
async function createLearningSlot(path,limit,value){
    if(demoMode||!db)return false;
    let allocated=null;
    try{
        const result=await db.ref(path).transaction(current=>{
            allocated=null;for(let i=0;i<limit;i++)if(!current?.[i]){allocated=String(i);return {...(current||{}),[i]:value};}
            return undefined;
        },undefined,false);
        if(!result.committed){showToast('Достигнут лимит. Удалите ненужные материалы или подключите «Практику».');return false;}
        return allocated;
    }catch(_){showToast('Не сохранено. Проверьте соединение и доступ по тарифу.');return false;}
}
function learningOptions(selected=''){return getContactsArray().map(s=>`<option value="${escAttr(s.uid)}" ${s.uid===selected?'selected':''}>${escHtml(s.name)}</option>`).join('');}
function learningField(name,label,value='',type='textarea'){
    return `<label>${escHtml(label)}${type==='textarea'?`<textarea class="form-textarea" name="${name}" maxlength="10000">${escHtml(value)}</textarea>`:`<input class="field-input" name="${name}" type="${type}" value="${escAttr(String(value))}" ${['date','time','email'].includes(type)?'required':''}>`}</label>`;
}
async function learningWrite(updates){
    if(demoMode){showToast('В демо изменения не сохраняются');return false;}
    if(!db||!currentUser||isPlatformAdmin)return false;
    try{await db.ref().update(updates);return true;}catch(_){showToast('Не сохранено. Проверьте соединение, доступ и лимит тарифа.',6000);return false;}
}
function subscribeLearning(path,receive){
    if(learningSubscriptions.has(path))return;learningSubscriptions.add(path);
    db.ref(path).on('value',snap=>{receive(snap.val()||{});renderLearningHub();},()=>showToast('Не удалось загрузить учебные материалы. Проверьте соединение.'));
}
async function initLearningHub(){
    if(isPlatformAdmin||!currentUserData||demoMode)return;
    if(!learningStarted){
        learningStarted=true;
        if(learningTeacher()){
            subscribeLearning(`teaching/${currentUser.uid}`,v=>{learningPrivate={...v,templates:L().records(v.templates)};});
            subscribeLearning(`availability/${currentUser.uid}`,v=>{learningSlots[currentUser.uid]={...v,slots:L().records(v.slots)};});
            subscribeLearning(`rescheduleRequests/${currentUser.uid}`,v=>{learningRequests=v;});
            try{
                const trialRef=db.ref(`trials/${currentUser.uid}`);
                let snap=await trialRef.once('value');
                if(!snap.exists()){await trialRef.set(firebase.database.ServerValue.TIMESTAMP);snap=await trialRef.once('value');}
                learningTrial=snap.val();renderLearningHub();
            }catch(_){showToast('Пробный доступ пока не активирован. Проверьте соединение.');}
        }
        learningTimer=setInterval(checkLessonReminders,30000);
        const room=new URLSearchParams(location.search).get('finish');
        if(room){switchSection('learning');const lesson=getMergedScheduleList().filter(s=>s.boardId===room).sort((a,b)=>Math.abs(L().startTime(a)-Date.now())-Math.abs(L().startTime(b)-Date.now()))[0];if(lesson)openLessonReview(lesson.id);}
    }
    for(const peer of getContactsArray()){
        const teacher=learningTeacher()?currentUser.uid:peer.uid,student=learningTeacher()?peer.uid:currentUser.uid;
        subscribeLearning(`learning/${teacher}/${student}`,v=>{learningShared[peer.uid]={...v,mistakes:L().records(v.mistakes)};});
        if(!learningTeacher())subscribeLearning(`availability/${teacher}`,v=>{learningSlots[teacher]={...v,slots:L().records(v.slots)};});
    }
}
function setLearningTab(tab){learningTab=tab;renderLearningHub();}
function reviewFinishedBoard(room){const lesson=getMergedScheduleList().filter(s=>s.boardId===room).sort((a,b)=>Math.abs(L().startTime(a)-Date.now())-Math.abs(L().startTime(b)-Date.now()))[0];if(lesson)openLessonReview(lesson.id);else showToast('Доска сохранена. Добавьте её в расписание, чтобы опубликовать итог занятия.');}
function finishBoardAndReview(room){closeBoardRoom();switchSection('learning');reviewFinishedBoard(room);}
function preparePaymentReminder(uid){
    const student=currentUserData.students?.[uid];if(!student||!learningTeacher())return;
    const rows=studentHistory(student).filter(s=>!s.paid),amount=rows.reduce((sum,s)=>sum+OrbitaLedger.amount(s,student),0);
    if(!rows.length){showToast('Неоплаченных занятий нет');return;}
    openLedgerDialog('Напоминание об оплате',`<p>Проверьте текст. Он будет отправлен только в чат выбранного ученика после нажатия «Сохранить».</p>`+learningField('text','Сообщение',`Здравствуйте, ${student.name}! По истории ожидается оплата за ${rows.length} занятий: ${ledgerCurrency(amount)}. Если вы уже оплатили, сообщите, пожалуйста.`),async data=>{
        const id='reminder_'+learningId();if(await learningWrite({[`boards/${getPairKey(uid)}/chats/${id}`]:{id,text:L().text(data.get('text')),senderUid:currentUser.uid,ts:Date.now()}})){showToast('Напоминание отправлено в чат ученика');return true;}return false;
    });
}
function renderLearningHub(){
    const root=document.getElementById('learning-content');if(!root||isPlatformAdmin||currentSection!=='learning')return;
    if(root.contains(document.activeElement)&&document.activeElement?.matches('input,textarea'))return;
    const teacher=learningTeacher(),tabs=teacher?[['lessons','Уроки'],['templates','Библиотека'],['review','Повторение'],['organize','Организация'],['progress','Прогресс']]:[['lessons','Мои уроки'],['review','Повторение'],['organize','Расписание и переносы'],['progress','Мой прогресс']];
    if(!tabs.some(t=>t[0]===learningTab))learningTab='lessons';
    root.innerHTML=`<div class="learning-intro"><div><span class="eyebrow">ОТ ПЕРВОЙ ЗАДАЧИ ДО РЕЗУЛЬТАТА</span><h1 class="page-h1">${teacher?'Обучение':'Мои занятия'}</h1><p>${teacher?'Материалы, итоги и следующий шаг — в одном месте.':'Возвращайтесь к объяснениям, заданиям и своему прогрессу.'}</p></div>${teacher?`<button class="btn" onclick="openTariffsModal()">${learningPro()?'Практика доступна':'Старт · бесплатно'}</button>`:''}</div><div class="learning-tabs">${tabs.map(([id,label])=>`<button class="folder-chip ${learningTab===id?'active':''}" onclick="setLearningTab('${id}')">${label}</button>`).join('')}</div><div class="learning-scope"><label>${teacher?'Ученик':'Преподаватель'} <select class="form-select" aria-label="Участник обучения" onchange="learningStudent=this.value;renderLearningHub()"><option value="">Все</option>${learningOptions(learningStudent)}</select></label></div><div id="learning-stage"></div>`;
    const stage=document.getElementById('learning-stage');
    if(learningTab==='lessons')stage.innerHTML=renderLearningLessons();
    else if(learningTab==='templates')stage.innerHTML=renderLearningTemplates();
    else if(learningTab==='review')stage.innerHTML=renderLearningMistakes();
    else if(learningTab==='organize')stage.innerHTML=renderLearningOrganization();
    else stage.innerHTML=renderLearningProgress();
}
function learningPeers(){return getContactsArray().filter(s=>!learningStudent||s.uid===learningStudent);}
function renderLearningLessons(){
    if(learningTeacher()){
        const rows=getMergedScheduleList().filter(s=>!learningStudent||s.studentUid===learningStudent).sort((a,b)=>L().startTime(b)-L().startTime(a));
        return `<div class="learning-help">Перед уроком откройте предыдущий итог. После урока проверьте конспект и опубликуйте задание для ученика.</div><div class="learning-cards">${rows.map(s=>{const published=learningShared[s.studentUid]?.lessons?.[s.id];return `<article class="learning-card"><span class="learning-badge">${published?'Итог опубликован':'Готовим занятие'}</span><h3>${escHtml(s.topic)}</h3><p>${escHtml(s.studentName)} · ${escHtml(formatHumanDate(s.date,s.time))}</p>${published?`<p class="learning-excerpt">Следующий шаг: ${escHtml(published.next||'Не указан')}</p>`:''}<div class="ledger-actions"><button class="btn btn-jade" onclick="openLessonReview('${escAttr(s.id)}')">${published?'Посмотреть итог':'Подготовить / завершить'}</button><button class="btn" onclick="openBoardRoom('${escAttr(s.boardId)}')">Доска ↗</button></div></article>`;}).join('')||'<div class="empty-box">Добавьте занятие в расписание или создайте его из шаблона в библиотеке.</div>'}</div>`;
    }
    return learningPeers().map(peer=>{const lessons=Object.values(learningShared[peer.uid]?.lessons||{}).sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<h3 class="learning-section-title">${escHtml(peer.name)}</h3><div class="learning-cards">${lessons.map(s=>`<article class="learning-card"><span class="learning-badge">${escHtml(formatHumanDate(s.date,s.time))}</span><h3>${escHtml(s.topic)}</h3>${lessonPublicHtml(s)}<button class="btn" onclick="openBoardRoom('${escAttr(s.boardId)}')">Материалы на доске ↗</button><button class="btn" onclick="answerLesson('${escAttr(peer.uid)}','${escAttr(s.id)}')">Мой ответ на домашнее задание</button></article>`).join('')||'<div class="empty-box">Здесь появятся итоги, которые опубликует преподаватель.</div>'}</div>`;}).join('');
}
function lessonPublicHtml(s){return [['Разобрали',s.summary],['Главное',s.rules],['Домашнее задание',s.homework],['Следующий шаг',s.next]].filter(x=>x[1]).map(([label,value])=>`<div class="learning-text"><strong>${label}</strong><p>${escHtml(value)}</p></div>`).join('');}
async function openLessonReview(id){
    const lesson=getMergedScheduleList().find(s=>s.id===id);if(!learningTeacher()||!lesson)return;
    let notes={};try{notes=(await db.ref(`boards/${lesson.boardId}/lessonNotes`).once('value')).val()||{};}catch(_){}
    const existing=learningPrivate.drafts?.[id]||learningShared[lesson.studentUid]?.lessons?.[id]||{};
    const earlier=Object.values(learningShared[lesson.studentUid]?.lessons||{}).filter(s=>s.id!==id&&s.date<=lesson.date).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))[0];
    const answer=learningShared[lesson.studentUid]?.submissions?.[id]?.text;
    openLedgerDialog(lesson.topic,`<p>${escHtml(lesson.studentName)} · ${escHtml(formatHumanDate(lesson.date,lesson.time))}</p>${earlier?.next?`<div class="learning-help">С прошлого занятия: ${escHtml(earlier.next)}</div>`:''}${answer?`<details><summary>Ответ ученика</summary><p class="learning-text">${escHtml(answer)}</p></details>`:''}${learningField('summary','Что разобрали',existing.summary??notes.summary??'')}${learningField('rules','Главная идея и правила',existing.rules??notes.rules??'')}${learningField('homework','Домашнее задание',existing.homework||'')}${learningField('next','Следующий шаг',existing.next??notes.next??'')}<label>Действие<select class="form-select" name="action"><option value="draft">Сохранить черновик — только для меня</option><option value="publish">Завершить урок и опубликовать ученику</option></select></label><p class="learning-muted">Оплата не отмечается автоматически. Личные заметки из карточки ученика сюда не попадают.</p>`,async data=>{
        const publicData={id,topic:lesson.topic,date:lesson.date,time:lesson.time,boardId:lesson.boardId,summary:L().text(data.get('summary')),rules:L().text(data.get('rules')),homework:L().text(data.get('homework')),next:L().text(data.get('next')),updatedAt:Date.now()};
        const updates={[`teaching/${currentUser.uid}/drafts/${id}`]:publicData};
        if(data.get('action')==='publish'){
            if(!publicData.summary&&!publicData.homework){showToast('Добавьте итог или домашнее задание');return false;}
            const student=currentUserData.students[lesson.studentUid],historyId='scheduled_'+id;
            const row=student.lessonHistory?.[historyId]||{id:historyId,scheduleId:id,date:lesson.date,time:lesson.time,topic:lesson.topic,paid:false,amount:OrbitaLedger.money(lesson.lessonPrice)??OrbitaLedger.price(student)};
            updates[`learning/${currentUser.uid}/${lesson.studentUid}/lessons/${id}`]=publicData;
            updates[`users/${currentUser.uid}/schedule/${id}/completed`]=true;
            updates[`boards/${getPairKey(lesson.studentUid)}/schedule/${id}/completed`]=true;
            updates[`users/${currentUser.uid}/students/${lesson.studentUid}/lessonHistory/${historyId}`]=row;
        }
        if(await learningWrite(updates)){showToast(data.get('action')==='publish'?'Итог опубликован ученику':'Черновик сохранён');return true;}return false;
    });
}
function answerLesson(teacher,id){
    const value=learningShared[teacher]?.submissions?.[id]?.text||'';
    openLedgerDialog('Ответ на домашнее задание',learningField('text','Решение, вопросы или ссылка на выполненную работу',value),data=>learningWrite({[`learning/${teacher}/${currentUser.uid}/submissions/${id}`]:{text:L().text(data.get('text')),updatedAt:Date.now()}}));
}
function renderLearningTemplates(){
    const templates=Object.entries(learningPrivate.templates||{}),limit=L().limits[learningPro()?'pro':'start'].templates;
    return `<div class="learning-toolbar"><p>Шаблон остаётся чистым. Каждый ученик получает отдельную копию.</p><button class="btn btn-jade" onclick="createTextTemplate()">+ Шаблон из блоков</button></div><p class="learning-muted">${templates.length} из ${limit} шаблонов. Сохранить материалы с доски можно через «Инструменты → В библиотеку».</p><div class="learning-cards">${templates.map(([id,t])=>`<article class="learning-card"><span class="learning-badge">${escHtml(t.subject||'Любой предмет')}</span><h3>${escHtml(t.title)}</h3><p>${escHtml(t.description||'Личный шаблон урока')}</p><div class="ledger-actions"><button class="btn btn-jade" onclick="useLessonTemplate('${escAttr(id)}')">Создать занятие</button><button class="btn" onclick="removeLessonTemplate('${escAttr(id)}')">Удалить шаблон</button></div></article>`).join('')||'<div class="empty-box">Соберите объяснение, практику и домашнее задание. Используйте заготовку с разными учениками.</div>'}</div>`;
}
function createTextTemplate(){
    if(Object.keys(learningPrivate.templates||{}).length>=L().limits[learningPro()?'pro':'start'].templates){openTariffsModal();return;}
    openLedgerDialog('Шаблон урока',learningField('title','Название','','text')+learningField('subject','Предмет','','text')+learningField('explain','Объяснение')+learningField('given','Задача для самостоятельной работы')+learningField('answer','Ответ и подсказка — видны только вам')+learningField('homework','Домашнее задание'),async data=>{
        const id=learningId(),title=L().text(data.get('title'),150);if(!title){showToast('Назовите шаблон');return false;}
        const snapshot={paper:'grid',strokeHistory:[],items:[{id:'explain-'+id,type:'essay',left:120,top:120,width:360,height:330,text:L().text(data.get('explain'))},{id:'task-'+id,type:'subject',subjectKind:'problem',left:530,top:120,width:380,height:400,fields:{given:L().text(data.get('given')),solution:'',answer:''}}]};
        return (await createLearningSlot(`teaching/${currentUser.uid}/templates`,L().limits[learningPro()?'pro':'start'].templates,{title,subject:L().text(data.get('subject'),80),homework:L().text(data.get('homework')),snapshotJson:JSON.stringify(snapshot),createdAt:Date.now(),answers:{['task-'+id]:{answer:L().text(data.get('answer'))}}}))!==false;
    });
}
function removeLessonTemplate(id){askConfirmDelete('Удалить шаблон?','Уже созданные занятия и ответы учеников сохранятся.',()=>learningWrite({[`teaching/${currentUser.uid}/templates/${id}`]:null,[`teaching/${currentUser.uid}/answers/${id}`]:null}));}
function useLessonTemplate(id){
    const t=learningPrivate.templates?.[id];if(!t)return;
    const tomorrow=new Date(Date.now()+L().DAY),date=formatIsoDate(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate());
    openLedgerDialog('Занятие из шаблона',`<label>Ученик<select name="student" class="form-select" required>${learningOptions(learningStudent)}</select></label>`+learningField('date','Дата',date,'date')+learningField('time','Время','17:00','time'),async data=>{
        const student=currentUserData.students?.[data.get('student')];if(!student){showToast('Сначала пригласите ученика');return false;}
        const token=learningId(),boardId=`prep_${currentUser.uid}_${token}`,lessonId='sch_'+token;
        const lesson={id:lessonId,boardId,boardTitle:t.title,topic:t.title,date:data.get('date'),time:data.get('time'),durationMinutes:60,studentUid:student.uid,studentName:student.name,teacherUid:currentUser.uid,teacherName:currentUserData.profile?.name||'Преподаватель',lessonPrice:OrbitaLedger.price(student)};
        if(L().conflicts(lesson,getMergedScheduleList())){showToast('В это время уже есть занятие');return false;}
        let snapshot;try{snapshot=L().cleanSnapshot(JSON.parse(t.snapshotJson));}catch(_){showToast('Не удалось прочитать шаблон');return false;}
        const updates={
            [`users/${currentUser.uid}/prepBoards/${boardId}`]:{id:boardId,title:t.title,studentUid:student.uid,createdAt:Date.now()},
            [`boards/${boardId}/snapshot`]:snapshot,[`boardAccess/${boardId}/${student.uid}`]:true,
            [`users/${currentUser.uid}/schedule/${lessonId}`]:lesson,[`boards/${getPairKey(student.uid)}/schedule/${lessonId}`]:lesson,
            [`teaching/${currentUser.uid}/boardAnswers/${boardId}`]:t.answers||learningPrivate.answers?.[id]||{},
            [`teaching/${currentUser.uid}/drafts/${lessonId}`]:{homework:t.homework||'',summary:'',next:''}
        };
        if(await learningWrite(updates)){showToast('Отдельное занятие создано. Ответы шаблона остались приватными.');learningTab='lessons';return true;}return false;
    });
}
function renderLearningMistakes(){
    const teacher=learningTeacher();
    return `<div class="learning-toolbar"><p>Повторение по конкретным трудностям. Отметку результата ставит преподаватель.</p>${teacher?'<button class="btn btn-jade" onclick="addLearningMistake()">+ Добавить трудность</button>':''}</div>`+learningPeers().map(peer=>{
        const rows=Object.entries(learningShared[peer.uid]?.mistakes||{}).sort((a,b)=>(a[1].dueAt||0)-(b[1].dueAt||0));
        return `<h3 class="learning-section-title">${escHtml(peer.name)}</h3><div class="learning-cards">${rows.map(([id,m])=>`<article class="learning-card"><span class="learning-badge">${m.dueAt<=Date.now()?'Пора повторить':'Повторить '+new Date(m.dueAt).toLocaleDateString('ru-RU')}</span><h3>${escHtml(m.title)}</h3><div class="learning-text"><p>${escHtml(m.example)}</p><details><summary>Объяснение и подсказка</summary><p>${escHtml(m.explanation)}</p></details></div><p class="learning-muted">${{repeat:'Нужно повторить',hint:'С подсказкой',independent:'Самостоятельно'}[m.status]||'Ещё не проверено'}</p>${teacher?`<div class="ledger-actions"><button class="btn" onclick="markLearningMistake('${escAttr(peer.uid)}','${escAttr(id)}','repeat')">Повторить</button><button class="btn" onclick="markLearningMistake('${escAttr(peer.uid)}','${escAttr(id)}','hint')">С подсказкой</button><button class="btn btn-jade" onclick="markLearningMistake('${escAttr(peer.uid)}','${escAttr(id)}','independent')">Самостоятельно</button><button class="btn" onclick="removeLearningMistake('${escAttr(peer.uid)}','${escAttr(id)}')">Удалить</button></div>`:`<button class="btn" onclick="sendReviewAnswer('${escAttr(peer.uid)}','${escAttr(id)}')">Ответить преподавателю</button>`}${learningShared[peer.uid]?.reviewAnswers?.[id]?.text?`<p class="learning-text">Ответ: ${escHtml(learningShared[peer.uid].reviewAnswers[id].text)}</p>`:''}</article>`).join('')||'<div class="empty-box">Добавленные трудности появятся здесь.</div>'}</div>`;
    }).join('');
}
function addLearningMistake(seed={}){
    openLedgerDialog('Вернуться к трудности',`<label>Ученик<select name="student" class="form-select" required>${learningOptions(seed.studentUid||learningStudent)}</select></label>`+learningField('title','Тема трудности',seed.title||'','text')+learningField('example','Пример или условие',seed.example||'')+learningField('explanation','Объяснение и подсказка',seed.explanation||''),async data=>{
        const uid=data.get('student'),id=learningId();if(!uid||!L().text(data.get('title'))){showToast('Выберите ученика и укажите тему');return false;}
        return (await createLearningSlot(`learning/${currentUser.uid}/${uid}/mistakes`,L().limits[learningPro()?'pro':'start'].mistakes,{title:L().text(data.get('title'),150),example:L().text(data.get('example')),explanation:L().text(data.get('explanation')),dueAt:Date.now(),status:'repeat',streak:0}))!==false;
    });
}
function rememberHomeworkDifficulty(id){const task=getMergedHomeworksList().find(h=>h.id===id);if(task&&learningTeacher())addLearningMistake({studentUid:task.studentUid,title:task.title,example:[task.desc,task.answer?'Ответ ученика: '+task.answer:''].filter(Boolean).join('\n\n'),explanation:task.comment||''});}
function markLearningMistake(uid,id,status){const m=learningShared[uid]?.mistakes?.[id];if(m)learningWrite({[`learning/${currentUser.uid}/${uid}/mistakes/${id}`]:L().review(m,status)});}
function removeLearningMistake(uid,id){askConfirmDelete('Удалить трудность?','Она исчезнет из повторения ученика.',()=>learningWrite({[`learning/${currentUser.uid}/${uid}/mistakes/${id}`]:null,[`learning/${currentUser.uid}/${uid}/reviewAnswers/${id}`]:null}));}
function sendReviewAnswer(teacher,id){openLedgerDialog('Ответ для преподавателя',learningField('text','Решение или вопрос',learningShared[teacher]?.reviewAnswers?.[id]?.text||''),data=>learningWrite({[`learning/${teacher}/${currentUser.uid}/reviewAnswers/${id}`]:{text:L().text(data.get('text')),updatedAt:Date.now()}}));}

function renderLearningOrganization(){
    const teacher=learningTeacher();
    const toolbar=`<div class="learning-toolbar"><div><h3>Напоминания без лишних приложений</h3><p>Выгрузите занятия в календарь с напоминанием за 15 минут. Это разовый импорт: при переносе измените событие в календаре.</p></div><div class="ledger-actions"><button class="btn" onclick="downloadLessonCalendar()">Скачать календарь .ics</button><button class="btn" onclick="enableLessonReminders()">Напоминать на сайте</button></div></div><p class="learning-muted">Уведомления сайта работают, пока он открыт. Напоминания импортированного календаря зависят от настроек вашего устройства.</p>`;
    if(!teacher)return toolbar+learningPeers().map(peer=>{
        const slots=Object.entries(learningSlots[peer.uid]?.slots||{}).filter(([,s])=>!s.reservedBy&&L().startTime(s)>Date.now());
        const policy=learningShared[peer.uid]?.policy||learningSlots[peer.uid]?.policy||'';
        return `<article class="learning-card">${Object.values(learningShared[peer.uid]?.rescheduleStatus||{}).map(r=>`<p class="learning-badge">${r.status==='accepted'?'Перенос подтверждён':'Запрос отклонён'}: ${escHtml(r.date)} ${escHtml(r.time)}</p>`).join('')}<h3>Перенос занятия · ${escHtml(peer.name)}</h3><p class="learning-text">${escHtml(policy||'Условия переноса уточняйте у преподавателя.')}</p><p>Выберите занятие и свободное время. Перенос вступит в силу после подтверждения преподавателем.</p><button class="btn btn-jade" onclick="requestLessonReschedule('${escAttr(peer.uid)}')" ${slots.length?'':'disabled'}>${slots.length?'Запросить перенос':'Свободных окон пока нет'}</button></article>`;
    }).join('');
    const slots=Object.entries(learningSlots[currentUser.uid]?.slots||{}).filter(([,s])=>L().startTime(s)>Date.now());
    return toolbar+`<div class="learning-toolbar"><h3>Окна для переноса</h3><div class="ledger-actions"><button class="btn btn-jade" onclick="addAvailabilitySlot()">+ Свободное окно</button><button class="btn" onclick="editLessonPolicy()">Условия занятий</button></div></div><div class="learning-cards">${slots.map(([id,s])=>`<article class="learning-card"><h3>${escHtml(formatHumanDate(s.date,s.time))}</h3><p>${s.durationMinutes} мин. · ${s.reservedBy?'Занято':'Свободно'}</p>${!s.reservedBy?`<button class="btn" onclick="removeAvailabilitySlot('${escAttr(id)}')">Убрать окно</button>`:''}</article>`).join('')||'<div class="empty-box">Добавьте время, на которое ученик сможет запросить перенос.</div>'}</div><h3 class="learning-section-title">Запросы учеников</h3><div class="learning-cards">${Object.entries(learningRequests).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0)).slice(0,40).map(([id,r])=>`<article class="learning-card"><h3>${escHtml(currentUserData.students?.[r.studentUid]?.name||'Ученик')}</h3><p>${escHtml(r.reason||'Запрос переноса')}</p><p>${escHtml(r.targetDate)} · ${escHtml(r.targetTime)}</p><p class="learning-badge">${{pending:'Ожидает решения',accepted:'Перенос подтверждён',declined:'Отклонён'}[r.status]||r.status}</p>${r.status==='pending'?`<div class="ledger-actions"><button class="btn btn-jade" onclick="decideReschedule('${escAttr(id)}',true)">Подтвердить</button><button class="btn" onclick="decideReschedule('${escAttr(id)}',false)">Отклонить</button></div>`:''}</article>`).join('')||'<div class="empty-box">Новых запросов нет.</div>'}</div>`;
}
function downloadLearningFile(text,name,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadLessonCalendar(){const origin=new URL('.',location.href).href;downloadLearningFile(L().calendar(getMergedScheduleList().filter(s=>L().startTime(s)>=Date.now()-L().DAY),origin),'Орбита — занятия.ics','text/calendar;charset=utf-8');}
async function enableLessonReminders(){
    if(!('Notification'in window)){showToast('В этом браузере используйте напоминания календаря');return;}
    try{const result=await Notification.requestPermission();if(result==='granted'){localStorage.setItem('orbita_reminders_'+currentUser.uid,'yes');showToast('Напомним за 15 минут, пока сайт открыт');checkLessonReminders();}else showToast('Уведомления не включены. Можно использовать календарь.');}catch(_){showToast('Используйте напоминания календаря на этом устройстве');}
}
function checkLessonReminders(){
    if(!currentUser||!currentUserData||isPlatformAdmin||!('Notification'in window)||Notification.permission!=='granted'||localStorage.getItem('orbita_reminders_'+currentUser.uid)!=='yes')return;
    for(const s of getMergedScheduleList()){
        const diff=L().startTime(s)-Date.now(),key=s.id+':'+s.date+':'+s.time;
        if(diff>0&&diff<=15*60000&&!learningNotified.has(key)){learningNotified.add(key);try{new Notification('Скоро занятие в Орбите',{body:s.topic+' · '+s.time,tag:key});}catch(_){} }
    }
}
function editLessonPolicy(){
    openLedgerDialog('Условия занятий',learningField('policy','Общие условия отмены и переноса',learningSlots[currentUser.uid]?.policy||'')+`<label>Индивидуальные условия для ученика<select class="form-select" name="student"><option value="">Не менять</option>${learningOptions(learningStudent)}</select></label>`+learningField('personal','Оплата и переносы для выбранного ученика'),data=>{
        const updates={[`availability/${currentUser.uid}/policy`]:L().text(data.get('policy'),3000)},uid=data.get('student');
        if(uid)updates[`learning/${currentUser.uid}/${uid}/policy`]=L().text(data.get('personal'),3000);
        return learningWrite(updates);
    });
}
function addAvailabilitySlot(){
    if(!needPractice())return;
    openLedgerDialog('Свободное окно для переноса',learningField('date','Дата','','date')+learningField('time','Время','17:00','time')+'<label>Длительность, минут<input class="field-input" name="duration" type="number" min="15" max="180" value="60" required></label>',async data=>{
        const slot={date:data.get('date'),time:data.get('time'),durationMinutes:Number(data.get('duration'))};
        if(L().startTime(slot)<=Date.now()||L().conflicts(slot,[...getMergedScheduleList(),...Object.values(learningSlots[currentUser.uid]?.slots||{})])){showToast('Выберите свободное время в будущем');return false;}
        return (await createLearningSlot(`availability/${currentUser.uid}/slots`,100,slot))!==false;
    });
}
function removeAvailabilitySlot(id){return learningWrite({[`availability/${currentUser.uid}/slots/${id}`]:null});}
function requestLessonReschedule(teacher){
    const lessons=getMergedScheduleList().filter(s=>s.teacherUid===teacher&&!s.completed&&L().startTime(s)>Date.now());
    const slots=Object.entries(learningSlots[teacher]?.slots||{}).filter(([,s])=>!s.reservedBy&&L().startTime(s)>Date.now());
    if(!lessons.length){showToast('Нет предстоящих занятий для переноса');return;}
    openLedgerDialog('Запросить перенос',`<p class="learning-text">${escHtml(learningShared[teacher]?.policy||learningSlots[teacher]?.policy||'Перенос подтверждает преподаватель.')}</p><label>Занятие<select class="form-select" name="lesson">${lessons.map(s=>`<option value="${escAttr(s.id)}">${escHtml(s.topic+' · '+s.date+' '+s.time)}</option>`).join('')}</select></label><label>Свободное окно<select name="slot" class="form-select">${slots.map(([id,s])=>`<option value="${escAttr(id)}">${escHtml(s.date+' '+s.time+' · '+s.durationMinutes+' мин.')}</option>`).join('')}</select></label>`+learningField('reason','Комментарий'),async data=>{
        const slot=learningSlots[teacher]?.slots?.[data.get('slot')],lesson=lessons.find(s=>s.id===data.get('lesson'));if(!slot||!lesson||slot.durationMinutes<lesson.durationMinutes){showToast('Выберите окно, достаточное для длительности урока');return false;}
        const id=lesson.id,payload={studentUid:currentUser.uid,lessonId:lesson.id,slotId:data.get('slot'),reason:L().text(data.get('reason'),2000),targetDate:slot.date,targetTime:slot.time,status:'pending',createdAt:Date.now()};
        if(await learningWrite({[`rescheduleRequests/${teacher}/${id}`]:payload})){showToast('Запрос отправлен. Расписание изменится после подтверждения.');return true;}return false;
    });
}
async function decideReschedule(id,accept){
    const request=learningRequests[id];if(!request||request.status!=='pending'||!needPractice())return;
    if(!accept){await learningWrite({[`rescheduleRequests/${currentUser.uid}/${id}/status`]:'declined',[`learning/${currentUser.uid}/${request.studentUid}/rescheduleStatus/${id}`]:{status:'declined',date:request.targetDate,time:request.targetTime}});return;}
    const lesson=currentUserData.schedule?.[request.lessonId],slot=learningSlots[currentUser.uid]?.slots?.[request.slotId];
    if(!lesson||lesson.cancelled||lesson.completed||lesson.studentUid!==request.studentUid||!slot||slot.reservedBy||L().startTime(slot)<=Date.now()||slot.durationMinutes<lesson.durationMinutes){showToast('Окно или занятие уже изменилось. Отклоните запрос и согласуйте новое время.');return;}
    const next={...lesson,date:slot.date,time:slot.time};
    if(L().conflicts(next,getMergedScheduleList(),lesson.id)){showToast('На это время уже есть занятие');return;}
    const ref=db.ref(`availability/${currentUser.uid}/slots/${request.slotId}`);
    try{
        const reserved=await ref.transaction(s=>s&&!s.reservedBy?{...s,reservedBy:id}:undefined,undefined,false);
        if(!reserved.committed){showToast('Это окно уже занято');return;}
        const success=await learningWrite({[`users/${currentUser.uid}/schedule/${lesson.id}`]:next,[`boards/${getPairKey(request.studentUid)}/schedule/${lesson.id}`]:next,[`rescheduleRequests/${currentUser.uid}/${id}/status`]:'accepted',[`learning/${currentUser.uid}/${request.studentUid}/rescheduleStatus/${id}`]:{status:'accepted',date:slot.date,time:slot.time}});
        if(!success)await ref.transaction(s=>s?.reservedBy===id?{...s,reservedBy:null}:undefined);
        else showToast('Перенос подтверждён. Обновите событие в календаре.');
    }catch(_){showToast('Не удалось подтвердить перенос. Проверьте соединение.');}
}
function renderLearningProgress(){
    const teacher=learningTeacher();
    return `<div class="learning-toolbar"><p>Конкретные навыки и примеры работ вместо условного процента прогресса.</p>${teacher?'<button class="btn btn-jade" onclick="editLearningSkill()">+ Навык</button>':''}</div>`+learningPeers().map(peer=>{
        const skills=Object.entries(learningShared[peer.uid]?.skills||{}),invites=Object.entries(learningPrivate.invites||{}).filter(([,v])=>v.studentUid===peer.uid);
        return `<article class="learning-card"><h3>${escHtml(peer.name)}</h3>${skills.map(([id,s])=>`<div class="learning-skill"><div><strong>${escHtml(s.title)}</strong><p>${{learning:'Разбираем',hint:'С подсказкой',independent:'Самостоятельно'}[s.status]||'Разбираем'}</p><p class="learning-muted">${escHtml(s.evidence||'')}</p></div>${teacher?`<button class="btn" onclick="editLearningSkill('${escAttr(peer.uid)}','${escAttr(id)}')">Изменить</button>`:''}</div>`).join('')||'<p>Преподаватель добавит навыки и отметки по результатам работы.</p>'}${teacher?`<div class="ledger-actions"><button class="btn" onclick="publishFamilyReport('${escAttr(peer.uid)}')">Отчёт родителю</button><button class="btn" onclick="inviteGuardian('${escAttr(peer.uid)}')">Пригласить родителя</button></div>${invites.map(([id,i])=>`<div class="learning-invite"><span>${escHtml(i.email)} · ${new Date(i.expiresAt).toLocaleDateString('ru-RU')}</span><button class="btn btn-sm" onclick="showGuardianLink('${escAttr(id)}')">Ссылка</button><button class="btn btn-sm" onclick="revokeGuardian('${escAttr(peer.uid)}','${escAttr(id)}')">Отозвать доступ</button></div>`).join('')}`:''}</article>`;
    }).join('');
}
function editLearningSkill(uid='',id=''){
    const existing=learningShared[uid]?.skills?.[id]||{};
    openLedgerDialog('Навык ученика',`<label>Ученик<select name="student" class="form-select" ${uid?'disabled':''}>${learningOptions(uid||learningStudent)}</select></label>`+learningField('title','Навык',existing.title||'','text')+`<label>Статус<select name="status" class="form-select">${[['learning','Разбираем'],['hint','С подсказкой'],['independent','Самостоятельно']].map(([v,l])=>`<option value="${v}" ${existing.status===v?'selected':''}>${l}</option>`).join('')}</select></label>`+learningField('evidence','Пример работы, подтверждающий результат',existing.evidence||''),data=>{
        const student=uid||data.get('student');if(!student||!L().text(data.get('title'))){showToast('Укажите ученика и навык');return false;}
        return learningWrite({[`learning/${currentUser.uid}/${student}/skills/${id||learningId()}`]:{title:L().text(data.get('title'),150),status:data.get('status'),evidence:L().text(data.get('evidence'),2000),updatedAt:Date.now()}});
    });
}
function publishFamilyReport(uid){
    if(!needPractice())return;
    const student=currentUserData.students?.[uid];if(!student)return;
    const month=new Date().toISOString().slice(0,7);
    openLedgerDialog('Подготовить отчёт родителю',`<p>Будут опубликованы итоги занятий за выбранный месяц и текущие навыки. Черновики и личные заметки не включаются.</p><label>Месяц<input name="month" type="month" class="field-input" required value="${month}"></label>`+learningField('comment','Комментарий для семьи')+`<label class="learning-check"><input type="checkbox" name="billing"> Включить суммы занятий и отметки оплаты за месяц</label><p class="learning-muted">Отчёт — снимок на момент публикации. После изменений его можно опубликовать заново.</p>`,data=>{
        const period=data.get('month'),shared=learningShared[uid]||{},lessons=Object.values(shared.lessons||{}).filter(s=>s.date.startsWith(period));
        const report={studentName:student.name,teacherName:currentUserData.profile?.name||'Преподаватель',month:period,comment:L().text(data.get('comment')),lessons,skills:Object.values(shared.skills||{}),publishedAt:Date.now()};
        if(data.get('billing')){const history=studentHistory(student).filter(s=>s.date.startsWith(period));report.billing={lessons:history.length,total:history.reduce((sum,s)=>sum+OrbitaLedger.amount(s,student),0),paid:history.filter(s=>s.paid).reduce((sum,s)=>sum+OrbitaLedger.amount(s,student),0)};}
        return learningWrite({[`familyReports/${currentUser.uid}/${uid}/${period}`]:report});
    });
}
function inviteGuardian(uid){
    if(!needPractice())return;
    openLedgerDialog('Приглашение родителю',`<p>Доступ получит только владелец указанной подтверждённой почты. Ссылка действует 7 дней для принятия. Отозвать доступ можно в любое время.</p>`+learningField('email','Почта родителя','','email'),async data=>{
        const token=learningId()+learningId(),email=L().text(data.get('email'),254).toLowerCase(),invite={teacherUid:currentUser.uid,studentUid:uid,email,expiresAt:Date.now()+7*L().DAY};
        if(await learningWrite({[`familyInvites/${token}`]:invite,[`teaching/${currentUser.uid}/invites/${token}`]:invite})){setTimeout(()=>showGuardianLink(token),0);return true;}return false;
    });
}
function showGuardianLink(token){const url=new URL('family.html',location.href);url.searchParams.set('invite',token);openLedgerDialog('Ссылка для родителя',`<p>Отправьте её родителю самостоятельно. Вход — с почтой, указанной в приглашении.</p><input class="field-input" aria-label="Ссылка приглашения" value="${escAttr(url.href)}" readonly onclick="this.select()">`,async()=>true);}
async function revokeGuardian(uid,token){
    askConfirmDelete('Отозвать доступ родителя?','Ссылка перестанет работать, уже принятый доступ тоже будет отозван.',async()=>{
        try{const access=(await db.ref(`guardianAccess/${currentUser.uid}/${uid}`).once('value')).val()||{},updates={[`familyInvites/${token}`]:null,[`teaching/${currentUser.uid}/invites/${token}`]:null};for(const [parent,record]of Object.entries(access))if(record.inviteToken===token)updates[`guardianAccess/${currentUser.uid}/${uid}/${parent}`]=null;await learningWrite(updates);}catch(_){showToast('Доступ не отозван. Проверьте соединение.');}
    });
}
function openTariffsModal(){
    const price=Number(platformConfig.practicePrice)||L().PRICE,pro=learningPro(),trialEnd=typeof learningTrial==='number'?learningTrial+14*L().DAY:0;
    const status=getEffectivePlan(currentUserData)!=='start'?'Подписка активна':trialEnd>Date.now()?`Пробный доступ до ${new Date(trialEnd).toLocaleDateString('ru-RU')}`:'После входа преподавателю доступны 14 дней «Практики»';
    document.getElementById('tariffs-cards-container').innerHTML=`<article class="learning-card"><span class="learning-badge">Для первых занятий</span><h3>Старт</h3><div class="learning-price">0 ₽</div><p>Индивидуальные занятия · 3 личных шаблона · до 10 трудностей на ученика</p><ul><li>Доска со всеми предметными инструментами и фото с телефона</li><li>Расписание, чат, тетрадь и домашние задания</li><li>Итоги уроков, навыки, история и ручной учёт оплат</li><li>Экспорт CSV и календаря</li></ul><p class="learning-muted">Ученик и родитель пользуются бесплатно.</p></article><article class="learning-card learning-plan-featured"><span class="learning-badge">Меньше подготовки каждую неделю</span><h3>Практика</h3><div class="learning-price">${price} ₽ <small>/ 30 дней</small></div><p>Индивидуальные занятия · 100 шаблонов · до 500 трудностей на ученика</p><ul><li>Всё из «Старта»</li><li>Повторяющееся расписание на 16 занятий вперёд</li><li>Свободные окна и согласование переносов</li><li>Отчёты за месяц и отдельный доступ родителю</li><li>Расширенная библиотека уроков и повторения</li></ul><p>${escHtml(status)}</p><button class="btn btn-jade" onclick="selectTariffForSbp('pro','Практика',${price})">${platformConfig.salesEnabled?'Подключить / продлить':'Пилот · покупки пока закрыты'}</button></article><p class="learning-muted learning-plan-note">Без автоматических списаний. После окончания подписки сохраняются чтение и экспорт созданных материалов; действующие занятия доступны. Новые материалы — в пределах «Старта». Напоминания: календарь устройства и открытый сайт. ИИ и платные API не используются.</p>`;
    document.getElementById('tariffs-cards-container').innerHTML+='<div class="commerce-entry"><p>Есть промокод? Приглашайте коллег и получайте личные бонусы на 7 дней.</p><button class="btn" onclick="openCommerceAccount()">Промокоды и приглашения</button></div>';
    document.getElementById('sbp-checkout-box').style.display='none';document.getElementById('tariffs-modal').style.display='flex';
}

async function saveScheduleItem(){
    if(!learningTeacher())return;
    const editId=document.getElementById('edit-sch-id').value,date=document.getElementById('sch-date-input').value,time=document.getElementById('sch-time').value,uid=document.getElementById('sch-student-select').value;
    const student=currentUserData.students?.[uid],old=currentUserData.schedule?.[editId];
    if(!student||!date||!time){showToast('Выберите ученика, дату и время');return;}
    if(old?.completed){showToast('Завершённый урок меняйте в истории. Для нового урока создайте отдельную запись.');return;}
    const count=editId?1:Number(document.getElementById('sch-repeat-count').value)||1,every=Number(document.getElementById('sch-repeat-every').value)||1;
    if(count>1&&!needPractice())return;
    const topic=L().text(document.getElementById('sch-topic').value,200)||'Занятие',duration=Math.max(15,Math.min(360,Number(document.getElementById('sch-duration').value)||60)),selectedBoard=document.getElementById('sch-board-select').value;
    const updates={},scheduled=[],seriesId=count>1?'series_'+learningId():null;
    try{
        for(const [i,day] of L().dates(date,count,every).entries()){
            const token=learningId(),id=editId||'sch_'+token,boardId=i===0&&selectedBoard?selectedBoard:`prep_${currentUser.uid}_${token}`;
            const lesson={...(old||{}),id,date:day,time,topic,durationMinutes:duration,studentUid:uid,studentName:student.name,teacherUid:currentUser.uid,teacherName:currentUserData.profile?.name||'Преподаватель',boardId,boardTitle:topic,lessonPrice:old&&old.studentUid===uid?old.lessonPrice??OrbitaLedger.price(student):OrbitaLedger.price(student)};
            if(seriesId)lesson.seriesId=seriesId;
            if(L().conflicts(lesson,[...getMergedScheduleList(),...scheduled],editId)){showToast('Есть пересечение с другим занятием: '+day+' '+time);return;}
            scheduled.push(lesson);updates[`users/${currentUser.uid}/schedule/${id}`]=lesson;updates[`boards/${getPairKey(uid)}/schedule/${id}`]=lesson;updates[`boardAccess/${boardId}/${uid}`]=true;
            if(!(i===0&&selectedBoard))updates[`users/${currentUser.uid}/prepBoards/${boardId}`]={id:boardId,title:count>1?topic+' · '+day:topic,studentUid:uid,createdAt:Date.now()};
            if(old&&old.studentUid!==uid)updates[`boards/${getPairKey(old.studentUid)}/schedule/${id}`]=null;
        }
        if(await learningWrite(updates)){closeModals();showToast(count>1?`Создано ${count} занятий с отдельными досками`:'Занятие сохранено');}
    }catch(error){showToast(error.message||'Не удалось сохранить расписание');}
}
