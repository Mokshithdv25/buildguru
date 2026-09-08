import { getSupabase } from "./supabaseClient";
import { compressDataUrl } from "./mediaCompression";

export const STORAGE_BUCKETS = {
  v0: "project-v0",
  portfolio: "portfolio-media",
};

function extFromMime(mime) {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1];
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return { mime, bytes, ext: extFromMime(mime) };
}

function pathFromStorageUrl(url, bucket) {
  const value = String(url || "");
  for (const visibility of ["public", "sign"]) {
    const marker = `/storage/v1/object/${visibility}/${bucket}/`;
    const index = value.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(value.slice(index + marker.length).split("?")[0]);
    }
  }
  return null;
}

async function accessUrlForObject(sb, bucket, fullPath) {
  if (bucket === STORAGE_BUCKETS.v0 || bucket === STORAGE_BUCKETS.portfolio) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(fullPath, 3600);
    if (error) return null;
    return data?.signedUrl || null;
  }
  const { data } = sb.storage.from(bucket).getPublicUrl(fullPath);
  return data?.publicUrl || null;
}

async function uploadDataUrlObject({ bucket, path, dataUrl }) {
  const sb = getSupabase();
  if (!sb || !dataUrl?.startsWith("data:")) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const fullPath = path.includes(".") ? path : `${path}.${parsed.ext}`;
  const { error } = await sb.storage.from(bucket).upload(fullPath, parsed.bytes, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) {
    console.warn("uploadDataUrl:", error.message);
    return null;
  }
  const url = await accessUrlForObject(sb, bucket, fullPath);
  return url ? { url, path: fullPath } : null;
}

/**
 * Upload a base64 data URL to Supabase Storage; returns an accessible URL or null.
 */
export async function uploadDataUrl({ bucket, path, dataUrl }) {
  const stored = await uploadDataUrlObject({ bucket, path, dataUrl });
  return stored?.url || null;
}

/**
 * Fetch a remote image (e.g. Grok CDN) and re-upload to our bucket for durable storage.
 */
