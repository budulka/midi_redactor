// Downloads the Salamander Grand Piano mp3 samples used for playback into public/samples/salamander.
// Source: the Tone.js audio repository, pinned to a commit so the files never change silently.
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '869b6f8d9cddb47d966238c012041480b1ce517a';
const BASE_URL = `https://raw.githubusercontent.com/Tonejs/audio/${COMMIT}/salamander/`;
const EXPECTED_COUNT = 30;
const EXPECTED_TOTAL_BYTES = 2012677;

const targetDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'samples',
  'salamander',
);

function sampleNames() {
  const names = [];
  for (let octave = 0; octave <= 7; octave += 1) {
    if (octave > 0) names.push(`C${octave}`, `Ds${octave}`, `Fs${octave}`);
    names.push(`A${octave}`);
  }
  names.push('C8');
  return names.map((name) => `${name}.mp3`);
}

async function download(fileName) {
  const response = await fetch(`${BASE_URL}${fileName}`);
  if (!response.ok) {
    throw new Error(`${fileName}: HTTP ${response.status}`);
  }
  const data = new Uint8Array(await response.arrayBuffer());
  await writeFile(join(targetDir, fileName), data);
  return data.byteLength;
}

async function main() {
  await mkdir(targetDir, { recursive: true });
  const files = sampleNames();
  let total = 0;
  for (const fileName of files) {
    total += await download(fileName);
  }
  let written = 0;
  for (const fileName of files) {
    written += (await stat(join(targetDir, fileName))).size;
  }
  process.stdout.write(`Downloaded ${files.length} files, ${written} bytes to ${targetDir}\n`);
  if (files.length !== EXPECTED_COUNT || total !== EXPECTED_TOTAL_BYTES || written !== total) {
    process.stderr.write(
      `Expected ${EXPECTED_COUNT} files and ${EXPECTED_TOTAL_BYTES} bytes, got ${files.length} files and ${written} bytes\n`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
