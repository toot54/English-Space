const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ledger=require('../assets/lesson-ledger.js');
(async()=>{
    let saved,exported;
    const student={uid:'student',name:'=1+1',lessonPrice:300,lessonHistory:{old:{date:'2020-01-01',time:'12:00',topic:'Тема; "цитата"',paid:true}}};
    const schedule=[{id:'future',studentUid:'student',date:'2099-01-01',time:'12:00',lessonPrice:300}];
    const context=vm.createContext({
        OrbitaLedger:ledger,currentUser:{uid:'teacher'},currentUserData:{role:'teacher',students:{student},schedule:{future:schedule[0]}},isPlatformAdmin:false,
        db:{ref:()=>({update:async changes=>{saved=changes;}})},
        document:{getElementById:()=>({value:'500'}),createElement:()=>({click(){}})},
        getMergedScheduleList:()=>schedule,getContactsArray:()=>[student],getPairKey:()=> 'pair',
        setLocalUserCache(){},renderAllSections(){},showToast(){},setTimeout(){},
        Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}}
    });
    vm.runInContext(fs.readFileSync('assets/student-ledger-ui.js','utf8'),context);
    await context.saveStudentSubscriptionPrice('student');
    assert.equal(saved['users/teacher/students/student/lessonHistory/old'].amount,300,'Past amount must stay fixed');
    assert.equal(saved['users/teacher/schedule/future/lessonPrice'],500,'Future lessons use new rate');
    assert.equal(saved['boards/pair/schedule/future/lessonPrice'],500,'Shared schedule agrees');
    context.exportLessonLedger();
    const csv=await exported.text();
    assert(csv.includes('"\'=1+1"'),'CSV formulas must be neutralized');
    assert(csv.includes('"Тема; ""цитата"""'),'CSV quotes and separators must round-trip');
    assert(csv.includes('"300";"Оплачено"'),'Export must use historical amount');
    console.log('PASS: rate changes preserve past amounts, update future lessons and export safe CSV');
})().catch(error=>{console.error(error);process.exitCode=1;});
