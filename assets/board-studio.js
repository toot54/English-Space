/* Subject-neutral classroom tools and a shared lesson notebook. */
const subjectDefinitions={
    graph:{title:'График функции',caption:'Математика · y = ax² + bx + c',fields:{a:'1',b:'0',c:'0'}},
    timeline:{title:'Лента времени',caption:'История · одна строка — одно событие',fields:{events:'1547 | Венчание Ивана IV на царство\n1564 | Начало книгопечатания в Москве'}},
    problem:{title:'Решение задачи',caption:'Математика, физика, химия',fields:{given:'',solution:'',answer:''}},
    compare:{title:'Сравнение',caption:'Признаки, причины и аргументы',fields:{leftTitle:'Объект А',left:'',rightTitle:'Объект Б',right:''}}
};
let boardPaper='dots';
const lessonNoteDrafts=new Map();
let lessonNotesTimer=null;
function setBoardPaper(paper,broadcast=true){
    if(!['dots','grid','plain'].includes(paper))return;
    if(broadcast && (!boardReady || role!=='teacher'))return;
    boardPaper=paper;boardWorld.dataset.paper=paper;
    const select=document.getElementById('board-paper-select');if(select)select.value=paper;
    if(broadcast && roomRef)roomRef.child('boardSettings/paper').set(paper).catch(()=>setRtcStatus('Не удалось сохранить фон доски'));
}
function switchTopTab(tab){
    const notes=tab==='notebook';
    document.getElementById('top-tab-board').classList.toggle('active',!notes);
    document.getElementById('top-tab-notebook').classList.toggle('active',notes);
    document.getElementById('lesson-notebook-panel').hidden=!notes;
    if(notes)closePopovers();
}
function subscribeBoardStudio(){
    if(!roomRef)return;
    roomRef.child('boardSettings/paper').on('value',snapshot=>{if(snapshot.val())setBoardPaper(snapshot.val(),false);});
    roomRef.child('lessonNotes').on('value',snapshot=>{
        const notes=snapshot.val()||{};
        document.querySelectorAll('[data-lesson-note]').forEach(input=>{
            const key=input.dataset.lessonNote;
            if(document.activeElement!==input && !lessonNoteDrafts.has(key))input.value=notes[key]||'';
        });
    });
}
function updateLessonNote(key,value){
    if(!boardReady)return;
    lessonNoteDrafts.set(key,value);
    document.getElementById('lesson-notes-status').textContent='Сохраняем…';
    clearTimeout(lessonNotesTimer);lessonNotesTimer=setTimeout(flushLessonNotes,500);
}
async function flushLessonNotes(){
    clearTimeout(lessonNotesTimer);if(!roomRef || !lessonNoteDrafts.size)return;
    const changes=Object.fromEntries(lessonNoteDrafts);
    try{
        await roomRef.child('lessonNotes').update(changes);
        for(const [key,value] of Object.entries(changes))if(lessonNoteDrafts.get(key)===value)lessonNoteDrafts.delete(key);
        document.getElementById('lesson-notes-status').textContent=lessonNoteDrafts.size?'Сохраняем…':'Сохранено для обоих участников';return true;
    }catch(_){document.getElementById('lesson-notes-status').textContent='Ждём соединение · не закрывайте урок';return false;}
}
function downloadLessonNotes(){
    const sections=[...document.querySelectorAll('[data-lesson-note]')].map(input=>input.getAttribute('aria-label')+'\n'+input.value);
    const blob=new Blob([sections.join('\n\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='Конспект урока.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function createSubjectWidget(existing,broadcast,recordInHistory=true){
    if(!existing || !validBoardId(existing.id) || document.getElementById(existing.id) || !Object.hasOwn(subjectDefinitions,existing.subjectKind))return;
    const data={...existing,type:'subject'},def=subjectDefinitions[data.subjectKind],fields={...def.fields,...data.fields};
    const widget=document.createElement('div');widget.id=data.id;widget.className='widget subject-widget';widget.dataset.type='subject';widget.dataset.subjectKind=data.subjectKind;
    widget.dataset.minW='270';widget.dataset.minH='260';widget.style.left=data.left+'px';widget.style.top=data.top+'px';widget.style.width=(data.width||420)+'px';widget.style.height=(data.height||380)+'px';
    const field=(key,label,multiline=true)=>`<label class="subject-field">${label}${multiline?`<textarea data-field="${key}" aria-label="${label}" spellcheck="true">${boardText(fields[key]||'')}</textarea>`:`<input data-field="${key}" aria-label="${label}" value="${boardText(fields[key]||'')}">`}</label>`;
    let content='';
    if(data.subjectKind==='graph')content=`<div class="graph-coefficients">${['a','b','c'].map(key=>`<label>${key}<input type="number" step="0.1" min="-100" max="100" inputmode="decimal" data-field="${key}" value="${boardText(fields[key])}" aria-label="Коэффициент ${key}"></label>`).join('')}</div><svg class="function-graph" viewBox="0 0 300 240" role="img" aria-label="График квадратичной функции"></svg><div class="graph-equation"></div>`;
    else if(data.subjectKind==='timeline')content=field('events','Год или дата | событие')+'<ol class="subject-timeline"></ol>';
    else if(data.subjectKind==='problem')content=field('given','Условие и данные')+field('solution','Ход решения')+field('answer','Ответ');
    else content=`<div class="subject-compare"><div>${field('leftTitle','Первый объект',false)}${field('left','Признаки и аргументы')}</div><div>${field('rightTitle','Второй объект',false)}${field('right','Признаки и аргументы')}</div></div>`;
    widget.innerHTML=`<div class="widget-header"><button class="header-icon-btn lock-btn" onclick="toggleLockWidget('${data.id}',true)">Закрепить</button><div class="grip-bar"></div><button class="close-btn" aria-label="Удалить виджет" onclick="removeDynamicItem('${data.id}',true)">✕</button></div><div class="subject-widget-title"><strong>${def.title}</strong><small>${def.caption}</small></div><div class="subject-widget-body">${content}</div><div class="resize-handle">◢</div>`;
    dynamicItems.appendChild(widget);makeWidgetInteractive(widget,null);
    widget.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{
        renderSubjectPreview(widget);saveBoardState();broadcastEvent({type:'subject_update',id:data.id,key:input.dataset.field,value:input.value});
    }));
    renderSubjectPreview(widget);
    if(recordInHistory)recordAction({kind:'add_item',id:data.id,display:'flex'});
    if(broadcast)broadcastEvent({type:'spawn_subject',data});
}
function subjectFields(widget){return Object.fromEntries([...widget.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]));}
function graphCoordinates(a,b,c){
    const points=[];
    for(let px=0;px<=300;px+=2){const x=(px-150)/20,y=a*x*x+b*x+c,py=120-y*20;points.push([px,Math.max(-10000,Math.min(10000,py))]);}
    return points;
}
function renderSubjectPreview(widget){
    const fields=subjectFields(widget);
    if(widget.dataset.subjectKind==='graph'){
        const values=['a','b','c'].map(key=>Number(fields[key])),svg=widget.querySelector('svg');
        if(values.some(n=>!Number.isFinite(n)||Math.abs(n)>100)){widget.querySelector('.graph-equation').textContent='Коэффициенты: от −100 до 100';return;}
        let grid='';for(let x=10;x<300;x+=20)grid+=`<path d="M${x} 0V240"/>`;for(let y=0;y<=240;y+=20)grid+=`<path d="M0 ${y}H300"/>`;
        const path=graphCoordinates(...values).map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
        svg.innerHTML=`<g stroke="currentColor" opacity=".1" stroke-width=".6">${grid}</g><path d="M0 120H300M150 0V240" stroke="currentColor" opacity=".55"/><text x="286" y="115" fill="currentColor" font-size="11">x</text><text x="155" y="12" fill="currentColor" font-size="11">y</text><text x="153" y="132" fill="currentColor" font-size="9">0</text><path d="${path}" fill="none" stroke="var(--emerald)" stroke-width="2.5"/>`;
        widget.querySelector('.graph-equation').textContent=`y = ${values[0]}x² + (${values[1]})x + (${values[2]}) · клетка = 1`;
    }else if(widget.dataset.subjectKind==='timeline'){
        widget.querySelector('.subject-timeline').innerHTML=(fields.events||'').split('\n').filter(line=>line.trim()).slice(0,50).map(line=>{const [date,...parts]=line.split('|');return `<li><b>${boardText(date.trim())}</b><span>${boardText(parts.join('|').trim())}</span></li>`;}).join('');
    }
}
function handleStudioEvent(data){
    if(data.type==='spawn_subject'){createSubjectWidget(data.data,false,false);return true;}
    if(data.type==='subject_update'){
        const widget=document.getElementById(data.id);
        if(widget?.dataset.type==='subject' && typeof data.value==='string' && data.value.length<=20000){
            const input=[...widget.querySelectorAll('[data-field]')].find(el=>el.dataset.field===data.key);
            if(input && document.activeElement!==input){input.value=data.value;renderSubjectPreview(widget);saveBoardState();}
        }return true;
    }
    return false;
}
function centerFollowStatus(){
    const rect=viewport.getBoundingClientRect(),sidebar=document.getElementById('class-sidebar'),side=sidebar.getBoundingClientRect();
    const overlap=sidebar.classList.contains('collapsed')?0:Math.max(0,rect.right-Math.max(rect.left,side.left));
    const available=rect.width-overlap,pill=document.getElementById('follow-status-pill');
    pill.style.left=(available/2)+'px';pill.style.maxWidth=Math.max(0,available-150)+'px';
    pill.style.visibility=available<320?'hidden':'visible';
}
function initBoardStudio(){
    document.querySelectorAll('[data-lesson-note]').forEach(input=>{
        input.addEventListener('input',()=>updateLessonNote(input.dataset.lessonNote,input.value));input.addEventListener('blur',flushLessonNotes);
    });
    new ResizeObserver(centerFollowStatus).observe(viewport);
    new ResizeObserver(centerFollowStatus).observe(document.getElementById('class-sidebar'));
    window.addEventListener('online',flushLessonNotes);window.addEventListener('pagehide',flushLessonNotes);centerFollowStatus();
}
