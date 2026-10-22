import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {github} from '../server/github.ts';
import {config} from '../server/config.ts';

// Owner maintenance command, not a model tool or automatic incident action.
const repo='MohammadBadzohreh/hamyar-liara-sample';
assert.equal(config.repairRepo,repo,'Only the configured contest sample may be repaired');
const path=`/repos/${repo}/actions/workflows/acceptance.yml`;
const mode=process.argv[2]||'--inspect';
assert.ok(['--inspect','--reset','--enable-only'].includes(mode));
await mkdir('.local',{recursive:true});
const report={at:new Date().toISOString(),repo,workflow:'acceptance.yml',mode,events:[]};
async function record(event,data={}){report.events.push({at:new Date().toISOString(),event,...data});await writeFile('.local/workflow-reset.json',JSON.stringify(report,null,2));console.log({event,...data});}
const before=await github(path);
await record('observed',{state:before.state,id:before.id});
if(mode==='--inspect')process.exit(0);
if(mode==='--enable-only'){
 await github(path+'/enable','PUT');
 const after=await github(path);assert.equal(after.state,'active');await record('enabled',{state:after.state});process.exit(0);
}
assert.equal(before.state,'active','Unexpected disabled workflow: inspect before changing it');
const runs=await github(path+'/runs?per_page=100');
assert.ok(runs.workflow_runs.every(run=>run.status==='completed'),'Active/queued test exists; reset refused');
let disableAttempted=false,enableAttempted=false;
try{
 disableAttempted=true;await record('disable-requested');
 await github(path+'/disable','PUT');
 const disabled=await github(path);assert.equal(disabled.state,'disabled_manually');await record('disabled',{state:disabled.state});
 enableAttempted=true;await record('enable-requested');
 await github(path+'/enable','PUT');
 const enabled=await github(path);assert.equal(enabled.state,'active');await record('reset-complete',{state:enabled.state});
}catch(error){
 await record('error',{message:error.message});
 // Reconcile before recovery; never blindly replay an ambiguous enable request.
 if(disableAttempted){
  const actual=await github(path);await record('reconciled',{state:actual.state});
  if(actual.state==='disabled_manually'&&!enableAttempted){
   await github(path+'/enable','PUT');const recovered=await github(path);await record('recovered',{state:recovered.state});assert.equal(recovered.state,'active');
  }else if(actual.state!=='active')await record('manual-enable-needed');
 }
 process.exitCode=1;
}
