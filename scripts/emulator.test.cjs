// Run with the Firebase Realtime Database emulator listening on 127.0.0.1:9000.
// All data is synthetic and stays in the isolated orbita-test namespace.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {ADMIN_UID, ADMIN_EMAIL} = require('../assets/access.js');
const base = 'http://127.0.0.1:9000';
async function request(path, method = 'GET', body, auth = null) {
    const url = new URL(base + path + '.json');
    url.searchParams.set('ns', 'orbita-test');
    const headers = {'Content-Type':'application/json'};
    if (auth === 'owner') headers.Authorization = 'Bearer owner';
    else if (auth) {
        headers.Authorization = 'Bearer owner';
        url.searchParams.set('auth_variable_override', JSON.stringify(auth));
    }
    const res = await fetch(url, {method, headers, body:body === undefined ? undefined : JSON.stringify(body)});
    const data = await res.json();
    return {status:res.status, data};
}
async function allowed(path,method,body,auth) {
    const result = await request(path,method,body,auth);
    assert.equal(result.status,200, `${method||'GET'} ${path}: ${JSON.stringify(result.data)}`);
    return result.data;
}
async function denied(path,method,body,auth) {
    const result = await request(path,method,body,auth);
    assert([401,403].includes(result.status), `Expected denial ${method||'GET'} ${path}, got ${result.status}`);
}
(async()=>{
    const rules = JSON.parse(fs.readFileSync('firebase/database.rules.json','utf8'));
    await allowed('/.settings/rules','PUT',rules,'owner');
    const teacher={uid:'teacher1',token:{email:'teacher@example.invalid',email_verified:true}};
    const student={uid:'student1',token:{}};
    const outsider={uid:'outsider',token:{}};
    const admin={uid:ADMIN_UID,token:{email:ADMIN_EMAIL,email_verified:true}};
    await allowed('/','PUT',{
        users:{teacher1:{role:'teacher',plan:'start',profile:{name:'Teacher'}},student1:{role:'student',plan:'start'}},
        boards:{prep_teacher1_123:{participants:{teacher:{name:'Teacher'}}},pair_teacher1_student1:{messages:{}}}
    },'owner');
    await denied('/boards/prep_teacher1_123');
    await denied('/boards/prep_teacher1_123','PUT',{},outsider);
    await denied('/users/teacher1',undefined,undefined,outsider);
    await denied('/users',undefined,undefined,teacher);
    await allowed('/users',undefined,undefined,admin);
    await denied('/users',undefined,undefined,{...outsider,token:admin.token});
    await allowed('/users/teacher1/profile/name','PUT','Updated teacher',teacher);
    await denied('/users/teacher1/plan','PUT','ultra',teacher);
    await denied('/users/teacher1/plan','DELETE',undefined,teacher);
    await allowed('/users/teacher1','PATCH',{plan:'pro',planExpiresAt:Date.now()+86400000},admin);
    await denied('/users/teacher1/planExpiresAt','PUT',9999999999999,teacher);
    await allowed('/','PATCH',{
        'users/teacher1/students/student1':{uid:'student1',name:'Student',lessonsBalance:0,subscriptionPrice:0},
        'users/student1/teachers/teacher1':{uid:'teacher1',name:'Teacher'}
    },student);
    await denied('/users/teacher1/students/student1/lessonsBalance','PUT',100,student);
    await allowed('/users/teacher1/students/student1/lessonsBalance','PUT',4,teacher);
    await allowed('/boardAccess/prep_teacher1_123/student1','PUT',true,teacher);
    await allowed('/boards/prep_teacher1_123',undefined,undefined,student);
    await allowed('/boards/prep_teacher1_123/events/event1','PUT',{type:'draw_commit',ts:Date.now()},student);
    await denied('/boardAccess/prep_teacher1_123/outsider','PUT',true,student);
    await denied('/boards/pair_teacher1_student1',undefined,undefined,outsider);
    await allowed('/boards/pair_teacher1_student1/messages/message1','PUT',{text:'Hello'},student);
    await allowed('/boards/support_threads/student1/messages/one','PUT',{text:'Help',senderRole:'student'},student);
    await denied('/boards/support_threads/student1/messages/two','PUT',{text:'Fake admin',senderRole:'admin'},student);
    await allowed('/boards/support_threads/student1/messages/two','PUT',{text:'Reply',senderRole:'admin'},admin);
    await allowed('/boards/payment_requests/one','PUT',{uid:'student1',planKey:'pro',amount:890,ts:Date.now()},student);
    await denied('/boards/payment_requests/one/status','PUT','approved',student);
    await denied('/boards/platform_config','PUT',{prices:{pro:1}},teacher);
    console.log('PASS: Firebase emulator compiled rules; admin, private data, invites, balance, plans, sharing, chat, support, payment permissions verified');
})().catch(error=>{console.error(error);process.exitCode=1;});
