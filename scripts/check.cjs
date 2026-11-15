const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
for(const file of ['index.html','board.html','family.html','phone.html']){
    const source=fs.readFileSync(file,'utf8');
    let count=0;
    for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
        if(match[1].trim()){new vm.Script(match[1],{filename:file});count++;}
    }
    const staticHtml=source.split('<script>')[0];
    const ids=[...staticHtml.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,file+': duplicate IDs');
    for(const match of source.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g))assert(fs.existsSync(match[1]),'Missing asset: '+match[1]);
    console.log(file+': '+count+' inline scripts parsed, IDs and assets OK');
}
for(const file of fs.readdirSync('assets').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync('assets/'+file,'utf8'),{filename:file});
const app=fs.readFileSync('index.html','utf8');
assert(app.includes("if (isPlatformAdmin) db.ref('users')"));
assert(app.includes('OrbitaAccess.isAdmin(user,token.claims)'));
assert(!app.includes('ESpace'));
console.log('Orbita UI script and admin subscription guards OK');
