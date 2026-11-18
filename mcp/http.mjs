import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from './workspace.mjs';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml','.pdf':'application/pdf'};
export async function startEditor(workspace,{port=0}={}) {
  const server=createServer(async(req,res)=>{
    const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try{
      const address=server.address(),host=`127.0.0.1:${address.port}`,origin=`http://${host}`;
      if(req.headers.host!==host&&req.headers.host!==`localhost:${address.port}`)return json(403,{error:'Invalid host.'});
      if(req.headers.origin&&![origin,`http://localhost:${address.port}`].includes(req.headers.origin))return json(403,{error:'Cross-origin access is not allowed.'});
      const url=new URL(req.url,origin),route=decodeURIComponent(url.pathname);
      if(req.method==='GET'&&route==='/api/status')return json(200,{app:'ornl-door-signs-companion',version:'0.3.0',editorUrl:workspace.editorUrl});
      if(req.method==='GET'&&route==='/api/session')return json(200,workspace.session());
      if(req.method==='POST'&&route.startsWith('/api/')){
        if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(415,{error:'JSON required.'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024*1024)throw Object.assign(new Error('Request too large.'),{statusCode:413});}
        const input=JSON.parse(body);
        if(route==='/api/design')return json(200,{result:await workspace.update(input),...workspace.session()});
        if(route==='/api/view'){
          for(const k of Object.keys(input))if(!['query','category','scienceArea'].includes(k)||typeof input[k]!=='string'||input[k].length>500)throw new Error('Invalid gallery filter.');
          await workspace.view(input);return json(200,workspace.session());
        }
        return json(404,{error:'Unknown API route.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed.'});
      let file;
      if(route.startsWith('/exports/'))file=await workspace.exportPath(route.slice(1));
      else{
        const relative=route==='/'?'index.html':route.slice(1);
        if(!/^(index\.html|src\/[a-zA-Z0-9_-]+\.js|src\/style\.css|assets\/[a-zA-Z0-9_./-]+)$/.test(relative)||relative.split('/').includes('..'))return json(404,{error:'Not found.'});
        file=await realpath(path.join(PROJECT_ROOT,relative));
        if(!file.startsWith(PROJECT_ROOT+path.sep)||!(await stat(file)).isFile())return json(404,{error:'Not found.'});
      }
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(route.startsWith('/exports/')?{'Content-Disposition':`attachment; filename="${path.basename(file)}"`}:{})});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(error){json(error.statusCode||((error.code==='ENOENT')?404:400),{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  workspace.editorUrl=`http://127.0.0.1:${server.address().port}/`;
  return server;
}
