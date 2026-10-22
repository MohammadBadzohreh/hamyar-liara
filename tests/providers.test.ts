import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../server/config.ts";
import { account, liara } from "../server/liara.ts";
import { checkTests } from "../server/github.ts";
import { recommendPlan } from "../server/recommendation.ts";
test("explicit Liara team, no raw account secrets, unknown billing remains unknown", async () => {
  const original = globalThis.fetch;
  const old = { team: config.team, liaraToken: config.liaraToken };
  config.team = "team-test";
  config.liaraToken = "secret-test";
  globalThis.fetch = async (input: any, init: any) => {
    const u = new URL(input);
    assert.equal(u.searchParams.get("teamID"), "team-test");
    assert.equal(init.headers.Authorization, "Bearer secret-test");
    assert.equal(init.redirect, "error");
    if (u.pathname === "/v1/me")
      return Response.json({
        plans: { projects: {} },
        email: "private",
        storageSecret: "never expose",
      });
    if (u.pathname === "/v1/billing")
      return Response.json({ message: "unavailable" }, { status: 404 });
    return Response.json({ projects: [{project_id:'sample',envs:[{key:'SECRET',value:'must-stay-server-side'}]}], networks: [] });
  };
  try {
    const data = await account();
    assert.equal(data.billing.unavailable, true);
    assert.equal(JSON.stringify(data).includes("never expose"), false);
    assert.equal(JSON.stringify(data).includes("private"), false);
    assert.equal(JSON.stringify(data).includes('must-stay-server-side'),false);
    await assert.rejects(liara("https://evil.test/a"));
  } finally {
    globalThis.fetch = original;
    Object.assign(config, old);
  }
});
test("CI success requires exact SHA and repository", async () => {
  const original = globalThis.fetch;
  const sha = "a".repeat(40);
  let runs: any[] = [
    {
      head_sha: "b".repeat(40),
      event: "push",
      head_repository: { full_name: "owner/sample" },
      status: "completed",
      conclusion: "success",
    },
  ];
  globalThis.fetch = async () => Response.json({ workflow_runs: runs });
  try {
    assert.equal((await checkTests("owner/sample", sha)).verified, false);
    runs = [
      {
        ...runs[0],
        head_sha: sha,
        head_repository: { full_name: "attacker/sample" },
      },
    ];
    assert.equal((await checkTests("owner/sample", sha)).verified, false);
    runs = [{ ...runs[0], head_repository: { full_name: "owner/sample" } }];
    assert.equal((await checkTests("owner/sample", sha)).verified, true);
    runs[0].conclusion = "failure";
    assert.equal((await checkTests("owner/sample", sha)).verified, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("a failed job blocks publication before workflow completion; successful jobs alone do not authorize it", async () => {
  const original = globalThis.fetch;
  let conclusion = "failure";
  globalThis.fetch = async (input: any) => new URL(input).pathname.endsWith('/jobs')
    ? Response.json({jobs:[{status:'completed',conclusion}]})
    : Response.json({workflow_runs:[{id:123,head_sha:'a'.repeat(40),event:'push',head_repository:{full_name:'owner/sample'},status:'in_progress',conclusion:null}]});
  try {
    const failed = await checkTests('owner/sample','a'.repeat(40));
    assert.equal(failed.verified,false);assert.equal('rejected' in failed && failed.rejected,true);
    conclusion='success';
    const pending=await checkTests('owner/sample','a'.repeat(40));
    assert.equal(pending.verified,false);assert.equal('rejected' in pending && pending.rejected,false);
    assert.equal(pending.status,'in_progress');
  } finally { globalThis.fetch=original; }
});

test("resource recommendations do not invent prices or capacity", () => {
  assert.equal(recommendPlan(null, []).available, false);
  assert.equal(
    recommendPlan({ dependencies: [] }, [
      { resourceHourly: 1, bundleHourly: 0, verified: false },
    ]).available,
    false,
  );
  const choices = [
    {
      planID: "large",
      bundlePlanID: "base",
      resourceHourly: 2,
      bundleHourly: 0,
      verified: true,
    },
    {
      planID: "small",
      bundlePlanID: "base",
      resourceHourly: 1,
      bundleHourly: 0,
      verified: true,
    },
  ];
  assert.equal(recommendPlan({ dependencies: [] }, choices).planID, "small");
  assert.equal(
    recommendPlan({ dependencies: ["puppeteer"] }, choices).available,
    false,
  );
});
