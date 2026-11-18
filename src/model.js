export const SIZES = Object.freeze({
  'medium-landscape': { label: 'Medium · 8.5 × 5 in', width: 8.5, height: 5, dpi: 300 },
});

export const DEFAULT_DESIGN = Object.freeze({
  app: 'ornl-door-signs', version: 1, sizeId: 'medium-landscape',
  organization: 'DIRECTORATE / DIVISION', title: 'Your name', subtitle: 'Your title',
  details: 'Group or program', room: '', imageId: 'campus-aerial',
  titleSize: 55, crop: Object.freeze({ x: 50, y: 50, zoom: 1 }),
});
export const clone = (value) => JSON.parse(JSON.stringify(value));
const limits = { organization: 100, title: 100, subtitle: 120, details: 160, room: 30 };
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
  if (!gallery.some(item => item.id === input.imageId && item.approved === true)) {
    throw new Error('This document’s image is missing or no longer approved. Choose a current gallery image.');
  }
  result.imageId = input.imageId;
  for (const [key, value, min, max] of [
    ['titleSize', input.titleSize, 24, 64],
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
    words.every(word => [item.title, item.alt, item.category, ...item.scienceAreas, ...item.tags]
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
export function fileStem(title) {
  return (title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 64) || 'door-sign') + '-8.5x5';
}
