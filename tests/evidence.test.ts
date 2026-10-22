import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeEvidence} from '../server/evidence-summary.ts';
test('current request evidence survives historical log flooding and unknown units stay unknown', () => {
  const values = Array.from({length:1000},(_,i)=>[String(10000+i),JSON.stringify({_entry:'historical noise '+i})]);
  values.unshift(['1',JSON.stringify({_entry:'request-specific TypeError request-123'})]);
  const result=summarizeEvidence({http:{status:500,body:JSON.stringify({requestId:'request-123'})},logs:{available:true,value:{data:[{metaData:{releaseId:'release'},values}]}}});
  assert.equal(result.http.status,500);
  assert.equal(result.logs.rows.length,16);
  assert.match(result.logs.rows[0].line,/request-specific/);
  assert.equal(result.units.cpu,'unknown');
  assert.equal(result.memory.available,false);
  assert.equal(JSON.parse(JSON.stringify(result)).logs.omitted,985);
});
