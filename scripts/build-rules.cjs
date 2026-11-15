// Generates reviewed Realtime Database rules. Deploy separately from GitHub Pages.
const fs=require('node:fs');
const uid='bvEGSBPw8wTWuH5gthAiEMpaZoe2';
const admin=`auth != null && auth.uid === '${uid}' && auth.token.email === 'naran33.ru@gmail.com' && auth.token.email_verified === true`;
const owner=`($room.beginsWith('prep_' + auth.uid + '_') || $room.beginsWith('hwboard_' + auth.uid + '_') || $room.beginsWith('lesson_' + auth.uid + '_'))`;
const pair=`($room.beginsWith('pair_' + auth.uid + '_') || ($room.beginsWith('pair_') && $room.endsWith('_' + auth.uid)))`;
const rules={
    '.read':admin,'.write':admin,
    users:{
        '$uid':{
            '.read':'auth != null && auth.uid === $uid',
            '.write':'auth != null && auth.uid === $uid',
            '.validate':`(${admin}) || (newData.child('plan').val() === data.child('plan').val() || (!data.child('plan').exists() && newData.child('plan').val() === 'start')) && newData.child('planExpiresAt').val() === data.child('planExpiresAt').val()`,
            profile:{'.read':'auth != null'},
            students:{'$student':{
                '.write':"auth != null && auth.uid === $student && root.child('users').child($uid).child('role').val() === 'teacher' && !data.exists() && newData.child('uid').val() === auth.uid && !newData.child('lessonPrice').exists() && !newData.child('lessonHistory').exists()",
                '.validate':`(${admin}) || auth.uid === $uid || (newData.child('uid').val() === auth.uid && ((!data.exists() && newData.child('lessonsBalance').val() === 0) || (data.exists() && newData.child('lessonsBalance').val() === data.child('lessonsBalance').val() && newData.child('subscriptionPrice').val() === data.child('subscriptionPrice').val())))`,
                name:{'.write':"auth != null && auth.uid === $student && data.parent().child('uid').val() === auth.uid && newData.isString() && newData.val().length <= 150"},
                uid:{'.write':"auth != null && auth.uid === $student && data.val() === auth.uid && newData.val() === auth.uid"},
                lessonPrice:{'.validate':`(${admin}) || auth.uid === $uid || newData.val() === data.val()`},
                lessonHistory:{'$lesson':{'.validate':`(${admin}) || auth.uid === $uid`}}
            }},
            teachers:{'$teacher':{'.write':'auth != null && auth.uid === $teacher && root.child("users").child(auth.uid).child("students").child($uid).exists()'}}
        }
    },
    boardAccess:{'$room':{
        '.read':`auth != null && (${owner} || data.child(auth.uid).val() === true)`,
        '.write':`auth != null && ${owner}`,
        '$member':{'.validate':'newData.isBoolean()'}
    }},
    boards:{
        platform_config:{'.read':'auth != null'},
        support_threads:{'$uid':{
            '.read':'auth != null && auth.uid === $uid',
            meta:{'.write':'auth != null && auth.uid === $uid'},
            messages:{'$message':{
                '.write':'auth != null && auth.uid === $uid && !data.exists()',
                '.validate':`(${admin}) || (newData.child('senderRole').val() !== 'admin' && newData.child('text').isString() && newData.child('text').val().length <= 10000)`
            }}
        }},
        payment_requests:{'$request':{
            '.read':'auth != null && data.child("uid").val() === auth.uid',
            '.write':'auth != null && !data.exists() && newData.child("uid").val() === auth.uid',
            '.validate':`(${admin}) || (newData.hasChildren(['uid','planKey','amount','ts']) && (newData.child('planKey').val() === 'basic' || newData.child('planKey').val() === 'pro' || newData.child('planKey').val() === 'ultra') && newData.child('amount').isNumber() && newData.child('amount').val() > 0)`
        }},
        '$room':{
            '.read':`auth != null && (${owner} || ${pair} || root.child('boardAccess').child($room).child(auth.uid).val() === true || $room.beginsWith('presence_'))`,
            '.write':`auth != null && (${owner} || ${pair} || root.child('boardAccess').child($room).child(auth.uid).val() === true || $room === 'presence_' + auth.uid)`,
            events:{'.indexOn':['ts']},rtcSignals:{'.indexOn':['ts']}
        }
    }
};
// An unverified email account may authenticate to request a verification email,
// but cannot read or write application data, even using the REST API directly.
function requireVerified(node){
    for(const [key,value] of Object.entries(node)){
        if((key==='.read'||key==='.write')&&typeof value==='string')node[key]=`auth != null && auth.token.email_verified === true && (${value})`;
        else if(value && typeof value==='object')requireVerified(value);
    }
}
require('./learning-rules.cjs')(rules,{admin});
require('./commerce-rules.cjs')(rules,{admin});
requireVerified(rules);
fs.mkdirSync('firebase',{recursive:true});
fs.writeFileSync('firebase/database.rules.json',JSON.stringify({rules},null,2)+'\n');
console.log('Generated Firebase rules');