async function uploadRemoteImageObject({ bucket, path, url }) {
  const sb = getSupabase();
  if (!sb || !url || String(url).startsWith("data:")) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = extFromMime(blob.type);
    const fullPath = path.endsWith(`.${ext}`) ? path : `${path}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(fullPath, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: true,
    });
    if (error) {
      console.warn("uploadRemoteImage:", error.message);
      return null;
    }
    const storedUrl = await accessUrlForObject(sb, bucket, fullPath);
    return storedUrl ? { url: storedUrl, path: fullPath } : null;
  } catch (err) {
    console.warn("uploadRemoteImage fetch failed:", err?.message || err);
    return null;
  }
}

export async function uploadRemoteImage({ bucket, path, url }) {
  const stored = await uploadRemoteImageObject({ bucket, path, url });
  return stored?.url || null;
}

async function mirrorImageToStorage({ userId, projectId, img, folder, idx }) {
  if (!img) return img;
  const remote = img?.url;
  if (!remote) return img;
  const existingPath = img.storage_path || pathFromStorageUrl(remote, STORAGE_BUCKETS.v0);
  if (existingPath) {
    const sb = getSupabase();
    const signed = sb ? await accessUrlForObject(sb, STORAGE_BUCKETS.v0, existingPath) : null;
    return {
      ...img,
      url: signed || remote,
      stored_url: signed || remote,
      storage_bucket: STORAGE_BUCKETS.v0,
      storage_path: existingPath,
    };
  }
  const base = `${userId}/${projectId}/${folder}-${idx}`;
  let stored = null;
  if (remote.startsWith("data:")) {
    stored = await uploadDataUrlObject({ bucket: STORAGE_BUCKETS.v0, path: base, dataUrl: remote });
  } else {
    stored = await uploadRemoteImageObject({ bucket: STORAGE_BUCKETS.v0, path: base, url: remote });
  }
  return {
    ...img,
    url: stored?.url || remote,
    source_url: remote.startsWith("data:") ? undefined : remote,
    stored_url: stored?.url || null,
    storage_bucket: stored ? STORAGE_BUCKETS.v0 : undefined,
    storage_path: stored?.path || null,
  };
}

/** Mirror v0 concept images and floor plans to durable storage; returns updated bundle. */
export async function persistV0ImagesToStorage({ userId, projectId, imageBundle }) {
  if (!imageBundle || !userId || !projectId) return imageBundle;
  const images = imageBundle.images?.length
    ? await Promise.all(
        imageBundle.images.map((img, idx) =>
          mirrorImageToStorage({ userId, projectId, img, folder: "concept", idx })
        )
      )
    : imageBundle.images;
  const floorPlansRaw = imageBundle.floor_plans || imageBundle.floorPlans || [];
  const floor_plans = floorPlansRaw.length
    ? await Promise.all(
        floorPlansRaw.map((img, idx) =>
          mirrorImageToStorage({ userId, projectId, img, folder: "floor", idx })
        )
      )
    : floorPlansRaw;
  const allItems = [...(images || []), ...(floor_plans || [])].filter((item) => item?.url);
  const failed = allItems.filter((item) => !item.storage_path);
  if (failed.length) {
    throw new Error(
      `Could not save ${failed.length} generated image${failed.length === 1 ? "" : "s"} to private project storage. Please retry.`,
    );
  }
  return {
    ...imageBundle,
    images,
    floor_plans,
    floorPlans: floor_plans,
    storage_mirrored: allItems.length > 0 && failed.length === 0,
  };
}

async function refreshStoredItem(item) {
  if (!item?.url) return item;
  const path = item.storage_path || pathFromStorageUrl(item.stored_url || item.url, STORAGE_BUCKETS.v0);
  if (!path) return item;
  const sb = getSupabase();
  if (!sb) return item;
  const signed = await accessUrlForObject(sb, STORAGE_BUCKETS.v0, path);
  return signed
    ? { ...item, url: signed, stored_url: signed, storage_bucket: STORAGE_BUCKETS.v0, storage_path: path }
    : item;
}

/** Refresh expiring project-v0 signed URLs whenever a saved pack is loaded. */
export async function refreshV0ImagesFromStorage(imageBundle) {
  if (!imageBundle || typeof imageBundle !== "object") return imageBundle;
  const images = await Promise.all((imageBundle.images || []).map(refreshStoredItem));
  const sourceFloorPlans = imageBundle.floor_plans || imageBundle.floorPlans || [];
  const floorPlans = await Promise.all(sourceFloorPlans.map(refreshStoredItem));
  return {
    ...imageBundle,
    images,
    floor_plans: floorPlans,
    floorPlans,
  };
}

async function refreshPortfolioUrl(url) {
  if (!url || String(url).startsWith("data:")) return url || "";
  const path = pathFromStorageUrl(url, STORAGE_BUCKETS.portfolio);
  if (!path) return url;
  const sb = getSupabase();
  if (!sb) return url;
  return (await accessUrlForObject(sb, STORAGE_BUCKETS.portfolio, path)) || url;
}

/** Refresh private portfolio-media URLs for an owner or a published profile. */
export async function refreshPortfolioMediaUrls(portfolio) {
  if (!portfolio || typeof portfolio !== "object") return portfolio;
  const photos = await Promise.all(
    (Array.isArray(portfolio.photos) ? portfolio.photos : []).map(refreshPortfolioUrl),
  );
  const [cover_photo, profile_photo] = await Promise.all([
    refreshPortfolioUrl(portfolio.cover_photo),
    refreshPortfolioUrl(portfolio.profile_photo),
  ]);
  return { ...portfolio, photos: photos.filter(Boolean), cover_photo, profile_photo };
}

/** Upload portfolio photos/cover/profile to private storage; returns signed URLs for DB. */
export async function uploadPortfolioMediaToStorage({ userId, portfolioId, media }) {
  if (!userId || !portfolioId) return media;
  const base = `${userId}/${portfolioId}`;
  const uploadOne = async (dataUrl, name) => {
    if (!dataUrl?.startsWith("data:")) return dataUrl || "";
    const compressed = await compressDataUrl(dataUrl, { maxDimension: 1800, targetBytes: 350_000 });
    const url = await uploadDataUrl({
      bucket: STORAGE_BUCKETS.portfolio,
      path: `${base}/${name}`,
      dataUrl: compressed,
    });
    if (!url) throw new Error(`Could not upload portfolio media: ${name}`);
    return url;
  };
  const photos = Array.isArray(media?.photos) ? media.photos : [];
  const storedPhotos = await Promise.all(
    photos.map((p, i) => uploadOne(p, `gallery-${i}`))
  );
  return {
    cover_photo: await uploadOne(media?.cover_photo, "cover"),
    profile_photo: await uploadOne(media?.profile_photo, "profile"),
    photos: storedPhotos.filter(Boolean),
  };
}
