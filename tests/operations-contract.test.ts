import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../server/config.ts';

test('cost ambiguity and changed quotes prevent purchases; SSL requires project ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hamyar-contract-'));
  const oldConfig = { ...config }, oldFetch = globalThis.fetch;
  const names = ['LIARA_PRICE_SCHEMA_VERIFIED', 'LIARA_BALANCE_FIELD', 'LIARA_TAX_RATE'];
  const oldEnv = names.map(key => [key, process.env[key]] as const);
  Object.assign(config, { dataDir: dir, team: 'test-team', liaraToken: 'fake-token' });
  const { store } = await import('../server/store.ts');
  const { propose, execute } = await import('../server/workflows.ts');
  const p = { id: 'p', app: 'sample', name: 'sample', repo: 'https://github.com/owner/sample', ref: 'main', port: 3100, url: 'https://sample.liara.run', healthPath: '/health/live', monitor: false };
  store.put('project', p.id, p);
  const calls: { path: string; method: string; body?: any }[] = [];
  let domainProject = 'another-app';
  globalThis.fetch = async (input: any, init: any) => {
    const u = new URL(input);
    assert.equal(u.searchParams.get('teamID'), 'test-team');
    calls.push({ path: u.pathname, method: init.method, body: init.body && JSON.parse(init.body) });
    if (u.pathname === '/v1/me') return Response.json({ plans: {
      projects: { small: { available: true, price: 10, RAM: 512, CPU: 0.5 } },
      projectBundlePlans: { small: { base: { available: true, price: 1, displayPrice: 720 } } },
    } });
    if (u.pathname === '/v1/billing') return Response.json({ team: { balance: 100000 } });
    if (u.pathname === '/v1/domains' && init.method === 'GET') return Response.json({ domains: [{ _id: 'domain-id', project: domainProject }] });
    if (u.pathname === '/v1/domains/provision-ssl-certs') return Response.json({ accepted: true });
    throw new Error('Unexpected external call');
  };
  try {
    process.env.LIARA_PRICE_SCHEMA_VERIFIED = 'false';
    const choice = { planID: 'small', bundlePlanID: 'base' };
    await assert.rejects(propose(p, 'resize', choice), /قرارداد/);
    process.env.LIARA_PRICE_SCHEMA_VERIFIED = 'true';
    process.env.LIARA_BALANCE_FIELD = 'missing';
    await assert.rejects(propose(p, 'resize', choice), /موجودی/);
    process.env.LIARA_BALANCE_FIELD = 'team.balance';
    process.env.LIARA_TAX_RATE = '';
    await assert.rejects(propose(p, 'resize', choice), /مالیات/);
    process.env.LIARA_TAX_RATE = '0.1'; // Fixture only; not a claim about real tax.
    const creation = store.operation(p.id, 'create-deploy', { team: config.team, app: p.app, ...choice, quote: { fingerprint: 'outdated-price' } }, {});
    await execute(store.approve(creation.id));
    assert.match(store.get('operation', creation.id)?.error, /قیمت تغییر کرده/);
    assert.equal(calls.filter(x => x.method === 'POST').length, 0);
    await assert.rejects(propose(p, 'domain', { domain: 'https://evil.test/path' }));

    const foreign = await propose(p, 'ssl', { domainId: 'domain-id' });
    await execute(store.approve(foreign.id));
    assert.match(store.get('operation', foreign.id)?.error, /مالکیت/);
    assert.equal(calls.filter(x => x.method === 'POST').length, 0);
    domainProject = p.app;
    const owned = await propose(p, 'ssl', { domainId: 'domain-id' });
    await execute(store.approve(owned.id));
    assert.equal(store.get('operation', owned.id)?.status, 'succeeded');
    assert.deepEqual(calls.filter(x => x.method === 'POST'), [{ path: '/v1/domains/provision-ssl-certs', method: 'POST', body: { domain: 'domain-id' } }]);
  } finally {
    globalThis.fetch = oldFetch;
    Object.assign(config, oldConfig);
    for (const [key, value] of oldEnv) value === undefined ? delete process.env[key] : process.env[key] = value;
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
