import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordHealth,claimIncident} from '../server/monitor-policy.ts';
test('three consecutive failures create one incident and cooldown prevents repeated analysis',()=>{
 const s={failures:0,lastIncident:0,busy:false};
 recordHealth(s,false);assert.equal(claimIncident(s,1000000),false);
 recordHealth(s,true);assert.equal(s.failures,0);
 recordHealth(s,false);recordHealth(s,false);assert.equal(claimIncident(s,1000000),false);
 recordHealth(s,false);assert.equal(claimIncident(s,1000000),true);
 recordHealth(s,false);assert.equal(claimIncident(s,1000001),false);
 const resumed=JSON.parse(JSON.stringify(s));assert.equal(claimIncident(resumed,1599999),false);
 assert.equal(claimIncident(resumed,1600000),true);
 recordHealth(resumed,true);assert.equal(resumed.failures,0);assert.equal(claimIncident(resumed,2200000),false);
});
