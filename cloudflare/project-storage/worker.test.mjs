import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import worker, {boundedBody} from './worker.mjs';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const uid='11111111-1111-4111-8111-111111111111', pid='22222222-2222-4222-8222-222222222222', id='33333333-3333-4333-8333-333333333333';
function setup({quota=false,failWrite=false,failDelete=false,foreign=false}={}) {
 const calls=[];
 const env={STORAGE_ENABLED:'true',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-service',DOWNLOAD_SIGNING_KEY:'test-signing',ALLOWED_ORIGINS:'https://app.test',FILES:{put:async()=>{calls.push('put');if(failWrite)throw Error('failed');},delete:async()=>{calls.push('delete-object');if(failDelete)throw Error('failed');}}};
 globalThis.fetch=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id:uid});
  if(path.endsWith('/consume_project_storage_operation'))return Response.json(true);
  if(path==='/rest/v1/projects')return Response.json(foreign?[]:[{id:pid}]);
  if(path.endsWith('/reserve_project_storage')){calls.push(['reserve',JSON.parse(opts.body).p_size_bytes]);return quota?Response.json({message:'STORAGE_QUOTA_EXCEEDED'},{status:400}):Response.json({id,object_key:`${uid}/${id}`});}
  if(path.endsWith('/finish_project_storage')){calls.push('finish');return Response.json({id,storage_provider:'r2'});}
  if(opts.method==='DELETE'){calls.push('delete-row');return new Response(null,{status:204});}
  throw Error(`Unexpected ${url}`);
 };
 return {env,calls};
}
const upload=()=>new Request(`https://files.test/documents?projectId=${pid}&name=bill.pdf`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/pdf',Origin:'https://app.test'},body:'hello'});
test('rejects unauthenticated requests',async()=>{const {env}=setup();assert.equal((await worker.fetch(new Request('https://files.test/usage'),env)).status,401);});
test('rejects foreign project before reservation or object write',async()=>{const {env,calls}=setup({foreign:true});assert.equal((await worker.fetch(upload(),env)).status,404);assert.deepEqual(calls,[]);});
test('quota rejection never writes an R2 object',async()=>{const {env,calls}=setup({quota:true});const r=await worker.fetch(upload(),env);assert.equal(r.status,413);assert.equal((await r.json()).code,'STORAGE_QUOTA_EXCEEDED');assert.deepEqual(calls,[['reserve',5]]);});
test('reserves actual bytes then writes then finalizes',async()=>{const {env,calls}=setup();assert.equal((await worker.fetch(upload(),env)).status,201);assert.deepEqual(calls,[['reserve',5],'put','finish']);});
test('ambiguous write and failed deletion keep reservation charged',async()=>{const {env,calls}=setup({failWrite:true,failDelete:true});assert.equal((await worker.fetch(upload(),env)).status,503);assert.deepEqual(calls,[['reserve',5],'put','delete-object']);});
test('failed write releases reservation only after object deletion',async()=>{const {env,calls}=setup({failWrite:true});await worker.fetch(upload(),env);assert.deepEqual(calls,[['reserve',5],'put','delete-object','delete-row','delete-row']);});
test('rejects oversized stream even without content-length',async()=>{const req=new Request('https://files.test',{method:'POST',body:'123456'});await assert.rejects(boundedBody(req,5),/15 MB/);});
test('rejects forged signed downloads before querying storage',async()=>{const {env,calls}=setup();const r=await worker.fetch(new Request(`https://files.test/download/${id}?expires=${Math.floor(Date.now()/1000)+300}&signature=${'0'.repeat(64)}`),env);assert.equal(r.status,403);assert.deepEqual(calls,[]);});
test('rejects disallowed browser origin',async()=>{const {env}=setup();assert.equal((await worker.fetch(new Request('https://files.test/usage',{headers:{Origin:'https://evil.test'}}),env)).status,403);});
