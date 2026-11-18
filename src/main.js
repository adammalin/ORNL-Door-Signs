import { DEFAULT_DESIGN, SIZES, clone, validateDesign, filterGallery, cropGeometry, fileStem } from './model.js';
import { renderSign, loadImage, PHOTO_BOX } from './render.js';
import { pngWithDpi, canvasPdf } from './print.js';

const $ = id => document.getElementById(id);
const STORAGE = 'ornl-door-signs-v1';
let gallery = [], design = clone(DEFAULT_DESIGN), history = [], future = [];
let renderVersion = 0, ready = false, exportBusy = false, toastTimer, editTime = 0, editKey = '', downloadUrl;
let latestQuality = { warnings: ['Preparing canvas'], photoDpi: null };
const fields = ['organization','title','subtitle','details','room'];

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),6500);
}
function saveLocal() {
  try { localStorage.setItem(STORAGE, JSON.stringify(design)); $('save-status').textContent = 'Draft saved on this device'; }
  catch { $('save-status').textContent = 'Autosave unavailable · save a JSON copy'; }
}
function syncControls() {
  fields.forEach(key => { if ($(key).value !== design[key]) $(key).value = design[key]; });
  $('sign-size').value = design.sizeId;
  $('title-size').value = design.titleSize;
  $('title-size-value').textContent = `${design.titleSize} · auto-fit`;
  for (const key of ['x','y','zoom']) {
    $(`crop-${key}`).value = design.crop[key];
    $(`crop-${key}-value`).textContent = key === 'zoom' ? `${design.crop[key].toFixed(2)}×` : `${Math.round(design.crop[key])}%`;
  }
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  const item = gallery.find(item => item.id === design.imageId);
  $('selected-image').textContent = item?.title || 'Choose a gallery image';
  for (const button of $('gallery').querySelectorAll('[data-image-id]')) {
    const selected = button.dataset.imageId === design.imageId;
    button.setAttribute('aria-pressed', String(selected));
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
  const blocked = !ready || exportBusy || latestQuality.warnings.length > 0 || latestQuality.photoDpi < 300;
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
    canvas.setAttribute('aria-label', `Door sign: ${design.organization}. ${design.title}. ${design.subtitle}. ${design.details}. ${design.room}. Photo: ${gallery.find(i => i.id === design.imageId)?.alt || 'none'}. Click text to edit; drag the photo to reframe.`);
    latestQuality = quality; ready = true;
    const qualityBox = $('quality'); qualityBox.replaceChildren();
    const heading = document.createElement('strong'), text = document.createElement('p');
    qualityBox.className = 'quality-status';
    if (quality.warnings.length) {
      qualityBox.classList.add('error'); heading.textContent = 'A little adjustment needed';
      text.textContent = quality.warnings.join(' ');
    } else if (quality.photoDpi < 300) {
      qualityBox.classList.add('warning'); heading.textContent = 'Reduce image zoom for print';
      text.textContent = `Photo resolution is ${quality.photoDpi} dpi at this crop. Zoom out until it reaches at least 300 dpi to enable print exports.`;
    } else {
      heading.textContent = 'Ready to export at 300 dpi';
      text.textContent = `2550 × 1500 pixels · photo ${quality.photoDpi} dpi at this crop. Review your content before printing.`;
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
      setDesign({...clone(design),imageId:item.id,crop:{x:50,y:50,zoom:1}});
    });
    $('gallery').append(button);
  }
  syncControls();
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
    if (quality.warnings.length || quality.photoDpi < 300) throw new Error('Resolve the canvas print checks before exporting.');
    let blob;
    if (format==='png') {
      const raw=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG export failed.')),'image/png'));
      blob=pngWithDpi(new Uint8Array(await raw.arrayBuffer()),size.dpi);
    } else {
      if (typeof CompressionStream==='undefined') throw new Error('PDF export needs a current version of Chrome, Edge, Firefox, or Safari.');
      blob=await canvasPdf(canvas,size);
    }
    download(blob,`${fileStem(snapshot.title)}.${format}`);
    toast(`${format.toUpperCase()} ready. If the download didn’t start, use the save link below the export buttons.`);
  } catch(error) { toast(error.message); }
  finally { label.textContent=`Download ${format.toUpperCase()}`; exportBusy=false; exportButtons(); }
}

function bindEvents() {
  fields.forEach(key=>$(key).addEventListener('input',()=>setDesign({...clone(design),[key]:$(key).value},key,true)));
  $('sign-size').addEventListener('change',()=>setDesign({...clone(design),sizeId:$('sign-size').value}));
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
    const next=clone(DEFAULT_DESIGN); next.imageId=gallery[0]?.id || null;
    setDesign(next); toast('Started a new design. Use Undo to restore your previous draft.');
  });
  for(const id of ['image-search','category','science-area']) $(id).addEventListener(id==='image-search'?'input':'change',updateGallery);
  $('clear-filters').addEventListener('click',()=>{
    $('image-search').value=''; $('category').value=''; $('science-area').value=''; updateGallery();
  });
  $('save-json').addEventListener('click',()=>{
    download(new Blob([JSON.stringify(design,null,2)+'\n'],{type:'application/json'}),`${fileStem(design.title)}.json`);
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
  const point=event=>{const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*850/rect.width,y:(event.clientY-rect.top)*500/rect.height};};
  canvas.addEventListener('pointerdown',async event=>{
    if(event.button!==0||!ready)return;
    const p=point(event), b=PHOTO_BOX;
    const hit=latestQuality.hitRegions?.find(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height);
    if(hit){$(hit.field).focus();$(hit.field).select();return;}
    if(p.x>=b.x && p.x<=b.x+b.width && p.y>=b.y && p.y<=b.y+b.height) {
      const item=gallery.find(i=>i.id===design.imageId); if(!item)return;
      const initial=clone(design), photo=await loadImage(item.src);
      // Ignore a pointer already released while an asset was loading.
      if(event.buttons!==1)return;
      drag={point:p,initial,geometry:cropGeometry(photo.naturalWidth,photo.naturalHeight,b.width,b.height,initial.crop)};
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('is-dragging');
    }
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return; const p=point(event),next=clone(drag.initial),g=drag.geometry;
    const overflowX=g.width-PHOTO_BOX.width, overflowY=g.height-PHOTO_BOX.height;
    next.crop.x=overflowX>0?Math.max(0,Math.min(100,drag.initial.crop.x-(p.x-drag.point.x)/overflowX*100)):50;
    next.crop.y=overflowY>0?Math.max(0,Math.min(100,drag.initial.crop.y-(p.y-drag.point.y)/overflowY*100)):50;
    setDesign(next,'drag-crop',true);
  });
  const stopDrag=()=>{drag=null;canvas.classList.remove('is-dragging');};
  canvas.addEventListener('pointerup',stopDrag); canvas.addEventListener('pointercancel',stopDrag); canvas.addEventListener('lostpointercapture',stopDrag);
  canvas.addEventListener('keydown',event=>{
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
    syncControls(); updateGallery(); bindEvents(); await requestRender();
  } catch(error) {
    $('startup-error').hidden=false; $('startup-error').textContent=error.message;
    $('quality').textContent='The editor could not start. Reload the page to try again.';
    $('open-json').disabled=true;
  }
}
start();
