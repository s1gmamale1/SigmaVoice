export type ModelDownloadGateResult =
  | { ok: true }
  | { ok: false; error: string };

export function shouldStartModelDownload(
  id: string,
  alreadyDownloading: boolean,
): ModelDownloadGateResult {
  return alreadyDownloading
    ? { ok: false, error: `Model is already downloading: ${id}` }
    : { ok: true };
}
