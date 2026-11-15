/* Manual billing, owner-managed promotions and account-bound referral rewards. */
let commerceState={},myCommerce={},commerceStarted=false,commerceOffset=0,commercePeriod=30;
const C=()=>OrbitaCommerce;
const commerceNow=()=>Date.now()+commerceOffset;
const commerceDate=value=>value?new Date(value).toLocaleString('ru-RU'):'—';
const commerceMoney=value=>Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const commerceName=uid=>allPlatformUsersMap?.[uid]?.profile?.name||uid;
function commerceError(error){showToast(error?.message||'Не удалось сохранить. Проверьте соединение.',6000);}
function captureReferral(){try{const ref=new URLSearchParams(location.search).get('ref');if(ref&&/^[A-Za-z0-9_-]{1,128}$/.test(ref))localStorage.setItem('orbita-referral',JSON.stringify({uid:ref,until:Date.now()+30*C().DAY}));}catch(_){}}
function pendingReferral(){try{const ref=JSON.parse(localStorage.getItem('orbita-referral')||'null');return ref?.until>Date.now()&&ref.uid!==currentUser?.uid?ref.uid:null;}catch(_){return null;}}
async function initCommerce(){
    if(commerceStarted||demoMode||!db||!currentUser)return;commerceStarted=true;
    db.ref('.info/serverTimeOffset').on('value',snap=>{commerceOffset=Number(snap.val())||0;});
    if(isPlatformAdmin){db.ref('commerce').on('value',snap=>{commerceState=snap.val()||{};renderAdminDashboard();},()=>showToast('Не удалось загрузить промокоды и рефералов.'));return;}
    if(currentUserData.role!=='teacher')return;
    db.ref(`commerce/accounts/${currentUser.uid}`).on('value',snap=>{myCommerce=snap.val()||{};renderCommerceAccount();renderLearningHub();renderReferralNotice();},()=>showToast('Не удалось загрузить подписку и бонусы.'));
}
function renderReferralNotice(){
    let notice=document.getElementById('referral-notice');
    const show=!myCommerce.referral&&!myCommerce.orders&&!myCommerce.firstPaidOrder&&pendingReferral();
    if(!show){notice?.remove();return;}
    if(!notice){notice=document.createElement('div');notice.id='referral-notice';notice.className='commerce-entry';document.getElementById('sec-schedule')?.prepend(notice);}
    notice.innerHTML='<p>Вы пришли по приглашению преподавателя. Примите его до первого запроса счёта.</p><button class="btn" onclick="openCommerceAccount()">Посмотреть приглашение</button>';
}
function openCommerceAccount(){closeModals();openLedgerDialog('Подписка, промокоды и приглашения','<div id="commerce-account"></div>',async()=>true);document.querySelector('#ledger-dialog [type=submit]').textContent='Готово';renderCommerceAccount();}
function renderCommerceAccount(){
    const root=document.getElementById('commerce-account');if(!root)return;
    if(root.contains(document.activeElement)&&document.activeElement?.matches('input'))return;
    const order=myCommerce.orders?.current,ref=pendingReferral(),activeUntil=Math.max(C().expiry(myCommerce),Number(currentUserData?.planExpiresAt)||0),rewards=Object.entries(myCommerce.rewards||{});
    const statuses={requested:'Проверяем скидку и готовим счёт',quoted:'Счёт готов',approved:'Подписка активирована',cancelled:'Заявка отменена'};
    root.innerHTML=`<p>${activeUntil>commerceNow()?'Платный доступ до '+escHtml(commerceDate(activeUntil)):'Пробный период и бесплатный тариф — в разделе «Тарифы».'}</p>
    <section class="commerce-section"><h3>Промокод на подписку</h3><p class="learning-muted">Введите код и запросите счёт. Сначала мы подтвердим скидку и сумму, затем появятся реквизиты. Одна скидка на заказ, один раз на аккаунт.</p>
    ${platformConfig.salesEnabled?(!order||['approved','cancelled'].includes(order.status)?'<label>Промокод (если есть)<input class="field-input" id="purchase-promo" maxlength="40" autocomplete="off" placeholder="Например, ORBITA20"></label><button type="button" class="btn btn-jade" onclick="requestCommerceInvoice()">Запросить счёт на 30 дней</button>':''):'<p class="learning-badge">Пилот: покупки пока закрыты</p>'}
    ${order?`<article class="commerce-order"><strong>${statuses[order.status]||'Заявка'}</strong>${order.amount!==undefined?`<p>К оплате: <b>${commerceMoney(order.amount)}</b> · скидка ${commerceMoney(order.discount)}</p>`:''}${order.status==='quoted'?`<p>${escHtml(platformConfig.sbp||'Реквизиты уточняются')}</p>${myCommerce.paymentNotices?.current?'<p>Отметка об оплате получена. Ожидайте проверки перевода.</p>':`<button type="button" class="btn" onclick="notifyCommercePayment()">${order.amount===0?'Активировать бесплатный месяц':'Я оплатил эту сумму'}</button>`}<p class="learning-muted">Доступ включится после подтверждения администратором. До перевода сверяйте сумму именно с этим счётом.</p>`:''}</article>`:''}</section>
    <section class="commerce-section"><h3>Пригласить преподавателя</h3><p>За первую подтверждённую платную покупку приглашённого — 7 дней всех платных функций. Код личный: активируйте в течение 30 дней. Бонус продлит действующий платный доступ.</p><button type="button" class="btn" onclick="showReferralLink()">Моя ссылка приглашения</button>
    ${!myCommerce.referral&&!myCommerce.firstPaidOrder&&!myCommerce.orders&&ref?'<button type="button" class="btn" onclick="acceptReferral()">Принять приглашение по ссылке</button>':''}${myCommerce.referral?'<p class="learning-muted">Приглашение закреплено за вашим аккаунтом.</p>':''}
    <div class="commerce-rewards">${rewards.map(([id,r])=>`<article class="commerce-order"><code>${escHtml(r.code)}</code><p>${r.activatedAt?'Активирован · доступ до '+escHtml(commerceDate(C().rewardExpiry(r))):r.claimUntil<=commerceNow()?'Срок активации истёк':'7 дней · активировать до '+escHtml(commerceDate(r.claimUntil))}</p>${!r.activatedAt&&r.claimUntil>commerceNow()?`<button type="button" class="btn btn-jade" onclick="activateReferralReward('${escAttr(id)}')">Активировать 7 дней</button>`:''}</article>`).join('')||'<p class="learning-muted">Здесь появятся ваши личные бонусные коды.</p>'}</div></section>`;
}
async function requestCommerceInvoice(){
    const promo=C().code(document.getElementById('purchase-promo')?.value);if(promo&&!C().validCode(promo)){showToast('Код: от 4 до 40 латинских букв, цифр или дефисов.');return;}
    try{await db.ref(`commerce/accounts/${currentUser.uid}/orders/current`).set({status:'requested',createdAt:firebase.database.ServerValue.TIMESTAMP,promoCode:promo});showToast('Заявка отправлена. Реквизиты появятся после проверки скидки.');}catch(_){showToast('Не удалось отправить заявку. Проверьте соединение и статус покупки.');}
}
async function notifyCommercePayment(){try{await db.ref(`commerce/accounts/${currentUser.uid}/paymentNotices/current`).set(firebase.database.ServerValue.TIMESTAMP);showToast('Отметка отправлена администратору.');}catch(_){showToast('Не удалось отправить отметку об оплате.');}}
async function showReferralLink(){
    try{const ref=db.ref(`commerce/links/${currentUser.uid}`),snap=await ref.once('value');if(!snap.exists())await ref.set({active:true,createdAt:firebase.database.ServerValue.TIMESTAMP});else if(!snap.val().active){showToast('Приглашения для этого аккаунта отключены администратором.');return;}
        const url=new URL('index.html',location.href);url.searchParams.set('ref',currentUser.uid);
        openLedgerDialog('Ваша ссылка приглашения',`<p>Отправьте ссылку преподавателю. После входа он должен принять приглашение до первого запроса счёта.</p><input class="field-input" aria-label="Реферальная ссылка" readonly value="${escAttr(url.href)}" onclick="this.select()"><p>Первая платная покупка принесёт вам личный код на 7 дней. Бесплатная покупка по скидке 100% не учитывается.</p>`,async()=>true);
    }catch(_){showToast('Не удалось создать ссылку. Проверьте соединение.');}
}
async function acceptReferral(){
    const inviter=pendingReferral();if(!inviter)return;
    try{await db.ref(`commerce/accounts/${currentUser.uid}/referral`).set({inviterUid:inviter,joinedAt:firebase.database.ServerValue.TIMESTAMP});localStorage.removeItem('orbita-referral');showToast('Приглашение принято.');}catch(_){showToast('Приглашение недействительно или уже поздно его принять.');}
}
async function activateReferralReward(id){
    try{const [a,u]=await Promise.all([db.ref(`commerce/accounts/${currentUser.uid}`).once('value'),db.ref(`users/${currentUser.uid}/planExpiresAt`).once('value')]),account=a.val()||{},reward=account.rewards?.[id];
        if(!reward||reward.activatedAt||reward.claimUntil<=commerceNow())throw Error('Код уже активирован или истёк.');
        await db.ref(`commerce/accounts/${currentUser.uid}`).update({[`rewards/${id}`]:{...reward,activatedAt:firebase.database.ServerValue.TIMESTAMP,baseExpiry:Math.max(Number(u.val())||0,C().expiry(account))},activeRewardId:id});
        showToast('Бонус активирован: 7 дней добавлены к платному доступу.');
    }catch(_){showToast('Код не активирован. Обновите данные и попробуйте снова: код личный и действует 30 дней.');}
}
function renderAdminCommerce(){
    if(!isPlatformAdmin)return;
    const root=document.getElementById('admin-commerce-content');if(!root)return;
    const accounts=Object.entries(commerceState.accounts||{}),since=commercePeriod?commerceNow()-commercePeriod*C().DAY:0;
    const referrals=accounts.filter(([,a])=>a.referral&&a.referral.joinedAt>=since),history=accounts.flatMap(([uid,a])=>Object.entries(a.history||{}).map(([id,o])=>({...o,uid,id}))).filter(o=>o.status==='approved'&&o.approvedAt>=since),paid=history.filter(o=>o.amount>0),referredPaid=paid.filter(o=>commerceState.accounts[o.uid]?.referral);
    const rewards=accounts.flatMap(([uid,a])=>Object.values(a.rewards||{}).map(r=>({...r,uid}))).filter(r=>r.createdAt>=since);
    const cohortPaid=referrals.filter(([,a])=>a.firstPaidOrder).length;
    root.innerHTML=`<div class="learning-toolbar"><div><h2>Промокоды и рефералы</h2><p class="learning-muted">Скидки, счета и награды. Подтверждайте оплату только после проверки поступления денег.</p></div><button class="btn btn-jade" onclick="createAdminPromo()">Создать промокод</button></div>
    <div class="commerce-filter"><label>Период <select class="field-input" onchange="commercePeriod=Number(this.value);renderAdminCommerce()"><option value="30" ${commercePeriod===30?'selected':''}>30 дней</option><option value="90" ${commercePeriod===90?'selected':''}>90 дней</option><option value="0" ${commercePeriod===0?'selected':''}>Всё время</option></select></label><button class="btn" onclick="exportReferralStats()">Экспорт CSV</button></div>
    <div class="commerce-stats">${[['Принятых приглашений',referrals.length],['Купили из приглашённых',cohortPaid],['Конверсия этой группы',referrals.length?Math.round(cohortPaid/referrals.length*100)+'%':'—'],['Оплаты рефералов за период',commerceMoney(referredPaid.reduce((s,o)=>s+o.amount,0))],['Выдано наград',rewards.length],['Активировано наград',rewards.filter(r=>r.activatedAt).length]].map(([label,value])=>`<article class="learning-card"><strong>${value}</strong><span>${label}</span></article>`).join('')}</div>
    <section class="commerce-section"><h3>Счета и проверка оплат</h3>${accounts.flatMap(([uid,a])=>Object.entries(a.orders||{}).filter(([,o])=>!['approved','cancelled'].includes(o.status)).map(([id,o])=>`<article class="commerce-order"><strong>${escHtml(commerceName(uid))}</strong><p>${o.status==='requested'?'Запрос счёта':'Счёт: '+commerceMoney(o.amount)} · код ${escHtml(o.promoCode||'не указан')}</p><p>${a.paymentNotices?.[id]?'Пользователь отметил оплату':'Оплата не отмечена'} · ${escHtml(commerceDate(o.createdAt))}</p><div class="ledger-actions"><button class="btn btn-jade" onclick="adminOrderAction('${escAttr(uid)}','${escAttr(id)}','${o.status==='requested'?'quote':'approve'}')">${o.status==='requested'?'Проверить скидку и выставить счёт':'Подтвердить поступление / выдать доступ'}</button><button class="btn" onclick="adminOrderAction('${escAttr(uid)}','${escAttr(id)}','cancel')">Отменить заявку</button></div></article>`)).join('')||'<p class="learning-muted">Нет необработанных заявок.</p>'}</section>
    <section class="commerce-section"><h3>Промокоды</h3><p class="learning-muted">Условия фиксируются при создании. Можно отключить код для новых счетов. Уже выставленные счета сохраняют скидку. Резерв освобождается при отмене заявки.</p><div class="commerce-codes">${Object.entries(commerceState.codes||{}).map(([id,p])=>`<article class="commerce-order"><strong><code>${escHtml(id)}</code> · ${p.value}${p.kind==='percent'?'%':' ₽'}</strong><p>${escHtml(commerceDate(p.startsAt))} — ${escHtml(commerceDate(p.expiresAt))}</p><p>Использовано ${p.used||0} / ${p.maxUses} · в резерве ${p.reserved||0}</p><p>${p.boundUid?'Только '+escHtml(commerceName(p.boundUid)):'Все преподаватели'} · ${p.active?'Включён':'Отключён'}</p><button class="btn" onclick="toggleAdminPromo('${escAttr(id)}')">${p.active?'Отключить':'Включить'}</button></article>`).join('')||'<p class="learning-muted">Промокодов пока нет.</p>'}</div></section>
    <section class="commerce-section"><h3>Кто приглашает</h3><div class="commerce-table-wrap"><table class="admin-table"><thead><tr><th>Преподаватель</th><th>Приглашений</th><th>Купили</th><th>Сумма оплат</th><th>Награды: выданы / активированы / истекли</th></tr></thead><tbody>${Object.keys(commerceState.links||{}).map(uid=>{const refs=referrals.filter(([,a])=>a.referral.inviterUid===uid),rr=rewards.filter(r=>r.uid===uid),sales=referredPaid.filter(o=>commerceState.accounts[o.uid].referral.inviterUid===uid);return `<tr><td>${escHtml(commerceName(uid))}</td><td>${refs.length}</td><td>${refs.filter(([,a])=>a.firstPaidOrder).length}</td><td>${commerceMoney(sales.reduce((s,o)=>s+o.amount,0))}</td><td>${rr.length} / ${rr.filter(r=>r.activatedAt).length} / ${rr.filter(r=>!r.activatedAt&&r.claimUntil<=commerceNow()).length}</td></tr>`;}).join('')||'<tr><td colspan="5">Приглашений пока нет.</td></tr>'}</tbody></table></div><p class="learning-muted">Конверсия — доля принявших приглашение за выбранный период, которые уже совершили первую платную покупку. Выручка — подтверждённые оплаты за период. Переходы по ссылке без принятия приглашения не считаются.</p></section>`;
}
function localDateInput(time){const date=new Date(time);return new Date(time-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function createAdminPromo(){
    if(!isPlatformAdmin)return;const random='ORBITA-'+C().code(OrbitaLearning.key().slice(0,8));
    openLedgerDialog('Новый промокод',`<label>Код<input class="field-input" name="code" value="${random}" pattern="[A-Za-z0-9-]{4,40}" required maxlength="40"></label><label>Тип скидки<select class="field-input" name="kind"><option value="percent">Проценты</option><option value="fixed">Рубли</option></select></label><label>Размер скидки<input class="field-input" type="number" name="value" min="0.01" step="0.01" value="20" required></label><label>Начало действия<input class="field-input" name="startsAt" type="datetime-local" value="${localDateInput(commerceNow())}" required></label><label>Действует до<input class="field-input" name="expiresAt" type="datetime-local" value="${localDateInput(commerceNow()+30*C().DAY)}" required></label><label>Всего активаций<input class="field-input" name="maxUses" type="number" min="1" max="100000" value="20" required></label><label>Кому доступен<select name="boundUid" class="field-input"><option value="">Всем преподавателям</option>${Object.entries(allPlatformUsersMap||{}).filter(([uid,u])=>u.role==='teacher'&&uid!==OrbitaAccess.ADMIN_UID).map(([uid])=>`<option value="${escAttr(uid)}">${escHtml(commerceName(uid))}</option>`).join('')}</select></label><p>Один раз на аккаунт. Скидки не суммируются. Код со скидкой 100% не даёт реферальную награду.</p>`,async data=>{
        try{const id=C().code(data.get('code')),kind=data.get('kind'),value=Number(data.get('value')),startsAt=+new Date(data.get('startsAt')),expiresAt=+new Date(data.get('expiresAt')),maxUses=Number(data.get('maxUses'));
            if(!C().validCode(id)||!['percent','fixed'].includes(kind)||!Number.isFinite(value)||value<=0||(kind==='percent'&&value>100)||!Number.isFinite(startsAt)||expiresAt<=startsAt||expiresAt<=commerceNow()||!Number.isInteger(maxUses)||maxUses<1||maxUses>100000)throw Error('Проверьте код, скидку, даты и лимит.');
            const result=await db.ref('commerce/codes/'+id).transaction(old=>old?undefined:{kind,value,startsAt,expiresAt,maxUses,boundUid:data.get('boundUid')||'',active:true,used:0,reserved:0,createdAt:commerceNow()},undefined,false);
            if(!result.committed)throw Error('Этот код уже существует. Выберите другой.');showToast('Промокод создан.');return true;
        }catch(error){commerceError(error);return false;}
    });
}
async function toggleAdminPromo(id){if(!isPlatformAdmin)return;try{await db.ref(`commerce/codes/${id}/active`).transaction(active=>active===null?undefined:!active);showToast('Статус промокода обновлён.');}catch(error){commerceError(error);}}
function adminOrderAction(uid,id,action){
    if(!isPlatformAdmin)return;const o=commerceState.accounts?.[uid]?.orders?.[id];if(!o)return;
    const title=action==='approve'?'Подтвердить поступление денег':action==='quote'?'Проверить скидку и выставить счёт':'Отменить заявку';
    openLedgerDialog(title,`<p>${escHtml(commerceName(uid))}</p><p>${action==='approve'?`Проверьте поступление ${commerceMoney(o.amount)} по своим банковским данным. Подтверждение выдаст 30 дней доступа и при первой платной покупке — личную награду пригласившему.`:action==='quote'?'Скидка и её лимит проверятся при сохранении. Резерв промокода и окончательная сумма появятся в кабинете покупателя.':'Заявка закроется, резерв промокода освободится. Если деньги уже поступили, сначала урегулируйте платёж с покупателем.'}</p>`,async()=>{
        let failure='';try{const rewardCode='GIFT-'+C().code(OrbitaLearning.key().slice(0,20));const result=await db.ref('commerce').transaction(current=>{
            if(!current)return undefined;try{const latest=current.accounts?.[uid]?.orders?.[id];if(latest?.createdAt!==o.createdAt||latest?.status!==o.status||latest?.amount!==o.amount)throw Error('Заявка изменилась. Закройте окно и проверьте её заново.');return C().transition(current,uid,id,action,{now:commerceNow(),price:Number(platformConfig.practicePrice)||590,legacyExpiry:Number(allPlatformUsersMap[uid]?.planExpiresAt)||0,rewardCode});}catch(error){failure=error.message;return undefined;}
        },undefined,false);if(!result.committed)throw Error(failure||'Данные изменились. Обновите список и повторите.');showToast('Сохранено.');return true;}catch(error){commerceError(error);return false;}
    });
}
function exportReferralStats(){
    if(!isPlatformAdmin)return;const since=commercePeriod?commerceNow()-commercePeriod*C().DAY:0;
    const rows=[['Пригласивший','UID пригласившего','Приглашённый','UID приглашённого','Дата принятия','Первая платная покупка','Оплаты за период, ₽']];
    for(const [uid,a]of Object.entries(commerceState.accounts||{})){if(!a.referral||a.referral.joinedAt<since)continue;rows.push([commerceName(a.referral.inviterUid),a.referral.inviterUid,commerceName(uid),uid,commerceDate(a.referral.joinedAt),a.firstPaidOrder?'Да':'Нет',Object.values(a.history||{}).filter(o=>o.status==='approved'&&o.approvedAt>=since).reduce((s,o)=>s+o.amount,0)]);}
    const cell=value=>'"'+String(value).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"',url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='orbita-referrals.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('DOMContentLoaded',captureReferral);
