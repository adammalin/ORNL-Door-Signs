import { DEFAULT_DESIGN, SIZES, MEDIUM_LAYOUTS, designSize, clone, defaultDesign, defaultImage, patchDesign, validateDesign, filterGallery, cropGeometry, effectiveDpi, fileStem } from './model.js';
import { renderSign, loadImage } from './render.js';
import { pngWithDpi, canvasPdf } from './print.js';
import { createTutorial } from './tutorial.js';
import { connectCompanion } from './companion.js';
import { registerBrowserTools } from './browser-tools.js';

const $ = id => document.getElementById(id);
const STORAGE = 'ornl-door-signs-v1';
let gallery = [], design = clone(DEFAULT_DESIGN), history = [], future = [];
let renderVersion = 0, ready = false, exportBusy = false, toastTimer, editTime = 0, editKey = '', downloadUrl;
let latestQuality = { warnings: ['Preparing canvas'], photoDpi: null };
let tutorial;
let companion;
let galleryOpen=false;
const fields = ['organization','title','subtitle','details','room'];

function listKey(){return designSize(design).menu?'menuItems':'entries';}
function syncEntries(){
  const menu=Boolean(designSize(design).menu),key=listKey(),entries=design[key]||[],container=$('entries'),label=menu?'Item':'Name';
  if(container.children.length!==entries.length||container.dataset.kind!==key){
    container.replaceChildren();container.dataset.kind=key;
    entries.forEach((entry,index)=>{
      const nameKey=menu?'label':'name',subKey=menu?'value':'subname';
      const row=document.createElement('div');row.className='entry-editor';
      row.innerHTML=`<div class="entry-heading"><strong>${label} ${index+1}</strong><div><button type="button" class="tool-button" data-action="up" aria-label="Move ${label.toLowerCase()} ${index+1} up">Up</button><button type="button" class="tool-button" data-action="down" aria-label="Move ${label.toLowerCase()} ${index+1} down">Down</button><button type="button" class="tool-button" data-action="remove" aria-label="Remove ${label.toLowerCase()} ${index+1}">Remove</button></div></div><label class="field">${menu?'Information':'Name'}<textarea rows="${menu?2:1}" id="entry-${index}-${nameKey}" data-entry="${nameKey}" maxlength="${menu?160:100}"></textarea></label><label class="field">${menu?'Room / detail':'Sub-name / role'}<input type="text" id="entry-${index}-${subKey}" data-entry="${subKey}" maxlength="${menu?40:160}"></label>${menu?'':'<div class="field-row"><label class="field">Name style<select data-entry="style"><option value="primary">Primary</option><option value="standard">Standard</option><option value="assistant">Assistant</option></select></label><label class="field">Alignment<select data-entry="align"><option value="left">Left</option><option value="right">Right</option></select></label></div>'}`;
      for(const input of row.querySelectorAll('[data-entry]'))input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{
        const next=clone(design);next[key][index][input.dataset.entry]=input.value;setDesign(next,`${key}-${index}-${input.dataset.entry}`,true);
      });
      for(const button of row.querySelectorAll('[data-action]'))button.addEventListener('click',()=>{
        const next=clone(design),action=button.dataset.action;
        if(action==='remove')next[key].splice(index,1);
        else{const target=index+(action==='up'?-1:1);if(target<0||target>=next[key].length)return;[next[key][index],next[key][target]]=[next[key][target],next[key][index]];}
        setDesign(next);
      });container.append(row);
    });
  }
  entries.forEach((entry,index)=>{
    const row=container.children[index];for(const input of row.querySelectorAll('[data-entry]'))if(input.value!==entry[input.dataset.entry])input.value=entry[input.dataset.entry];
    row.querySelector('[data-action=up]').disabled=index===0;row.querySelector('[data-action=down]').disabled=index===entries.length-1;
  });
  $('list-heading').textContent=menu?'Information items':'Names';$('add-entry').textContent=menu?'Add item':'Add name';
  $('list-hint').textContent=menu?'Add, remove or reorder information and room/detail pairs. Line breaks in information are supported.':'Add up to 12 entries. Leave a sub-name blank to omit it. Use Undo to restore a removed entry.';
  $('add-entry').disabled=entries.length>=(menu?40:12);
}
function syncImagePicker(){
  const visible=galleryOpen&&design.showImage!==false&&!designSize(design).imageDisabled;
  $('image-picker').hidden=!visible;$('choose-different-image').setAttribute('aria-expanded',String(visible));
  $('choose-different-image').textContent=visible?'Done choosing':'Choose different image';
  $('image-choice-actions').hidden=design.showImage===false;
  $('image-choice-summary').textContent=`Using ${gallery.find(i=>i.id===design.imageId)?.title||'Main Oak Ridge Campus'}`;
  $('use-default-image').hidden=design.imageId==='campus-aerial';
}
function imagePicker(action){
  if(!['open','close','use_default'].includes(action))throw new Error('Invalid image picker action.');
  if(action!=='close'&&(designSize(design).imageDisabled||design.showImage===false))throw new Error('This template has no visible image.');
  if(action==='use_default'){
    const image=defaultImage(gallery);if(!image)throw new Error('The default campus image is unavailable.');
    setDesign({...clone(design),imageId:image.id,crop:{x:50,y:50,zoom:1}});galleryOpen=false;
  }else galleryOpen=action==='open';
  syncImagePicker();if(galleryOpen)updateGallery();
  companion?.filters({...currentFilters(),galleryOpen});return getEditorState();
}
function currentFilters(){return {query:$('image-search').value,category:$('category').value,scienceArea:$('science-area').value,galleryOpen};}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),6500);
}
function saveLocal() {
  companion?.save(clone(design));
  try { localStorage.setItem(STORAGE, JSON.stringify(design)); $('save-status').textContent = 'Draft saved on this device'; }
  catch { $('save-status').textContent = 'Autosave unavailable · save a JSON copy'; }
}
function syncControls() {
  const size=designSize(design),small=design.sizeId==='small-room';
  const large=Boolean(size.large);
  fields.forEach(key => { if ($(key).value !== design[key]) $(key).value = design[key]; });
  for(const key of ['organization','details'])$(key).closest('label').hidden=!size.fields.includes(key);
  $('title').closest('label').hidden=Boolean(size.multiName);
  $('subtitle-toggle-label').textContent=size.multiName?'Show sub-names':'Show subtitle';
  $('show-subtitle').checked=design.showSubtitle!==false;
  $('subtitle-field').hidden=design.showSubtitle===false||Boolean(size.multiName);
  $('details-label').textContent=size.header==='green'?'Header tagline':'Group / program';
  $('title-size-label').textContent=size.multiName?'Name size':'Title size';
  $('subtitle-label').textContent=small?'Subtitle / room':'Subtitle / role';
  $('entries-section').hidden=!(large||size.multiName);syncEntries();
  $('gallery-section').hidden=Boolean(size.imageDisabled);
  $('image-toggle-field').hidden=!size.imageOptional;$('show-image').checked=design.showImage!==false;
  $('image-hidden-hint').hidden=design.showImage!==false;
  $('crop-controls').hidden=design.showImage===false;
  document.querySelector('.preview-panel').classList.toggle('portrait-preview',size.height>size.width);
  $('show-room').checked=Boolean(design.showRoom);$('room-field').hidden=!design.showRoom;
  $('medium-layout-field').hidden=design.sizeId!=='medium-landscape';$('medium-layout').value=design.mediumLayout||'standard';
  $('background-field').hidden=!size.menu;$('background').value=design.background||'white';
  syncImagePicker();
  $('sign-size').value = design.sizeId;
  $('title-size').max=size.titleMax;
  $('size-hint').textContent=`${size.width} × ${size.height} in · ${size.dpi} dpi`;
  $('preview-size').textContent=`${size.width} × ${size.height} in`;
  $('png-spec').textContent=`${Math.round(size.width*size.dpi)} × ${Math.round(size.height*size.dpi)} px · ${size.dpi} dpi`;
  $('pdf-spec').textContent=`${size.width} × ${size.height} in · print size`;
  $('canvas-help').textContent=size.imageDisabled?'Click text to edit its field.':'Click text to edit · drag the photo to reframe · arrow keys move the crop';
  $('text-hint').textContent=size.multiName?'Edit the heading above and the names below. Leave individual sub-names blank to omit them.':small?'Title and optional subtitle fit on one line each.':size.menu?'An optional heading can be added above the information list.':large?'Use line breaks in the heading. Add and arrange names below.':'Long text fits automatically. Use a line break to choose where it wraps.';
  $('title-size').value = design.titleSize;
  $('title-size-value').textContent = `${design.titleSize} · auto-fit`;
  for (const key of ['x','y','zoom']) {
    $(`crop-${key}`).value = design.crop[key];
    $(`crop-${key}-value`).textContent = key === 'zoom' ? `${design.crop[key].toFixed(2)}×` : `${Math.round(design.crop[key])}%`;
  }
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  const item = gallery.find(item => item.id === design.imageId);
  $('selected-image').textContent = size.imageDisabled?'Image-free template':(item?.title || 'Choose a gallery image')+(design.showImage===false?' · hidden':'');
  for (const button of $('gallery').querySelectorAll('[data-image-id]')) {
    const selected = button.dataset.imageId === design.imageId;
    button.setAttribute('aria-pressed', String(selected));
    const photo=gallery.find(i=>i.id===button.dataset.imageId),b=size.photoBox;
    const low=design.showImage!==false&&photo.pixels&&effectiveDpi(...photo.pixels,b.width/100,b.height/100,(photo.defaultCrop?.zoom||1))<300;
    button.querySelector('small').textContent=photo.category+(low?' · needs larger original':'');
    button.querySelector('.gallery-check').hidden = !selected;
  }
}
function setDesign(next, key = '', coalesce = false) {
  if (JSON.stringify(next) === JSON.stringify(design)) return;
  const now = Date.now();
  if (!coalesce || key !== editKey || now - editTime > 650) {
    history.push(clone(design)); if (history.length > 60) history.shift();
  }
  editKey = key; editTime = now; future = []; design = next;
  $('download-ready').hidden=true;
  saveLocal(); syncControls(); requestRender();
}
function exportButtons() {
  const blocked = !ready || exportBusy || latestQuality.warnings.length > 0 || (latestQuality.imageVisible!==false&&latestQuality.photoDpi < 300);
  $('export-png').disabled = blocked; $('export-pdf').disabled = blocked;
  $('save-json').disabled = !ready || exportBusy;
}
async function requestRender() {
  const version = ++renderVersion;
  ready = false; exportButtons();
  try {
    // Keep asynchronous image/font loading from letting older edits overwrite newer ones.
    const buffer = document.createElement('canvas');
    const quality = await renderSign(buffer,clone(design),gallery);
    if (version !== renderVersion) return;
    const canvas = $('sign-canvas');
    canvas.width = buffer.width; canvas.height = buffer.height;
    canvas.getContext('2d').drawImage(buffer,0,0);
    const settings=designSize(design),visibleFields=settings.fields.filter(f=>f!=='room'&&(!settings.multiName||!['title','subtitle'].includes(f))&&(f!=='subtitle'||design.showSubtitle!==false));
    const listText=settings.large||settings.multiName?(design[listKey()]||[]).map(e=>[e.name||e.label,settings.multiName&&design.showSubtitle===false?'':e.subname||e.value].filter(Boolean).join(', ')).join('. '):'';
    canvas.setAttribute('aria-label',`Door sign: ${visibleFields.map(f=>design[f]).filter(Boolean).join('. ')}. ${listText} ${design.showRoom?design.room:''}. Photo: ${quality.imageVisible===false?'hidden':gallery.find(i=>i.id===design.imageId)?.alt||'none'}. Click text to edit${quality.imageVisible===false?'.':'; drag the photo to reframe.'}`);
    latestQuality = quality; ready = true;
    const qualityBox = $('quality'); qualityBox.replaceChildren();
    const heading = document.createElement('strong'), text = document.createElement('p');
    qualityBox.className = 'quality-status';
    if (quality.warnings.length) {
      qualityBox.classList.add('error'); heading.textContent = 'A little adjustment needed';
      text.textContent = quality.warnings.join(' ');
    } else if (quality.imageVisible!==false&&quality.photoDpi < 300) {
      qualityBox.classList.add('warning'); heading.textContent = quality.photoDpi*design.crop.zoom<300?'Choose a larger image for print':'Reduce image zoom for print';
      text.textContent = `Photo resolution is ${quality.photoDpi} dpi at this crop. `+(quality.photoDpi*design.crop.zoom<300?`Choose a higher-resolution image${designSize(design).imageOptional?' or turn off Show image':''} to enable print exports.`:'Zoom out until it reaches at least 300 dpi to enable print exports.');
    } else {
      heading.textContent = 'Ready to export at 300 dpi';
      const size=designSize(design);
      text.textContent = `${Math.round(size.width*size.dpi)} × ${Math.round(size.height*size.dpi)} pixels · ${quality.imageVisible===false?(size.imageDisabled?'image-free template':'image hidden'):`photo ${quality.photoDpi} dpi at this crop`}. Review your content before printing.`;
    }
    qualityBox.append(heading,text); exportButtons();
  } catch (error) {
    if (version !== renderVersion) return;
    ready = false; exportButtons(); $('quality').className = 'quality-status error';
    $('quality').textContent = error.message; toast(error.message);
  }
}
function updateGallery() {
  const filtered = filterGallery(gallery,$('image-search').value,$('category').value,$('science-area').value);
  $('gallery-count').textContent = `${filtered.length} of ${gallery.length} approved image${gallery.length===1?'':'s'}`;
  $('clear-filters').hidden = !($('image-search').value || $('category').value || $('science-area').value);
  $('gallery').replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('p'); empty.className = 'empty-gallery';
    empty.textContent = gallery.length ? 'No images match. Try a different search or clear the filters.' : 'No approved images are available yet. Ask the site maintainer to add images to the gallery.';
    $('gallery').append(empty);
  }
  for (const item of filtered) {
    const button = document.createElement('button'); button.type='button'; button.className='gallery-card';
    button.dataset.imageId = item.id; button.setAttribute('aria-label', `Use ${item.title}`);
    const image = document.createElement('img'); image.src=item.thumbnail || item.src;
    image.alt=item.alt; image.loading='lazy';
    const name = document.createElement('strong'); name.textContent=item.title;
    const category = document.createElement('small'); category.textContent=item.category;
    const check = document.createElement('span'); check.className='gallery-check'; check.textContent='✓'; check.setAttribute('aria-hidden','true');
    button.append(image,name,category,check);
    button.addEventListener('click', () => {
      setDesign({...clone(design),imageId:item.id,crop:clone(item.defaultCrop||{x:50,y:50,zoom:1})});galleryOpen=false;syncImagePicker();companion?.filters(currentFilters());
    });
    $('gallery').append(button);
  }
  syncControls();
  companion?.filters(currentFilters());
}
function download(blob,name) {
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);
  downloadUrl=URL.createObjectURL(blob);
  const link=$('download-link');link.href=downloadUrl;link.download=name;
  link.textContent=`Save ${name}`;$('download-ready').hidden=false;
  link.click();
}
async function exportArtwork(format) {
  if (!ready || exportBusy) return;
  exportBusy=true; exportButtons();
  const button=$(`export-${format}`), label=button.querySelector('span'); label.textContent='Preparing file…';
  try {
    const snapshot=clone(design), canvas=document.createElement('canvas'), size=SIZES[snapshot.sizeId];
    const quality=await renderSign(canvas,snapshot,gallery,size.dpi);
    if (quality.warnings.length || (quality.imageVisible!==false&&quality.photoDpi < 300)) throw new Error('Resolve the canvas print checks before exporting.');
    let blob;
    if (format==='png') {
      const raw=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG export failed.')),'image/png'));
      blob=pngWithDpi(new Uint8Array(await raw.arrayBuffer()),size.dpi);
    } else {
      if (typeof CompressionStream==='undefined') throw new Error('PDF export needs a current version of Chrome, Edge, Firefox, or Safari.');
      blob=await canvasPdf(canvas,size);
    }
    download(blob,`${fileStem(snapshot.title,snapshot.sizeId)}.${format}`);
    toast(`${format.toUpperCase()} ready. If the download didn’t start, use the save link below the export buttons.`);
    return {format,...getDownload()};
  } catch(error) { toast(error.message); return {error:error.message}; }
  finally { label.textContent=`Download ${format.toUpperCase()}`; exportBusy=false; exportButtons(); }
}

