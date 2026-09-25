// Resizes/compresses an image file in the browser before upload. Phone
// cameras routinely produce 3-10MB photos at 3000-4000px — sent raw, that's
// a slow upload on mobile data and can trip size limits server-side. This
// downsizes to a reasonable max dimension and re-encodes as JPEG, which
// typically shrinks a phone photo to a few hundred KB with no visible
// quality loss for an AI vision check.

export function resizeImageForUpload(file, { maxDimension = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

// Reads a File/Blob as a base64 string (no data: URL prefix), resizing it
// first when possible. Falls back to the original file if resizing fails
// for any reason (unsupported format, canvas error, etc.) so a photo that
// can't be resized still gets sent rather than blocking the whole upload.
export async function fileToResizedBase64(file, options) {
  let blob = file;
  try {
    blob = await resizeImageForUpload(file, options);
  } catch (e) {
    // Fall back to the original file.
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
