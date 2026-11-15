/* Mobile board gestures and bounded WebRTC recovery. No media is relayed through RTDB. */
function queueIceRestart(){
    if(rtcClosed || reconnectTimer || !pc)return;
    if(reconnectAttempts>=4){setRtcStatus('Связь не установлена. Попробуйте другую сеть или переподключение.');return;}
    reconnectTimer=setTimeout(()=>{
        reconnectTimer=null;
        if(rtcClosed || !pc || pc.connectionState==='connected')return;
        reconnectAttempts++;
        pc.restartIce();
        sendRtcSignal({kind:'hello'});
        scheduleDebouncedOffer();
        queueIceRestart();
    },Math.min(12000,2500*Math.pow(1.5,reconnectAttempts)));
}
function cancelBoardGesture(){
    drawing=false;panning=false;currentStrokePoints=[];currentStrokeId=null;drawingPointerId=null;
    tempCtx.clearRect(0,0,tempCanvas.width,tempCanvas.height);
    redrawAllStrokes();
    if(roomRef)roomRef.child(`liveStroke/${role}`).set({active:false}).catch(()=>{});
}
const boardPointers=new Set();
viewport.addEventListener('pointerdown',e=>{
    if(e.target.closest('button,input,textarea,.lesson-notebook-panel,.widget,.board-text-node,.left-toolbar,.tool-settings-card,.bottom-left-island,.bottom-right-island'))return;
    boardPointers.add(e.pointerId);
    if(boardPointers.size>1){cancelBoardGesture();e.stopImmediatePropagation();}
},true);
viewport.addEventListener('pointermove',e=>{if(boardPointers.size>1)e.stopImmediatePropagation();},true);
window.addEventListener('pointerup',e=>boardPointers.delete(e.pointerId),true);
window.addEventListener('pointercancel',e=>{boardPointers.delete(e.pointerId);cancelBoardGesture();});
window.addEventListener('online',()=>{if(boardReady && !rtcClosed){setRtcStatus('Сеть восстановлена. Подключаемся…');reconnectAttempts=0;queueIceRestart();}});
window.addEventListener('offline',()=>setRtcStatus('Нет интернета. Изменения сохраняются на устройстве.'));
window.addEventListener('pagehide',()=>{flushBoardStateImmediate();cleanupWebRTC();localChannel.close();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
document.addEventListener('visibilitychange',()=>{
    if(document.hidden)flushBoardStateImmediate();
    else if(boardReady && !rtcClosed && pc && pc.connectionState!=='connected')queueIceRestart();
});
document.querySelectorAll('button[title]').forEach(button=>{if(!button.getAttribute('aria-label'))button.setAttribute('aria-label',button.title);});
document.getElementById('rtc-status-bar').setAttribute('role','status');
document.getElementById('chat-input-field').setAttribute('aria-label','Сообщение участнику урока');
const sidebarToggle=document.querySelector('[onclick="toggleSidebarPanel()"]');
if(sidebarToggle){sidebarToggle.setAttribute('aria-label','Камеры и чат');sidebarToggle.insertAdjacentHTML('beforeend','<span class="mobile-board-label">Связь</span>');}
if(window.matchMedia('(max-width: 760px)').matches){
    document.getElementById('class-sidebar').classList.add('collapsed');
    boardScale=.7;
    boardX=viewport.clientWidth/2-1800*boardScale;
    boardY=viewport.clientHeight/2-1200*boardScale;
    updateZoomUI();applyBoardTransform();
}
// Cap video bandwidth while preserving voice on limited mobile connections.
const originalAttachTrack=attachOrReplaceTrack;
attachOrReplaceTrack=async function(track){
    await originalAttachTrack(track);
    if(track.kind==='video'){
        const sender=pc?.getSenders().find(s=>s.track===track);
        if(sender){try{const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=650000;await sender.setParameters(params);}catch(_){}}
    }
};
