import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultDesign,validateDesign,patchDesign,SIZES,MEDIUM_LAYOUTS,fileStem} from '../src/model.js';
import {DoorSignWorkspace} from '../mcp/workspace.mjs';
const init=async()=>new DoorSignWorkspace({directory:await mkdtemp(path.join(os.tmpdir(),'door-sign-templates-'))}).init();

test('old saved documents gain optional controls without changing the medium design',async()=>{
 const w=await init(),legacy=defaultDesign();delete legacy.showSubtitle;delete legacy.showImage;delete legacy.entries;
 const opened=validateDesign(legacy,w.gallery);
 assert.equal(opened.showSubtitle,true);assert.equal(opened.showImage,true);assert.deepEqual(opened.entries,[]);
 assert.equal(opened.sizeId,'medium-landscape');assert.equal(opened.titleSize,55);
 const active=w.state.designs[w.state.activeId];delete active.design.showImage;await w.imagePicker({action:'open'});assert.equal(w.session().view.galleryOpen,true);
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

test('square and menu templates remain image-free with editable backgrounds and lists',async()=>{
 const w=await init();
 for(const sizeId of ['square-bsd','large-menu']){
  const d=await w.create({design:{sizeId}});assert.equal(d.design.showImage,false);assert.equal(d.design.imageId,null);
  assert.equal((await w.check(d.id)).printReady,true);
  await assert.rejects(w.update({id:d.id,patch:{showImage:true}}),/does not include images/);
  const out=await w.export({id:d.id,formats:['png','pdf']});
  const png=await readFile(out.artifacts[0].path),size=SIZES[sizeId];assert.equal(png.readUInt32BE(16),3300);assert.equal(png.readUInt32BE(20),size.height*300);
  assert.ok((await readFile(out.artifacts[1].path,'latin1')).includes(`/MediaBox [0 0 792 ${size.height*72}]`));
 }
 const d=await w.create({design:{sizeId:'large-menu',menuItems:[{label:'Sample information\nsecond line',value:'B-203'}]}});
 const white=await w.preview(d.id,72);await w.update({id:d.id,patch:{background:'color'}});const color=await w.preview(d.id,72);
 assert.notDeepEqual(await white.canvas.encode('png'),await color.canvas.encode('png'));assert.equal(color.quality.warnings.length,0);
 await assert.rejects(w.update({id:d.id,patch:{background:'blue'}}),/background/);
 await assert.rejects(w.update({id:d.id,patch:{menuItems:Array(41).fill({label:'X',value:'1'})}}),/at most 40/);
 await assert.rejects(w.update({id:d.id,patch:{menuItems:[{label:'X',value:'1',url:'bad'}]}}),/information item/);
 await w.update({id:d.id,patch:{menuItems:[]}});assert.equal((await w.check(d.id)).printReady,false);
});

test('room label toggles on every template and hidden text does not affect artwork',async()=>{
 const w=await init();
 for(const sizeId of Object.keys(SIZES)){
  const d=await w.create({design:{sizeId,showRoom:false,room:'ROOM 212'}}),before=await w.preview(d.id,72);
  await w.update({id:d.id,patch:{room:'ROOM 213'}});assert.deepEqual(await before.canvas.encode('png'),await (await w.preview(d.id,72)).canvas.encode('png'));
  await w.update({id:d.id,patch:{showRoom:true}});const shown=await w.preview(d.id,72);
  assert.equal(shown.quality.warnings.length,0,sizeId);assert.ok(shown.quality.hitRegions.some(r=>r.field==='room'));assert.notDeepEqual(await before.canvas.encode('png'),await shown.canvas.encode('png'));
  await w.update({id:d.id,patch:{room:''}});assert.ok((await w.check(d.id)).warnings.some(x=>x.includes('room number')));
 }
 const legacy=defaultDesign();delete legacy.showRoom;legacy.room='ROOM 101';assert.equal(validateDesign(legacy,w.gallery).showRoom,true);
});

test('campus defaults, saved choices and picker controls remain explicit',async()=>{
 const w=await init();const d=await w.create({design:{title:'Quantum optics'}});assert.equal(d.design.imageId,'campus-aerial');
 const alternative=w.gallery.find(i=>i.id!=='campus-aerial');
 const chosen=await w.create({design:{imageId:alternative.id}});assert.equal(chosen.design.imageId,alternative.id);
 await w.imagePicker({action:'open'});assert.equal(w.session().view.galleryOpen,true);
 await w.imagePicker({action:'use_default'});assert.equal(w.get().design.imageId,'campus-aerial');assert.equal(w.session().view.galleryOpen,false);
 assert.equal(patchDesign(chosen.design,{sizeId:'small-room'},w.gallery).imageId,'campus-aerial');
 assert.equal(validateDesign(chosen.design,w.gallery).imageId,alternative.id);
 const queried=await w.create({design:{imageQuery:alternative.title}});assert.ok(queried.design.imageId);
 await w.create({design:{sizeId:'square-bsd'}});await assert.rejects(w.imagePicker({action:'open'}),/no visible image/);
});


test('Medium sub-layouts retain content, defaults, image policy and exact print size',async()=>{
 const w=await init();
 for(const mediumLayout of Object.keys(MEDIUM_LAYOUTS)){
  const d=await w.create({design:{mediumLayout,room:'ROOM 212',showRoom:true}});
  const check=await w.check(d.id);assert.equal(check.printReady,true,mediumLayout+': '+check.warnings.join(' '));
  assert.equal(d.design.imageId,MEDIUM_LAYOUTS[mediumLayout].imageDisabled?null:'campus-aerial');
  const out=await w.export({id:d.id,formats:['png','pdf','json']});const png=await readFile(out.artifacts[0].path);
  assert.equal(png.readUInt32BE(16),2550);assert.equal(png.readUInt32BE(20),1500);
  assert.ok((await readFile(out.artifacts[1].path,'latin1')).includes('/MediaBox [0 0 612 360]'));
  assert.deepEqual(validateDesign(JSON.parse(await readFile(out.artifacts[2].path,'utf8')),w.gallery),d.design);
  if(MEDIUM_LAYOUTS[mediumLayout].imageDisabled)await assert.rejects(w.update({id:d.id,patch:{showImage:true}}),/does not include images/);
  if(MEDIUM_LAYOUTS[mediumLayout].multiName){
   const before=await w.preview(d.id,72);await w.update({id:d.id,patch:{showSubtitle:false}});const after=await w.preview(d.id,72);assert.notDeepEqual(await before.canvas.encode('png'),await after.canvas.encode('png'));assert.equal(w.get(d.id).design.entries[0].subname,'Role / title');
  }
 }
 const original=defaultDesign();const changed=patchDesign(original,{mediumLayout:'shared-office'},w.gallery);assert.equal(changed.entries.length,2);assert.equal(changed.entries[0].name,original.title);
 const color=patchDesign(changed,{mediumLayout:'color'},w.gallery);assert.equal(color.imageId,null);assert.deepEqual(color.entries,changed.entries);
 assert.equal(patchDesign(color,{mediumLayout:'standard'},w.gallery).imageId,'campus-aerial');
 assert.throws(()=>patchDesign(color,{mediumLayout:'unknown'},w.gallery),/Medium layout/);
 const old=defaultDesign();delete old.mediumLayout;assert.equal(validateDesign(old,w.gallery).mediumLayout,'standard');
});
