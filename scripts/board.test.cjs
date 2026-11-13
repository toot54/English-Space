const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('board.html','utf8');
const safe=html.slice(html.indexOf('        function boardText('),html.indexOf('        function restoreSnapshotData('));
const context=vm.createContext({});
vm.runInContext(safe,context);
assert.equal(context.boardText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
assert.equal(context.boardText('</textarea><script>x</script>'), '&lt;/textarea&gt;&lt;script&gt;x&lt;/script&gt;');
assert.equal(context.validBoardId("x');alert(1)//"),false);
assert.equal(context.validBoardId('text-1700000000000'),true);
assert.equal(context.safeBoardItem({id:'text-1',color:'red;" onmouseover="evil()',fontSize:'1000'}).color,'#1f2937');
assert.equal(context.safeBoardItem({id:'text-1',fontSize:1000}).fontSize,120);
assert.equal(context.safeBoardItem({id:'unsafe id'}),null);
const code=fs.readFileSync('assets/board-enhancements.js','utf8');
const retry=code.slice(code.indexOf('function queueIceRestart'),code.indexOf('function cancelBoardGesture'));
const callbacks=[];
let restarts=0,offers=0,lastStatus='';
const rtc=vm.createContext({rtcClosed:false,reconnectTimer:null,reconnectAttempts:0,
    pc:{connectionState:'failed',restartIce(){restarts++;}},
    setTimeout(fn){callbacks.push(fn);return callbacks.length;},
    sendRtcSignal(){},scheduleDebouncedOffer(){offers++;},setRtcStatus(s){lastStatus=s;}
});
vm.runInContext(retry,rtc);
rtc.queueIceRestart();rtc.queueIceRestart();
assert.equal(callbacks.length,1,'Repeated state events must not schedule parallel retries');
for(let i=0;i<callbacks.length;i++)callbacks[i]();
assert.equal(restarts,4);assert.equal(offers,4);
assert(lastStatus.includes('Связь не установлена'));
rtc.reconnectAttempts=0;rtc.reconnectTimer=null;rtc.pc.connectionState='connected';
rtc.queueIceRestart();callbacks.at(-1)();
assert.equal(restarts,4,'Recovered connection must not be restarted');
console.log('PASS: board text injection defense, safe item IDs, font bounds and bounded RTC recovery');
