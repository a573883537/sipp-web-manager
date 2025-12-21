/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_PORT: string;
  readonly VITE_DEFAULT_REMOTE_HOST: string;
  readonly VITE_DEFAULT_REMOTE_PORT: string;
  readonly VITE_DEFAULT_LOCAL_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
