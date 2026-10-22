import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {config} from '../server/config.ts';
import {liara} from '../server/liara.ts';
import {analyze,repair} from '../server/ai.ts';

test('provider auth/rate limits, malformed model output and ambiguous write timeout fail closed without replay',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hamyar-failures-'));config.dataDir=dir;
 const original=globalThis.fetch;const old={team:config.team,liaraToken:config.liaraToken,aiKey:config.aiKey,aiBase:config.aiBase};
 Object.assign(config,{team:'test-team',liaraToken:'fake-token',aiKey:'fake-ai-key',aiBase:'https://ai.liara.ir/api/test/v1'});
 const {store}=await import('../server/store.ts');const {execute}=await import('../server/workflows.ts');
 try{
  for(const status of [401,403,429,503]){
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({message:'controlled unavailable'},{status});};
    await assert.rejects(liara('/v1/me'),new RegExp(String(status)));assert.equal(calls,1);
    await assert.rejects(analyze({http:{status:500}}),new RegExp(String(status)));assert.equal(calls,2);
  }
  for(const content of ['not JSON','{"content":','{}']){
    globalThis.fetch=async()=>Response.json({choices:[{message:{content},finish_reason:'stop'}]});
    await assert.rejects(repair({source:'export function checkout(){}'}));
  }
  let writes=0;globalThis.fetch=async(_input:any,init:any)=>{assert.equal(init.method,'POST');writes++;throw new Error('network timeout after request sent');};
  store.put('project','p',{id:'p',app:'test-app',url:'https://test-app.liara.run',healthPath:'/health/live'});
  const op=store.operation('p','restart',{team:'test-team',app:'test-app'},{});
  await execute(store.approve(op.id));assert.equal(writes,1);assert.equal(store.get('operation',op.id)?.status,'needs_review');
  assert.throws(()=>store.approve(op.id));assert.equal(writes,1);
 }finally{globalThis.fetch=original;Object.assign(config,old);store.close();await rm(dir,{recursive:true,force:true});}
});
