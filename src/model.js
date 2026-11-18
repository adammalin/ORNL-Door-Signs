export const SIZES = Object.freeze({
  'medium-landscape': { label: 'Medium · 8.5 × 5 in', width: 8.5, height: 5, dpi: 300,
    photoBox:{x:550,y:18,width:282,height:464}, titleMax:64, titleDefault:55,
    fields:['organization','title','subtitle','details','room'] },
  'small-room': { label: 'Small room sign · 8.75 × 2.5 in', width: 8.75, height: 2.5, dpi: 300,
    photoBox:{x:627.5,y:21,width:226,height:208}, titleMax:100, titleDefault:84,
    fields:['title','subtitle'] },
  'large-bsd': {label:'Large · BSD · 11 × 17 in',width:11,height:17,dpi:300,
    photoBox:{x:50,y:1325,width:1000,height:325},titleMax:130,titleDefault:84,
    fields:['title','subtitle'],imageOptional:true,headerBottom:608},
  'large-directors': {label:'Large · Director’s Office · 11 × 17 in',width:11,height:17,dpi:300,
    photoBox:{x:50,y:1325,width:1000,height:325},titleMax:130,titleDefault:110,
    fields:['title','subtitle'],imageOptional:true,headerBottom:502},
  'large-directors-staff': {label:'Large · Director’s Office staff · 11 × 17 in',width:11,height:17,dpi:300,
    photoBox:{x:50,y:1350,width:1000,height:300},titleMax:130,titleDefault:110,
    fields:['title','subtitle'],imageOptional:true,headerBottom:645},
});

