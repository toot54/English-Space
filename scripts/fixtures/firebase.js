/* Synthetic browser QA only. Served by preview.cjs; never connected to Firebase. */
(()=>{
    const role=new URLSearchParams(location.search).get('role')||'student';
    const uid=role==='teacher'?'fixtureTeacher':'fixtureStudent';
    const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    let state={users:{
        fixtureTeacher:{uid:'fixtureTeacher',role:'teacher',plan:'start',profile:{name:'Тестовый преподаватель',subject:'Математика'},students:{fixtureStudent:{uid:'fixtureStudent',name:'Никита (проверка)',lessonPrice:300,lessonsBalance:0,subscriptionPrice:0}},schedule:{testLesson:{id:'testLesson',studentUid:'fixtureStudent',teacherUid:'fixtureTeacher',date,time:'00:00',topic:'Тест: квадратные уравнения',boardId:'prep_fixtureTeacher_test',durationMinutes:60,lessonPrice:300}}},
        fixtureStudent:{uid:'fixtureStudent',role:'student',plan:'start',profile:{name:'Тестовый ученик'},teachers:{fixtureTeacher:{uid:'fixtureTeacher',name:'Тестовый преподаватель',subject:'Математика'}},notebooks:{testNotebook:{id:'testNotebook',title:'Математика · проверка',paper:'grid',pages:['<p>Проверяем непрерывный ввод.</p><div class="nb-callout-rule">Тестовое правило</div>','<p>Вторая страница</p>']}}}
    },boards:{},boardAccess:{prep_fixtureTeacher_test:{fixtureStudent:true}}};
    const listeners=[],read=path=>path.split('/').filter(Boolean).reduce((obj,key)=>obj?.[key],state)??null;
    const snap=value=>({val:()=>structuredClone(value),exists:()=>value!==null,key:null});
    function emit(changed){for(const l of [...listeners])if(l.event==='value' && (!l.path || changed.startsWith(l.path)||l.path.startsWith(changed)))l.cb(snap(read(l.path)));}
    function write(path,value){const keys=path.split('/').filter(Boolean);if(!keys.length){state=value;return;}let node=state;for(const k of keys.slice(0,-1))node=node[k]??={};if(value===null)delete node[keys.at(-1)];else node[keys.at(-1)]=structuredClone(value);}
    function ref(path=''){return {key:path.split('/').at(-1),child:part=>ref([path,part].filter(Boolean).join('/')),once:async()=>snap(read(path)),
        on(event,cb){listeners.push({path,event,cb});if(event==='value')setTimeout(()=>cb(snap(read(path))),0);return cb;},off(){},
        async set(value){write(path,value);emit(path);},async remove(){write(path,null);emit(path);},
        async update(values){for(const [key,value]of Object.entries(values))write([path,key].filter(Boolean).join('/'),value);emit(path);},
        async transaction(fn){const next=fn(read(path));if(next!==undefined){write(path,next);emit(path);}return {committed:next!==undefined,snapshot:snap(read(path))};},
        onDisconnect(){return{remove(){},set(){},cancel(){}};},push(value){const child=ref(path+'/fixture_'+Date.now());if(value!==undefined)child.set(value);return child;},
        orderByChild(){return this;},startAt(){return this;},limitToLast(){return this;},limitToFirst(){return this;}
    };}
    const verified=new URLSearchParams(location.search).get('verified')!=='false';
    const user={uid,email:uid+'@example.invalid',emailVerified:verified,displayName:'Тестовый пользователь',getIdTokenResult:async()=>({claims:{email_verified:verified}}),reload:async()=>{},getIdToken:async()=>'',sendEmailVerification:async()=>{}};
    const auth={currentUser:user,onAuthStateChanged:callback=>setTimeout(()=>callback(user),20),signOut:async()=>{}};
    window.firebase={initializeApp(){},auth:()=>auth,database:()=>({ref})};
    const notice=document.createElement('div');notice.textContent='Локальная проверка · вымышленные данные · Firebase отключён';notice.style='position:fixed;bottom:0;left:0;right:0;z-index:99999;text-align:center;font:11px sans-serif;background:#183d30;color:white;padding:4px;pointer-events:none';
    document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(notice));
})();
