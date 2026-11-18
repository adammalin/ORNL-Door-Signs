import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'), dist=path.join(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(path.join(dist,'assets/gallery'),{recursive:true});
for(const name of ['index.html','src','assets/fonts','assets/ornl-design-tokens.css','assets/favicon.svg','assets/template-leaf.png','assets/template-logo.png','assets/template-hexagons.png','assets/template-leaf-white.png','assets/template-medium-hexagons.png']) {
  await cp(path.join(root,name),path.join(dist,name),{recursive:true});
}
const gallery=JSON.parse(await readFile(path.join(root,'assets/gallery.json'),'utf8'));
const approved=gallery.filter(item=>item.approved===true);
const ids=new Set();
for(const item of approved) {
  if(ids.has(item.id))throw new Error(`Duplicate gallery id: ${item.id}`);ids.add(item.id);
  if(!item.approvalNote || !item.source)throw new Error(`Missing approval/source record: ${item.id}`);
  for(const file of [item.src,item.thumbnail].filter(Boolean)) {
    if(!/^assets\/gallery\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(file))throw new Error(`Unsafe gallery path: ${file}`);
    if(!(await stat(path.join(root,file))).isFile())throw new Error(`Missing gallery image: ${file}`);
    await cp(path.join(root,file),path.join(dist,file));
  }
}
// Internal approval notes/source filenames are repository documentation, not UI content.
const publicGallery=approved.map(({approvalNote,source,...item})=>item);
await writeFile(path.join(dist,'assets/gallery.json'),JSON.stringify(publicGallery,null,2)+'\n');
await writeFile(path.join(dist,'.nojekyll'),'');
console.log(`Built dist/ with ${approved.length} approved gallery image(s). No runtime dependencies.`);
