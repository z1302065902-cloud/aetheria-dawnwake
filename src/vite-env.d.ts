/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * '1' = 试玩版构建：只解锁前两关（免费引流）。
   * 未设置 = 完整版：十关全解锁（itch 付费下载 / 爱发电 ¥7 完整版）。
   */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
