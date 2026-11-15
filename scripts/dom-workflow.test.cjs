// DOM integration checks, without a browser or external Firebase connections.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(process.env.ORBITA_LINKEDOM_PATH||'../.tools/dom-test/node_modules/linkedom');
const html=fs.readFileSync('index.html','utf8'),{document,window:domWindow}=parseHTML(html);
domWindow.HTMLElement.prototype.showModal=function(){this.open=true;};domWindow.HTMLElement.prototype.close=function(){this.open=false;};
Object.defineProperty(domWindow.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option')){if(option.value===String(value))option.setAttribute('selected','');else option.removeAttribute('selected');}}});
class FormDataLike{constructor(form){this.entries=[];for(const input of form.querySelectorAll('input,textarea,select'))if(input.name&&!input.disabled&&(!['checkbox','radio'].includes(input.type)||input.checked))this.entries.push([input.name,input.type==='checkbox'?(input.value||'on'):input.value]);}get(key){return this.entries.find(x=>x[0]===key)?.[1]??null;}getAll(key){return this.entries.filter(x=>x[0]===key).map(x=>x[1]);}}
const state={users:{teacher:{uid:'teacher',role:'teacher',plan:'pro',planExpiresAt:Date.now()+86400000,profile:{name:'Teacher'},students:{student:{uid:'student',name:'Student',lessonPrice:300}},schedule:{},prepBoards:{}}}},messages=[];
const read=path=>path.split('/').filter(Boolean).reduce((v,k)=>v?.[k],state)??null;
function write(path,value){const keys=path.split('/').filter(Boolean);let node=state;for(const key of keys.slice(0,-1))node=node[key]??={};if(value===null)delete node[keys.at(-1)];else node[keys.at(-1)]=structuredClone(value);}
const snap=value=>({val:()=>structuredClone(value),exists:()=>value!==null});
const db={ref(path=''){return{child:key=>db.ref(path+'/'+key),once:async()=>snap(read(path)),on(){},off(){},set:async value=>write(path,value),remove:async()=>write(path,null),update:async data=>{for(const [key,value]of Object.entries(data))write([path,key].filter(Boolean).join('/'),value);},transaction:async fn=>{const value=fn(read(path));if(value!==undefined)write(path,value);return{committed:value!==undefined,snapshot:snap(read(path))};},onDisconnect:()=>({set(){},remove(){}})};}};
const storage=new Map(),location={search:'',pathname:'/index.html',href:'http://localhost/index.html',origin:'http://localhost'};
const context=vm.createContext({document,console,Blob,URL,URLSearchParams,Date,Math,Set,Map,Promise,TextEncoder,FormData:FormDataLike,crypto:require('node:crypto').webcrypto,location,
 window:{location,history:{replaceState(){}},addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
for(const file of ['access.js','commerce-core.js','commerce.js','learning-core.js','learning-hub.js','lesson-ledger.js','student-ledger-ui.js','notebooks.js','email-verification.js'])vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),context);
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())vm.runInContext(match[1],context);
vm.runInContext(fs.readFileSync('assets/orbita.js','utf8'),context);
context.testDb=db;context.testUser=state.users.teacher;context.captureToast=x=>messages.push(x);
vm.runInContext("db=testDb;currentUser={uid:'teacher'};currentUserData=testUser;demoMode=false;isPlatformAdmin=false;showToast=captureToast;currentSection='learning';",context);
const run=code=>vm.runInContext(code,context);
function sync(){context.testUser=state.users.teacher;context.testPrivate=state.teaching?.teacher||{};context.testShared={student:state.learning?.teacher?.student||{}};run('currentUserData=testUser;learningPrivate=testPrivate;learningShared=testShared;');}
async function submit(values){const form=document.querySelector('#ledger-dialog form');assert(form,'A dialog must be visible');for(const [name,value]of Object.entries(values)){const field=form.querySelector(`[name="${name}"]`);assert(field,name);if(field.type==='checkbox')field.checked=!!value;else field.value=value;}await form.onsubmit({preventDefault(){},target:form});sync();return form;}
(async()=>{
 for(const tab of ['lessons','templates','review','organize','progress']){run(`setLearningTab('${tab}')`);assert(document.querySelector('#learning-stage'));}
 run('createTextTemplate()');await submit({title:'Equations',subject:'Math',explain:'Explanation',given:'x+1=3',answer:'PRIVATE: x=2',homework:'Solve another example'});
 assert(state.teaching.teacher.templates[0]);
 const original=JSON.stringify(state.teaching.teacher.templates[0]);
 run("useLessonTemplate('0')");await submit({student:'student',date:'2099-01-01',time:'12:00'});
 const lesson=Object.values(state.users.teacher.schedule)[0];assert(lesson);
 assert(!JSON.stringify(state.boards[lesson.boardId].snapshot).includes('PRIVATE'));
 assert(JSON.stringify(state.teaching.teacher.boardAnswers[lesson.boardId]).includes('PRIVATE'));
 assert.equal(JSON.stringify(state.teaching.teacher.templates[0]),original);
 await run(`openLessonReview('${lesson.id}')`);await submit({summary:'We solved an equation',rules:'Subtract on both sides',homework:'Two exercises',next:'Word problems',action:'draft'});
 assert(!state.learning?.teacher?.student?.lessons,'Draft must not be published');
 await run(`openLessonReview('${lesson.id}')`);await submit({summary:'We solved an equation',rules:'Subtract on both sides',homework:'Two exercises',next:'Word problems',action:'publish'});
 assert.equal(state.learning.teacher.student.lessons[lesson.id].homework,'Two exercises');
 assert.equal(state.users.teacher.students.student.lessonHistory['scheduled_'+lesson.id].paid,false);
 assert.equal(state.users.teacher.students.student.lessonHistory['scheduled_'+lesson.id].amount,300);
 run('addLearningMistake()');await submit({student:'student',title:'Signs',example:'x+1=3',explanation:'Subtract 1'});
 assert(state.learning.teacher.student.mistakes[0]);
 await run("markLearningMistake('student','0','independent')");sync();assert.equal(state.learning.teacher.student.mistakes[0].status,'independent');
 run('editLearningSkill()');await submit({student:'student',title:'Equations',status:'independent',evidence:'Solved without hints'});
 run("publishFamilyReport('student')");await submit({month:'2099-01',comment:'Good work',billing:false});
 const report=state.familyReports.teacher.student['2099-01'];assert(report);assert.equal(report.billing,undefined);assert(!JSON.stringify(report).includes('PRIVATE'));
 run("preparePaymentReminder('student')");await submit({text:'Please check the payment'});assert.equal(Object.values(state.boards.pair_teacher_student.chats)[0].text,'Please check the payment');
 run('openTariffsModal()');assert(document.querySelector('#tariffs-cards-container').textContent.includes('590'));assert(!document.querySelector('#tariffs-cards-container').textContent.includes('30 учеников'));
 run('openScheduleModal()');for(const [id,value]of Object.entries({'sch-date-input':'2099-02-01','sch-time':'10:00','sch-duration':'60','sch-student-select':'student','sch-board-select':'','sch-topic':'Weekly lesson','sch-repeat-count':'4','sch-repeat-every':'1'}))document.getElementById(id).value=value;
 await run('saveScheduleItem()');sync();
 const series=Object.values(state.users.teacher.schedule).filter(s=>s.seriesId);assert.equal(series.length,4);assert.equal(new Set(series.map(s=>s.boardId)).size,4);
 const before=Object.keys(state.users.teacher.schedule).length;await run('saveScheduleItem()');assert.equal(Object.keys(state.users.teacher.schedule).length,before,'Conflicting recurrence must not partially save');
 run('addAvailabilitySlot()');await submit({date:'2099-02-03',time:'11:00',duration:'60'});
 context.testSlots={teacher:state.availability.teacher};run('learningSlots=testSlots;');
 state.rescheduleRequests={teacher:{request:{studentUid:'student',lessonId:series[0].id,slotId:'0',status:'pending',reason:'Change',targetDate:'2099-02-03',targetTime:'11:00'}}};context.testRequests=state.rescheduleRequests.teacher;run('learningRequests=testRequests;');
 await run("decideReschedule('request',true)");sync();assert.equal(state.users.teacher.schedule[series[0].id].date,'2099-02-03');assert.equal(state.boards.pair_teacher_student.schedule[series[0].id].time,'11:00');assert.equal(state.rescheduleRequests.teacher.request.status,'accepted');
 console.log('PASS: rendered lesson workflow, private template copying, draft/publication, manual payment, mistakes, skills, family report preview and tariff cards');
 context.firebase={database:{ServerValue:{TIMESTAMP:Date.now()}}};
 run('isPlatformAdmin=true;allPlatformUsersMap={teacher:currentUserData};createAdminPromo()');
 await submit({code:'QA20',kind:'percent',value:'20',startsAt:'2026-01-01T00:00',expiresAt:'2099-01-01T00:00',maxUses:'2',boundUid:''});
 assert.equal(state.commerce.codes.QA20.value,20);
 run('isPlatformAdmin=false;platformConfig.salesEnabled=true;openCommerceAccount()');
 document.getElementById('purchase-promo').value='qa20';await run('requestCommerceInvoice()');
 assert.equal(state.commerce.accounts.teacher.orders.current.promoCode,'QA20');
 context.commerceFixture=state.commerce;run('commerceState=commerceFixture;isPlatformAdmin=true;renderAdminCommerce();adminOrderAction("teacher","current","quote")');await submit({});
 assert.equal(state.commerce.accounts.teacher.orders.current.amount,472);
 context.commerceFixture=state.commerce;run('commerceState=commerceFixture;adminOrderAction("teacher","current","approve")');await submit({});
 assert.equal(state.commerce.accounts.teacher.orders.current.status,'approved');
 assert(state.commerce.accounts.teacher.history);
 console.log('PASS: admin promo creation, teacher invoice request, price reservation and payment approval UI');
})().catch(error=>{console.error(error);process.exitCode=1;});
