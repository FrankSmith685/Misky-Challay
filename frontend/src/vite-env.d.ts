/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PREVIEW_MODE: string;
  readonly VITE_API_PROXY_TARGET: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_PUBLIC_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
