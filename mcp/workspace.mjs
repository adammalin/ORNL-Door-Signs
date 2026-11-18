import { readFile, writeFile, mkdir, rename, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { DEFAULT_DESIGN, SIZES, clone, defaultDesign, validateDesign, patchDesign, filterGallery, fileStem } from '../src/model.js';
import { renderSign } from '../src/render.js';
import { pngWithDpi, canvasPdf } from '../src/print.js';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const ID = /^[a-zA-Z0-9-]{1,80}$/;
const textFields = ['organization','title','subtitle','details','room'];
let fontsLoaded = false;
const imageCache = new Map();

export async function renderNative(design, gallery, dpi = 150) {
  if(!fontsLoaded) {
    for(const face of ['400-normal','600-normal','700-normal','800-normal','400-italic']) {
      if(!GlobalFonts.registerFromPath(path.join(PROJECT_ROOT,`assets/fonts/mulish-latin-${face}.woff2`),'Mulish'))throw new Error(`Could not load Mulish ${face}.`);
    }
    fontsLoaded=true;
  }
  const canvas=createCanvas(1,1);
  const quality=await renderSign(canvas,design,gallery,dpi,{
    fontsReady:async()=>{},
    loadImage:async src=>{
      if(!/^assets\/(gallery\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)|template-(leaf|logo|hexagons)\.png)$/.test(src))throw new Error('Invalid artwork path.');
      if(!imageCache.has(src)){
        const resolved=await realpath(path.join(PROJECT_ROOT,src));
        if(!resolved.startsWith(PROJECT_ROOT+path.sep))throw new Error('Artwork must remain inside the project.');
        imageCache.set(src,await loadImage(resolved));
        if(imageCache.size>5)imageCache.delete(imageCache.keys().next().value);
      }
      return imageCache.get(src);
    },
  });
  return {canvas,quality};
}

