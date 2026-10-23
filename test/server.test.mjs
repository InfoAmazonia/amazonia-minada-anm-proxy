import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('public route serves validated bytes, refuses missing receipt and never starts legacy collector', async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anm-server-'));fs.mkdirSync(path.join(dir,'storage'));
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const file=path.join(dir,'storage','PROCESSOS_MINERARIOS_BRASIL.zip');const bytes=Buffer.from('fixture');fs.writeFileSync(file,bytes);
 fs.writeFileSync(file+'.validated.json',JSON.stringify({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),downloadedAt:new Date().toISOString(),validatedAt:new Date().toISOString()}));
 const script=new URL('../dist/server.js',import.meta.url);
 const child=spawn(process.execPath,[script.pathname],{cwd:dir,env:{...process.env,APP_PORT:String(port),ANM_EXTERNAL_COLLECTOR:'true',ANM_PROCESSOSMINERARIOS_SHAPEFILE_NAME:path.basename(file),ANM_PROCESSOSMINERARIOS_SHAPEFILEURL:'http://127.0.0.1:1/should-not-run'}});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 t.after(async()=>{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('close',r));}fs.rmSync(dir,{recursive:true,force:true});});
 let ready=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{await fetch(`http://127.0.0.1:${port}/`,{redirect:'manual'});ready=true;break;}catch{}await new Promise(r=>setTimeout(r,50));}
 assert.ok(ready,logs);
 const url=`http://127.0.0.1:${port}/download/${path.basename(file)}`;
 const response=await fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('x-anm-sha256'),createHash('sha256').update(bytes).digest('hex'));assert.equal(await response.text(),'fixture');
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('cache-control'),'no-store');
 const range=await fetch(url,{headers:{Range:'bytes=1-3'}});assert.equal(range.status,206);assert.equal(await range.text(),'ixt');
 // A client disconnect after response headers must not crash the process.
 const large=Buffer.alloc(16*1024*1024,65);fs.writeFileSync(file,large);
 fs.writeFileSync(file+'.validated.json',JSON.stringify({bytes:large.length,sha256:createHash('sha256').update(large).digest('hex'),downloadedAt:new Date().toISOString(),validatedAt:new Date().toISOString()}));
 await new Promise((resolve,reject)=>{const request=http.get(url,response=>{response.once('data',()=>{response.destroy();resolve();});});request.on('error',reject);});
 await new Promise(r=>setTimeout(r,150));
 assert.equal(child.exitCode,null,logs);
 assert.equal((await fetch(url,{method:'HEAD'})).status,200);
 fs.unlinkSync(file+'.validated.json');assert.equal((await fetch(url)).status,503);
 assert.equal((await fetch(`http://127.0.0.1:${port}/download/other`)).status,404);
 assert.doesNotMatch(logs,/Starting files pull|Pulling ANM|Downloading/);
});
