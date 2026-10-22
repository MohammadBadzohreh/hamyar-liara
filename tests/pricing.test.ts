import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hourlyWithTax} from '../server/pricing.ts';
test('Mars uses separate actual hourly resource and bundle prices with user supplied 10 percent tax',()=>{
  assert.ok(Math.abs(hourlyWithTax(1145.83,659.72,0.1)-1986.105)<1e-8);
  assert.ok(Math.abs(hourlyWithTax(1145.83,1145.83,0.1)-2520.826)<1e-8);
  assert.equal(Math.round((825000+475000)*1.1),1430000);
  assert.equal(Math.round((825000+825000)*1.1),1815000);
  assert.notEqual(hourlyWithTax(1145.83,1145.83,0.1),hourlyWithTax(1145.83,825000/720,0.1));
  for(const args of [[1,NaN,0.1],[1,-1,0.1],[1,1,10],[Infinity,1,0.1]])assert.throws(()=>hourlyWithTax(...args as [number,number,number]));
});