function getDownload(){return {filename:$('download-link').download,url:$('download-link').href};}
function getEditorState(){return {design:clone(design),quality:clone(latestQuality),ready,exportBusy,canUndo:history.length>0,canRedo:future.length>0,filters:currentFilters(),tutorial:tutorial.getState()};}
function applyFilters(view){
  if(view.galleryOpen!==undefined)galleryOpen=Boolean(view.galleryOpen)&&design.showImage!==false&&!designSize(design).imageDisabled;syncImagePicker();
  for(const [key,id] of [['query','image-search'],['category','category'],['scienceArea','science-area']])if(view[key]!==undefined)$(id).value=view[key];updateGallery();
}
function applyTutorial({action,step}){if(action==='start')tutorial.start({step});else if(['next','back','close'].includes(action))tutorial[action]();}

function bindEvents() {
  $('show-tutorial').addEventListener('click',()=>tutorial.start());
  fields.forEach(key=>$(key).addEventListener('input',()=>setDesign({...clone(design),[key]:$(key).value},key,true)));
  $('sign-size').addEventListener('change',()=>{
    const sizeId=$('sign-size').value,next=patchDesign(design,{sizeId},gallery);
    const preset=defaultDesign(sizeId),previous=defaultDesign(design.sizeId);
    for(const key of ['title','subtitle','organization','details'])if(design[key]===previous[key])next[key]=preset[key];
    if(design.subtitle===previous.subtitle)next.showSubtitle=preset.showSubtitle;
    if(SIZES[sizeId].large){
      if(!designSize(design).large)Object.assign(next,{title:preset.title,subtitle:preset.subtitle,showSubtitle:preset.showSubtitle,showImage:preset.showImage,entries:preset.entries,menuItems:preset.menuItems,background:preset.background});
      else{
        if(JSON.stringify(design.entries)===JSON.stringify(previous.entries))next.entries=preset.entries;
        if(JSON.stringify(design.menuItems)===JSON.stringify(previous.menuItems))next.menuItems=preset.menuItems;
        if(design.showImage===previous.showImage)next.showImage=preset.showImage;
      }
    }
    if(designSize(next).imageDisabled){next.showImage=false;next.imageId=null;}
    else next.imageId=defaultImage(gallery)?.id||null;
    galleryOpen=false;setDesign(next);
  });
  $('medium-layout').addEventListener('change',()=>{
    const next=patchDesign(design,{mediumLayout:$('medium-layout').value},gallery);
    if(designSize(next).multiName&&!next.entries.length)next.entries=[{name:design.title,subname:design.subtitle,style:'primary',align:'left'},{name:'Your name',subname:'Role / title',style:'primary',align:'left'}];
    galleryOpen=false;setDesign(next);
  });
  $('show-subtitle').addEventListener('change',()=>setDesign({...clone(design),showSubtitle:$('show-subtitle').checked}));
  $('choose-different-image').addEventListener('click',()=>imagePicker(galleryOpen?'close':'open'));
  $('use-default-image').addEventListener('click',()=>imagePicker('use_default'));
  $('show-room').addEventListener('change',()=>setDesign({...clone(design),showRoom:$('show-room').checked}));
  $('background').addEventListener('change',()=>setDesign({...clone(design),background:$('background').value}));
  $('show-image').addEventListener('change',()=>setDesign(patchDesign(design,{showImage:$('show-image').checked},gallery)));
  $('add-entry').addEventListener('click',()=>{const key=listKey(),menu=key==='menuItems';if((design[key]||[]).length>=(menu?40:12))return;const next=clone(design);next[key]=[...(next[key]||[]),menu?{label:'',value:''}:{name:'',subname:'',style:'primary',align:'left'}];setDesign(next);$(`entry-${next[key].length-1}-${menu?'label':'name'}`).focus();});
  $('title-size').addEventListener('input',()=>setDesign({...clone(design),titleSize:Number($('title-size').value)},'title-size',true));
  for(const key of ['x','y','zoom']) $(`crop-${key}`).addEventListener('input',()=>{
    const next=clone(design); next.crop[key]=Number($(`crop-${key}`).value); setDesign(next,`crop-${key}`,true);
  });
  $('reset-crop').addEventListener('click',()=>setDesign({...clone(design),crop:{x:50,y:50,zoom:1}}));
  $('undo').addEventListener('click',()=>{
    if(!history.length)return; future.push(clone(design)); design=history.pop();
    editKey=''; saveLocal(); syncControls(); requestRender();
  });
  $('redo').addEventListener('click',()=>{
    if(!future.length)return; history.push(clone(design)); design=future.pop();
    editKey=''; saveLocal(); syncControls(); requestRender();
  });
  $('reset-design').addEventListener('click',()=>{
    const next=defaultDesign(design.sizeId,design.mediumLayout);next.imageId=designSize(next).imageDisabled?null:defaultImage(gallery)?.id||null;galleryOpen=false;
    setDesign(next); toast('Started a new design. Use Undo to restore your previous draft.');
  });
  for(const id of ['image-search','category','science-area']) $(id).addEventListener(id==='image-search'?'input':'change',updateGallery);
  $('clear-filters').addEventListener('click',()=>{
    $('image-search').value=''; $('category').value=''; $('science-area').value=''; updateGallery();
  });
  $('save-json').addEventListener('click',()=>{
    download(new Blob([JSON.stringify(design,null,2)+'\n'],{type:'application/json'}),`${fileStem(design.title,design.sizeId)}.json`);
    toast('Editable JSON ready. Use Open design to continue later.');
  });
  $('open-json').addEventListener('click',()=>$('json-file').click());
  $('json-file').addEventListener('change',async()=>{
    const file=$('json-file').files[0]; if(!file)return;
    try {
      if(file.size>1024*1024)throw new Error('This file is too large. Choose a Door Sign Studio JSON file under 1 MB.');
      const next=validateDesign(JSON.parse(await file.text()),gallery);
      setDesign(next); toast('Design opened. Your previous draft is available with Undo.');
    } catch(error) { toast(error instanceof SyntaxError?'This file is not valid JSON. Your current design is unchanged.':error.message); }
    finally { $('json-file').value=''; }
  });
  $('export-png').addEventListener('click',()=>exportArtwork('png'));
  $('export-pdf').addEventListener('click',()=>exportArtwork('pdf'));
  const canvas=$('sign-canvas'); let drag=null;
  const point=event=>{const rect=canvas.getBoundingClientRect(),size=designSize(design);return{x:(event.clientX-rect.left)*size.width*100/rect.width,y:(event.clientY-rect.top)*size.height*100/rect.height};};
  canvas.addEventListener('pointerdown',async event=>{
    if(event.button!==0||!ready)return;
    const p=point(event), b=designSize(design).photoBox;
    const hit=latestQuality.hitRegions?.findLast(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height);
    if(hit){event.preventDefault();const input=['entries','menuItems'].includes(hit.field)?$(`entry-${hit.entryIndex}-${hit.entryPart}`):$(hit.field);input.focus();input.select();return;}
    if(design.showImage!==false&&p.x>=b.x && p.x<=b.x+b.width && p.y>=b.y && p.y<=b.y+b.height) {
      const item=gallery.find(i=>i.id===design.imageId); if(!item)return;
      const initial=clone(design), photo=await loadImage(item.src);
      // Ignore a pointer already released while an asset was loading.
      if(event.buttons!==1)return;
      drag={point:p,initial,box:b,geometry:cropGeometry(photo.naturalWidth,photo.naturalHeight,b.width,b.height,initial.crop)};
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
    }
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;if(design.sizeId!==drag.initial.sizeId){stopDrag();return;} const p=point(event),next=clone(drag.initial),g=drag.geometry;
    const overflowX=g.width-drag.box.width, overflowY=g.height-drag.box.height;
    next.crop.x=overflowX>0?Math.max(0,Math.min(100,drag.initial.crop.x-(p.x-drag.point.x)/overflowX*100)):50;
    next.crop.y=overflowY>0?Math.max(0,Math.min(100,drag.initial.crop.y-(p.y-drag.point.y)/overflowY*100)):50;
    setDesign(next,'drag-crop',true);
  });
  const stopDrag=()=>{drag=null;canvas.classList.remove('is-dragging');};
  canvas.addEventListener('pointerup',stopDrag); canvas.addEventListener('pointercancel',stopDrag); canvas.addEventListener('lostpointercapture',stopDrag);
  canvas.addEventListener('keydown',event=>{
    if(design.showImage===false)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault(); const next=clone(design),step=event.shiftKey?5:1;
    const axis=event.key==='ArrowLeft'||event.key==='ArrowRight'?'x':'y';
    const direction=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    next.crop[axis]=Math.max(0,Math.min(100,next.crop[axis]+step*direction));setDesign(next,'keyboard-crop',true);
  });
}

