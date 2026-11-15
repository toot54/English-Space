(function(root){
    'use strict';
    const money=value=>typeof value==='number' && Number.isFinite(value) && value>=0 ? Math.round(value*100)/100 : null;
    const price=student=>money(student?.lessonPrice);
    const amount=(lesson,student)=>money(lesson?.amount) ?? price(student) ?? 0;
    const endTime=lesson=>new Date(`${lesson.date}T${lesson.time}`).getTime()+(Number(lesson.durationMinutes)||60)*60000;
    function history(student,schedule,now=Date.now()){
        const rows=Object.entries(student?.lessonHistory||{}).map(([id,h])=>({...h,id}));
        const linked=new Set(rows.map(h=>h.scheduleId).filter(Boolean));
        for(const lesson of schedule){
            if(lesson.studentUid!==student?.uid || lesson.cancelled || lesson.historyDeleted || linked.has(lesson.id))continue;
            if(!lesson.completed && !(endTime(lesson)<=now))continue;
            // Old records had no scheduleId. Match those without duplicating them.
            if(rows.some(h=>!h.scheduleId && h.date===lesson.date && h.time===lesson.time && h.topic===lesson.topic))continue;
            rows.push({id:'scheduled_'+lesson.id,scheduleId:lesson.id,date:lesson.date,time:lesson.time,topic:lesson.topic,amount:money(lesson.lessonPrice) ?? price(student),paid:false,automatic:true});
        }
        return rows.filter(h=>!h.voided).sort((a,b)=>(b.date+'T'+b.time).localeCompare(a.date+'T'+a.time));
    }
    function totals(students,schedule,now=Date.now()){
        const date=new Date(now), month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        let forecast=0,paid=0,unpaid=0,unpriced=0;
        for(const student of students){
            const rows=history(student,schedule,now), links=new Set(rows.map(h=>h.scheduleId));
            for(const row of rows){
                const value=amount(row,student);
                if(row.paid)paid+=value;else unpaid+=value;
                if(row.date?.startsWith(month))forecast+=value;
                if(money(row.amount)===null && price(student)===null)unpriced++;
            }
            for(const lesson of schedule){
                if(lesson.studentUid!==student.uid || lesson.cancelled || lesson.historyDeleted || !lesson.date?.startsWith(month) || links.has(lesson.id))continue;
                if(rows.some(h=>!h.scheduleId && h.date===lesson.date && h.time===lesson.time && h.topic===lesson.topic))continue;
                forecast+=money(lesson.lessonPrice) ?? price(student) ?? 0;
            }
        }
        return {forecast:money(forecast),paid:money(paid),unpaid:money(unpaid),unpriced};
    }
    const api={money,price,amount,endTime,history,totals};
    root.OrbitaLedger=api;
    if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