export const DEFAULT_DESIGN = Object.freeze({
  app: 'ornl-door-signs', version: 1, sizeId: 'medium-landscape',
  organization: 'DIRECTORATE / DIVISION', title: 'Your name', subtitle: 'Your title',
  details: 'Group or program', room: '', showSubtitle:true, showImage:true, entries:Object.freeze([]), imageId: 'campus-aerial',
  titleSize: 55, crop: Object.freeze({ x: 50, y: 50, zoom: 1 }),
});
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function defaultDesign(sizeId='medium-landscape') {
  if(!Object.hasOwn(SIZES,sizeId))throw new Error('Unsupported sign size.');
  const design=clone(DEFAULT_DESIGN);design.sizeId=sizeId;design.titleSize=SIZES[sizeId].titleDefault;
  if(sizeId==='small-room')Object.assign(design,{title:'Copy Room',subtitle:'',showSubtitle:false,organization:'',details:'',room:''});
  if(SIZES[sizeId].imageOptional){
    const row=(style='primary',align='left')=>({name:'Your name',subname:'Role / title',style,align});
    Object.assign(design,{organization:'',details:'',room:'',title:'DIRECTOR’S\nOFFICE',subtitle:'',showSubtitle:false,
      entries:[row(),row('standard'),row('assistant','right'),row(),row('assistant','right')]});
    if(sizeId==='large-bsd')Object.assign(design,{title:'BUSINESS\nSERVICES\nDIRECTORATE',subtitle:'The Business of Enabling Research',showSubtitle:true,showImage:false,entries:[row(),row(),row()]});
    if(sizeId==='large-directors-staff')Object.assign(design,{subtitle:'Laboratory Director’s Office Staff',showSubtitle:true,entries:[row(),row('assistant','right')]});
  }
  return design;
}
const limits = { organization: 100, title: 100, subtitle: 120, details: 160, room: 30 };
export function patchDesign(current, patch, gallery) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('A design patch must be an object.');
  const allowed=[...Object.keys(limits),'showSubtitle','showImage','entries','sizeId','titleSize','imageId','crop'];
  for(const key of Object.keys(patch))if(!allowed.includes(key))throw new Error(`Unknown editable property: ${key}`);
  if(Object.hasOwn(patch,'crop')){
    if(!patch.crop||typeof patch.crop!=='object'||Array.isArray(patch.crop))throw new Error('Crop must be an object.');
    for(const key of Object.keys(patch.crop))if(!['x','y','zoom'].includes(key))throw new Error(`Unknown crop property: ${key}`);
  }
  const next={...current,...patch,crop:{...current.crop,...patch.crop}};
  if(patch.sizeId&&patch.sizeId!==current.sizeId&&!Object.hasOwn(patch,'titleSize')&&Object.hasOwn(SIZES,patch.sizeId))next.titleSize=SIZES[patch.sizeId].titleDefault;
  if(patch.sizeId&&patch.sizeId!==current.sizeId&&Object.hasOwn(SIZES,patch.sizeId)&&!SIZES[patch.sizeId].imageOptional)next.showImage=true;
  if(next.showImage!==false&&next.imageId===null&&current.showImage===false)next.imageId=gallery.find(item=>item.approved===true)?.id??null;
  return validateDesign(next,gallery);
}
export function validateDesign(input, gallery) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.app !== 'ornl-door-signs' || input.version !== 1) {
    throw new Error('Choose a Door Sign Studio JSON document (version 1).');
  }
  if (!Object.hasOwn(SIZES, input.sizeId)) throw new Error('This document uses an unsupported sign size.');
  const result = { app: input.app, version: 1, sizeId: input.sizeId };
  for (const [key, max] of Object.entries(limits)) {
    if (typeof input[key] !== 'string' || input[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input[key])) {
      throw new Error(`Invalid ${key} text (maximum ${max} characters).`);
    }
    result[key] = input[key];
  }
  if(input.showImage!==undefined&&typeof input.showImage!=='boolean')throw new Error('Invalid image visibility setting.');
  result.showImage=input.showImage??true;
  if(!result.showImage&&!SIZES[input.sizeId].imageOptional)throw new Error('This template requires a side image.');
  if (!(input.imageId===null&&!result.showImage)&&!gallery.some(item => item.id === input.imageId && item.approved === true)) {
    throw new Error('This document’s image is missing or no longer approved. Choose a current gallery image.');
  }
  result.imageId = input.imageId;
  if(input.showSubtitle!==undefined&&typeof input.showSubtitle!=='boolean')throw new Error('Invalid subtitle visibility setting.');
  result.showSubtitle=input.showSubtitle??true;
  const entries=input.entries??[];
  if(!Array.isArray(entries)||entries.length>12)throw new Error('Use at most 12 name entries.');
  result.entries=entries.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(k=>!['name','subname','style','align'].includes(k)))throw new Error('Invalid name entry.');
    for(const [key,max] of [['name',100],['subname',160]])if(typeof entry[key]!=='string'||entry[key].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(entry[key]))throw new Error(`Invalid entry ${key}.`);
    const style=entry.style??'primary',align=entry.align??'left';
    if(!['primary','standard','assistant'].includes(style)||!['left','right'].includes(align))throw new Error('Invalid name style or alignment.');
    return {name:entry.name,subname:entry.subname,style,align};
  });
  for (const [key, value, min, max] of [
    ['titleSize', input.titleSize, 24, SIZES[input.sizeId].titleMax],
    ['x', input.crop?.x, 0, 100], ['y', input.crop?.y, 0, 100], ['zoom', input.crop?.zoom, 1, 3],
  ]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Invalid ${key} setting.`);
    }
  }
  result.titleSize = input.titleSize;
  result.crop = { x: input.crop.x, y: input.crop.y, zoom: input.crop.zoom };
  return result;
}
export function filterGallery(gallery, query = '', category = '', scienceArea = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return gallery.filter(item => item.approved === true &&
    (!category || item.category === category) &&
    (!scienceArea || item.scienceAreas.includes(scienceArea)) &&
    words.every(word => [item.title, item.alt, item.description||'', item.category, ...(item.categories||[]), ...item.scienceAreas, ...item.tags]
      .join(' ').toLocaleLowerCase().includes(word)));
}
export function cropGeometry(imageWidth, imageHeight, boxWidth, boxHeight, crop) {
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight) * crop.zoom;
  const width = imageWidth * scale, height = imageHeight * scale;
  return { width, height, x: -(width - boxWidth) * crop.x / 100,
    y: -(height - boxHeight) * crop.y / 100, scale };
}
export function effectiveDpi(imageWidth, imageHeight, boxWidthInches, boxHeightInches, zoom) {
  return Math.floor(Math.min(imageWidth / boxWidthInches, imageHeight / boxHeightInches) / zoom);
}
export function fileStem(title,sizeId='medium-landscape') {
  const size=SIZES[sizeId];if(!size)throw new Error('Unsupported sign size.');
  return (title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 64) || 'door-sign') + `-${size.width}x${size.height}`;
}
