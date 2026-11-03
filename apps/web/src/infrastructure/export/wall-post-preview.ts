export async function encodeWallPostPreview(image: Blob) {
  const bitmap = await createImageBitmap(image);
  try {
    const initialScale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = initialScale * 0.82 ** attempt;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("投稿画像を作成できませんでした。");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL("image/webp", 0.82 - attempt * 0.08);
      if (preview.length <= 680_000) return preview;
    }
    throw new Error("投稿画像が大きすぎます。別の壁画像を使ってください。");
  } finally {
    bitmap.close();
  }
}
