import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../server/config.ts';
import {createRepairCommit} from '../server/github.ts';

test('repair creates a base branch then fast-forwards once; ambiguous push is not retried',async()=>{
 const original=globalThis.fetch,token=config.githubToken;config.githubToken='fake';
 try{
  for(const fail of [false,true]){
   const calls:any[]=[];
   globalThis.fetch=async(input:any,init:any)=>{
    const path=new URL(input).pathname;const body=init.body?JSON.parse(init.body):null;
    calls.push({path,method:init.method,body});
    if(init.method==='PATCH'&&fail)throw new Error('ambiguous timeout');
    return Response.json(path.endsWith('/commits/base')?{tree:{sha:'old-tree'}}:{sha:path.endsWith('/commits')?'reviewed-sha':'object-sha'});
   };
   const pending=createRepairCommit('owner/sample','base','src/checkout.mjs','reviewed','test');
   if(fail)await assert.rejects(pending,/ambiguous timeout/);
   else assert.equal((await pending).sha,'reviewed-sha');
   assert.deepEqual(calls.slice(-2),[
    {path:'/repos/owner/sample/git/refs',method:'POST',body:{ref:'refs/heads/codex/repair-test',sha:'base'}},
    {path:'/repos/owner/sample/git/refs/heads/codex/repair-test',method:'PATCH',body:{sha:'reviewed-sha',force:false}},
   ]);
   assert.equal(calls.length,6);
  }
 }finally{globalThis.fetch=original;config.githubToken=token;}
});
