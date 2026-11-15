/* Stable editor nodes preserve the caret, IME composition and mobile keyboard. */
const notebookDrafts=new Map();
let notebookSaveTimer=null;
function cleanNotebookHtml(html){
    const template=document.createElement('template');template.innerHTML=String(html||'');
    const allowed=new Set(['DIV','P','BR','STRONG','B','EM','I','U','UL','OL','LI','H2','H3','SPAN','BLOCKQUOTE']);
    for(const node of [...template.content.querySelectorAll('*')]){
        if(node.matches('script,style,iframe,object,embed,svg,math,button,input,textarea')){node.remove();continue;}
        if(!allowed.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}
        const classes=[...node.classList].filter(c=>['nb-callout-rule','nb-callout-imp','nb-block-text'].includes(c));
        for(const attr of [...node.attributes])node.removeAttribute(attr.name);
        if(classes.length)node.className=classes.join(' ');
    }
    return template.innerHTML;
}
function notebookHtml(sheet){return cleanNotebookHtml(sheet.innerHTML);}
function decorateNotebookBlocks(sheet){
    sheet.querySelectorAll('.nb-callout-rule,.nb-callout-imp').forEach(block=>{
        block.contentEditable='false';
        let text=block.querySelector('.nb-block-text');
        if(!text){text=document.createElement('div');text.className='nb-block-text';while(block.firstChild)text.appendChild(block.firstChild);block.appendChild(text);}
        text.contentEditable='true';text.setAttribute('role','textbox');text.setAttribute('aria-label',block.classList.contains('nb-callout-rule')?'Правило':'Заметка');
        if(!block.querySelector('button')){const remove=document.createElement('button');remove.type='button';remove.className='nb-remove-block';remove.textContent='×';remove.setAttribute('aria-label','Удалить блок');remove.onclick=()=>{block.remove();saveActiveNotebookContent(sheet.dataset.notebook);};block.appendChild(remove);}
    });
}
function mergeNotebookDrafts(){
    for(const draft of notebookDrafts.values()){
        const nb=currentUserData?.notebooks?.[draft.id];if(!nb)continue;
        nb.pages=Array.isArray(nb.pages)?nb.pages:[''];nb.pages[draft.page]=draft.html;
    }
}
function renderStudentNotebooksSection(){
    mergeNotebookDrafts();
    const notebooks=currentUserData.notebooks||{},list=Object.values(notebooks).filter(n=>n?.id&&n.title);
    const nb=notebooks[activeNotebookId]||list[0];if(nb)activeNotebookId=nb.id;
    const roster=document.getElementById('s-notebooks-roster');
    roster.innerHTML=list.map(n=>`<div class="st-roster-item ${nb?.id===n.id?'active':''}"><button class="nb-roster-title" onclick="selectNotebook('${escAttr(n.id)}',0)"><strong>${escHtml(n.title)}</strong><small>${(n.pages||['']).length} стр.</small></button><button class="btn btn-icon" aria-label="Удалить тетрадь" onclick="requestDeleteNotebook('${escAttr(n.id)}','${escAttr(n.title)}')">×</button></div>`).join('')||'<div class="empty-box">Создайте тетрадь для своего предмета</div>';
    document.getElementById('s-lesson-boards-list').innerHTML=getMergedScheduleList().map(s=>`<div class="row-item"><div><div class="row-title">${escHtml(s.topic)}</div><div class="row-sub">${escHtml(formatHumanDate(s.date))}</div></div><button class="btn btn-sm" onclick="openBoardRoom('${escAttr(s.boardId)}',null,'${escAttr(s.topic)}')">Доска ↗</button></div>`).join('')||'<div class="empty-box">Здесь будут доски ваших уроков</div>';
    const card=document.getElementById('s-notebook-editor-card');
    if(!nb){card.innerHTML='<div class="empty-box">Выберите тетрадь или создайте новую</div>';return;}
    nb.pages=Array.isArray(nb.pages)&&nb.pages.length?nb.pages:[''];
    activeNotebookPageIdx=Math.min(activeNotebookPageIdx,nb.pages.length-1);
    const key=nb.id+':'+activeNotebookPageIdx;
    const sheet=document.getElementById('notebook-sheet-editable');
    if(sheet && card.dataset.editor===key){
        sheet.className='paper-sheet '+(nb.paper==='lined'?'lined-paper':nb.paper==='dot'?'dot-paper':'grid-paper');
        // No innerHTML replacement while editing, including an empty IME draft.
        if(!sheet.contains(document.activeElement) && document.activeElement!==sheet && !notebookDrafts.has(key)){
            const next=cleanNotebookHtml(nb.pages[activeNotebookPageIdx]);
            if(notebookHtml(sheet)!==next){sheet.innerHTML=next;decorateNotebookBlocks(sheet);}
        }
        return;
    }
    card.dataset.editor=key;
    card.innerHTML=`<div class="nb-editor-head"><div><span class="eyebrow">ЛИЧНАЯ ТЕТРАДЬ</span><h3>${escHtml(nb.title)}</h3></div><span id="notebook-save-status" role="status">Сохранено</span></div><div class="nb-page-tabs">${nb.pages.map((_,i)=>`<button class="folder-chip ${i===activeNotebookPageIdx?'active':''}" onclick="selectNotebook('${escAttr(nb.id)}',${i})">${i+1}</button>`).join('')}<button class="btn btn-sm" onclick="addNotebookPage('${escAttr(nb.id)}')">+ Страница</button><button class="btn btn-sm" onclick="deleteNotebookPage('${escAttr(nb.id)}')">Удалить страницу</button></div><div class="nb-tools"><label>Бумага <select aria-label="Фон тетради" onchange="setNotebookPaper('${escAttr(nb.id)}',this.value)"><option value="grid" ${nb.paper==='grid'?'selected':''}>Клетка</option><option value="lined" ${nb.paper==='lined'?'selected':''}>Линейка</option><option value="dot" ${nb.paper==='dot'?'selected':''}>Точки</option></select></label><button class="btn btn-sm" onclick="insertNotebookBlock('rule')">+ Правило</button><button class="btn btn-sm" onclick="insertNotebookBlock('imp')">+ Заметка</button></div><div id="notebook-sheet-editable" class="paper-sheet ${nb.paper==='lined'?'lined-paper':nb.paper==='dot'?'dot-paper':'grid-paper'}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Страница тетради" spellcheck="true" data-notebook="${escHtml(nb.id)}" data-page="${activeNotebookPageIdx}">${cleanNotebookHtml(nb.pages[activeNotebookPageIdx])}</div>`;
    const editor=document.getElementById('notebook-sheet-editable');decorateNotebookBlocks(editor);
    editor.addEventListener('input',()=>saveActiveNotebookContent(nb.id));
    editor.addEventListener('focusout',()=>{saveActiveNotebookContent(nb.id);flushNotebookDrafts();});
    editor.addEventListener('paste',event=>{
        event.preventDefault();const selection=window.getSelection();if(!selection.rangeCount)return;
        const range=selection.getRangeAt(0);if(!editor.contains(range.commonAncestorContainer))return;
        range.deleteContents();const text=document.createTextNode(event.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);saveActiveNotebookContent(nb.id);
    });
}
function selectNotebook(id,page){
    flushNotebookDrafts();activeNotebookId=id;activeNotebookPageIdx=page;
    document.getElementById('s-notebook-editor-card').dataset.editor='';renderStudentNotebooksSection();
}
function saveActiveNotebookContent(id){
    const sheet=document.getElementById('notebook-sheet-editable'),nb=currentUserData?.notebooks?.[id];
    if(!sheet || sheet.dataset.notebook!==id || !nb)return;
    const page=Number(sheet.dataset.page),html=notebookHtml(sheet),key=id+':'+page;
    nb.pages=Array.isArray(nb.pages)?nb.pages:[''];
    if(nb.pages[page]===html && !notebookDrafts.has(key))return;
    nb.pages[page]=html;notebookDrafts.set(key,{id,page,html});
    setLocalUserCache(currentUser.uid,currentUserData);
    const status=document.getElementById('notebook-save-status');if(status)status.textContent='Сохраняем…';
    clearTimeout(notebookSaveTimer);notebookSaveTimer=setTimeout(flushNotebookDrafts,600);
}
async function flushNotebookDrafts(){
    clearTimeout(notebookSaveTimer);
    for(const [key,draft] of [...notebookDrafts]){
        try {
            if(db)await db.ref(`users/${currentUser.uid}/notebooks/${draft.id}/pages/${draft.page}`).set(draft.html);
            if(notebookDrafts.get(key)===draft)notebookDrafts.delete(key);
        }catch(_){const status=document.getElementById('notebook-save-status');if(status)status.textContent='На устройстве · ждём интернет';return;}
    }
    const status=document.getElementById('notebook-save-status');if(status)status.textContent=notebookDrafts.size?'Сохраняем…':'Сохранено';
}
function insertNotebookBlock(kind){
    const sheet=document.getElementById('notebook-sheet-editable');if(!sheet)return;
    const block=document.createElement('div');block.className=kind==='rule'?'nb-callout-rule':'nb-callout-imp';
    block.textContent=kind==='rule'?'Правило: ':'Заметка: ';sheet.appendChild(block);
    const after=document.createElement('p');after.innerHTML='<br>';sheet.appendChild(after);decorateNotebookBlocks(sheet);
    block.querySelector('.nb-block-text').focus();saveActiveNotebookContent(sheet.dataset.notebook);
}
async function setNotebookPaper(id,paper){
    if(!['grid','lined','dot'].includes(paper))return;
    const nb=currentUserData.notebooks?.[id];if(!nb)return;
    nb.paper=paper;setLocalUserCache(currentUser.uid,currentUserData);renderStudentNotebooksSection();
    if(db)try{await db.ref(`users/${currentUser.uid}/notebooks/${id}/paper`).set(paper);}catch(_){showToast('Фон сохранён на устройстве. Проверьте интернет.');}
}
async function addNotebookPage(id){
    await flushNotebookDrafts();const nb=currentUserData.notebooks?.[id];if(!nb)return;
    const pages=[...(Array.isArray(nb.pages)?nb.pages:['']),''];
    try{if(db)await db.ref(`users/${currentUser.uid}/notebooks/${id}/pages`).set(pages);}catch(_){showToast('Не удалось добавить страницу');return;}
    nb.pages=pages;setLocalUserCache(currentUser.uid,currentUserData);selectNotebook(id,pages.length-1);
}
function deleteNotebookPage(id){
    const page=activeNotebookPageIdx;
    askConfirmDelete('Удалить эту страницу?','Текст и блоки этой страницы будут удалены.',async()=>{
        await flushNotebookDrafts();const nb=currentUserData.notebooks?.[id];if(!nb)return;
        const pages=nb.pages.filter((_,i)=>i!==page);if(!pages.length)pages.push('');
        try{if(db)await db.ref(`users/${currentUser.uid}/notebooks/${id}/pages`).set(pages);}catch(_){showToast('Страница не удалена');return;}
        nb.pages=pages;setLocalUserCache(currentUser.uid,currentUserData);selectNotebook(id,Math.min(page,pages.length-1));
    });
}
window.addEventListener('online',flushNotebookDrafts);
window.addEventListener('pagehide',flushNotebookDrafts);
