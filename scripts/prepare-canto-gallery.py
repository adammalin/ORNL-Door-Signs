#!/usr/bin/env python3
"""Prepare locally reviewed Canto downloads; never approves or publishes them."""
import argparse
import html
import io
import json
import math
import re
import zipfile
from collections import Counter
from pathlib import Path
from PIL import Image, ImageCms, ImageOps

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--selections',type=Path,required=True)
parser.add_argument('--metadata',type=Path,required=True)
parser.add_argument('--archive',type=Path,action='append',default=[])
parser.add_argument('--download-directory',type=Path)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
selected=json.loads(args.selections.read_text(encoding='utf-8'))
metadata=json.loads(args.metadata.read_text(encoding='utf-8'))
args.output.mkdir(parents=True,exist_ok=True)
art=args.output/'images';art.mkdir(exist_ok=True)
archives=[zipfile.ZipFile(p) for p in args.archive]
srgb=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))
science={
 'Artificial Intelligence':['Artificial intelligence'], 'Biology & Environment':['Biology','Environmental science'],
 'Energy Science':['Energy science'],'Fission':['Nuclear fission'],'Fusion':['Fusion energy'],
 'Isotopes':['Isotope science'],'National Security':['National security'],'Neutron Science':['Neutron science'],
 'Physical Sciences':['Physical sciences'],'Quantum':['Quantum science'],'Supercomputing':['Computing'],
 'Education Outreach':['Education and outreach'],'Community Engagement':['Education and outreach'],
}

def source_bytes(name):
    if Path(name).name!=name:raise ValueError('Selection filenames must be basenames.')
    matches=[]
    for archive in archives:
        matches.extend((archive,entry) for entry in archive.infolist() if Path(entry.filename).name==name and not entry.is_dir())
    if len(matches)>1:raise ValueError('Ambiguous filename appears more than once in the supplied archives.')
    if matches:
        archive,entry=matches[0]
        if entry.file_size>150*1024*1024:raise ValueError('Source image exceeds the preparation size limit.')
        return archive.read(entry)
    if args.download_directory:
        root=args.download_directory.resolve();candidate=(root/name).resolve()
        if candidate.parent!=root:raise ValueError('Source path escapes the download directory.')
        if candidate.is_file():return candidate.read_bytes()
    raise FileNotFoundError(name)

prepared=[];failures=[]
for choice in selected:
    try:
        asset=choice['id']
        if not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',asset):raise ValueError('Invalid Canto asset ID.')
        meta=metadata[asset]
        if meta['filename']!=choice['name']:raise ValueError('Canto metadata does not match the source filename.')
        with Image.open(io.BytesIO(source_bytes(choice.get('downloadName',choice['name'])))) as original:
            original.load();image=ImageOps.exif_transpose(original)
            original_size=image.size
            profile=original.info.get('icc_profile')
            if profile:image=ImageCms.profileToProfile(image,ImageCms.ImageCmsProfile(io.BytesIO(profile)),srgb,outputMode='RGB')
            else:image=image.convert('RGB')
            width,height=image.size
            scale=min(1,3200/height)
            if width*scale>5000 and height*5000/width>=1800:scale=min(scale,5000/width)
            if scale<1:image=image.resize((round(width*scale),round(height*scale)),Image.Resampling.LANCZOS)
            filename=f'canto-{asset}.jpg';thumb=f'canto-{asset}-thumb.jpg'
            image.save(art/filename,quality=94,subsampling=0,icc_profile=srgb.tobytes(),dpi=(300,300))
            thumbnail=image.copy();thumbnail.thumbnail((480,480),Image.Resampling.LANCZOS)
            thumbnail.save(art/thumb,quality=88,icc_profile=srgb.tobytes())
            dpi=math.floor(min(image.width/2.82,image.height/4.64))
        description=meta.get('description','').strip()
        description=re.split(r'(?:^|\n)(?:Alt Text|Tags|Custom Fields)(?:\n|$)',description)[0].strip()
        source_alt=re.split(r'(?:^|\n)(?:Alt Text|Tags|Custom Fields|Related Files|In These Albums)(?:\n|$)',meta.get('altText','').strip())[0].strip()
        alt=choice.get('alt','').strip() or source_alt or description
        if not alt:alt=f"{choice['category']} photograph {choice['name']} from the ORNL Photo Library."
        title=choice.get('title') or re.split(r'(?<=[.!?])\s+',description)[0]
        if not title or len(title)>72:title=f"{choice['category']} · {choice['name']}"
        if len(alt)>320:alt=alt[:317].rsplit(' ',1)[0]+'…'
        crop=choice.get('defaultCrop',{'x':50,'y':50,'zoom':1})
        if any(not isinstance(crop.get(k),(float,int)) or not math.isfinite(crop[k]) or not lo<=crop[k]<=hi for k,lo,hi in [('x',0,100),('y',0,100),('zoom',1,3)]):raise ValueError('Invalid recommended crop.')
        record={
            'id':f'canto-{asset}','title':title,'src':f'assets/gallery/{filename}','thumbnail':f'assets/gallery/{thumb}',
            'alt':alt,'description':description,'category':choice['category'],'scienceAreas':choice.get('scienceAreas',science.get(choice['category'],['General'])),
            'tags':list(dict.fromkeys([*meta.get('tags',[]),choice['category'],choice['album'],choice['name'],asset])),
            'approved':False,'approvalNote':'Pending owner review for the public Door Sign Studio gallery.',
            'source':f"ORNL Canto asset {asset}; original filename {choice['name']}; album {choice['album']}",
            'sourceUrl':meta.get('sourceUrl',''),'photographer':meta.get('photographer',''),
            'sourceRightsDisplay':meta.get('rights',''),'sourceCategory':choice['category'],'sourceAlbum':choice['album'],
            'discoveredBy':choice.get('discoveredBy','Category album browsing'),'sourceAssetId':asset,'originalFilename':choice['name'],'originalPixels':list(original_size),'pixels':[image.width,image.height],
            'effectiveDpiAtDefaultCrop':math.floor(dpi/crop['zoom']),'defaultCrop':crop,
            'needsReview':(['Photo is below 300 effective dpi.'] if dpi/crop['zoom']<300 else [])+([] if description or meta.get('altText') else ['No Canto description or alt text was supplied; review the image caption.']),
        }
        prepared.append(record)
    except Exception as error:failures.append({'assetId':choice.get('id'),'filename':choice.get('name'),'error':str(error)})

