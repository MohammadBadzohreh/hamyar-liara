import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/store.ts';
import {expectedCheckout,hasVerifiedRepair} from '../server/verification.ts';

test('cached CI evidence authorizes only a completed successful test of the identical project repository and commit',()=>{
 const op={kind:'repair-test',projectId:'p',status:'succeeded',parameters:{repo:'owner/repo'},result:{sha:'abc',tests:{sha:'abc',verified:true,status:'completed',conclusion:'success'}}};
 assert.equal(hasVerifiedRepair(op,'p','owner/repo','abc'),true);
 assert.equal(hasVerifiedRepair(op,'other','owner/repo','abc'),false);
 assert.equal(hasVerifiedRepair(op,'p','other/repo','abc'),false);
 assert.equal(hasVerifiedRepair(op,'p','owner/repo','other-sha'),false);
 op.result.tests.status='in_progress';assert.equal(hasVerifiedRepair(op,'p','owner/repo','abc'),false);
 op.result.tests.status='completed';op.result.tests.conclusion='failure';assert.equal(hasVerifiedRepair(op,'p','owner/repo','abc'),false);
});
test('pending and consumed approvals persist across database restart',async()=>{const dir=await mkdtemp(join(tmpdir(),'hamyar-persist-'));let s=new Store(join(dir,'test.sqlite'));try{const op=s.operation('p','deploy',{sha:'immutable'},{});s.close();s=new Store(join(dir,'test.sqlite'));s.approve(op.id);s.event(op.id,'started');s.close();s=new Store(join(dir,'test.sqlite'));assert.equal(s.get('operation',op.id)?.status,'running');assert.equal(s.get('operation',op.id)?.events.length,1);assert.throws(()=>s.approve(op.id));}finally{s.close();await rm(dir,{recursive:true,force:true})}});
test('incident verification uses actual amount rather than canned success',()=>{assert.deepEqual(expectedCheckout({amount:25000,user:{discount:{code:'save10'}}}),{total:22500,currency:'IRT'});assert.throws(()=>expectedCheckout({amount:-1}));assert.throws(()=>expectedCheckout({amount:1,user:{discount:{code:42}}}));});
