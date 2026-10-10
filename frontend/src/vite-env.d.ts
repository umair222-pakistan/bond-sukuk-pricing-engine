/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_LEMON_BASIC_URL?: string;
  readonly NEXT_PUBLIC_LEMON_PRO_URL?: string;
  readonly NEXT_PUBLIC_LEMON_ENTERPRISE_URL?: string;
  readonly VITE_LEMON_BASIC_URL?: string;
  readonly VITE_LEMON_PRO_URL?: string;
  readonly VITE_LEMON_ENTERPRISE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
