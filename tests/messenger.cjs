const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
const nodes = {}, node = s => nodes[s] ??= { innerHTML: '', textContent: '', value: '', style: {}, scrollHeight: 80, scrollTop: 0, clientHeight: 200, focus() { }, classList: { add() { }, remove() { } } };
let serial = 0, failOnce = true, requests = [], networkError = false;
const revoked = [];
class UploadRequest {
    constructor() { this.upload = {}; }
    open(method, url) { assert.equal(method, 'POST'); assert.equal(url, '/api/upload'); }
    send(form) { const file = form.get('file'); requests.push(file.name); assert.equal(this.withCredentials, true); this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 }); if (networkError) {
        this.onerror();
        return;
    } if (file.name === 'second.png' && failOnce) {
        failOnce = false;
        this.status = 503;
        this.responseText = JSON.stringify({ error: 'Попробуй ещё раз' });
    }
    else {
        this.status = 200;
        this.responseText = JSON.stringify({ file: { id: 'file-' + (++serial), name: file.name, mime: file.type, url: '/api/files/' + serial } });
    } this.onload(); }
}
const ctx = { assert, File, FormData, console, URL: { createObjectURL: () => 'blob:test-' + (++serial), revokeObjectURL: url => revoked.push(url) }, XMLHttpRequest: UploadRequest, document: { body: { dataset: {} }, querySelector: node, addEventListener() { }, documentElement: { dataset: {} } }, window: { matchMedia: () => ({ matches: false }) }, setInterval() { }, setTimeout() { }, clearTimeout() { } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('public/ui/app.js', 'utf8').replace(/boot\(\);\s*$/, ''), ctx);
(async () => {
    await vm.runInContext(`(async()=>{
me={profile:{},completed:true,privacy:{noticeAccepted:true}};nav();assert($('#nav').innerHTML.includes('Чаты'));assert($('#nav').innerHTML.includes('<svg'));
assert.equal(profileIntentions({goal:'Дружба'}).join(','),'friendship');assert.equal(profileIntentions({goal:'Отношения'}).join(','),'relationship');assert.equal(profileIntentions({goal:'Общение'}).length,2);
const badges=intentionBadges({intentions:['friendship','relationship']});assert(badges.includes('friendship'));assert(badges.includes('relationship'));
let apiCalls=[];api=async(path,method)=>{apiCalls.push([path,method]);return {people:[]}};await setDiscoverIntent('friendship');assert(apiCalls.some(x=>x[0]==='discover?intent=friendship'));
selectAttachments([new File(['a'],'first.png',{type:'image/png'}),new File(['b'],'second.png',{type:'image/png'})],'chat');
assert.equal(pendingFiles.length,2);assert.equal(drafts.length,0);assert($('#modal').innerHTML.includes('blob:test-'));
await uploadSelection();assert.equal(drafts.length,1);assert.equal(pendingFiles.length,1);assert(pendingFiles[0].error);assert($('#modal').innerHTML.includes('Попробуй ещё раз'));
await uploadSelection();assert.equal(drafts.length,2);assert.equal(pendingFiles.length,0);assert($('#attachment-drafts').innerHTML.includes('<img'));assert.equal($('#modal').innerHTML,'');
let removed=[];api=async(path,method)=>{removed.push([path,method]);return {}};await clearDrafts();assert.equal(drafts.length,0);assert.equal(removed.length,2);assert(removed.every(x=>x[1]==='DELETE'));
selectAttachments([new File(['x'],'bad.exe',{type:'application/octet-stream'})],'chat');assert.equal(pendingFiles.length,0);
selectAttachments([new File(['x'],'photo.png',{type:'image/png'})],'profile');assert.equal(pendingFiles.length,1);removePendingFile(0);assert.equal(pendingFiles.length,0);
let sent=0;send=async()=>{sent++};let event={key:'Enter',preventDefault(){},shiftKey:false};composeKey(event);assert.equal(sent,1);composeKey({...event,shiftKey:true});assert.equal(sent,1);window.matchMedia=()=>({matches:true});composeKey(event);assert.equal(sent,1);
matchList=[{id:'a',name:'Анна',last:{body:'Привет',created:1}},{id:'b',name:'Борис',last:{body:'Кино?',created:2}}];chatSearch='кино';renderConversationList();assert($('#conversation-rows').innerHTML.includes('Борис'));assert(!$('#conversation-rows').innerHTML.includes('Анна'));
activeChat='b';lastMessages='';api=async()=>({messages:[{mine:true,created:Date.now(),body:'<script>\\nПривет',attachments:[]}]});await loadMessages();assert($('#bubbles').innerHTML.includes('&lt;script&gt;'));assert($('#bubbles').innerHTML.includes('chat-date'));assert(!$('#bubbles').innerHTML.includes('<script>'));
})()`, ctx);
    assert.equal(requests.filter(x => x === 'first.png').length, 1);
    assert.equal(requests.filter(x => x === 'second.png').length, 2);
    assert(revoked.length >= 3);
    networkError = true;
    await assert.rejects(vm.runInContext("uploadFile(new File(['x'],'third.png',{type:'image/png'}),'chat',()=>{})", ctx), /Соединение/);
    console.log('PASS: intent tabs and badges, bottom navigation, staged previews, partial upload retry without duplication, draft cleanup, file validation, keyboard behavior, conversation search and escaped messages');
})().catch(e => { console.error(e); process.exitCode = 1; });
