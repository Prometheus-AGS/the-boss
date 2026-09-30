import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ObjectValue, UarAuthoringPackage, UarCompiledPackage, UarMigrationReceipt } from '../types.mjs';
import { object, relativeFile, text } from '../validation.mjs';
import { selfDigest, sha256 } from './canonical.mjs';
import { compileUarPackage } from './compiler.mjs';

function writeExclusive(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, content); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
}

export function writeUarPackage(directoryValue: unknown, value: unknown, receipt?: UarMigrationReceipt): { directory: string; manifest: ObjectValue; files: string[] } {
  const compiled = compileUarPackage(value, receipt);
  const directory = path.resolve(text(directoryValue, 'out'));
  if (fs.existsSync(directory)) throw new Error(`Immutable package destination already exists: ${directory}`);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  const temporary = path.join(path.dirname(directory), `.${path.basename(directory)}.${randomUUID()}.tmp`);
  fs.mkdirSync(temporary);
  try {
    for (const file of compiled.files) writeExclusive(path.join(temporary, ...file.path.split('/')), file.contentUtf8);
    writeExclusive(path.join(temporary, 'manifest.json'), compiled.manifestUtf8);
    fs.renameSync(temporary, directory);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  return { directory, manifest: compiled.manifest, files: ['manifest.json', ...compiled.files.map(file => file.path)] };
}

export function loadUarPackage(directoryValue: unknown): UarCompiledPackage {
  const directory = path.resolve(text(directoryValue, 'packageDirectory'));
  const manifestUtf8 = fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8');
  const manifest = object(JSON.parse(manifestUtf8), 'manifest');
  if (!Array.isArray(manifest.files)) throw new Error('Compiled package manifest.files must be an array');
  const files = manifest.files.map((entry, index) => {
    const item = object(entry, `manifest.files[${index}]`);
    const file = relativeFile(text(item.path, `manifest.files[${index}].path`));
    const contentUtf8 = fs.readFileSync(path.join(directory, ...file.split('/')), 'utf8');
    if (sha256(contentUtf8) !== item.byteDigest) throw new Error(`Package byte digest mismatch: ${file}`);
    const document = object(JSON.parse(contentUtf8), file);
    if (selfDigest(document) !== document.contentDigest) throw new Error(`Package content digest mismatch: ${file}`);
    const reference = object(item.definition, `manifest.files[${index}].definition`);
    for (const field of ['id','version']) if (document[field] !== reference[field]) throw new Error(`Package file identity mismatch: ${file} ${field}`);
    if (document.contentDigest !== reference.digest) throw new Error(`Package file identity mismatch: ${file} digest`);
    if (document.kind !== item.kind) throw new Error(`Package file kind mismatch: ${file}`);
    return { path: file, contentUtf8 };
  });
  if (selfDigest(manifest) !== manifest.contentDigest) throw new Error('Package manifest content digest mismatch');
  return { manifest, manifestUtf8, files };
}

export function compiledAsAuthoring(compiled: UarCompiledPackage): UarAuthoringPackage {
  const manifest = structuredClone(compiled.manifest);
  delete manifest.files; delete manifest.lock;
  return { manifest, definitions: compiled.files.map(file => ({ path: file.path, document: object(JSON.parse(file.contentUtf8), file.path) })) };
}
