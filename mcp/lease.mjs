// One stdio server owns each persistent workspace. Parallel tool calls share its
// serialized mutation queue; separate hosts must use separate workspace roots.
import {mkdir,open,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function acquireWorkspaceLease(directory) {
  await mkdir(directory,{recursive:true});
  const file=path.join(directory,'.server-lease.json'),token=randomUUID();
  for(let attempt=0;attempt<3;attempt++) {
    let handle;
    try {
      handle=await open(file,'wx',0o600);
      await handle.writeFile(JSON.stringify({pid:process.pid,token}));await handle.close();
      return async()=>{
        try{const owner=JSON.parse(await readFile(file,'utf8'));if(owner.token===token)await unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}
      };
    }catch(error){
      if(handle){await handle.close().catch(()=>{});throw error;}
      if(error.code!=='EEXIST')throw error;
      let owner;
      try{owner=JSON.parse(await readFile(file,'utf8'));}catch{throw new Error('The workspace has an unreadable server lease. Check for a running Door Sign Studio server before removing .server-lease.json.');}
      if(!Number.isInteger(owner.pid)||owner.pid<1)throw new Error('Invalid workspace server lease.');
      try{process.kill(owner.pid,0);throw new Error('This workspace is already open in another Door Sign Studio server. Reuse that connection or set a different DOOR_SIGNS_WORKSPACE.');}
      catch(error){if(error.code!=='ESRCH')throw error;}
      // The recorded process no longer exists. Only remove the lease inspected.
      const latest=JSON.parse(await readFile(file,'utf8'));
      if(latest.token===owner.token)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    }
  }
  throw new Error('Workspace ownership changed. Start the server again.');
}
