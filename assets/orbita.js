/* UI enhancements; demo data never connects to Firebase Database. */
function openOrbitaAuth(register) {
    if (demoMode) { location.href = location.pathname + (register ? '?register=1' : '?login=1'); return; }
    document.getElementById('landing').hidden = true;
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    toggleAuthMode(register);
    window.scrollTo(0, 0);
    document.getElementById(register ? 'auth-name-input' : 'auth-email-input').focus();
}
function showOrbitaLanding() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('landing').hidden = false;
    window.scrollTo(0, 0);
}
function toggleMobileMenu(){
    const open=document.body.classList.toggle('mobile-nav-open');
    document.querySelector('.mobile-menu-toggle').setAttribute('aria-expanded',String(open));
}
function updateOrbitaOverview() {
    if (!currentUserData) return;
    const today = new Date();
    const iso = formatIsoDate(today.getFullYear(), today.getMonth(), today.getDate());
    const teacher = currentUserData.role === 'teacher';
    const schedule = getMergedScheduleList();
    const homework = getMergedHomeworksList().filter(h => h.status === (teacher ? 'review' : 'assigned'));
    const items = [
        ['◷', schedule.filter(s => s.date === iso && !s.completed).length, 'Уроков сегодня'],
        ['◎', getContactsArray().length, teacher ? 'Учеников' : 'Преподавателей'],
        ['✓', homework.length, teacher ? 'На проверке' : 'Заданий к уроку']
    ];
    document.getElementById('schedule-summary').innerHTML = items.map(([icon,count,label]) => `<div class="summary-item"><span class="summary-icon" aria-hidden="true">${icon}</span><div><strong>${count}</strong><small>${label}</small></div></div>`).join('');
    const names = {learning:'Обучение',schedule:'Мой день',cabinet:'Ученики',boards:teacher?'Доски':'Тетради',practice:'Практика',assignments:'Задания',messages:'Сообщения',profile:'Профиль',admin:'Управление'};
    document.getElementById('workspace-section-name').textContent = names[currentSection] || 'Кабинет';
    document.body.classList.remove('mobile-nav-open');
    document.querySelector('.mobile-menu-toggle')?.setAttribute('aria-expanded','false');
    document.getElementById('workspace-date').textContent = today.toLocaleDateString('ru-RU',{day:'numeric',month:'long',weekday:'short'});
    document.getElementById('schedule-subtitle').textContent = teacher ? 'Ваши занятия, ученики и планы. Всё на своих местах.' : 'Ваши занятия и задания. Следующий шаг к новым знаниям.';
    document.querySelectorAll('#regular-nav-list .nav-item').forEach(button => {
        button.setAttribute('aria-label',button.querySelector('.nav-label').textContent);
        if (button.classList.contains('active')) button.setAttribute('aria-current','page');
        else button.removeAttribute('aria-current');
    });
}
function startOrbitaDemo() {
    if (currentUser && !demoMode) { document.getElementById('landing').hidden = true; return; }
    demoMode = true;
    db = null;
    isPlatformAdmin = false;
    document.body.classList.add('demo-mode');
    document.getElementById('landing').hidden = true;
    document.getElementById('loading-screen').style.display = 'none';
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const tomorrow = formatIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
    const now = new Date();
    const today = formatIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const late = now.getHours() >= 18;
    const lessonDate = late ? tomorrow : today;
    const hour = late ? 15 : Math.max(15, now.getHours()+1);
    currentUser = {uid:'orbita-demo',email:'demo@example.invalid'};
    currentUserData = {
        uid:currentUser.uid,role:'teacher',plan:'start',profile:{name:'Александра',subject:'Математика',bio:'Помогаю увидеть логику за формулами. Демонстрационный профиль.'},
        students:{
            anna:{uid:'anna',name:'Анна Волкова',goal:'Математика · 9 класс',lessonPrice:1500},
            mikhail:{uid:'mikhail',name:'Михаил Соколов',goal:'Математика · 10 класс',lessonPrice:1600},
            sofia:{uid:'sofia',name:'София Белова',goal:'Подготовка к ЕГЭ',lessonPrice:1800}
        },
        schedule:{
            lesson1:{id:'lesson1',studentUid:'anna',studentName:'Анна Волкова',date:lessonDate,time:String(hour).padStart(2,'0')+':00',topic:'Квадратные уравнения',boardId:'algebra',boardTitle:'Алгебра · 9 класс'},
            lesson2:{id:'lesson2',studentUid:'mikhail',studentName:'Михаил Соколов',date:lessonDate,time:String(hour+1).padStart(2,'0')+':30',topic:'Производная функции',boardId:'functions',boardTitle:'Функции и графики'},
            lesson3:{id:'lesson3',studentUid:'sofia',studentName:'София Белова',date:tomorrow,time:'18:00',topic:'Планиметрия: разбираем задачи ЕГЭ',boardId:'geometry',boardTitle:'Геометрия'}
        },
        prepBoards:{algebra:{id:'algebra',title:'Квадратные уравнения',studentUid:'anna'},functions:{id:'functions',title:'Функции и графики',studentUid:'mikhail'},geometry:{id:'geometry',title:'Геометрия · подготовка к ЕГЭ'}},
        homeworks:{hw1:{id:'hw1',title:'Практика: дискриминант',studentUid:'anna',studentName:'Анна Волкова',status:'review',format:'text',desc:'Решите уравнение x² − 5x + 6 = 0. Объясните каждый шаг.',answer:'D = 25 − 24 = 1. Корни: x₁ = 2, x₂ = 3.',due:tomorrow,createdAt:Date.now()},hw2:{id:'hw2',title:'Задачи на производную',studentUid:'mikhail',studentName:'Михаил Соколов',status:'assigned',format:'text',desc:'Найдите производную функции f(x) = x³ + 2x.',due:tomorrow,createdAt:Date.now()-1000}},
        flashcardSets:{math:{id:'math',title:'Основные формулы',subject:'Математика',cards:[{q:'Дискриминант квадратного уравнения',a:'D = b² − 4ac'},{q:'Теорема Пифагора',a:'a² + b² = c²'},{q:'Производная xⁿ',a:'n · xⁿ⁻¹'}]}}
    };
    peerPresenceMap={anna:{online:true}};
    learningPrivate={templates:{0:{title:'Квадратные уравнения: от примера к самостоятельной работе',subject:'Математика',description:'Объяснение → задача → домашнее задание',snapshotJson:'{"items":[]}'}}};
    learningShared={anna:{mistakes:{0:{title:'Знаки при переносе слагаемых',example:'2x + 6 = 12. Какое действие нужно выполнить с обеими частями?',explanation:'Вычесть 6 из обеих частей, затем разделить на 2.',status:'hint',streak:0,dueAt:Date.now()}},skills:{equations:{title:'Линейные уравнения',status:'independent',evidence:'Три задачи решены без подсказок.'}}}};
    launchAppShell();
    window.scrollTo(0,0);
}
// Browsing and practice work in the demo; actions that change data require an account.
document.addEventListener('click', event => {
    if (!demoMode) return;
    const target = event.target.closest('[onclick]');
    if (!target) return;
    const action = target.getAttribute('onclick');
    const allowed = /^(setLearningTab|selectLedgerStudent|toggleMobileMenu|switchSection|onBrandLogoClick|toggleThemeQuick|shiftSidebarMonth|onSidebarCalDayClick|resetCalendarFilter|openTariffsModal|closeModals|openOrbitaAuth|exitOrbitaDemo|setPracticeMode|onMatchColumnClick|answerQuizQuestion|filterTasks|switchHwViewMode|showLowBalanceStudentsPanel)\(/;
    const local = /^(activeCabinetStudentUid|activeTaskId|activeDeckId|selectedBoardFolder|activeChatPeerUid|cardFlipped|currentCardIdx|learnedCardIndices|quizStepIdx|quizFinished|practiceMode)/;
    if (!allowed.test(action.trim()) && !local.test(action.trim())) {
        event.preventDefault(); event.stopImmediatePropagation();
        showToast('Это демо для знакомства. Создайте аккаунт, чтобы провести урок или сохранить изменения.');
    }
},true);
document.addEventListener('keydown',event=>{
    if (demoMode && event.key === 'Enter' && event.target.matches('input,textarea')) {event.preventDefault();event.stopImmediatePropagation();}
    if (event.key === 'Escape') closeModals();
},true);
function exitOrbitaDemo(){location.href=location.pathname;}
async function resetOrbitaPassword(){
    const email=document.getElementById('auth-email-input').value.trim();
    if(!email){showToast('Введите почту в поле выше — отправим ссылку для восстановления.');return;}
    try{await auth.sendPasswordResetEmail(email);showToast('Если аккаунт существует, на почту придёт письмо для восстановления.');}
    catch(error){showToast('Не удалось отправить письмо. Проверьте почту и попробуйте ещё раз.');}
}
document.querySelectorAll('label.field-label').forEach(label=>{const field=label.parentElement.querySelector('input,select,textarea');if(field?.id)label.htmlFor=field.id;});
document.getElementById('toast').setAttribute('role','status');
document.getElementById('toast').setAttribute('aria-live','polite');
const orbitaParams=new URLSearchParams(location.search);
if(orbitaParams.has('demo'))startOrbitaDemo();
else if(orbitaParams.has('register'))openOrbitaAuth(true);
else if(orbitaParams.has('login')||localStorage.getItem('es_pending_invite'))openOrbitaAuth(false);
