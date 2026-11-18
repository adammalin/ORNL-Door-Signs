import { SIZES, cropGeometry, effectiveDpi } from './model.js';

const GREEN = '#00662c', NAVY = '#00454d', WHITE = '#ffffff', GRAPHITE = '#dbdcdb';
export const PHOTO_BOX = SIZES['medium-landscape'].photoBox;
const images = new Map();
export function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { images.delete(src); reject(new Error('An artwork image could not load. Reload the page and try again.')); };
    image.src = new URL(src, document.baseURI).href;
  }));
  const result=images.get(src);
  // Bound decoded high-resolution photos while browsing the larger gallery.
  images.delete(src);images.set(src,result);
  while(images.size>6)images.delete(images.keys().next().value);
  return result;
}
function linesFor(ctx, text, width, spacing) {
  const measure = value => ctx.measureText(value).width + Math.max(0, [...value].length - 1) * spacing;
  const lines = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  return { lines, widths: lines.map(measure) };
}
function textBlock(ctx, text, {x,y,width,height,maxSize,minSize=14,weight=400,italic=false,spacing=0,maxLines=2,color=NAVY,center=false,align='left',lineHeight=1.16}) {
  let size = maxSize, wrapped;
  for (; size >= minSize; size--) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px Mulish`;
    wrapped = linesFor(ctx, text, width, spacing);
    if (wrapped.lines.length <= maxLines && wrapped.widths.every(w => w <= width) && wrapped.lines.length * size * lineHeight <= height) break;
  }
  const fits = size >= minSize;
  size = Math.max(size, minSize);
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px Mulish`;
  wrapped = linesFor(ctx, text, width, spacing);
  ctx.fillStyle = color; ctx.textBaseline = 'top';
  let baseline=y;
  if(center){
    ctx.textBaseline='alphabetic';
    const metrics=wrapped.lines.map(line=>ctx.measureText(line||'M'));
    const ascent=Math.max(...metrics.map(m=>m.actualBoundingBoxAscent));
    const descent=Math.max(...metrics.map(m=>m.actualBoundingBoxDescent));
    baseline=y+(height-((wrapped.lines.length-1)*size*lineHeight+ascent+descent))/2+ascent;
  }
  // Clip only as a preview fallback; printing is blocked when text does not fit.
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  for (let i=0; i<wrapped.lines.length; i++) {
    const start=x+(center?(width-wrapped.widths[i])/2:align==='right'?width-wrapped.widths[i]:0);
    if (!spacing) { ctx.fillText(wrapped.lines[i], start, baseline + i * size * lineHeight); continue; }
    let left = start;
    for (const char of [...wrapped.lines[i]]) {
      ctx.fillText(char, left, baseline + i * size * lineHeight);
      left += ctx.measureText(char).width + spacing;
    }
  }
  ctx.restore();
  return { fits, size, height: wrapped.lines.length * size * lineHeight };
}
export async function renderSign(canvas, design, gallery, dpi = 150, environment = {}) {
  const size = SIZES[design.sizeId];
  const small=design.sizeId==='small-room',large=Boolean(size.imageOptional),imageVisible=design.showImage!==false;
  const width=size.width*100,height=size.height*100,bsd=design.sizeId==='large-bsd';
  const headerBottom=large&&design.showSubtitle!==false?Math.max(size.headerBottom,608):size.headerBottom;
  const selected = gallery.find(item => item.id === design.imageId && item.approved === true);
  const imageLoader=environment.loadImage||loadImage;
  const fontsReady=environment.fontsReady||(()=>Promise.all([
    document.fonts.load('800 55px Mulish'),document.fonts.load('700 20px Mulish'),
    document.fonts.load('400 20px Mulish'),document.fonts.load('italic 400 26px Mulish'),
  ]));
  const [photo, leaf,,logo,hexagons] = await Promise.all([
    selected&&imageVisible ? imageLoader(selected.src) : Promise.resolve(null),small||large?null:imageLoader('assets/template-leaf.png'),fontsReady(),
    bsd?imageLoader('assets/template-logo.png'):null,bsd?imageLoader('assets/template-hexagons.png'):null,
  ]);
  canvas.width = Math.round(size.width * dpi); canvas.height = Math.round(size.height * dpi);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.imageSmoothingQuality = 'high';
  const border = ctx.createLinearGradient(0, height, width, 0);
  border.addColorStop(0, GREEN); border.addColorStop(1, NAVY);
  ctx.fillStyle = border; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = WHITE;
  if(small)ctx.fillRect(20.5,21,833,208);else if(large)ctx.fillRect(50,50,1000,1600);else ctx.fillRect(18,18,814,464);
  if(large){ctx.save();ctx.globalAlpha=.6;ctx.fillStyle=GRAPHITE;ctx.fillRect(50,50,1000,headerBottom-50);ctx.restore();}
  const b = size.photoBox;
  let photoDpi = null;
  if (photo) {
    const crop = cropGeometry(photo.naturalWidth, photo.naturalHeight, b.width, b.height, design.crop);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x,b.y,b.width,b.height); ctx.clip();
    ctx.drawImage(photo, b.x+crop.x, b.y+crop.y, crop.width, crop.height); ctx.restore();
    photoDpi = effectiveDpi(photo.naturalWidth,photo.naturalHeight,b.width/100,b.height/100,design.crop.zoom);
  } else if(imageVisible) {
    ctx.fillStyle = GRAPHITE; ctx.fillRect(b.x,b.y,b.width,b.height);
    textBlock(ctx, 'Choose a gallery image', {x:b.x+15,y:b.y+b.height/2-30,width:b.width-30,height:60,maxSize:20,maxLines:3});
  }
  const warnings = [];
  if(large){
    if(bsd){
      ctx.drawImage(logo,116,108,287,70);
      ctx.save();ctx.beginPath();ctx.rect(50,50,1000,headerBottom-50);ctx.clip();
      ctx.drawImage(hexagons,791,35,802/3,694/3);ctx.restore();
    }
    const titleBox={x:116,y:bsd?210:220,width:868,height:bsd?265:240};
    const title=textBlock(ctx,design.title,{...titleBox,maxSize:design.titleSize,minSize:24,weight:800,color:NAVY,maxLines:bsd?3:2,lineHeight:bsd ? .95 : 1.0});
    if(!title.fits)warnings.push('Heading is too long. Shorten it or add a line break.');
    const hitRegions=[{field:'title',...titleBox}];
    if(design.showSubtitle!==false){
      const box={x:116,y:480,width:868,height:75};
      const sub=textBlock(ctx,design.subtitle,{...box,maxSize:42,minSize:22,italic:bsd,weight:bsd?700:800,maxLines:1});
      if(!sub.fits)warnings.push('Subtitle is too long. Shorten it to one line.');
      hitRegions.push({field:'subtitle',...box});
    }
    const entries=design.entries||[],start=headerBottom+(design.sizeId==='large-directors-staff'?80:55);
    const bottom=imageVisible?b.y-35:1600;
    const weights={primary:1.4,standard:1.15,assistant:.9};
    const unit=Math.min(140,(bottom-start)/(entries.reduce((n,e)=>n+weights[e.style||'primary'],0)||1));
    const scale=Math.min(1,unit/115);let y=start;
    entries.forEach((entry,index)=>{
      const style=entry.style||'primary',rowHeight=unit*weights[style],nameMax=Math.max(24,({primary:76,standard:64,assistant:46}[style])*scale);
      const subMax=Math.max(14,(style==='assistant'?26:style==='standard'?32:36)*scale);
      const nameBox={x:116,y,width:868,height:nameMax*1.18};
      const name=textBlock(ctx,entry.name,{...nameBox,maxSize:nameMax,minSize:24,weight:800,color:GREEN,maxLines:1,align:entry.align});
      const subBox={x:116,y:y+nameBox.height+4,width:868,height:subMax*1.2};
      const sub=entry.subname.trim()?textBlock(ctx,entry.subname,{...subBox,maxSize:subMax,minSize:14,italic:true,maxLines:1,align:entry.align}):null;
      if(!entry.name.trim())warnings.push(`Name ${index+1} is empty. Enter a name or remove the entry.`);
      if(!name.fits||sub&&!sub.fits)warnings.push(`Name ${index+1} or its sub-name is too long. Shorten it.`);
      if((sub?subBox.y+subBox.height:nameBox.y+nameBox.height)>Math.min(y+rowHeight,bottom)+1)warnings.push('The name list is too dense. Remove entries or hide the image.');
      hitRegions.push({field:'entries',entryIndex:index,entryPart:'name',...nameBox},...(sub?[{field:'entries',entryIndex:index,entryPart:'subname',...subBox}]:[]));
      y+=rowHeight;
    });
    if(!design.title.trim())warnings.push('Add a title before exporting.');
    if(imageVisible&&!photo)warnings.push('Choose an approved gallery image before exporting.');
    return {warnings:[...new Set(warnings)],photoDpi,imageVisible,titleSize:title.size,hitRegions};
  }
  if(small){
    const titleBox={x:42,y:design.showSubtitle?68:42,width:565,height:design.showSubtitle?100:166};
    const title=textBlock(ctx,design.title,{...titleBox,maxSize:design.titleSize,minSize:24,weight:800,color:GREEN,maxLines:1,center:true});
    const subtitleBox={x:42,y:156,width:565,height:34};
    const subtitle=design.showSubtitle?textBlock(ctx,design.subtitle,{...subtitleBox,maxSize:28,minSize:14,weight:800,color:NAVY,maxLines:1,center:true}):null;
    if(!title.fits)warnings.push('Title is too long for this template. Shorten it to one line.');
    if(subtitle&&!subtitle.fits)warnings.push('Subtitle is too long for this template. Shorten it to one line.');
    if(!design.title.trim())warnings.push('Add a title before exporting.');
    if(!photo)warnings.push('Choose an approved gallery image before exporting.');
    return {warnings,photoDpi,imageVisible,titleSize:title.size,hitRegions:[{field:'title',...titleBox},...(design.showSubtitle?[{field:'subtitle',...subtitleBox}]:[])]};
  }
  const org = textBlock(ctx,design.organization,{x:50,y:48,width:455,height:66,maxSize:19,minSize:13,weight:800,spacing:2,maxLines:3});
  const title = textBlock(ctx,design.title,{x:50,y:188,width:456,height:132,maxSize:design.titleSize,minSize:24,weight:800,color:GREEN});
  const subtitleY = 188 + Math.max(64, title.height) + 8;
  const subtitle = design.showSubtitle!==false?textBlock(ctx,design.subtitle,{x:50,y:subtitleY,width:456,height:62,maxSize:25,minSize:14,italic:true}):{fits:true,height:0};
  const lineY = subtitleY + (design.showSubtitle!==false?Math.max(29,subtitle.height):0) + 14;
  if (design.title.trim() || (design.showSubtitle!==false&&design.subtitle.trim())) { ctx.fillStyle=GREEN; ctx.fillRect(50,lineY,78,5); }
  const details = textBlock(ctx,design.details,{x:50,y:407,width:403,height:58,maxSize:21,minSize:14});
  ctx.drawImage(leaf,481,408,41,41*leaf.naturalHeight/leaf.naturalWidth);
  const room = textBlock(ctx,design.room,{x:566,y:443,width:250,height:28,maxSize:21,minSize:13,weight:800,color:WHITE,maxLines:1});
  // A white room label uses a navy field so it stays legible on every photo.
  if (design.room.trim()) {
    ctx.fillStyle=NAVY; ctx.fillRect(559,435,264,39);
    textBlock(ctx,design.room,{x:566,y:443,width:250,height:28,maxSize:21,minSize:13,weight:800,color:WHITE,maxLines:1});
  }
  for (const [label,result] of [['Organization',org],['Title',title],['Subtitle',subtitle],['Group / program',details],['Room',room]]) {
    if (!result.fits) warnings.push(`${label} is too long. Shorten the text or add a line break.`);
  }
  if (!design.title.trim()) warnings.push('Add a title before exporting.');
  if (!photo) warnings.push('Choose an approved gallery image before exporting.');
  const hitRegions = [
    {field:'organization',x:50,y:48,width:455,height:66},
    {field:'title',x:50,y:188,width:456,height:Math.max(35,title.height)},
    ...(design.showSubtitle!==false?[{field:'subtitle',x:50,y:subtitleY,width:456,height:Math.max(28,subtitle.height)}]:[]),
    {field:'details',x:50,y:407,width:403,height:58},
    ...(design.room.trim()?[{field:'room',x:559,y:435,width:264,height:39}]:[]),
  ];
  return { warnings, photoDpi, imageVisible, titleSize: title.size, hitRegions };
}
