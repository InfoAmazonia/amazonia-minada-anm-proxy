import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatedDownload } from '../src/validated-download.ts';

test('receipt and file remain bound to one immutable generation', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anm-proxy-')); t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  for (const n of ['one','two']) {
    fs.writeFileSync(path.join(dir,n),n);
    fs.writeFileSync(path.join(dir,n+'.validated.json'), JSON.stringify({bytes:3,sha256:'a'.repeat(64),downloadedAt:'2026-10-23T03:00:00Z',validatedAt:'2026-10-23T03:00:05Z'}));
  }
  const publicPath=path.join(dir,'public.zip');fs.symlinkSync(path.join(dir,'one'), publicPath);
  const response=validatedDownload(publicPath);fs.unlinkSync(publicPath);fs.symlinkSync(path.join(dir,'two'),publicPath);
  assert.equal(fs.readFileSync(response.file,'utf8'),'one');assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(response.headers['X-ANM-Bytes'],'3');
});

test('missing or mismatched receipt fails closed', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anm-proxy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'file');fs.writeFileSync(file,'data');assert.throws(()=>validatedDownload(file));
 fs.writeFileSync(file+'.validated.json',JSON.stringify({bytes:5,sha256:'a'.repeat(64),downloadedAt:'2026-10-23',validatedAt:'2026-10-23'}));assert.throws(()=>validatedDownload(file));
});
