import fs from 'fs';

// Resolve the generation once: headers and bytes must belong to the same immutable ZIP.
export function validatedDownload(storagePath: string) {
  const file = fs.realpathSync(storagePath);
  const metadata = JSON.parse(fs.readFileSync(`${file}.validated.json`, 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(metadata.sha256) || metadata.bytes !== fs.statSync(file).size ||
      !Number.isFinite(Date.parse(metadata.downloadedAt)) || !Number.isFinite(Date.parse(metadata.validatedAt))) {
    throw new Error('Missing or invalid ANM validation receipt');
  }
  return { file, headers: {
    'X-ANM-SHA256': metadata.sha256,
    'X-ANM-Downloaded-At': metadata.downloadedAt,
    'X-ANM-Validated-At': metadata.validatedAt,
    'X-ANM-Bytes': String(metadata.bytes),
    'Cache-Control': 'no-store'
  }};
}
