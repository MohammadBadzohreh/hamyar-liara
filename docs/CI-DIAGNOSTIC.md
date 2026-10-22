# GitHub Actions trigger diagnostic — 2026-10-22

Repository: https://github.com/MohammadBadzohreh/hamyar-liara-sample

## Observed
- Public repository, archived=false, disabled=false, default branch main.
- acceptance.yml workflow ID 392960978 reports active.
- Trigger: push, branches `codex/repair-*` and `main`.
- Owner screenshots show Allow all actions; no custom Actions policies. Policy insights is unavailable on this account.
- Workflow only uses checkout/setup-node and `node --test test/checkout.test.mjs`. No deployment or infrastructure secrets in the workflow.
- Existing successful run 39799713525 (commit d5ebcf2820678518551565619593aedfa90c47b1) was manually rerun by owner. Attempt2 completed successfully at 18:09:05 UTC; test job ran 5 seconds.
- New reviewed commit ac497fb3ba7a13303740a75ff9a605e516010fac and fresh same-source commit e0d9974e361e5f3d4c31e469c28ac88045ec8917 returned no matching workflow run. This is not a known queued job.
- Creating a new ref, fast-forwarding an existing ref using REST, and regular Git push all succeeded, but no run was observed during bounded polling.
- Source/test/workflow contract was verified unchanged except src/checkout.mjs repair. Commit message contains no CI-skip instruction.
- Rerun via limited PAT returned403; owner UI rerun worked. That permission failure does not establish the cause of missing push-trigger runs.
- Official status incident wq8305lppdc2 overlapped original attempts: Actions degraded around15:28–17:41UTC. Correlation only; causation unconfirmed.

## Latest controlled experiment
A new commit was created using local git commit-tree with exactly the same tree as reviewed e0d9974e361e5f3d4c31e469c28ac88045ec8917, then pushed as a fast-forward to an existing diagnostic branch.
- SHA: 0a28e88dabdadde430116174591e7d312cd3785c
- Branch: codex/repair-git-transport-1792692176823
- Push time: 18:10:52 UTC
- No main branch changes, new dependencies, or production deployment.
- Final outcome recorded in VALIDATION.fa.md / private local evidence.

## Unresolved question
Why are new push events on matching branches not producing an acceptance workflow run while an owner rerun of the existing workflow succeeds?

This note is prepared for troubleshooting only; it has not been sent to GitHub support. Do not include local .env, tokens, account responses or private .local files in a support submission.

## Resolution verified — 2026-10-23 Tehran

The owner granted Actions:write for the repository PAT. The acceptance workflow was disabled and immediately re-enabled via scripts/repair-ci-registration.mjs; final state active, no history deletion. The post-reset SHA555dbcc81542ec9bd73647465f7796773277aa41 eventually passed push CI run39834459285 (created18:47UTC vs commit18:21UTC). Causation is not proven because GitHub recovery/delay also overlapped.

A new independent push of reviewed source, SHA4eb3744197c6728301cbbdc1edef29fa221185fc, passed automatically in run39852528819. This verifies new push CI is currently working. Partial workflow_dispatch changes were removed; exact immutable workflow contract and push/SHA/repository checks remain. New runs do not retroactively validate earlier unmatched SHAs. No production deployment occurred during this fix.

28 local tests, build, HTTP security/SSE, and18live probes pass. Two full contest rehearsals remain. No more token/setting changes required for this blockage. Site healthy at d5ebcf; demo disabled. Detailed evidence in VALIDATION.fa.md and private .local/post-reset-ci.json.
