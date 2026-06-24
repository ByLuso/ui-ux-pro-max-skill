export type ConvertFormat = 'mobi' | 'azw3' | 'epub';

export type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface ConvertFile {
  id:           string;
  name:         string;
  uri:          string;
  size?:        number;
  extension:    string;
  status:       FileStatus;
  progress:     number;
  errorMessage?: string;
  outputUri?:   string;
  outputName?:  string;
}

export interface AppSettings {
  serverUrl:     string;
  defaultFormat: ConvertFormat;
}

export const DEFAULT_SETTINGS: AppSettings = {
  serverUrl:     'http://192.168.1.100:8000',
  defaultFormat: 'mobi',
};
