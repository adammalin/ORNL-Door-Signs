import { SIZES, cropGeometry, effectiveDpi } from './model.js';

const GREEN = '#00662c', NAVY = '#00454d', WHITE = '#ffffff', GRAPHITE = '#dbdcdb';
export const PHOTO_BOX = { x: 550, y: 18, width: 282, height: 464 };
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
function textBlock(ctx, text, {x,y,width,height,maxSize,minSize=14,weight=400,italic=false,spacing=0,maxLines=2,color=NAVY}) {
  let size = maxSize, wrapped;
  for (; size >= minSize; size--) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px Mulish`;
    wrapped = linesFor(ctx, text, width, spacing);
    if (wrapped.lines.length <= maxLines && wrapped.widths.every(w => w <= width) && wrapped.lines.length * size * 1.16 <= height) break;
  }
  const fits = size >= minSize;
  size = Math.max(size, minSize);
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px Mulish`;
  wrapped = linesFor(ctx, text, width, spacing);
  ctx.fillStyle = color; ctx.textBaseline = 'top';
  // Clip only as a preview fallback; printing is blocked when text does not fit.
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  for (let i=0; i<wrapped.lines.length; i++) {
    if (!spacing) { ctx.fillText(wrapped.lines[i], x, y + i * size * 1.16); continue; }
    let left = x;
    for (const char of [...wrapped.lines[i]]) {
      ctx.fillText(char, left, y + i * size * 1.16);
      left += ctx.measureText(char).width + spacing;
    }
  }
  ctx.restore();
  return { fits, size, height: wrapped.lines.length * size * 1.16 };
}
export async function renderSign(canvas, design, gallery, dpi = 150, environment = {}) {
  const size = SIZES[design.sizeId];
  const selected = gallery.find(item => item.id === design.imageId && item.approved === true);
  const imageLoader=environment.loadImage||loadImage;
  const fontsReady=environment.fontsReady||(()=>Promise.all([
    document.fonts.load('800 55px Mulish'),document.fonts.load('700 20px Mulish'),
    document.fonts.load('400 20px Mulish'),document.fonts.load('italic 400 26px Mulish'),
  ]));
  const [photo, leaf] = await Promise.all([
    selected ? imageLoader(selected.src) : Promise.resolve(null),imageLoader('assets/template-leaf.png'),fontsReady(),
  ]);
  canvas.width = Math.round(size.width * dpi); canvas.height = Math.round(size.height * dpi);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.scale(canvas.width / 850, canvas.height / 500);
  ctx.imageSmoothingQuality = 'high';
  const border = ctx.createLinearGradient(0, 500, 850, 0);
  border.addColorStop(0, GREEN); border.addColorStop(1, NAVY);
  ctx.fillStyle = border; ctx.fillRect(0, 0, 850, 500);
  ctx.fillStyle = WHITE; ctx.fillRect(18, 18, 814, 464);
  const b = PHOTO_BOX;
  let photoDpi = null;
  if (photo) {
    const crop = cropGeometry(photo.naturalWidth, photo.naturalHeight, b.width, b.height, design.crop);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x,b.y,b.width,b.height); ctx.clip();
    ctx.drawImage(photo, b.x+crop.x, b.y+crop.y, crop.width, crop.height); ctx.restore();
    photoDpi = effectiveDpi(photo.naturalWidth,photo.naturalHeight,b.width/100,b.height/100,design.crop.zoom);
  } else {
    ctx.fillStyle = GRAPHITE; ctx.fillRect(b.x,b.y,b.width,b.height);
    textBlock(ctx, 'Choose a gallery image', {x:580,y:210,width:220,height:80,maxSize:22,maxLines:3});
  }
  const warnings = [];
  const org = textBlock(ctx,design.organization,{x:50,y:48,width:455,height:66,maxSize:19,minSize:13,weight:800,spacing:2,maxLines:3});
  const title = textBlock(ctx,design.title,{x:50,y:188,width:456,height:132,maxSize:design.titleSize,minSize:24,weight:800,color:GREEN});
  const subtitleY = 188 + Math.max(64, title.height) + 8;
  const subtitle = textBlock(ctx,design.subtitle,{x:50,y:subtitleY,width:456,height:62,maxSize:25,minSize:14,italic:true});
  const lineY = subtitleY + Math.max(29,subtitle.height) + 14;
  if (design.title.trim() || design.subtitle.trim()) { ctx.fillStyle=GREEN; ctx.fillRect(50,lineY,78,5); }
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
    {field:'subtitle',x:50,y:subtitleY,width:456,height:Math.max(28,subtitle.height)},
    {field:'details',x:50,y:407,width:403,height:58},
    ...(design.room.trim()?[{field:'room',x:559,y:435,width:264,height:39}]:[]),
  ];
  return { warnings, photoDpi, titleSize: title.size, hitRegions };
}
