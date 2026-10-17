export function downloadBytes(bytes, filename, mime = "application/pdf") {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return url;
}

export function downloadText(text, filename, mime = "text/plain") {
  return downloadBytes(new TextEncoder().encode(text), filename, mime);
}
