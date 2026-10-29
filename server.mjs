import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const defaultRoot=path.resolve(fileURLToPath(new URL('./dist/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.txt':'text/plain; charset=utf-8','.mp4':'video/mp4'};

export function createPreviewServer(root=defaultRoot){
  root=path.resolve(root);
  return http.createServer(async(request,response)=>{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    try{
      const url=new URL(request.url,'http://localhost');
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
      const target=path.resolve(root,relative);
      if(target!==root&&!target.startsWith(root+path.sep)){response.writeHead(403).end('Forbidden');return;}
      const info=await stat(target);
      if(!info.isFile()){response.writeHead(404).end('Not found');return;}
      const headers={'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
      let start=0,end=info.size-1,status=200;
      if(request.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if(!match||(!match[1]&&!match[2])){response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
        if(match[1]){start=Number(match[1]);end=match[2]?Math.min(end,Number(match[2])):end;}
        else start=Math.max(0,info.size-Number(match[2]));
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){response.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
        status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
      }
      headers['Content-Length']=Math.max(0,end-start+1);response.writeHead(status,headers);
      if(request.method==='HEAD'||info.size===0){response.end();return;}
      const stream=createReadStream(target,{start,end});
      stream.on('error',()=>response.destroy());response.on('close',()=>stream.destroy());stream.pipe(response);
    }catch{if(!response.headersSent)response.writeHead(404).end('Not found');else response.destroy();}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||4173);
  createPreviewServer().listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
}
