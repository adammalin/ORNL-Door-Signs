import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DoorSignWorkspace} from '../mcp/workspace.mjs';
const init=async()=>new DoorSignWorkspace({directory:await mkdtemp(path.join(os.tmpdir(),'door-sign-workspace-'))}).init();

test('agent edits expose all design controls, persist, and retain undo/redo',async()=>{
  const w=await init(),created=await w.create({name:'Lab sign',design:{imageId:'campus-aerial',title:'Sample scientist'}});
  const edited=await w.update({id:created.id,expectedRevision:created.revision,patch:{organization:'Science',title:'Two-line\nname',subtitle:'Researcher',details:'Group',room:'212',titleSize:42,crop:{x:13,y:92,zoom:1.2}}});
  assert.equal(edited.design.crop.zoom,1.2);assert.equal(edited.design.room,'212');assert.ok(edited.canUndo);
  assert.equal((await w.history({id:created.id,direction:'undo'})).design.title,'Sample scientist');
  assert.equal((await w.history({id:created.id,direction:'redo'})).design.title,'Two-line\nname');
  const reopened=await new DoorSignWorkspace({directory:w.directory}).init();assert.equal(reopened.get(created.id).design.title,'Two-line\nname');
});
test('stale and invalid agent edits do not overwrite the current design',async()=>{
  const w=await init(),original=w.get();
  await w.update({patch:{title:'First edit'},expectedRevision:original.revision});
  await assert.rejects(w.update({patch:{title:'Stale edit'},expectedRevision:original.revision}),/changed since/);
  await assert.rejects(w.update({patch:{crop:{zoom:99}}}),/Invalid zoom/);
  await assert.rejects(w.update({patch:{src:'https://example.invalid'}}),/Unknown editable/);
  await assert.rejects(w.exportPath('../../outside.json'),/Invalid export/);
  assert.equal(w.get().design.title,'First edit');
});
test('native MCP exports use print size/DPI and protect against poor crops',async()=>{
  const w=await init();await w.update({patch:{imageId:'campus-aerial',title:'Print test',crop:{x:50,y:50,zoom:1}}});
  assert.equal((await w.check()).printReady,true);
  const first=await w.export(),second=await w.export({formats:['json']});
  assert.notEqual(first.artifacts[0].path,second.artifacts[0].path);
  const png=await readFile(first.artifacts.find(a=>a.format==='png').path);
  assert.equal(png.readUInt32BE(16),2550);assert.equal(png.readUInt32BE(20),1500);
  const pdf=await readFile(first.artifacts.find(a=>a.format==='pdf').path);
  assert.match(pdf.toString('latin1'),/\/MediaBox \[0 0 612 360\]/);
  await w.update({patch:{crop:{zoom:3}}});assert.equal((await w.check()).printReady,false);
  await assert.rejects(w.export({formats:['png']}),/Print check failed/);
  assert.ok((await w.export({formats:['json']})).artifacts.length===1);
});
test('batch isolates row failures, creates distinct artifacts, and preserves active sign',async()=>{
  const w=await init(),active=w.state.activeId;
  const result=await w.batch({defaults:{imageId:'campus-aerial',organization:'Batch test'},formats:['json'],signs:[{title:'One'},{title:'Two'},{title:'Bad',crop:{zoom:20}},{title:'Four'}]});
  assert.equal(result.succeeded,3);assert.equal(result.failed,1);assert.equal(result.results[2].ok,false);
  assert.equal(w.state.activeId,active);assert.equal(new Set(result.results.filter(r=>r.ok).map(r=>r.artifacts[0].path)).size,3);
});

test('explicit framing takes precedence over recommended image crops',async()=>{
  const w=await init();w.gallery.find(i=>i.id==='campus-aerial').defaultCrop={x:22,y:34,zoom:1.1};
  assert.deepEqual(w.makeDesign({imageId:'campus-aerial'}).crop,{x:22,y:34,zoom:1.1});
  assert.deepEqual(w.makeDesign({imageQuery:'campus',crop:{x:70,zoom:1.2}}).crop,{x:70,y:34,zoom:1.2});
});

test('persistent workspaces reject a competing server owner and allow release',async()=>{
  const {acquireWorkspaceLease}=await import('../mcp/lease.mjs');
  const directory=await mkdtemp(path.join(os.tmpdir(),'door-sign-lease-'));
  const release=await acquireWorkspaceLease(directory);
  await assert.rejects(acquireWorkspaceLease(directory),/already open/);
  await release();const second=await acquireWorkspaceLease(directory);await second();
});
