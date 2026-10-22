import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkout } from '../src/checkout.mjs';
test('no discount preserves total',()=>assert.deepEqual(checkout({amount:10000,user:{}}),{total:10000,currency:'IRT'}));
test('missing user is optional',()=>assert.equal(checkout({amount:10000}).total,10000));
test('valid discount calculates actual total',()=>assert.equal(checkout({amount:10000,user:{discount:{code:'save10'}}}).total,9000));
test('invalid amount is rejected',()=>assert.throws(()=>checkout({amount:-1}),{message:'INVALID_AMOUNT'}));
test('invalid discount type is rejected',()=>assert.throws(()=>checkout({amount:100,user:{discount:{code:42}}}),{message:'INVALID_DISCOUNT'}));
