// Application-level rendering checks with a minimal DOM; not a browser/layout test.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const elements=new Map();
for(const [,id] of html.split('<script>')[0].matchAll(/\bid="([^"]+)"/g)){
    const classes=new Set();
    elements.set(id,{id,style:{},dataset:{},value:'',textContent:'',innerText:'',innerHTML:'',hidden:false,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on??!classes.has(x))classes.add(x);else classes.delete(x);}},
        setAttribute(){},removeAttribute(){},focus(){},contains(){return false;},querySelectorAll(){return[];},querySelector(){return null;}});
}
const context=vm.createContext({console,URLSearchParams,Date,Math,Set,Map,Promise,
    document:{title:'Орбита',activeElement:null,getElementById:id=>{if(id==='learning-stage'&&!elements.has(id))elements.set(id,{innerHTML:''});assert(elements.has(id),'Missing DOM ID: '+id);return elements.get(id);},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({}),head:{appendChild(){}},body:{classList:{add(){},remove(){},toggle(){}}}},
    localStorage:{getItem:()=>null,setItem(){}},
    location:{search:'',pathname:'/',origin:'http://localhost'},
    window:{location:{search:'',pathname:'/',origin:'http://localhost'},history:{replaceState(){}},scrollTo(){},addEventListener(){}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}
});
vm.runInContext(fs.readFileSync('assets/access.js','utf8'),context);
for(const file of ['commerce-core.js','commerce.js','learning-core.js','learning-hub.js','lesson-ledger.js','student-ledger-ui.js','notebooks.js','email-verification.js'])vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),context);
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())vm.runInContext(match[1],context);
vm.runInContext(fs.readFileSync('assets/orbita.js','utf8'),context);
vm.runInContext('startOrbitaDemo()',context);
assert.equal(vm.runInContext('db',context),null,'Demo must never connect to database');
assert.equal(vm.runInContext('isPlatformAdmin',context),false);
assert.equal(elements.get('app-shell').style.display,'flex');
assert(elements.get('hero-next-lesson-info').innerHTML.includes('Квадратные уравнения'));
assert(elements.get('schedule-summary').innerHTML.includes('Учеников'));
for(const section of ['learning','cabinet','boards','practice','assignments','messages','profile','schedule'])vm.runInContext(`switchSection('${section}')`,context);
vm.runInContext("setPracticeMode('quiz');setPracticeMode('match');setPracticeMode('cards');shiftSidebarMonth(1);shiftSidebarMonth(-1);openTariffsModal();closeModals();",context);
assert(elements.get('t-prep-boards-list').innerHTML.includes('Функции и графики'));
assert(elements.get('practice-stage-container').innerHTML.includes('Дискриминант'));
assert.equal(elements.get('btn-toggle-admin-mode').style.display,'none');
vm.runInContext('toggleOwnerAdminView()',context);
assert.equal(vm.runInContext('isOwnerAdminView',context),false);
console.log('PASS: offline demo, all seven sections, practice modes, calendar, tariffs, admin denial');
vm.runInContext('isPlatformAdmin=true;launchAppShell();switchSection("schedule");',context);
assert.equal(vm.runInContext('currentSection',context),'admin');
assert.equal(elements.get('regular-nav-list').style.display,'none');
assert.equal(elements.get('admin-nav-list').style.display,'flex');
assert.equal(elements.get('sidebar-tariff-btn').style.display,'none');
console.log('PASS: administrator is confined to the admin workspace');
