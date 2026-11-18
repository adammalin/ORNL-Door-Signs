import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {DoorSignWorkspace} from '../mcp/workspace.mjs';
import {createMcpServer} from '../mcp/server.mjs';

test('real MCP client discovers tools and calls editing, validation, preview and batch APIs',async()=>{
  const workspace=await new DoorSignWorkspace({directory:await mkdtemp(path.join(os.tmpdir(),'door-sign-protocol-'))}).init();
  const server=createMcpServer(workspace),client=new Client({name:'door-sign-tests',version:'1.0.0'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  try{
    const list=await client.listTools();assert.ok(list.tools.length>=20);
    const call=(name,args={})=>client.callTool({name,arguments:args});
    const status=await call('get_status');assert.equal(status.isError,undefined);
    const templates=await call('list_templates');assert.equal(Object.keys(JSON.parse(templates.content[0].text).templates).length,7);
    const created=await call('create_design',{design:{title:'MCP protocol test',imageId:'campus-aerial'}});assert.ok(!created.isError);
    const item=JSON.parse(created.content[0].text);
    await call('update_design',{id:item.id,expectedRevision:item.revision,patch:{subtitle:'Researcher',room:'101'}});
    const stale=await call('update_design',{id:item.id,expectedRevision:item.revision,patch:{title:'Stale'}});assert.equal(stale.isError,true);
    const invalid=await call('set_crop',{crop:{zoom:99}});assert.equal(invalid.isError,true);
    const preview=await call('preview_design',{id:item.id,dpi:72});assert.equal(preview.content[1].type,'image');assert.ok(preview.content[1].data.length>1000);
    const small=await call('create_design',{design:{sizeId:'small-room',title:'Kitchen',subtitle:'ROOM 217',showSubtitle:true,titleSize:84,imageId:'campus-aerial'}});assert.ok(!small.isError);
    const large=await call('create_design',{design:{sizeId:'large-bsd',showImage:false,imageId:null,entries:[{name:'Sample name',subname:'',style:'assistant',align:'right'}]}});assert.ok(!large.isError);
    const largeRecord=JSON.parse(large.content[0].text);
    const removed=await call('update_design',{id:largeRecord.id,patch:{entries:[]},expectedRevision:largeRecord.revision});assert.deepEqual(JSON.parse(removed.content[0].text).design.entries,[]);
    const batch=await call('batch_create_signs',{defaults:{imageId:'campus-aerial'},signs:[{title:'Batch A'},{title:'Batch B'}],formats:['json']});assert.equal(JSON.parse(batch.content[0].text).succeeded,2);
    const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='doorsigns://guide'));
    const guide=await client.readResource({uri:'doorsigns://guide'});assert.match(guide.contents[0].text,/batch_create_signs/);
  }finally{await client.close();await server.close();}
});
