import {test} from 'node:test';
import assert from 'node:assert/strict';
import {remainingBuildLogs} from '../server/build-logs.ts';
import {config} from '../server/config.ts';
test('terminal build logs are drained across cursor pages and stop when cursor does not advance',async()=>{
 const old=globalThis.fetch,prior={team:config.team,liaraToken:config.liaraToken};config.team='test';config.liaraToken='test';
 const cursors:string[]=[];
 globalThis.fetch=async(input:any)=>{const since=new URL(input).searchParams.get('since')!;cursors.push(since);return Response.json({release:{state:'FAILED'},buildOutput:since==='first'?[{createdAt:'second',line:'npm error code 1',stream:'STDOUT'}]:[{createdAt:'second',line:'exit code 1',stream:'STDERR'}]});};
 try{const rows=await remainingBuildLogs('release','first');assert.deepEqual(cursors,['first','second']);assert.equal(rows.length,2);assert.equal(rows[1].stream,'STDERR');}finally{globalThis.fetch=old;Object.assign(config,prior);}
});
