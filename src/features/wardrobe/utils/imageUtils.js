export function compressImage(file, maxWidth = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => {
          if (b) resolve(b);
          else canvas.toBlob(b2 => resolve(b2), 'image/jpeg', quality);
        }, 'image/webp', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function formatSize(b) {
  return b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(0) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
}
