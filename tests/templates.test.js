import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultDesign,validateDesign,patchDesign,SIZES,fileStem} from '../src/model.js';
import {DoorSignWorkspace} from '../mcp/workspace.mjs';
const init=async()=>new DoorSignWorkspace({directory:await mkdtemp(path.join(os.tmpdir(),'door-sign-templates-'))}).init();

test('old saved documents gain optional controls without changing the medium design',async()=>{
 const w=await init(),legacy=defaultDesign();delete legacy.showSubtitle;delete legacy.showImage;delete legacy.entries;
 const opened=validateDesign(legacy,w.gallery);
 assert.equal(opened.showSubtitle,true);assert.equal(opened.showImage,true);assert.deepEqual(opened.entries,[]);
 assert.equal(opened.sizeId,'medium-landscape');assert.equal(opened.titleSize,55);
 const small=patchDesign(opened,{sizeId:'small-room'},w.gallery);assert.equal(small.titleSize,84);
 assert.equal(patchDesign(small,{sizeId:'medium-landscape'},w.gallery).titleSize,55);
 assert.throws(()=>patchDesign(small,{showSubtitle:'false'},w.gallery),/visibility/);
 assert.throws(()=>patchDesign(small,{showImage:false},w.gallery),/requires a side image/);
 assert.equal(fileStem('Kitchen','small-room'),'Kitchen-8.75x2.5');
});

test('small subtitle toggle changes artwork and preserves text while hidden',async()=>{
 const w=await init();const d=await w.create({design:{sizeId:'small-room',imageId:'campus-aerial',title:'Kitchen',subtitle:'ROOM 217',showSubtitle:false}});
 const before=await w.preview(d.id,100);assert.equal(before.canvas.width,875);assert.equal(before.canvas.height,250);
 await w.update({id:d.id,patch:{subtitle:'ROOM 218'}});
 assert.deepEqual(await before.canvas.encode('png'),await (await w.preview(d.id,100)).canvas.encode('png'));
 await w.update({id:d.id,patch:{showSubtitle:true}});const after=await w.preview(d.id,100);
 assert.notDeepEqual(await before.canvas.encode('png'),await after.canvas.encode('png'));
 assert.ok(after.quality.hitRegions.some(x=>x.field==='subtitle'));
 const reopened=validateDesign(JSON.parse(JSON.stringify(w.get(d.id).design)),w.gallery);assert.equal(reopened.subtitle,'ROOM 218');assert.equal(reopened.showSubtitle,true);
});

test('large names support add, remove, order, blank sub-names, styles and persistence',async()=>{
 const w=await init();const d=await w.create({design:{sizeId:'large-directors',imageId:'campus-aerial'}});
 const entries=[{name:'Sample name',subname:'',style:'primary',align:'left'},{name:'Sample assistant',subname:'Sample role',style:'assistant',align:'right'}];
 await w.update({id:d.id,patch:{entries,showImage:false}});assert.equal((await w.check(d.id)).printReady,true);
 await w.update({id:d.id,patch:{entries:[entries[1]]}});assert.equal(w.get(d.id).design.entries[0].name,'Sample assistant');
 await w.history({id:d.id,direction:'undo'});assert.deepEqual(w.get(d.id).design.entries,entries);
 await assert.rejects(w.update({id:d.id,patch:{entries:Array(13).fill(entries[0])}}),/at most 12/);
 await assert.rejects(w.update({id:d.id,patch:{entries:[{...entries[0],align:'bad'}]}}),/alignment/);
 await w.update({id:d.id,patch:{entries:[],imageId:null}});assert.equal((await w.check(d.id)).printReady,true);
  await w.update({id:d.id,patch:{showImage:true}});assert.equal(w.get(d.id).design.imageId,'campus-aerial');
  await w.history({id:d.id,direction:'undo'});assert.equal(w.get(d.id).design.imageId,null);
 const reopened=await new DoorSignWorkspace({directory:w.directory}).init();assert.deepEqual(reopened.get(d.id).design.entries,[]);
});

test('new templates export precise physical sizes and correct size filenames',async()=>{
 const w=await init();
 for(const sizeId of ['small-room','large-bsd','large-directors','large-directors-staff']){
  const d=await w.create({design:{sizeId,imageId:'campus-aerial'}});const result=await w.export({id:d.id,formats:['png','pdf','json']});
  const size=SIZES[sizeId],png=await readFile(result.artifacts.find(a=>a.format==='png').path);
  assert.equal(png.readUInt32BE(16),Math.round(size.width*300));assert.equal(png.readUInt32BE(20),Math.round(size.height*300));
  const pdf=await readFile(result.artifacts.find(a=>a.format==='pdf').path,'latin1');assert.ok(pdf.includes(`/MediaBox [0 0 ${size.width*72} ${size.height*72}]`));
  assert.ok(result.artifacts.every(a=>a.filename.includes(`-${size.width}x${size.height}.`)));
 }
});
