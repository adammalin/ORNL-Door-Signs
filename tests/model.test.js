import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DESIGN, SIZES, clone, validateDesign, patchDesign, filterGallery, cropGeometry, effectiveDpi, fileStem } from '../src/model.js';
import { readFileSync } from 'node:fs';
const gallery=JSON.parse(readFileSync(new URL('../assets/gallery.json',import.meta.url),'utf8'));

test('saved design round-trips every editable setting',()=>{
  const expected={...clone(DEFAULT_DESIGN),title:'Two-line\nname',subtitle:'Research & development',details:'Program\nGroup',room:'ROOM 212',crop:{x:17.25,y:90,zoom:1.3},titleSize:42};
  assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(expected)),gallery),expected);
});
test('documents reject unsupported schema, unknown sizes, invalid crops, and unapproved images',()=>{
  for(const patch of [{version:2},{sizeId:'__proto__'},{sizeId:'large'},{imageId:'unknown'},{crop:{x:101,y:50,zoom:1}},{crop:{x:50,y:50,zoom:NaN}},{title:'x'.repeat(101)},{titleSize:Infinity}]) {
    assert.throws(()=>validateDesign({...clone(DEFAULT_DESIGN),...patch},gallery));
  }
  assert.throws(()=>validateDesign(clone(DEFAULT_DESIGN),gallery.map(i=>({...i,approved:false}))));
  // Imported arbitrary URLs and HTML never become DOM or image sources.
  const extra={...clone(DEFAULT_DESIGN),src:'https://example.invalid/tracker',injected:'<script>bad</script>'};
  assert.equal('src' in validateDesign(extra,gallery),false);
});
test('control patches reject invalid objects and unknown nested crop settings',()=>{
  for(const patch of [[],null,{crop:'text'},{crop:[]},{crop:{imageUrl:'https://example.invalid'}},{src:'https://example.invalid'}])assert.throws(()=>patchDesign(clone(DEFAULT_DESIGN),patch,gallery));
  assert.deepEqual(patchDesign(clone(DEFAULT_DESIGN),{crop:{x:12}},gallery).crop,{x:12,y:50,zoom:1});
});
test('gallery search combines terms, category and science area and excludes pending images',()=>{
  const samples=[...gallery,{...gallery[0],id:'not-approved',title:'Secret',approved:false}];
  assert.equal(filterGallery(samples,'oAK aerial','Campus','General').length,1);
  assert.equal(filterGallery(samples,'campus','Materials','General').length,0);
  assert.equal(filterGallery(samples,'no matching science').length,0);
  assert.equal(filterGallery(samples,'Secret').length,0);
  assert.equal(filterGallery(samples).length,gallery.length);
});
test('every pan and zoom covers the complete image frame',()=>{
  for(const [w,h] of [[3070,2047],[600,1800],[1000,1000]]) {
    for(const x of [0,50,100])for(const y of [0,50,100])for(const zoom of [1,1.5,3]) {
      const g=cropGeometry(w,h,282,464,{x,y,zoom});
      assert.ok(g.x<=0 && g.y<=0);
      assert.ok(g.x+g.width>=282-1e-9 && g.y+g.height>=464-1e-9);
    }
  }
});
test('physical canvas and crop resolution use actual source pixels',()=>{
  const s=SIZES['medium-landscape'];
  assert.equal(s.width*s.dpi,2550);assert.equal(s.height*s.dpi,1500);
  assert.equal(effectiveDpi(3070,2047,2.82,4.64,1),441);
  assert.equal(effectiveDpi(3070,2047,2.82,4.64,2),220);
  assert.equal(fileStem('../../<bad> /'), 'bad-8.5x5');
});
