import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {config} from '../server/config.ts';

test('restart reconciles existing repair commit without writes and preserves checkpoint on unavailable provider',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hamyar-reconcile-'));
  const previousConfig={...config};
  Object.assign(config,{team:'test-team',liaraToken:'fake-liara-token',githubToken:'fake-github-token'});
  config.dataDir=dir;
  const {store}=await import('../server/store.ts');
  const {reconcile,reverifyDeployment}=await import('../server/workflows.ts');
  const old=globalThis.fetch;
  const sha='a'.repeat(40);
  let unavailable=false;
  globalThis.fetch=async (_input:any,init:any)=>{
    assert.equal(init.method,'GET');
    if(unavailable)return Response.json({message:'unavailable'},{status:403});
    return Response.json({workflow_runs:[{head_sha:sha,event:'push',head_repository:{full_name:'owner/sample'},status:'completed',conclusion:'success'}]});
  };
  try {
    const op=store.operation('p','repair-test',{repo:'owner/sample'},{});
    store.approve(op.id);const running=store.get('operation',op.id)!;
    running.result={sha,branch:'codex/repair-test'};store.put('operation',op.id,running);
    await reconcile();assert.equal(store.get('operation',op.id)?.status,'succeeded');
    assert.equal(store.get('operation',op.id)?.result.sha,sha);
    running.status='running';store.put('operation',op.id,running);unavailable=true;
    await reconcile();assert.equal(store.get('operation',op.id)?.status,'needs_review');
    assert.equal(store.get('operation',op.id)?.result.sha,sha);
    assert.throws(()=>store.approve(op.id));
    store.put('project','p',{id:'p',app:'sample',url:'https://sample.liara.run',healthPath:'/health/live'});
    const previous=store.operation('p','deploy',{releaseID:'old-release',sha},{});
    store.finish(previous.id,'failed');
    globalThis.fetch=async (input:any,init:any)=>{
      assert.equal(init.method,'GET');assert.match(new URL(input).pathname,/\/releases$/);
      return Response.json({currentRelease:'different-release'});
    };
    await assert.rejects(reverifyDeployment(previous.id),/انتشار فعال/);
    assert.equal(store.get('operation',previous.id)?.status,'failed');
  }finally{globalThis.fetch=old;Object.assign(config,previousConfig);store.close();await rm(dir,{recursive:true,force:true});}
});