export class DoorSignWorkspace {
  constructor({directory=path.join(PROJECT_ROOT,'output/agent-workspace')}={}) {
    this.directory=path.resolve(directory);this.queue=Promise.resolve();this.editorUrl=null;
  }
  async init() {
    await mkdir(this.directory,{recursive:true});this.directory=await realpath(this.directory);
    this.gallery=JSON.parse(await readFile(path.join(PROJECT_ROOT,'assets/gallery.json'),'utf8')).filter(i=>i.approved===true);
    this.stateFile=path.join(this.directory,'workspace.json');
    try { this.state=JSON.parse(await readFile(this.stateFile,'utf8'));if(this.state.version!==1||!this.state.designs)throw new Error('Unsupported workspace schema.'); }
    catch(error){if(error.code!=='ENOENT')throw error;this.state={version:1,revision:0,activeId:null,designs:{},view:{query:'',category:'',scienceArea:''},tutorial:{sequence:0,action:'none',step:0}};await this.persist();}
    if(!this.state.activeId)await this.create({name:'Untitled sign'});
    return this;
  }
  async persist() {
    const temp=path.join(this.directory,`.${randomUUID()}.tmp`);
    await writeFile(temp,JSON.stringify(this.state,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,this.stateFile);
  }
  async mutate(fn) {
    const operation=this.queue.then(async()=>{
      const before=clone(this.state);
      try {const result=await fn();this.state.revision++;await this.persist();return result;}
      catch(error){this.state=before;throw error;}
    });
    this.queue=operation.catch(()=>{});return operation;
  }
  get(id=this.state.activeId) {
    if(typeof id!=='string'||!ID.test(id)||!Object.hasOwn(this.state.designs,id))throw new Error('Unknown design ID.');
    return clone(this.state.designs[id]);
  }
  publicDesign(record) {
    const {history,future,...data}=record;
    return {...clone(data),canUndo:history.length>0,canRedo:future.length>0};
  }
  session() {
    return {revision:this.state.revision,active:this.publicDesign(this.get()),view:clone(this.state.view),tutorial:clone(this.state.tutorial),editorUrl:this.editorUrl};
  }
  list() {return Object.values(this.state.designs).map(d=>({id:d.id,name:d.name,title:d.design.title,imageId:d.design.imageId,revision:d.revision,updatedAt:d.updatedAt}));}
  findImages({query='',category='',scienceArea='',offset=0,limit=24}={}) {
    const found=filterGallery(this.gallery,query,category,scienceArea);
    return {total:found.length,offset,images:found.slice(offset,offset+limit),categories:[...new Set(this.gallery.map(i=>i.category))].sort(),scienceAreas:[...new Set(this.gallery.flatMap(i=>i.scienceAreas))].sort()};
  }
  recommend({query='',category='',scienceArea='',limit=5}={}) {
    const words=query.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2);
    const candidates=filterGallery(this.gallery,'',category,scienceArea);
    return candidates.map(image=>{
      const haystack=[image.title,image.alt,image.description||'',...image.tags,...image.scienceAreas].join(' ').toLocaleLowerCase();
      const score=words.reduce((n,w)=>n+(haystack.includes(w)?1:0),0);
      return {image,score};
    }).sort((a,b)=>b.score-a.score||a.image.id.localeCompare(b.image.id)).slice(0,limit);
  }
  makeDesign(input={}) {
    const design={...defaultDesign(input.sizeId),...Object.fromEntries(Object.entries(input).filter(([k])=>textFields.includes(k)||['sizeId','titleSize','imageId','showSubtitle','showImage','entries'].includes(k))),crop:{...DEFAULT_DESIGN.crop,...input.crop}};
    if(!input.imageId&&!(input.imageId===null&&design.showImage===false)){const image=this.recommend({query:input.imageQuery||[design.organization,design.title,design.subtitle,design.details].join(' '),category:input.category||'',scienceArea:input.scienceArea||'',limit:1})[0]?.image;if(!image)throw new Error('No approved image matches the requested filters.');design.imageId=image.id;}
    const image=this.gallery.find(image=>image.id===design.imageId);
    design.crop={...DEFAULT_DESIGN.crop,...image?.defaultCrop,...input.crop};
    return validateDesign(design,this.gallery);
  }
  async create({name='Untitled sign',design:input={},activate=true}={}) {
    const design=this.makeDesign(input);
    return this.mutate(()=>{
      const id=randomUUID(),now=new Date().toISOString();
      const record={id,name:name.slice(0,160),design,revision:1,history:[],future:[],createdAt:now,updatedAt:now};
      this.state.designs[id]=record;if(activate)this.state.activeId=id;
      return this.publicDesign(record);
    });
  }
  async update({id=this.state.activeId,patch={},expectedRevision}={}) {
    return this.mutate(()=>{
      const record=this.get(id);
      if(expectedRevision!==undefined&&expectedRevision!==record.revision)throw Object.assign(new Error('Design changed since it was read. Get the latest design and retry.'),{statusCode:409});
      for(const key of Object.keys(patch))if(![...textFields,'showSubtitle','showImage','entries','sizeId','titleSize','imageId','crop'].includes(key))throw new Error(`Unknown editable property: ${key}`);
      const next=patchDesign(record.design,patch,this.gallery);
      if(JSON.stringify(next)!==JSON.stringify(record.design)){
        record.history.push(record.design);record.history=record.history.slice(-100);record.future=[];
        record.design=next;record.revision++;record.updatedAt=new Date().toISOString();this.state.designs[id]=record;
      }
      return this.publicDesign(record);
    });
  }
  async activate(id) {return this.mutate(()=>{this.get(id);this.state.activeId=id;return this.session();});}
  async history({id=this.state.activeId,direction}={}) {
    return this.mutate(()=>{
      const record=this.get(id),from=direction==='undo'?record.history:record.future,to=direction==='undo'?record.future:record.history;
      if(!from.length)throw new Error(`Nothing to ${direction}.`);
      to.push(record.design);record.design=from.pop();record.revision++;record.updatedAt=new Date().toISOString();this.state.designs[id]=record;return this.publicDesign(record);
    });
  }
  async resetCrop(id) {return this.update({id,patch:{crop:{x:50,y:50,zoom:1}}});}
  async selectImage({id=this.state.activeId,imageId,crop}={}) {
    const image=this.gallery.find(i=>i.id===imageId);if(!image)throw new Error('Choose an approved gallery image ID.');
    return this.update({id,patch:{imageId,crop:crop||image.defaultCrop||{x:50,y:50,zoom:1}}});
  }
  async view(patch) {
    return this.mutate(()=>{this.state.view={...this.state.view,...patch};return this.findImages(this.state.view);});
  }
  async tutorial({action,step=0}) {
    return this.mutate(()=>{this.state.tutorial={action,step,sequence:this.state.tutorial.sequence+1};return clone(this.state.tutorial);});
  }
  async preview(id,dpi=100) {
    const record=this.get(id),rendered=await renderNative(record.design,this.gallery,dpi);
    return {...rendered,design:this.publicDesign(record)};
  }
  async check(id) {
    const {quality,design}=await this.preview(id,100);
    return {designId:design.id,...quality,printReady:quality.warnings.length===0&&(quality.imageVisible===false||quality.photoDpi>=300)};
  }
  async export({id=this.state.activeId,formats=['json','png','pdf']}={}) {
    const record=this.get(id),design=validateDesign(record.design,this.gallery);
    let rendered;
    if(formats.some(f=>f!=='json')){
      rendered=await renderNative(design,this.gallery,300);
      if(rendered.quality.warnings.length||(rendered.quality.imageVisible!==false&&rendered.quality.photoDpi<300))throw new Error(`Print check failed: ${rendered.quality.warnings.join(' ')||`photo ${rendered.quality.photoDpi} dpi; zoom out`}`);
    }
    const exportId=randomUUID(),directory=path.join(this.directory,'exports',exportId);await mkdir(directory,{recursive:true});
    const artifacts=[];
    for(const format of [...new Set(formats)]){
      let data;
      if(format==='json')data=Buffer.from(JSON.stringify(design,null,2)+'\n');
      else if(format==='png')data=Buffer.from(await pngWithDpi(await rendered.canvas.encode('png'),300).arrayBuffer());
      else if(format==='pdf')data=Buffer.from(await (await canvasPdf(rendered.canvas,SIZES[design.sizeId])).arrayBuffer());
      else throw new Error('Unknown export format.');
      const filename=`${fileStem(design.title,design.sizeId)}.${format}`,file=path.join(directory,filename);
      await writeFile(file,data,{flag:'wx',mode:0o600});
      artifacts.push({format,filename,path:file,bytes:data.length,url:this.editorUrl?`${this.editorUrl}exports/${exportId}/${filename}`:null});
    }
    return {designId:id,revision:record.revision,artifacts,quality:rendered?.quality||null};
  }
  async batch({signs,formats=['json','png','pdf'],defaults={},continueOnError=true}={}) {
    const results=[];
    for(let index=0;index<signs.length;index++) {
      let created;
      try{
        const entry=signs[index],input={...defaults,...entry,crop:{...defaults.crop,...entry.crop}};
        created=await this.create({name:entry.name||entry.title||`Sign ${index+1}`,design:input,activate:false});
        const files=await this.export({id:created.id,formats});results.push({index,ok:true,...files});
      }catch(error){results.push({index,ok:false,designId:created?.id||null,error:error.message});if(!continueOnError)break;}
    }
    return {requested:signs.length,processed:results.length,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
  }
  async exportPath(relative) {
    if(!/^exports\/[a-f0-9-]{36}\/[a-zA-Z0-9.-]+\.(json|png|pdf)$/.test(relative))throw new Error('Invalid export path.');
    const resolved=await realpath(path.join(this.directory,relative));
    if(!resolved.startsWith(this.directory+path.sep)||!(await stat(resolved)).isFile())throw new Error('Export not found.');return resolved;
  }
}
