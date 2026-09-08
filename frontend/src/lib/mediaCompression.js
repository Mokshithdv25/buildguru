const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";

async function compressPdf(file, {
  targetBytes = 1_200_000,
  maxPages = 80,
  jpegQuality = 0.44,
  maxPixels = 500_000,
} = {}) {
  if (file.size <= targetBytes) return file;
  try {
    const [{ PDFDocument }, pdfjsLib] = await Promise.all([
      import("pdf-lib"),
      import("pdfjs-dist/legacy/build/pdf.mjs"),
    ]);
    const source = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: source, disableWorker: true }).promise;
    if (!pdf.numPages || pdf.numPages > maxPages) return file;
    const output = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.5, Math.sqrt(maxPixels / Math.max(1, baseViewport.width * baseViewport.height)));
      const viewport = page.getViewport({ scale: Math.max(0.62, scale) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
      const image = await output.embedJpg(dataUrl);
      const outPage = output.addPage([baseViewport.width, baseViewport.height]);
      outPage.drawImage(image, { x: 0, y: 0, width: baseViewport.width, height: baseViewport.height });
    }
    const bytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
    if (!bytes?.length || bytes.length >= file.size) return file;
    return new File([bytes], file.name || "document.pdf", { type: PDF_TYPE, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function extensionFor(type) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be read.")); };
    image.src = url;
  });
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

/**
 * Adaptive raster optimization. It tries high quality first, then only steps down
 * as far as needed. PDFs are rebuilt at a moderate readable resolution.
 */
export async function compressImage(file, {
  maxDimension = 1800,
  targetBytes = 350_000,
  preserveDetail = false,
} = {}) {
  if (!file || !IMAGE_TYPES.has(file.type)) return file;
  const image = await loadImage(file);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = preserveDetail ? 0.82 : 0.72;
  const floor = preserveDetail ? 0.60 : 0.42;
  let blob = await canvasBlob(canvas, quality);
  while (blob && blob.size > targetBytes && quality > floor) {
    quality -= preserveDetail ? 0.04 : 0.06;
    blob = await canvasBlob(canvas, quality);
  }
  // A small saving is not worth changing a source that may be a drawing or plan.
  if (!blob || blob.size >= file.size * 0.92) return file;
  return new File([blob], `${String(file.name || "image").replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp", lastModified: file.lastModified });
}

export async function compressFile(file, options = {}) {
  if (!file) return file;
  if (file.type === PDF_TYPE) return compressPdf(file, options);
  return compressImage(file, options);
}

export async function compressDataUrl(dataUrl, options = {}) {
  if (!String(dataUrl || "").startsWith("data:image/")) return dataUrl || "";
  const [header, encoded] = String(dataUrl).split(",");
  const mime = header.match(/^data:(image\/(?:jpeg|png|webp));base64$/i)?.[1];
  if (!mime || !encoded) return dataUrl;
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const compressed = await compressImage(new File([bytes], `upload.${extensionFor(mime)}`, { type: mime }), options);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(compressed);
  });
}
