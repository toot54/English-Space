let verificationSentAt=0;
function showEmailVerification(user){
    document.getElementById('landing').hidden=true;
    document.getElementById('app-shell').style.display='none';
    document.getElementById('auth-screen').style.display='block';
    document.getElementById('auth-step-credentials').style.display='none';
    document.getElementById('auth-step-role').style.display='none';
    document.getElementById('auth-step-verification').hidden=false;
    document.getElementById('verification-email').textContent=user.email||'';
}
async function resendVerificationEmail(){
    const user=auth.currentUser;if(!user)return;
    if(Date.now()-verificationSentAt<60000){showToast('Повторное письмо можно отправить через минуту');return;}
    const button=document.getElementById('verification-resend');button.disabled=true;
    try{auth.languageCode='ru';await user.sendEmailVerification();verificationSentAt=Date.now();showToast('Письмо отправлено. Проверьте входящие и папку «Спам».',6000);}
    catch(_){showToast('Письмо не отправлено. Попробуйте немного позже.',6000);}
    finally{button.disabled=false;}
}
async function checkEmailVerification(){
    const button=document.getElementById('verification-check');button.disabled=true;
    try{
        await auth.currentUser.reload();
        if(auth.currentUser.emailVerified){await auth.currentUser.getIdToken(true);window.location.reload();}
        else showToast('Почта пока не подтверждена. Перейдите по ссылке в письме.');
    }catch(_){showToast('Не удалось проверить подтверждение. Проверьте интернет.');}
    finally{button.disabled=false;}
}
