import { queryClient } from './api';

/** Upload via XHR (not fetch) so large files can report progress. */
export function sendDrop(payload: { text: string } | { file: File }, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    if ('text' in payload) form.append('text', payload.text);
    else form.append('file', payload.file, payload.file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/drops');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      void queryClient.invalidateQueries({ queryKey: ['drops'] });
      xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
