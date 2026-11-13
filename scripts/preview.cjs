const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    if(!['index.html','board.html'].includes(name)&&!/^assets\/[a-z0-9.-]+$/.test(name)){res.writeHead(404);res.end('Not found');return;}
    fs.readFile(path.join(root,name),(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(name)]||'text/plain','Cache-Control':'no-store'});res.end(data);});
}).listen(4173,'127.0.0.1',()=>console.log('Орбита: http://127.0.0.1:4173'));
