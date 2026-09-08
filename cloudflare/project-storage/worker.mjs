const MAX_FILE = 15_000_000;
const TYPES = new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class Failure extends Error { constructor(status, message, code) { super(message); this.status=status; this.code=code; } }
const json = (body, status=200) => Response.json(body,{status});
const enc = new TextEncoder();
async function db(env, path, options={}) {
  const response=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...options.headers},
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const error=await response.text();
    if (/PLATFORM_STORAGE_LIMIT|PLATFORM_REQUEST_LIMIT/.test(error)) throw new Failure(503,'File storage has reached its service safety limit. Please try again later. Upgrading will not bypass this limit.','PLATFORM_SAFETY_LIMIT');
    if (error.includes('STORAGE_QUOTA_EXCEEDED')) throw new Failure(413,'Storage allowance reached. Upgrade your plan or delete files to make room.','STORAGE_QUOTA_EXCEEDED');
    if (/PROJECT_NOT_FOUND|INVALID_STAGE/.test(error)) throw new Failure(404,'Project or stage not found.');
    throw new Failure(503,'Storage is temporarily unavailable. Please try again.');
  }
  return response.status===204 ? null : response.json();
}
const rpc=(env,name,args)=>db(env,`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});
async function user(env, request) {
  const auth=request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new Failure(401,'Sign in to manage your files.');
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Failure(401,'Your session expired. Please sign in again.');
  const result=await response.json();
  if (!UUID.test(result.id)) throw new Failure(401,'Sign in to manage your files.');
  return result.id;
}
async function ownProject(env, projectId, userId) {
  if (!UUID.test(projectId || '')) throw new Failure(400,'Choose a saved project.');
  const rows=await db(env,`projects?id=eq.${projectId}&owner_user_id=eq.${userId}&select=id`);
  if (!rows.length) throw new Failure(404,'Project not found.');
}
async function hmac(env, text) {
  const key=await crypto.subtle.importKey('raw',enc.encode(env.DOWNLOAD_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return {key,bytes:enc.encode(text)};
}
async function signed(env, base, doc) {
  if (doc.storage_provider !== 'r2') {
    if (!doc.storage_path) return {...doc,signed_url:null};
    const path=doc.storage_path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/project-documents/${path}`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600}),signal:AbortSignal.timeout(10000)});
    const result=response.ok ? await response.json() : {};
    return {...doc,signed_url:result.signedURL ? `${env.SUPABASE_URL}/storage/v1${result.signedURL}` : null};
  }
  const expires=Math.floor(Date.now()/1000)+3600;
  const {key,bytes}=await hmac(env,`${doc.id}:${expires}`);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {...doc,signed_url:`${base}/download/${doc.id}?expires=${expires}&signature=${signature}`};
}
export async function boundedBody(request, max=MAX_FILE) {
  if (Number(request.headers.get('Content-Length'))>max) throw new Failure(413,'Each file must be 15 MB or smaller.');
  const reader=request.body?.getReader();
  if (!reader) throw new Failure(400,'Choose a non-empty file.');
  let size=0; const chunks=[];
  try { for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>max) { await reader.cancel(); throw new Failure(413,'Each file must be 15 MB or smaller.'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  if (!size) throw new Failure(400,'Choose a non-empty file.');
  const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;} return bytes;
}
async function cleanup(env, item) {
  // Release quota only after deletion is confirmed; ambiguous failures stay charged for retry.
  await env.FILES.delete(item.object_key);
  await db(env,`project_documents?id=eq.${item.id}&storage_provider=eq.r2`,{method:'DELETE'});
  await db(env,`project_storage_objects?id=eq.${item.id}`,{method:'DELETE'});
}
async function download(env,url) {
  const id=url.pathname.slice('/download/'.length), expires=Number(url.searchParams.get('expires')), signature=url.searchParams.get('signature') || '';
  if (!UUID.test(id) || !Number.isInteger(expires) || expires<Math.floor(Date.now()/1000) || expires>Math.floor(Date.now()/1000)+3600 || !/^[a-f0-9]{64}$/.test(signature)) throw new Failure(403,'This file link has expired. Reopen the document vault.');
  const {key,bytes}=await hmac(env,`${id}:${expires}`);
  if (!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),bytes)) throw new Failure(403,'Invalid file link.');
  const rows=await db(env,`project_documents?id=eq.${id}&storage_provider=eq.r2&select=*`);
  const doc=rows[0]; if (!doc) throw new Failure(404,'File not found.');
  await rpc(env,'consume_project_storage_operation',{p_kind:'read'});
  const object=await env.FILES.get(doc.storage_path); if(!object) throw new Failure(404,'File not found.');
  const inline=['application/pdf','image/jpeg','image/png','image/webp'].includes(doc.mime_type);
  return new Response(object.body,{headers:{'Content-Type':doc.mime_type || 'application/octet-stream','Content-Length':String(object.size),'Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
async function route(request,env) {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/download/') && request.method==='GET') return download(env,url);
  const userId=await user(env,request);
  if(url.pathname==='/usage' && request.method==='GET') return json(await rpc(env,'project_storage_usage',{p_user_id:userId}));
  const projectId=url.searchParams.get('projectId');
  await ownProject(env,projectId,userId);
  if(url.pathname==='/documents' && request.method==='GET') {
    const rows=await db(env,`project_documents?project_id=eq.${projectId}&order=created_at.desc&select=*`);
    return json(await Promise.all(rows.map(doc=>signed(env,url.origin,doc))));
  }
  if(url.pathname==='/documents' && request.method==='POST') {
    const mime=request.headers.get('Content-Type')?.split(';')[0];
    if(!TYPES.has(mime)) throw new Failure(415,'Use PDF, JPG, PNG, WebP, TXT, CSV, DOCX or XLSX files.');
    const filename=(url.searchParams.get('name') || '').trim();
    if(!filename || filename.length>240) throw new Failure(400,'Use a file name of 1–240 characters.');
    const stageId=url.searchParams.get('stageId') || null;
    if(stageId && !UUID.test(stageId)) throw new Failure(400,'Invalid project stage.');
    const body=await boundedBody(request);
    const item=await rpc(env,'reserve_project_storage',{p_user_id:userId,p_project_id:projectId,p_stage_id:stageId,p_file_name:filename,p_mime_type:mime,p_kind:url.searchParams.get('category') || 'other',p_size_bytes:body.byteLength});
    let doc;
    try {
      await rpc(env,'consume_project_storage_operation',{p_kind:'write'});
      await env.FILES.put(item.object_key,body,{httpMetadata:{contentType:mime}});
      doc=await rpc(env,'finish_project_storage',{p_id:item.id,p_user_id:userId});
    } catch(error) { try {await cleanup(env,item);} catch { /* Hourly reconciliation retries confirmed deletion. */ } throw error; }
    return json(await signed(env,url.origin,doc),201);
  }
  if(url.pathname.startsWith('/documents/') && request.method==='DELETE') {
    const id=url.pathname.slice('/documents/'.length); if(!UUID.test(id)) throw new Failure(400,'Invalid file.');
    const rows=await db(env,`project_documents?id=eq.${id}&project_id=eq.${projectId}&select=*`);
    const doc=rows[0]; if(!doc) return json({deleted:true});
    if(doc.storage_provider==='r2') {
      await cleanup(env,{id:doc.id,object_key:doc.storage_path});
    } else {
      const response=await fetch(`${env.SUPABASE_URL}/storage/v1/object/project-documents`,{method:'DELETE',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[doc.storage_path]}),signal:AbortSignal.timeout(10000)});
      if(!response.ok) throw new Failure(503,'Could not delete the file. Please try again.');
      await db(env,`project_documents?id=eq.${id}`,{method:'DELETE'});
    }
    return json({deleted:true});
  }
  throw new Failure(404,'Not found.');
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',');
    if(origin && !allowed.includes(origin)) return json({error:'Origin not allowed.'},403);
    const cors={'Access-Control-Allow-Origin':origin || allowed[0] || '', 'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin'};
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    let response;
    try {
      if(env.STORAGE_ENABLED !== 'true' || !env.SUPABASE_SERVICE_ROLE_KEY || !env.DOWNLOAD_SIGNING_KEY || !env.FILES) throw new Failure(503,'File storage is being set up. Please try again shortly.');
      response=await route(request,env);
    } catch(error) {response=json({error:error instanceof Failure ? error.message : 'Storage is temporarily unavailable. Please try again.',code:error.code || 'STORAGE_ERROR'},error.status || 503);}
    for(const [key,value] of Object.entries(cors)) response.headers.set(key,value);
    return response;
  },
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      const items=await rpc(env,'project_storage_cleanup_candidates',{});
      for(const item of items) await cleanup(env,item);
    })());
  }
};