for archive in archives:archive.close()
(args.output/'candidate-gallery.json').write_text(json.dumps(prepared,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
counts=Counter(item['category'] for item in prepared)
report={'selected':len(selected),'prepared':len(prepared),'categories':dict(counts),'below300Dpi':[i['id'] for i in prepared if i['effectiveDpiAtDefaultCrop']<300],'failures':failures}
(args.output/'preparation-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
sections=[]
for category in dict.fromkeys(item['category'] for item in selected):
    cards=[]
    for item in [i for i in prepared if i['category']==category]:
        name=Path(item['thumbnail']).name;full=Path(item['src']).name;crop=item['defaultCrop']
        tags=' · '.join(item['tags'][:12])
        cards.append(f'''<article><div class="pictures"><a href="images/{html.escape(full)}" target="_blank" rel="noopener"><img src="images/{html.escape(name)}" alt="{html.escape(item['alt'])}"></a><img class="crop" style="object-position:{crop['x']}% {crop['y']}%" src="images/{html.escape(name)}" alt="Default tall crop"></div><h3>{html.escape(item['title'])}</h3><p>{html.escape(item['originalFilename'])} · {item['effectiveDpiAtDefaultCrop']} dpi</p><p>{html.escape(item['description'])}</p><p class="tags">{html.escape(tags)}</p><p class="credit">{html.escape(item['discoveredBy'])}</p><p class="credit">Photo: {html.escape(item['photographer'] or 'See Canto record')}</p><code>{html.escape(item['id'])}</code>{''.join('<p class="warning">'+html.escape(w)+'</p>' for w in item['needsReview'])}</article>''')
    sections.append(f'<section><h2>{html.escape(category)} ({len(cards)})</h2><div class="grid">'+''.join(cards)+'</div></section>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Door Sign Gallery Review</title><style>body{font:16px Arial,sans-serif;margin:32px;background:#fff;color:#373a36}h1,h2{color:#00454d}h1{border-bottom:5px solid #00662c;padding-bottom:20px}section{margin:45px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}article{background:white;border:1px solid #dbdcdb;padding:16px;overflow-wrap:anywhere}.pictures{display:flex;gap:12px;height:230px}.pictures a{display:flex;width:65%}.pictures img{width:100%;object-fit:contain}.pictures .crop{width:30%;object-fit:cover}h3{font-size:17px}p{font-size:14px;line-height:1.5}.tags,.credit{font-size:12px}code{font-size:11px}.warning{color:#373a36;border-left:4px solid #ff9e1b;padding-left:8px;font-weight:bold}@media print{section{break-before:page}.grid{grid-template-columns:repeat(5,1fr)}body{margin:0}.pictures{height:170px}}</style><h1>Door Sign Studio · Candidate Gallery</h1><p>Selected Canto images for owner review. The left view shows the full photograph; the narrow view approximates the sign’s default crop. These candidates are not approved or published by this preparation step. Category counts reflect the selected files in this preparation run. Partnerships and User Facilities were empty or inaccessible; their candidates were found by matching global keyword searches. Some source albums contain imagery from other science areas; science-area metadata follows the actual subject. Select a full photograph to inspect it in another tab.</p>'''+''.join(sections)+'</html>'
(args.output/'review.html').write_text(page,encoding='utf-8')
print(json.dumps(report,indent=2))
