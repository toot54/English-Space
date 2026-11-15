// Tests actual rule expressions locally. Firebase CLI also validates syntax at deployment.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {rules}=JSON.parse(fs.readFileSync('firebase/database.rules.json','utf8'));
const access=require('../assets/access.js');
const admin={uid:access.ADMIN_UID,email:access.ADMIN_EMAIL,emailVerified:true,token:{email:access.ADMIN_EMAIL,email_verified:true}};
const teacher={uid:'teacher1',token:{email:'teacher@example.invalid',email_verified:true}};
const student={uid:'student1',token:{email_verified:true}};
const outsider={uid:'outsider',token:{email_verified:true}};
function snap(value){return {val:()=>value??null,exists:()=>value!=null,child:key=>snap(value?.[key]),isString:()=>typeof value==='string',isNumber:()=>typeof value==='number',isBoolean:()=>typeof value==='boolean',hasChildren:keys=>keys.every(key=>value?.[key]!=null)};}
const data={users:{teacher1:{role:'teacher',plan:'start'},student1:{role:'student',plan:'start'}},boardAccess:{prep_teacher1_123:{student1:true}}};
function evaluate(expression,auth,vars={}){
    const scope={auth,root:snap(data),data:snap(null),newData:snap(null),now:Date.now(),...vars};
    return Function(...Object.keys(scope),'return ('+expression.replace(/\.beginsWith\(/g,'.startsWith(')+');')(...Object.values(scope));
}
const readRoom=rules.boards.$room['.read'],writeRoom=rules.boards.$room['.write'];
for(const action of [readRoom,writeRoom]){
    assert.equal(evaluate(action,null,{$room:'prep_teacher1_123'}),false);
    assert.equal(evaluate(action,outsider,{$room:'prep_teacher1_123'}),false);
    assert.equal(evaluate(action,teacher,{$room:'prep_teacher1_123'}),true);
    assert.equal(evaluate(action,student,{$room:'prep_teacher1_123'}),true);
    assert.equal(evaluate(action,student,{$room:'pair_teacher1_student1'}),true);
    assert.equal(evaluate(action,outsider,{$room:'pair_teacher1_student1'}),false);
    assert.equal(evaluate(action,teacher,{$room:'platform_config'}),false);
    assert.equal(evaluate(action,teacher,{$room:'support_threads'}),false);
}
assert(evaluate(rules['.read'],admin));
assert(!evaluate(rules['.read'],{...outsider,token:admin.token}));
assert(!evaluate(rules['.read'],{...admin,token:{email:admin.email,email_verified:false}}));
assert(access.isAdmin(admin));
assert(!access.isAdmin({...admin,uid:'outsider'}));
assert(!access.isAdmin({...admin,emailVerified:false},{}));
assert(evaluate(rules.users.$uid['.read'],student,{$uid:'student1'}));
assert(!evaluate(rules.users.$uid['.read'],student,{$uid:'teacher1'}));
const validateUser=rules.users.$uid['.validate'];
assert(evaluate(validateUser,teacher,{$uid:'teacher1',data:snap({plan:'start'}),newData:snap({plan:'start',profile:{name:'Updated'}})}));
assert(!evaluate(validateUser,teacher,{$uid:'teacher1',data:snap({plan:'start'}),newData:snap({plan:'ultra'})}));
assert(!evaluate(validateUser,teacher,{$uid:'teacher1',data:snap({plan:'pro',planExpiresAt:123}),newData:snap({plan:'pro',planExpiresAt:9999999999999})}));
assert(!evaluate(rules.boardAccess.$room['.write'],student,{$room:'prep_teacher1_123'}));
assert(evaluate(rules.boardAccess.$room['.write'],teacher,{$room:'prep_teacher1_123'}));
assert(!evaluate(rules.boards.support_threads.$uid.messages.$message['.validate'],student,{newData:snap({text:'Forged admin reply',senderRole:'admin'})}));
console.log('PASS: anonymous/outsider isolation, room sharing, admin identity, private profiles, plan protection and support impersonation');
