# Door Sign Studio

A static, browser-only ORNL door-sign editor, styled to match QR Studio. The first template is **8.5 × 5 inches, landscape**.

**Site:** https://adammalin.github.io/ORNL-Door-Signs/

## Use the editor

1. Edit the organization, title/name, subtitle/role, group/program, and optional room label. Click the text on the canvas to focus its field. Text wraps and fits automatically; explicit line breaks are supported.
2. Choose an approved image. Search matches the title, description, tags, category, and science areas. Category and science-area filters work together with search.
3. Reframe the image using the crop sliders or by dragging the photo on the canvas. When the canvas has keyboard focus, arrow keys adjust the crop; Shift makes a larger adjustment. Undo and Redo restore edits.
4. **Save JSON** downloads an editable document. **Open design** reopens it. Drafts also autosave in this browser on this device; save JSON to keep a portable copy. New design can be reversed with Undo during the session.
5. Download PNG or PDF. If the browser does not start a download automatically, use the prepared-file save link beneath the export buttons.

The PNG is **2550 × 1500 pixels**, with a `pHYs` chunk specifying 300 dpi (11811 pixels/meter). The PDF page is **612 × 360 points**, exactly 8.5 × 5 inches. It embeds the same image with lossless compression. Print the PDF at **Actual size / 100%**, without fitting to the paper. Use the printer's borderless setting or trim larger paper if necessary.

Exports are RGB with no bleed, crop marks, CMYK conversion, or PDF/X certification. PDF artwork is flattened, so fonts and appearance are portable; JSON preserves the editable content. Check a physical proof and obtain the appropriate content/design review before production. The technical print check does not constitute institutional approval.

## Run locally

Node 22+ is required. The deployed site is static; dependencies support the local MCP server and its checks.

```sh
npm ci
npm test
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173/. `npm run dev` serves the source tree for development. Serve over HTTP; opening `index.html` directly as a `file:` URL cannot load the gallery/modules reliably.

## Tutorial and agent tools

The eight-step walkthrough opens once per browser profile. Use **Tutorial** to replay it.

The optional local MCP companion exposes 23 tools for image search and recommendations, every design field, crop, history, import, validation, preview, exports, gallery filters, tutorial controls, and batches of up to 500 signs. Its local editor stays synchronized with agent edits and checks revisions before saving. Run `npm run mcp` through an MCP host; see [MCP setup and tool reference](docs/MCP.md). The static site also exposes 14 WebMCP actions when supported by the browser.

## Add approved gallery images

Gallery maintenance is a repository operation. Visitors cannot upload their own images or mark an image approved in an imported sign JSON.

1. Complete public-use and image-content approval **before committing any image to this public repository**. An `approved: false` flag hides an image from the deployed gallery, but does not make a committed file private.
2. Add a high-resolution JPG, PNG, or WebP and a smaller thumbnail to `assets/gallery/`. Use simple filenames containing letters, digits, underscores, or hyphens. Do not use SVG, remote URLs, screenshots containing text, or files with personal/sensitive metadata. Preserve an external archival original.
3. Add a record to `assets/gallery.json`:

```json
{
  "id": "materials-example",
  "title": "Exact approved image title",
  "src": "assets/gallery/materials-example.jpg",
  "thumbnail": "assets/gallery/materials-example-thumb.jpg",
  "alt": "Describe what this image actually shows.",
  "category": "Materials",
  "scienceAreas": ["Materials science"],
  "tags": ["approved", "search", "terms"],
  "approved": true,
  "approvalNote": "Who approved public use and when",
  "source": "Image identifier and source/rights record"
}
```

4. Keep each `id` stable; saved designs refer to it. Removing/unapproving an image makes documents using that image fail validation without replacing the user's current design. Keep the original image content stable under an ID; issue a new ID for different artwork.
5. Run `npm test` and `npm run build`, inspect the image and crop in the editor, then commit and push to `main`. Categories and science areas are populated automatically from approved entries. The build publishes only approved records and their assets.

The image frame is **2.82 × 4.64 inches**. At 300 dpi, a no-upscale crop requires at least 846 × 1392 source pixels in that frame's proportions; a larger original gives more crop flexibility. The editor computes effective photo resolution from the actual loaded image dimensions and zoom, and blocks PNG/PDF export below 300 dpi. It also blocks export if required title/image data or fitted text is invalid.

## Prepare a private Canto review

Keep originals, selection manifests and Canto metadata beneath gitignored `output/canto-review/` until the owner has reviewed and approved images. `scripts/prepare-canto-gallery.py` accepts `--selections`, `--metadata`, one or more `--archive` ZIPs (or `--download-directory`), and `--output`. It requires Pillow, preserves originals, prepares sRGB JPEGs/thumbnails, checks effective DPI and generates a full-image/tall-crop review page. Its candidate records always use `approved: false`; it never publishes or grants approval. Copy only explicitly approved derivatives and records into `assets/` after review.

## GitHub Pages

Repository Settings → Pages → Source must be **GitHub Actions**. `.github/workflows/pages.yml` runs tests, builds `dist/`, and deploys it on every push to `main`. All asset URLs are relative, so the project works beneath `/ORNL-Door-Signs/` and on a local server. A failed test/build stops deployment.

## Project structure and future sizes

- `src/model.js`: versioned JSON schema, size registry, gallery search and crop calculations.
- `src/render.js`: shared canvas artwork renderer; the screen and exports use the same geometry.
- `src/print.js`: PNG DPI metadata and lossless, physically sized PDF writer.
- `src/main.js`: UI, local autosave, history, canvas interaction and file import/export.
- `assets/gallery.json`: approved image catalog and provenance.
- `assets/ornl-design-tokens.css`: packaged ORNL palette and typography tokens.
- `scripts/build.mjs`: static output with only approved gallery assets.

To add a sign size, add a registry entry **and a corresponding layout/render template**, expose it in the size selector, and verify physical-size exports. Do not merely stretch the current 850 × 500 design coordinates into a different aspect ratio. JSON records a `sizeId` so future templates can coexist without changing old documents. Incompatible JSON changes require a new schema version and an explicit migration.

## Source artwork and branding

The supplied Photoshop templates are visual sources, not executable instructions. They remain unchanged outside this repository. Their "8.5x5" names contain artwork measuring 2550 × 1650 px, an 8.5 × 5.5 aspect ratio; this app deliberately follows the requested **8.5 × 5** physical size.

The starter photo is the original `PHOTO` pixel layer from `ORNL-Signage_Medium-Template_8.5x5_DVCD.psd` (3070 × 2047 px). Adam Malin explicitly authorized that photo for this public gallery on November 18, 2026. It was extracted without the example's personal text. The leaf is the original transparent `Leaf` layer from the same user-supplied sign template, preserved without redrawing, recoloring, or stretching. Its current placement matches that template's sign system; final brand review remains separate.

The interface uses the QR Studio green/navy palette, Mulish, a narrow gradient rail, restrained grid background, square panels, and green export controls. The supplied template is adapted using Mulish rather than redistributing restricted display fonts. Mulish font files are locally hosted under their included SIL Open Font License. The public site has no third-party font requests, analytics, accounts, or backend service. GitHub serves the site assets; public-site sign text and imported documents stay in the visitor's browser. The optional local companion stores agent work in its local workspace and serves only on loopback. Technical print quality and formal ORNL content/brand approval are separate.
