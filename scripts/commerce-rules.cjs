module.exports=function(rules,{admin}){
    const own="auth != null && auth.uid === $uid && root.child('users').child($uid).child('role').val() === 'teacher'";
    const account="root.child('commerce/accounts').child($uid)";
    const active=`${account}.child('rewards').child(${account}.child('activeRewardId').val())`;
    const legacy="root.child('users').child($uid).child('planExpiresAt')";
    const access=`${account}.child('access/expiresAt')`;
    const oldReward=`(${account}.child('activeRewardId').isString() && ${active}.child('activatedAt').isNumber() ? (${active}.child('activatedAt').val() > ${active}.child('baseExpiry').val() ? ${active}.child('activatedAt').val() : ${active}.child('baseExpiry').val()) + 604800000 : 0)`;
    const legacyEnd=`(${legacy}.isNumber() ? ${legacy}.val() : 0)`;
    const paidEnd=`(${access}.isNumber() ? ${access}.val() : 0)`;
    const max=(a,b)=>`(${a} > ${b} ? ${a} : ${b})`;
    const base=max(legacyEnd,max(paidEnd,oldReward));
    rules.commerce={
        links:{'$uid':{'.read':'auth != null','.write':`${own} && !data.exists() && newData.child('active').val() === true && newData.child('createdAt').val() === now`,active:{'.validate':'newData.isBoolean()'},createdAt:{'.validate':'newData.isNumber()'},'$other':{'.validate':false}}},
        // Codes and aggregate statistics are admin-only. A teacher submits a code
        // for an invoice, without downloading the code catalogue or other accounts.
        accounts:{'$uid':{
            '.read':own,
            referral:{'.write':`${own} && !data.exists() && !${account}.child('firstPaidOrder').exists() && !${account}.child('orders').exists() && newData.child('inviterUid').isString() && newData.child('inviterUid').val() !== $uid && root.child('commerce/links').child(newData.child('inviterUid').val()).child('active').val() === true && newData.child('joinedAt').val() === now`,inviterUid:{},joinedAt:{},'$other':{'.validate':false}},
            orders:{'$order':{
                '.write':`${own} && root.child('boards/platform_config/salesEnabled').val() === true && ((!data.exists() && newData.child('status').val() === 'requested' && newData.child('createdAt').val() === now && $order === 'current') || (data.exists() && (data.child('status').val() === 'approved' || data.child('status').val() === 'cancelled') && newData.child('status').val() === 'requested' && $order === 'current' && newData.child('createdAt').val() === now))`,
                '.validate':`(${admin}) || (newData.hasChildren(['status','createdAt','promoCode']) && newData.child('promoCode').isString() && newData.child('promoCode').val().length <= 40 && !newData.child('amount').exists() && !newData.child('approvedAt').exists() && !newData.child('basePrice').exists() && !newData.child('discount').exists() && !newData.child('quotedAt').exists() && !newData.child('rewardIssued').exists() && !newData.child('cancelledAt').exists())`,
                status:{},createdAt:{},promoCode:{},amount:{},basePrice:{},discount:{},quotedAt:{},approvedAt:{},rewardIssued:{},cancelledAt:{},'$other':{'.validate':false}
            }},
            paymentNotices:{'$order':{'.write':`${own} && ${account}.child('orders').child($order).child('status').val() === 'quoted' && !data.exists() && newData.val() === now`}},
            rewards:{'$reward':{
                '.write':`${own} && data.exists() && !data.child('activatedAt').exists() && data.child('claimUntil').val() > now && newData.child('activatedAt').val() === now`,
                '.validate':`(${admin}) || (newData.child('code').val() === data.child('code').val() && newData.child('sourceUid').val() === data.child('sourceUid').val() && newData.child('orderId').val() === data.child('orderId').val() && newData.child('createdAt').val() === data.child('createdAt').val() && newData.child('claimUntil').val() === data.child('claimUntil').val() && newData.child('days').val() === 7 && newData.child('baseExpiry').val() === ${base} && newData.parent().parent().child('activeRewardId').val() === $reward)`,
                code:{},sourceUid:{},orderId:{},createdAt:{},claimUntil:{},days:{},activatedAt:{},baseExpiry:{},'$other':{'.validate':false}
            }},
            activeRewardId:{'.write':`${own} && newData.isString() && newData.parent().child('rewards').child(newData.val()).child('activatedAt').val() === now && !${account}.child('rewards').child(newData.val()).child('activatedAt').exists()`}
        }}
    };
};
