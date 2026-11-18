// PNG pHYs stores pixels per meter. Browsers otherwise export a fixed 96 dpi.
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngWithDpi(bytes, dpi = 300) {
  if (bytes.length < 33 || ![137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) {
    throw new Error('Invalid PNG data.');
  }
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set([112,72,89,115], 4);
  const ppm = Math.round(dpi / 0.0254);
  view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [bytes.subarray(0, 33), chunk];
  const sourceView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 33; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG data.');
    const length = sourceView.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG chunk.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return new Blob(parts, { type: 'image/png' });
}

// One losslessly compressed RGB image on a physically sized PDF page.
// All fonts are rendered into the image: exports stay identical on other computers.
export function makePdf(rgbDeflate, widthPx, heightPx, widthInches, heightInches) {
  const encoder = new TextEncoder(), chunks = [], offsets = [0];
  let length = 0;
  const add = value => { const b = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(b); length += b.length; };
  const object = (id, body) => { offsets[id] = length; add(`${id} 0 obj\n${body}\nendobj\n`); };
  const w = widthInches * 72, h = heightInches * 72;
  add('%PDF-1.4\n%DoorSignStudio\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /TrimBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${rgbDeflate.length} >>\nstream\n`);
  add(rgbDeflate); add('\nendstream\nendobj\n');
  const content = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  const xref = length;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
export async function canvasPdf(canvas, size) {
  const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let s = 0, d = 0; s < rgba.length; s += 4) {
    rgb[d++] = rgba[s]; rgb[d++] = rgba[s+1]; rgb[d++] = rgba[s+2];
  }
  const compressed = new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
  return makePdf(new Uint8Array(await new Response(compressed).arrayBuffer()),
    canvas.width, canvas.height, size.width, size.height);
}