async function start() {
  try {
    const response=await fetch(new URL('assets/gallery.json',document.baseURI),{cache:'no-cache'});
    if(!response.ok)throw new Error('The image gallery could not load. Reload the page to try again.');
    const raw=await response.json();
    if(!Array.isArray(raw))throw new Error('Invalid gallery manifest.');
    const ids=new Set();
    gallery=raw.filter(item=>item.approved===true);
    for(const item of gallery) {
      if(typeof item.id!=='string'||ids.has(item.id)||typeof item.title!=='string'||typeof item.alt!=='string'||typeof item.category!=='string'||
        !Array.isArray(item.tags)||!item.tags.every(v=>typeof v==='string')||!Array.isArray(item.scienceAreas)||!item.scienceAreas.every(v=>typeof v==='string')||
        !/^assets\/gallery\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(item.src)||
        (item.thumbnail&&!/^assets\/gallery\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(item.thumbnail)))throw new Error('Invalid gallery entry. Contact the site maintainer.');
      ids.add(item.id);
    }
    if(!gallery.some(i=>i.id===design.imageId))design.imageId=gallery[0]?.id||null;
    try {
      const saved=localStorage.getItem(STORAGE);
      if(saved)design=validateDesign(JSON.parse(saved),gallery);
    } catch { toast('The saved draft could not be restored. Open a JSON copy or start a new design.'); }
    for(const [id,values] of [['category',gallery.map(i=>i.category)],['science-area',gallery.flatMap(i=>i.scienceAreas)]]) {
      for(const value of [...new Set(values)].sort()) {const option=document.createElement('option');option.value=value;option.textContent=value;$(id).append(option);}
    }
    tutorial=createTutorial();
    $('sign-size').replaceChildren(...Object.entries(SIZES).map(([id,size])=>{const option=document.createElement('option');option.value=id;option.textContent=size.label;return option;}));
    for(const [value,layout] of Object.entries(MEDIUM_LAYOUTS)){const option=document.createElement('option');option.value=value;option.textContent=layout.label;$('medium-layout').append(option);}
    syncControls(); updateGallery(); bindEvents(); await requestRender();
    companion=await connectCompanion({
      applyDesign:async next=>{setDesign(validateDesign(next,gallery));await requestRender();},applyView:applyFilters,applyTutorial,
      onConflict:toast,onStatus:message=>{$('agent-status').hidden=false;$('agent-status').textContent=message;},
    });
    registerBrowserTools({getDesign:()=>clone(design),getGallery:()=>clone(gallery),getState:getEditorState,
      setDesign:async next=>{setDesign(next);await requestRender();},setFilters:applyFilters,render:requestRender,tutorial,getDownload,
      imagePicker,newDesign:()=>$('reset-design').click(),undo:()=>$('undo').click(),redo:()=>$('redo').click(),saveJson:()=>$('save-json').click(),
      export:async format=>{if(!ready||exportBusy||latestQuality.warnings.length||(latestQuality.imageVisible!==false&&latestQuality.photoDpi<300))throw new Error('Resolve the print checks before exporting.');const result=await exportArtwork(format);if(result?.error)throw new Error(result.error);return result;},
    });
    if(ready)tutorial.start({automatic:true});
  } catch(error) {
    $('startup-error').hidden=false; $('startup-error').textContent=error.message;
    $('quality').textContent='The editor could not start. Reload the page to try again.';
    $('open-json').disabled=true;
  }
}
start();
