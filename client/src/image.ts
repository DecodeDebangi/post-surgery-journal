// Shrinks a phone photo before upload: max 1600px on the long side, JPEG.
// A 4 MB camera photo becomes roughly 200–400 KB, which keeps uploads fast on
// mobile data and stays well inside the free storage and bandwidth limits.

export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" can't be read in this browser. Try a JPEG or PNG.`);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", quality),
  );
}
