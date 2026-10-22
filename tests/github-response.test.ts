import {test} from 'node:test';
import assert from 'node:assert/strict';
import {github,checkTests} from '../server/github.ts';
import {config} from '../server/config.ts';

test('GitHub empty write responses succeed; denied or ambiguous writes are never retried',async()=>{
 const original=globalThis.fetch,token=config.githubToken;config.githubToken='fake';
 try{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:204});};
  assert.equal(await github('/repos/o/r/actions/workflows/acceptance.yml/enable','PUT'),undefined);
  assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return Response.json({message:'Resource not accessible by personal access token'},{status:403});};
  await assert.rejects(github('/repos/o/r/actions/workflows/acceptance.yml/disable','PUT'),/GitHub 403/);
  assert.equal(calls,2);
  globalThis.fetch=async()=>{calls++;return new Response('<html>error</html>',{status:502});};
  await assert.rejects(github('/repos/o/r/actions/workflows/acceptance.yml/enable','PUT'),/GitHub 502/);
  assert.equal(calls,3);
 }finally{globalThis.fetch=original;config.githubToken=token;}
});

test('absent workflow run is distinct from a queued run and neither permits publication',async()=>{
 const original=globalThis.fetch,sha='a'.repeat(40);
 try{
  globalThis.fetch=async()=>Response.json({workflow_runs:[]});
  const absent=await checkTests('o/r',sha);
  assert.equal(absent.status,'not_started');assert.equal(absent.verified,false);
  globalThis.fetch=async()=>Response.json({workflow_runs:[{head_sha:sha,event:'push',head_repository:{full_name:'o/r'},status:'queued'}]});
  const queued=await checkTests('o/r',sha);
  assert.equal(queued.status,'queued');assert.equal(queued.verified,false);
 }finally{globalThis.fetch=original;}
});
