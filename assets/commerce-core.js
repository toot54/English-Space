(function(root){
    'use strict';
    const DAY=86400000;
    const code=value=>String(value||'').trim().toUpperCase();
    const validCode=value=>/^[A-Z0-9-]{4,40}$/.test(value);
    const rewardExpiry=reward=>reward?.activatedAt?Math.max(reward.activatedAt,reward.baseExpiry||0)+7*DAY:0;
    const expiry=account=>Math.max(Number(account?.access?.expiresAt)||0,rewardExpiry(account?.rewards?.[account?.activeRewardId]));
    function quote(promo,price,uid,now){
        if(!promo)return {amount:price,discount:0};
        if(!promo.active||now<promo.startsAt||now>=promo.expiresAt)throw Error('Промокод ещё не действует, отключён или истёк.');
        if(promo.boundUid&&promo.boundUid!==uid)throw Error('Промокод предназначен другому аккаунту.');
        if((promo.used||0)+(promo.reserved||0)>=promo.maxUses)throw Error('Лимит промокода исчерпан или зарезервирован.');
        if(promo.customers?.[uid])throw Error('Этот аккаунт уже использовал промокод или ожидает оплату по нему.');
        const discount=Math.min(price,promo.kind==='percent'?Math.round(price*promo.value)/100:promo.value);
        return {amount:Math.round((price-discount)*100)/100,discount:Math.round(discount*100)/100};
    }
    // Run only inside an authenticated admin RTDB transaction. This makes counters,
    // paid access, first-purchase attribution and reward issuance one atomic change.
    function transition(source,uid,id,action,{now,price,legacyExpiry=0,rewardCode}={}){
        const state=JSON.parse(JSON.stringify(source||{})),account=state.accounts?.[uid],order=account?.orders?.[id];
        if(!order)throw Error('Заявка не найдена.');
        if(action==='quote'){
            if(order.status!=='requested')throw Error('Счёт уже обработан.');
            const promo=order.promoCode?state.codes?.[order.promoCode]:null;
            if(order.promoCode&&!promo)throw Error('Промокод не найден.');
            const totals=quote(promo,price,uid,now);
            if(promo){promo.reserved=(promo.reserved||0)+1;(promo.customers??={})[uid]='reserved';}
            if(account.paymentNotices)delete account.paymentNotices[id];
            Object.assign(order,totals,{basePrice:price,status:'quoted',quotedAt:now});
        }else if(action==='cancel'){
            if(!['requested','quoted','paid_notice'].includes(order.status))throw Error('Заявка уже завершена.');
            const promo=state.codes?.[order.promoCode];
            if(promo?.customers?.[uid]==='reserved'){promo.reserved=Math.max(0,(promo.reserved||0)-1);delete promo.customers[uid];}
            order.status='cancelled';order.cancelledAt=now;
        }else if(action==='approve'){
            if(!['quoted','paid_notice'].includes(order.status))throw Error('Сначала подготовьте счёт. Повторное подтверждение запрещено.');
            const promo=state.codes?.[order.promoCode];
            if(order.promoCode&&promo?.customers?.[uid]!=='reserved')throw Error('Резерв промокода не найден.');
            if(promo){promo.reserved=Math.max(0,(promo.reserved||0)-1);promo.used=(promo.used||0)+1;promo.customers[uid]='used';}
            account.access={plan:'pro',expiresAt:Math.max(now,legacyExpiry,expiry(account))+30*DAY};
            order.status='approved';order.approvedAt=now;
            // A free (100% discount) order is not a paid purchase and gives no reward.
            if(order.amount>0&&!account.firstPaidOrder){
                account.firstPaidOrder=id;
                const ref=account.referral;
                if(ref&&ref.inviterUid!==uid&&state.links?.[ref.inviterUid]?.active){
                    const inviter=(state.accounts[ref.inviterUid]??={});
                    (inviter.rewards??={})['REF-'+uid]={code:rewardCode,sourceUid:uid,orderId:id,createdAt:now,claimUntil:now+30*DAY,days:7};
                    order.rewardIssued=true;
                }
            }
        }else throw Error('Неизвестное действие.');
        if(['approve','cancel'].includes(action))(account.history??={})[id+'-'+order.createdAt]={...order};
        return state;
    }
    const api={DAY,code,validCode,rewardExpiry,expiry,quote,transition};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    root.OrbitaCommerce=api;
})(typeof globalThis!=='undefined'?globalThis:this);
