import axios, { AxiosProgressEvent } from 'axios';
import * as FileSystem from 'expo-file-system';
import { ConvertFormat } from './types';

export interface HealthResponse {
  status:       string;
  calibre:      boolean;
  calibre_path: string | null;
}

export async function checkHealth(serverUrl: string): Promise<HealthResponse> {
  const url = serverUrl.replace(/\/$/, '');
  const res = await axios.get<HealthResponse>(`${url}/health`, { timeout: 5000 });
  return res.data;
}

export async function convertFile(
  serverUrl:  string,
  fileUri:    string,
  fileName:   string,
  format:     ConvertFormat,
  onProgress: (pct: number) => void,
): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');

  // Build multipart form using fetch + XMLHttpRequest for upload progress
  const formData = new FormData();
  formData.append('file', {
    uri:  fileUri,
    name: fileName,
    type: 'application/octet-stream',
  } as unknown as Blob);
  formData.append('format', format);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/convert`);
    xhr.responseType = 'blob';

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total * 0.5);
    };

    xhr.onload = async () => {
      if (xhr.status !== 200) {
        const errText = await new Promise<string>((res) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.readAsText(xhr.response);
        });
        let detail = errText;
        try { detail = JSON.parse(errText).detail ?? errText; } catch {}
        reject(new Error(detail));
        return;
      }

      onProgress(0.75);

      // Save blob to device
      const blob: Blob = xhr.response;
      const stem    = fileName.replace(/\.[^.]+$/, '');
      const outName = `${stem}.${format}`;
      const outPath = `${FileSystem.cacheDirectory}${outName}`;

      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(',')[1];
        await FileSystem.writeAsStringAsync(outPath, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        onProgress(1);
        resolve(outPath);
      };
      reader.onerror = () => reject(new Error('Error al guardar el archivo'));
      reader.readAsDataURL(blob);
    };

    xhr.onerror = () => reject(new Error('Error de red. Verifica la URL del servidor.'));
    xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado.'));
    xhr.timeout = 300_000;

    xhr.send(formData);
  });
}
