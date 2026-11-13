(function(root){
    'use strict';
    const ADMIN_UID='bvEGSBPw8wTWuH5gthAiEMpaZoe2';
    const ADMIN_EMAIL='naran33.ru@gmail.com';
    function isAdmin(user,claims={}){
        return !!user && user.uid===ADMIN_UID && (user.email||'').toLowerCase()===ADMIN_EMAIL && (claims.email_verified===true || user.emailVerified===true);
    }
    function ownsRoom(uid,room){return ['prep_','hwboard_','lesson_'].some(prefix=>room.startsWith(prefix+uid+'_'));}
    const api={ADMIN_UID,ADMIN_EMAIL,isAdmin,ownsRoom};
    root.OrbitaAccess=api;
    if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
