import * as FileSystem from 'expo-file-system';
import { ConvertFormat, ServerCapabilities } from './types';

export interface HealthResponse {
  status:           string;
  calibre:          boolean;
  kfx_plugin:       boolean;
  kindle_previewer: boolean;
  can_make_kfx:     boolean;
  supported_input:  string[];
  supported_output: string[];
}

export async function checkHealth(serverUrl: string): Promise<HealthResponse> {
  const url = serverUrl.replace(/\/$/, '');
  const res = await fetch(`${url}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export async function convertFile(
  serverUrl:  string,
  fileUri:    string,
  fileName:   string,
  format:     ConvertFormat,
  onProgress: (pct: number) => void,
): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');

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
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 0.5);
    };

    xhr.onload = async () => {
      if (xhr.status !== 200) {
        const reader = new FileReader();
        reader.onload = () => {
          let msg = reader.result as string;
          try { msg = JSON.parse(msg).detail ?? msg; } catch {}
          reject(new Error(msg.slice(0, 200)));
        };
        reader.readAsText(xhr.response);
        return;
      }

      onProgress(0.75);

      // Detectar si el servidor usó fallback AZW3 en lugar de KFX
      const fallbackFmt = xhr.getResponseHeader('X-Fallback-Format');
      const actualFormat = fallbackFmt ?? format;

      const blob: Blob  = xhr.response;
      const stem        = fileName.replace(/\.[^.]+$/, '');
      const outName     = `${stem}.${actualFormat}`;
      const outPath     = `${FileSystem.cacheDirectory}${outName}`;

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

    xhr.onerror   = () => reject(new Error('Error de red. Verifica la URL del servidor.'));
    xhr.ontimeout = () => reject(new Error('Tiempo de espera agotado.'));
    xhr.timeout   = 300_000;

    xhr.send(formData);
  });
}
