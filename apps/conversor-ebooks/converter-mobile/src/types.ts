export type ConvertFormat = 'kfx' | 'azw3' | 'mobi' | 'epub';

export type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface ConvertFile {
  id:            string;
  name:          string;
  uri:           string;
  size?:         number;
  extension:     string;
  status:        FileStatus;
  progress:      number;
  errorMessage?: string;
  outputUri?:    string;
  outputName?:   string;
}

export interface ServerCapabilities {
  calibre:          boolean;
  kfx_plugin:       boolean;
  kindle_previewer: boolean;
  can_make_kfx:     boolean;
}

export interface AppSettings {
  serverUrl:     string;
  defaultFormat: ConvertFormat;
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl:     'http://192.168.1.100:8000',
  defaultFormat: 'kfx',
};

// Todos los tipos MIME aceptados como entrada
export const ACCEPTED_MIME_TYPES = [
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.ebook',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/html',
  'application/rtf',
  'application/x-fictionbook+xml',
  'application/octet-stream', // .lit, .azw, .azw3, .cbz, .cbr, .odt, etc.
  '*/*',
];

export const FORMAT_LABELS: Record<string, string> = {
  '.epub': 'EPUB', '.mobi': 'MOBI', '.azw': 'AZW',
  '.azw3': 'AZW3', '.pdf': 'PDF',  '.doc': 'DOC',
  '.docx': 'DOCX', '.txt': 'TXT',  '.html': 'HTML',
  '.htm': 'HTML',  '.rtf': 'RTF',  '.lit': 'LIT',
  '.odt': 'ODT',   '.fb2': 'FB2',  '.cbz': 'CBZ',
  '.cbr': 'CBR',   '.pdb': 'PDB',  '.djvu': 'DJVU',
};
