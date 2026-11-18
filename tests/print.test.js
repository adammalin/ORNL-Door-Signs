import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pngWithDpi, crc32, makePdf } from '../src/print.js';

test('PNG gets one valid 300 dpi physical-resolution chunk',async()=>{
  // Valid one-pixel PNG; canvas dimensions are checked separately in browser QA.
  const original=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII=','base64'));
  const once=new Uint8Array(await pngWithDpi(original).arrayBuffer());
  const twice=new Uint8Array(await pngWithDpi(once).arrayBuffer());
  assert.deepEqual(once,twice);
  const v=new DataView(once.buffer);
  assert.equal(v.getUint32(41),11811); assert.equal(v.getUint32(45),11811);assert.equal(once[49],1);
  assert.equal(v.getUint32(50),crc32(once.subarray(37,50)));
  assert.deepEqual(once.subarray(54),original.subarray(33));
  assert.throws(()=>pngWithDpi(new Uint8Array(12)));
});
test('PDF has precise physical size, no print scaling, correct binary lengths and xref offsets',async()=>{
  const stream=new Uint8Array(deflateSync(new Uint8Array([0,102,44])));
  const pdf=new Uint8Array(await makePdf(stream,1,1,8.5,5).arrayBuffer());
  const text=new TextDecoder('latin1').decode(pdf);
  assert.match(text,/\/MediaBox \[0 0 612 360\]/);
  assert.match(text,/\/PrintScaling \/None/);
  assert.match(text,/\/ColorSpace \/DeviceRGB/);
  const start=Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(start,start+4),'xref');
  const entries=text.slice(start).split('\n').slice(3,8);
  entries.forEach((entry,i)=>assert.equal(text.slice(Number(entry.slice(0,10)),Number(entry.slice(0,10))+7),`${i+1} 0 obj`));
  const imageStart=text.indexOf('stream\n',text.indexOf('4 0 obj'))+7;
  assert.deepEqual(pdf.subarray(imageStart,imageStart+stream.length),stream);
  assert.equal(text.slice(imageStart+stream.length,imageStart+stream.length+10),'\nendstream');
});
