module.exports=function learningRules(rules,{admin}){
    const pro=t=>{
        const a=`root.child('commerce/accounts').child(${t})`,r=`${a}.child('rewards').child(${a}.child('activeRewardId').val())`;
        return `((root.child('users').child(${t}).child('planExpiresAt').isNumber() && root.child('users').child(${t}).child('planExpiresAt').val() > now && (root.child('users').child(${t}).child('plan').val() === 'basic' || root.child('users').child(${t}).child('plan').val() === 'pro' || root.child('users').child(${t}).child('plan').val() === 'ultra')) || (root.child('trials').child(${t}).isNumber() && root.child('trials').child(${t}).val() <= now && root.child('trials').child(${t}).val() + 1209600000 > now) || (${a}.child('access/expiresAt').isNumber() && ${a}.child('access/expiresAt').val() > now) || (${a}.child('activeRewardId').isString() && ${r}.child('activatedAt').isNumber() && (${r}.child('activatedAt').val() + 604800000 > now || ${r}.child('baseExpiry').val() + 604800000 > now)))`;
    };
    const owner="auth != null && auth.uid === $teacher && root.child('users').child($teacher).child('role').val() === 'teacher'";
    const linked="root.child('users').child($teacher).child('students').child($student).exists()";
    const teacherWrite=`${owner} && ${linked}`;
    const slotLimit=(free,paid)=>`(${admin}) || data.exists() || (${pro('$teacher')} ? $id.matches(${paid}) : $id.matches(${free}))`;
    rules.trials={'$teacher':{'.read':'auth != null && auth.uid === $teacher','.write':`${owner} && !data.exists() && newData.isNumber() && newData.val() === now`}};
    rules.teaching={'$teacher':{
        '.read':owner,
        templates:{'.write':owner,'$id':{'.validate':`(${slotLimit('/^[0-2]$/','/^([0-9]|[1-9][0-9])$/')}) && newData.hasChildren(['title','snapshotJson']) && newData.child('title').isString() && newData.child('title').val().length <= 150 && newData.child('snapshotJson').isString() && newData.child('snapshotJson').val().length <= 700000`}},
        answers:{'.write':owner},boardAnswers:{'.write':owner},drafts:{'.write':owner},invites:{'.write':owner}
    }};
    // Validation applies even when a write is granted higher up at users/$uid.
    rules.users.$uid.schedule={'$lesson':{seriesId:{'.validate':`(${admin}) || newData.val() === data.val() || ${pro('$uid')}`}}};
    const response={'.write':`auth != null && auth.uid === $student && ${linked}`,'.validate':"newData.hasChildren(['text','updatedAt']) && newData.child('text').isString() && newData.child('text').val().length <= 10000 && newData.child('updatedAt').isNumber()",text:{},updatedAt:{},'$other':{'.validate':false}};
    rules.learning={'$teacher':{'$student':{
        '.read':`auth != null && (auth.uid === $teacher || (auth.uid === $student && ${linked}))`,
        '.write':teacherWrite,
        mistakes:{'$id':{'.validate':`(${slotLimit('/^[0-9]$/','/^([0-9]|[1-9][0-9]|[1-4][0-9][0-9])$/')}) && newData.hasChildren(['title','example','explanation','dueAt','status']) && newData.child('title').isString() && newData.child('title').val().length <= 150 && newData.child('example').isString() && newData.child('example').val().length <= 10000 && newData.child('explanation').isString() && newData.child('explanation').val().length <= 10000 && newData.child('dueAt').isNumber()`}},
        submissions:{'$lesson':{...response,'.write':`${response['.write']} && root.child('learning').child($teacher).child($student).child('lessons').child($lesson).exists()`}},
        reviewAnswers:{'$mistake':{...response,'.write':`${response['.write']} && root.child('learning').child($teacher).child($student).child('mistakes').child($mistake).exists()`}}
    }}};
    rules.availability={'$teacher':{
        '.read':`auth != null && (auth.uid === $teacher || root.child('users').child($teacher).child('students').child(auth.uid).exists())`,
        policy:{'.write':owner,'.validate':'newData.isString() && newData.val().length <= 3000'},
        slots:{'.write':`${owner} && ${pro('$teacher')}`,'$slot':{'.write':`${owner} && !newData.exists()`,'.validate':"$slot.matches(/^([0-9]|[1-9][0-9])$/) && newData.hasChildren(['date','time','durationMinutes']) && newData.child('date').isString() && newData.child('time').isString() && newData.child('durationMinutes').isNumber() && newData.child('durationMinutes').val() >= 15 && newData.child('durationMinutes').val() <= 180"}}
    }};
    rules.rescheduleRequests={'$teacher':{'.read':owner,'$request':{
        '.read':"auth != null && data.child('studentUid').val() === auth.uid",
        '.write':`${owner} || (auth != null && (!data.exists() || data.child('status').val() !== 'pending') && newData.child('studentUid').val() === auth.uid && newData.child('status').val() === 'pending' && ${pro('$teacher')} && root.child('users').child($teacher).child('students').child(auth.uid).exists() && root.child('users').child($teacher).child('schedule').child(newData.child('lessonId').val()).child('studentUid').val() === auth.uid && root.child('users').child($teacher).child('schedule').child(newData.child('lessonId').val()).child('completed').val() !== true && !root.child('availability').child($teacher).child('slots').child(newData.child('slotId').val()).child('reservedBy').exists() && root.child('availability').child($teacher).child('slots').child(newData.child('slotId').val()).child('date').val() === newData.child('targetDate').val() && root.child('availability').child($teacher).child('slots').child(newData.child('slotId').val()).child('time').val() === newData.child('targetTime').val())`,
        '.validate':"newData.hasChildren(['studentUid','lessonId','slotId','status','createdAt']) && newData.child('reason').isString() && newData.child('reason').val().length <= 2000"
    }}};
    rules.familyInvites={'$token':{
        '.read':"auth != null && (data.child('teacherUid').val() === auth.uid || data.child('email').val() === auth.token.email)",
        '.write':`auth != null && ((data.child('teacherUid').val() === auth.uid && !newData.exists()) || (newData.child('teacherUid').val() === auth.uid && ${pro('auth.uid')} && root.child('users').child(auth.uid).child('students').child(newData.child('studentUid').val()).exists()))`,
        '.validate':"newData.hasChildren(['teacherUid','studentUid','email','expiresAt']) && newData.child('email').isString() && newData.child('expiresAt').isNumber() && newData.child('expiresAt').val() > now && newData.child('expiresAt').val() <= now + 604800000"
    }};
    const invitation="root.child('familyInvites').child(newData.child('inviteToken').val())";
    rules.guardianAccess={'$teacher':{'$student':{
        '.read':owner,
        '.write':`${owner} && !newData.exists()`,
        '$parent':{'.read':'auth != null && auth.uid === $parent',
            '.write':`(${owner} && !newData.exists()) || (auth != null && auth.uid === $parent && ${linked} && ${invitation}.child('teacherUid').val() === $teacher && ${invitation}.child('studentUid').val() === $student && ${invitation}.child('email').val() === auth.token.email && ${invitation}.child('expiresAt').val() > now)`,
            '.validate':"newData.hasChildren(['inviteToken']) && newData.child('inviteToken').isString()",inviteToken:{},'$other':{'.validate':false}}
    }}};
    const guardian="root.child('guardianAccess').child($teacher).child($student).child(auth.uid).child('inviteToken')";
    rules.familyReports={'$teacher':{'$student':{
        '.read':`auth != null && (auth.uid === $teacher || (auth.uid === $student && ${linked}) || (${guardian}.isString() && root.child('familyInvites').child(${guardian}.val()).child('email').val() === auth.token.email))`,
        '.write':`${teacherWrite} && (${pro('$teacher')} || !newData.exists())`
    }}};
    // Dedicated upload queue; clients cannot upload arbitrary unbounded file blobs here.
    const roomOwner="($room.beginsWith('prep_' + auth.uid + '_') || $room.beginsWith('hwboard_' + auth.uid + '_') || $room.beginsWith('lesson_' + auth.uid + '_') || ($room.beginsWith('pair_' + auth.uid + '_') && root.child('users').child(auth.uid).child('role').val() === 'teacher'))";
    const roomMember=`(${roomOwner} || ($room.beginsWith('pair_') && $room.endsWith('_' + auth.uid)) || root.child('boardAccess').child($room).child(auth.uid).val() === true)`;
    rules.companionUploads={'$room':{'.read':`auth != null && ${roomMember}`,
        '$upload':{'.write':`auth != null && ${roomMember} && ((!data.exists() && newData.child('uid').val() === auth.uid) || (!newData.exists() && (${roomOwner} || data.child('uid').val() === auth.uid)))`,
            '.validate':"$upload.matches(/^[0-7]$/) && newData.hasChildren(['uid','src','aspect','createdAt']) && newData.child('src').isString() && newData.child('src').val().beginsWith('data:image/jpeg;base64,') && newData.child('src').val().length <= 600000 && newData.child('aspect').isNumber() && newData.child('aspect').val() > 0 && newData.child('aspect').val() < 20",
            uid:{},src:{},aspect:{},createdAt:{},'$other':{'.validate':false}}
    }};
};
