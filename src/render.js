import { SIZES, designSize, cropGeometry, effectiveDpi } from './model.js';

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
function roomGeometry(sizeId){
  if(sizeId==='medium-landscape')return {x:559,y:435,width:264,height:39,pad:7,textY:443,textHeight:28,font:21,min:13};
  const size=SIZES[sizeId];
  if(sizeId==='small-room')return {x:639.5,y:191,width:206,height:30,pad:7,textY:194,textHeight:26,font:20,min:11};
  const margin=sizeId==='square-bsd'?27.5:50,y=size.height*100-margin-80;
  return {x:size.width*100-margin-380,y,width:360,height:60,pad:12,textY:y+8,textHeight:46,font:36,min:14};
}
export async function renderSign(canvas, design, gallery, dpi = 150, environment = {}) {
  const size = designSize(design);
  const small=design.sizeId==='small-room',large=Boolean(size.large),square=design.sizeId==='square-bsd',menu=Boolean(size.menu),imageVisible=design.showImage!==false&&!size.imageDisabled;
  const width=size.width*100,height=size.height*100,bsd=design.sizeId==='large-bsd'||square;
  const headerBottom=large&&!square&&design.showSubtitle!==false?Math.max(size.headerBottom,608):size.headerBottom;
  const selected = gallery.find(item => item.id === design.imageId && item.approved === true);
  const imageLoader=environment.loadImage||loadImage;
  const fontsReady=environment.fontsReady||(()=>Promise.all([
    document.fonts.load('800 55px Mulish'),document.fonts.load('700 20px Mulish'),
    document.fonts.load('400 20px Mulish'),document.fonts.load('italic 400 26px Mulish'),
  ]));
  const [photo, leaf,,logo,hexagons] = await Promise.all([
    selected&&imageVisible ? imageLoader(selected.src) : Promise.resolve(null),small||large?null:imageLoader(size.colored?'assets/template-leaf-white.png':'assets/template-leaf.png'),fontsReady(),
    bsd?imageLoader('assets/template-logo.png'):null,bsd?imageLoader('assets/template-hexagons.png'):size.header==='green'?imageLoader('assets/template-medium-hexagons.png'):null,
  ]);
  canvas.width = Math.round(size.width * dpi); canvas.height = Math.round(size.height * dpi);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(canvas.width / width, canvas.height / height);
  ctx.imageSmoothingQuality = 'high';
  const roomVisible=design.showRoom??Boolean(design.room.trim()),roomBox=roomVisible?roomGeometry(design.sizeId):null;
  const finish=quality=>{
    if(roomVisible){
      if(!design.room.trim())quality.warnings.push('Enter the room number or turn off Show room number.');
      else{
        const r=roomBox;ctx.fillStyle=NAVY;ctx.fillRect(r.x,r.y,r.width,r.height);
        const room=textBlock(ctx,design.room,{x:r.x+r.pad,y:r.textY,width:r.width-r.pad*2,height:r.textHeight,maxSize:r.font,minSize:r.min,weight:800,color:WHITE,maxLines:1,align:'right'});
        if(!room.fits)quality.warnings.push('Room label is too long. Shorten it.');
        quality.hitRegions.push({field:'room',x:r.x,y:r.y,width:r.width,height:r.height});
      }
    }
    return quality;
  };
  const border = ctx.createLinearGradient(0, height, width, 0);
  border.addColorStop(0, (menu&&design.background==='color'||size.colored)?'#7dba00':GREEN); border.addColorStop(1, (menu&&design.background==='color'||size.colored)?'#00bdb5':NAVY);
  ctx.fillStyle = border; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = WHITE;
  if(small)ctx.fillRect(20.5,21,833,208);else if(large){const m=square?27.5:50;ctx.fillRect(m,m,width-m*2,height-m*2);}else ctx.fillRect(18,18,814,464);
  if(large&&!menu){const m=square?27.5:50;ctx.save();ctx.globalAlpha=.6;ctx.fillStyle=GRAPHITE;ctx.fillRect(m,m,width-m*2,headerBottom-m);ctx.restore();}
  if(size.colored){const fill=ctx.createLinearGradient(18,482,832,18);fill.addColorStop(0,GREEN);fill.addColorStop(1,NAVY);ctx.fillStyle=fill;ctx.fillRect(18,18,814,464);}
  if(size.header){ctx.fillStyle=size.header==='green'?NAVY:GRAPHITE;ctx.fillRect(18,18,size.header==='green'?814:532,size.header==='green'?150:95);}
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
  if(menu){
    const colored=design.background==='color';
    if(colored){const fill=ctx.createLinearGradient(50,height-50,width-50,50);fill.addColorStop(0,GREEN);fill.addColorStop(1,NAVY);ctx.fillStyle=fill;ctx.fillRect(50,50,width-100,height-100);}
    const ink=colored?WHITE:'#373a36',valueInk=colored?WHITE:GREEN,hitRegions=[];
    const heading=Boolean(design.title.trim()||(design.showSubtitle&&design.subtitle.trim()));
    if(design.title.trim()){
      const box={x:130,y:90,width:840,height:100},result=textBlock(ctx,design.title,{...box,maxSize:design.titleSize,minSize:24,weight:800,color:colored?WHITE:NAVY,maxLines:1});
      if(!result.fits)warnings.push('Heading is too long. Shorten it to one line.');hitRegions.push({field:'title',...box});
    }
    if(design.showSubtitle&&design.subtitle.trim()){
      const box={x:130,y:195,width:840,height:65},result=textBlock(ctx,design.subtitle,{...box,maxSize:36,minSize:18,color:ink,maxLines:1});
      if(!result.fits)warnings.push('Subtitle is too long. Shorten it.');hitRegions.push({field:'subtitle',...box});
    }
    const items=design.menuItems||[],start=heading?300:150,bottom=roomBox?roomBox.y-30:height-100;
    ctx.font='700 48px Mulish';
    const counts=items.map(i=>Math.max(1,linesFor(ctx,i.label,620,0).lines.length));
    const total=counts.reduce((n,c)=>n+c,0),pitch=Math.min(96,(bottom-start)/(total||1)),font=Math.min(48,pitch/2);
    if(font<24)warnings.push('The information list is too dense. Remove items or shorten their text.');
    let y=start;
    items.forEach((item,index)=>{
      const rowHeight=counts[index]*pitch,box={x:130,y,width:620,height:rowHeight};
      const result=textBlock(ctx,item.label,{...box,maxSize:Math.max(24,font),minSize:24,weight:700,color:ink,maxLines:4,lineHeight:1.6});
      const valueBox={x:800,y:y+(counts[index]-1)*pitch,width:170,height:pitch};
      const value=textBlock(ctx,item.value,{...valueBox,maxSize:Math.max(24,font),minSize:20,weight:800,color:valueInk,maxLines:1,align:'right'});
      if(!item.label.trim())warnings.push(`Item ${index+1} is empty. Enter information or remove the item.`);
      if(!result.fits||!value.fits)warnings.push(`Item ${index+1} is too long. Shorten it.`);
      hitRegions.push({field:'menuItems',entryIndex:index,entryPart:'label',...box},{field:'menuItems',entryIndex:index,entryPart:'value',...valueBox});y+=rowHeight;
    });
    if(!items.length&&!heading)warnings.push('Add information items or a heading before exporting.');
    return finish({warnings:[...new Set(warnings)],photoDpi:null,imageVisible:false,titleSize:design.titleSize,hitRegions});
  }
  if(large){
    if(bsd){
      ctx.drawImage(logo,square?90:116,square?76:108,287,70);
      const m=square?27.5:50;ctx.save();ctx.beginPath();ctx.rect(m,m,width-m*2,headerBottom-m);ctx.clip();
      ctx.drawImage(hexagons,square?809:791,square?30:35,802/3,694/3);ctx.restore();
    }
    const titleBox={x:square?90:116,y:square?178:bsd?210:220,width:square?900:868,height:bsd?265:240};
    const title=textBlock(ctx,design.title,{...titleBox,maxSize:design.titleSize,minSize:24,weight:800,color:NAVY,maxLines:bsd?3:2,lineHeight:bsd ? .95 : 1.0});
    if(!title.fits)warnings.push('Heading is too long. Shorten it or add a line break.');
    const hitRegions=[{field:'title',...titleBox}];
    if(design.showSubtitle!==false){
      const box={x:square?90:116,y:square?454:480,width:square?900:868,height:75};
      const sub=textBlock(ctx,design.subtitle,{...box,maxSize:42,minSize:22,italic:bsd,weight:bsd?700:800,maxLines:1});
      if(!sub.fits)warnings.push('Subtitle is too long. Shorten it to one line.');
      hitRegions.push({field:'subtitle',...box});
    }
    const entries=design.entries||[],start=headerBottom+(design.sizeId==='large-directors-staff'?80:55);
    const bottom=imageVisible?b.y-35:Math.min(height-100,roomBox?roomBox.y-30:height-100);
    const weights={primary:1.4,standard:1.15,assistant:.9};
    const unit=Math.min(square?107:140,(bottom-start)/(entries.reduce((n,e)=>n+weights[e.style||'primary'],0)||1));
    const scale=Math.min(1,unit/115)*(square ? .8 : 1);let y=start;
    entries.forEach((entry,index)=>{
      const style=entry.style||'primary',rowHeight=unit*weights[style],nameMax=Math.max(24,({primary:76,standard:64,assistant:46}[style])*scale);
      const subMax=Math.max(14,(style==='assistant'?26:style==='standard'?32:36)*scale);
      const nameBox={x:square?90:116,y,width:square?900:868,height:nameMax*1.18};
      const name=textBlock(ctx,entry.name,{...nameBox,maxSize:nameMax,minSize:24,weight:800,color:GREEN,maxLines:1,align:entry.align});
      const subBox={x:nameBox.x,y:y+nameBox.height+4,width:nameBox.width,height:subMax*1.2};
      const sub=entry.subname.trim()?textBlock(ctx,entry.subname,{...subBox,maxSize:subMax,minSize:14,italic:true,maxLines:1,align:entry.align}):null;
      if(!entry.name.trim())warnings.push(`Name ${index+1} is empty. Enter a name or remove the entry.`);
      if(!name.fits||sub&&!sub.fits)warnings.push(`Name ${index+1} or its sub-name is too long. Shorten it.`);
      if((sub?subBox.y+subBox.height:nameBox.y+nameBox.height)>Math.min(y+rowHeight,bottom)+1)warnings.push('The name list is too dense. Remove entries or hide the image.');
      hitRegions.push({field:'entries',entryIndex:index,entryPart:'name',...nameBox},...(sub?[{field:'entries',entryIndex:index,entryPart:'subname',...subBox}]:[]));
      if(square&&index<entries.length-1){ctx.fillStyle=GREEN;ctx.fillRect(90,y+rowHeight-36,80,5.5);}y+=rowHeight;
    });
    if(!design.title.trim())warnings.push('Add a title before exporting.');
    if(imageVisible&&!photo)warnings.push('Choose an approved gallery image before exporting.');
    return finish({warnings:[...new Set(warnings)],photoDpi,imageVisible,titleSize:title.size,hitRegions});
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
    return finish({warnings,photoDpi,imageVisible,titleSize:title.size,hitRegions:[{field:'title',...titleBox},...(design.showSubtitle?[{field:'subtitle',...subtitleBox}]:[])]});
  }
  if(size.multiName){
    const greenHeader=size.header==='green',grayHeader=size.header==='gray',withPhoto=imageVisible;
    const contentWidth=withPhoto?456:730,left=greenHeader?65:50;
    const orgBox=grayHeader?{x:118,y:47,width:395,height:55}:greenHeader?{x:65,y:46,width:580,height:70}:{x:50,y:48,width:contentWidth,height:66};
    const org=textBlock(ctx,design.organization,{...orgBox,maxSize:greenHeader?33:grayHeader?30:19,minSize:13,weight:800,spacing:greenHeader||grayHeader?0:2,maxLines:2,color:greenHeader?WHITE:NAVY});
    if(!org.fits)warnings.push('Organization heading is too long. Shorten it or add a line break.');
    const hitRegions=[{field:'organization',...orgBox}];
    if(greenHeader){
      ctx.drawImage(hexagons,671,18,161,139.33);
      const box={x:65,y:120,width:585,height:28},result=textBlock(ctx,design.details,{...box,maxSize:18,minSize:12,italic:true,maxLines:1,color:WHITE});
      if(!result.fits)warnings.push('Header tagline is too long. Shorten it.');hitRegions.push({field:'details',...box});
    }else if(design.details.trim()){
      const box={x:50,y:407,width:withPhoto?403:roomBox?480:650,height:58},result=textBlock(ctx,design.details,{...box,maxSize:20,minSize:13,italic:design.mediumLayout==='bsd-white',maxLines:2});
      if(!result.fits)warnings.push('Group / program is too long. Shorten it.');hitRegions.push({field:'details',...box});
    }
    if(grayHeader)ctx.drawImage(leaf,50,42,41,41*leaf.naturalHeight/leaf.naturalWidth);
    else ctx.drawImage(leaf,greenHeader?65:withPhoto?481:760,greenHeader?417:roomBox&&!withPhoto?375:408,41,41*leaf.naturalHeight/leaf.naturalWidth);
    const entries=design.entries||[],start=greenHeader?199:grayHeader?181:143,bottom=greenHeader?405:389;
    const weights={primary:1.25,standard:1.1,assistant:1},total=entries.reduce((n,e)=>n+weights[e.style||'primary'],0)||1;
    const unit=Math.min(122,(bottom-start)/total);let y=start;
    entries.forEach((entry,index)=>{
      const style=entry.style||'primary',rowHeight=unit*weights[style],scale=Math.min(1,unit/90);
      const nameMax=Math.max(21,Math.min(design.titleSize,style==='assistant'?38:55)*scale),subMax=Math.max(13,22*scale);
      const box={x:left,y,width:contentWidth-(left-50),height:nameMax*1.18},name=textBlock(ctx,entry.name,{...box,maxSize:nameMax,minSize:21,weight:800,color:GREEN,maxLines:1,align:entry.align});
      const subBox={x:box.x,y:y+box.height+4,width:box.width,height:subMax*1.2};
      const sub=design.showSubtitle!==false&&entry.subname.trim()?textBlock(ctx,entry.subname,{...subBox,maxSize:subMax,minSize:13,italic:true,maxLines:1,align:entry.align}):null;
      if(!entry.name.trim())warnings.push(`Name ${index+1} is empty. Enter a name or remove the entry.`);
      if(!name.fits||sub&&!sub.fits)warnings.push(`Name ${index+1} or its sub-name is too long. Shorten it.`);
      const end=sub?subBox.y+subBox.height:box.y+box.height;
      if(end>Math.min(y+rowHeight-8,bottom)+1)warnings.push('The name list is too dense. Remove entries or shorten their text.');
      hitRegions.push({field:'entries',entryIndex:index,entryPart:'name',...box},...(sub?[{field:'entries',entryIndex:index,entryPart:'subname',...subBox}]:[]));
      if(size.divider&&index<entries.length-1){ctx.fillStyle=GREEN;ctx.fillRect(left,Math.min(y+rowHeight-13,bottom-8),78,5);}
      y+=rowHeight;
    });
    if(!entries.length&&!design.organization.trim())warnings.push('Add a heading or name before exporting.');
    if(imageVisible&&!photo)warnings.push('Choose an approved gallery image before exporting.');
    return finish({warnings:[...new Set(warnings)],photoDpi,imageVisible,titleSize:design.titleSize,hitRegions});
  }
  const ink=size.colored?WHITE:NAVY,nameInk=size.colored?WHITE:GREEN,contentWidth=imageVisible?456:730;
  const org = textBlock(ctx,design.organization,{x:50,y:48,width:contentWidth,height:66,maxSize:19,minSize:13,weight:800,spacing:2,maxLines:3,color:ink});
  const title = textBlock(ctx,design.title,{x:50,y:188,width:contentWidth,height:132,maxSize:design.titleSize,minSize:24,weight:800,color:nameInk});
  const subtitleY = 188 + Math.max(64, title.height) + 8;
  const subtitle = design.showSubtitle!==false?textBlock(ctx,design.subtitle,{x:50,y:subtitleY,width:contentWidth,height:62,maxSize:25,minSize:14,italic:true,color:ink}):{fits:true,height:0};
  const lineY = subtitleY + (design.showSubtitle!==false?Math.max(29,subtitle.height):0) + 14;
  if (design.title.trim() || (design.showSubtitle!==false&&design.subtitle.trim())) { ctx.fillStyle=nameInk; ctx.fillRect(50,lineY,78,5); }
  const detailsWidth=imageVisible?403:roomBox?480:650;
  const details = textBlock(ctx,design.details,{x:50,y:407,width:detailsWidth,height:58,maxSize:21,minSize:14,color:ink});
  ctx.drawImage(leaf,imageVisible?481:760,roomBox&&!imageVisible?375:408,41,41*leaf.naturalHeight/leaf.naturalWidth);
  for (const [label,result] of [['Organization',org],['Title',title],['Subtitle',subtitle],['Group / program',details]]) {
    if (!result.fits) warnings.push(`${label} is too long. Shorten the text or add a line break.`);
  }
  if (!design.title.trim()) warnings.push('Add a title before exporting.');
  if (imageVisible&&!photo) warnings.push('Choose an approved gallery image before exporting.');
  const hitRegions = [
    {field:'organization',x:50,y:48,width:contentWidth,height:66},
    {field:'title',x:50,y:188,width:contentWidth,height:Math.max(35,title.height)},
    ...(design.showSubtitle!==false?[{field:'subtitle',x:50,y:subtitleY,width:contentWidth,height:Math.max(28,subtitle.height)}]:[]),
    {field:'details',x:50,y:407,width:detailsWidth,height:58},
  ];
  return finish({ warnings, photoDpi, imageVisible, titleSize: title.size, hitRegions });
}
