(function(root){
    'use strict';
    const DAY=86400000,TRIAL_DAYS=14,PRICE=590;
    const limits={start:{templates:3,mistakes:10},pro:{templates:100,mistakes:500}};
    const paid=(user,trial,now=Date.now())=>!!((['basic','pro','ultra'].includes(user?.plan)&&user.planExpiresAt>now)||(typeof trial==='number'&&trial<=now&&trial+TRIAL_DAYS*DAY>now));
    const key=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replaceAll('-',''):Date.now().toString(36)+Math.random().toString(36).slice(2);
    const text=(value,max=10000)=>String(value??'').trim().slice(0,max);
    const records=value=>Object.fromEntries(Object.entries(value||{}).filter(([,item])=>item!==null&&item!==undefined));
    function dates(start,count=1,every=1){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isInteger(count)||count<1||count>16||![1,2].includes(every))throw Error('Проверьте дату и число занятий (1–16).');
        const first=new Date(start+'T12:00:00');if(Number.isNaN(+first))throw Error('Некорректная дата');
        return Array.from({length:count},(_,i)=>{const d=new Date(first);d.setDate(d.getDate()+i*every*7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');});
    }
    const startTime=lesson=>new Date(lesson.date+'T'+lesson.time).getTime();
    function conflicts(lesson,schedule,ignoreId){
        const start=startTime(lesson),end=start+(Number(lesson.durationMinutes)||60)*60000;
        if(!Number.isFinite(start))throw Error('Проверьте дату и время занятия');
        return schedule.some(s=>!s.cancelled&&s.id!==ignoreId&&start<startTime(s)+(Number(s.durationMinutes)||60)*60000&&end>startTime(s));
    }
    function cleanSnapshot(snapshot,selected){
        const copy=JSON.parse(JSON.stringify(snapshot||{}));
        return {paper:['grid','plain','dots'].includes(copy.paper)?copy.paper:'dots',strokeHistory:selected?[]:(copy.strokeHistory||[]),items:(copy.items||[]).filter(item=>!selected||selected.includes(item.id)),deletedIds:[],chatHistory:[]};
    }
    function templateParts(snapshot,selected){
        const clean=cleanSnapshot(snapshot,selected),answers={};
        for(const item of clean.items){
            if(item.type==='subject'&&item.subjectKind==='problem'){
                const f=item.fields||{};if(f.solution||f.answer)answers[item.id]={solution:text(f.solution),answer:text(f.answer)};
                item.fields={given:text(f.given),solution:'',answer:''};
            }
        }
        return {snapshot:clean,answers};
    }
    const icsText=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const utc=date=>new Date(date).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    function calendar(lessons,origin,now=Date.now()){
        const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Orbita//Lessons//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
        for(const lesson of lessons.filter(s=>!s.cancelled&&Number.isFinite(startTime(s)))){
            const start=startTime(lesson),end=start+(Number(lesson.durationMinutes)||60)*60000;
            lines.push('BEGIN:VEVENT','UID:'+icsText(lesson.id)+'@orbita','DTSTAMP:'+utc(now),'DTSTART:'+utc(start),'DTEND:'+utc(end),'SUMMARY:'+icsText(lesson.topic),'DESCRIPTION:'+icsText('Орбита · '+(lesson.studentName||lesson.teacherName||'Занятие')),'URL:'+origin+'board.html?room='+encodeURIComponent(lesson.boardId||''),'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:Занятие через 15 минут','END:VALARM','END:VEVENT');
        }
        lines.push('END:VCALENDAR');return lines.map(line=>{let result='',bytes=0;for(const c of line){const length=new TextEncoder().encode(c).length;if(bytes+length>73){result+='\r\n ';bytes=1;}result+=c;bytes+=length;}return result;}).join('\r\n')+'\r\n';
    }
    function review(mistake,status,now=Date.now()){
        if(!['repeat','hint','independent'].includes(status))throw Error('Неизвестная отметка');
        const streak=status==='independent'?(mistake.streak||0)+1:0;
        const days=status==='repeat'?1:status==='hint'?3:Math.min(30,7*Math.max(1,streak));
        return {...mistake,status,streak,reviewedAt:now,dueAt:now+days*DAY};
    }
    const api={DAY,TRIAL_DAYS,PRICE,limits,paid,key,text,records,dates,startTime,conflicts,cleanSnapshot,templateParts,calendar,review};
    root.OrbitaLearning=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
