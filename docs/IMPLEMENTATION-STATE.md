# Current testing checkpoint

Updated 2026-10-22 ~17:55 UTC. User authorized contest scenario tests. Dedicated sample is HEALTHY again. Credentials stay in .env; never print them.

## Final state
- Server restarted, session 97786, node server/index.ts, localhost:3000.
- Sample current/ref/lastGood: d5ebcf2820678518551565619593aedfa90c47b1.
- Recovery operation 635ba2fa-3c37-4448-95a7-249d5c47f05a succeeded; active release 6ada4d244400f7631d57a846.
- Final read-only 18 checks passed in two rounds; DEMO_MODE=false, PAYMENT sandbox. Evidence .local/final-validation.json, .local/rehearsal-recovery.json.
- No running operations. Repair d4c41702-94ac-4fd5-8a45-3bcfc0e6ff10 still waiting_tests, untested patch not deployed.

## Completed tests
26 assistant tests and 6 sample tests pass; tsc/Vite build passed outside sandbox (esbuild denied ancestor directory inside sandbox). Prior transient HTTP expiry test failure preserved in VALIDATION.fa.md; cause unproven.
Real crash recovery created one release only; 3 consecutive monitor failures created one incident and no duplicate during extra130sec; real failed Build preserved prior service and pagination fix exposes npm error. Actual invalid credentials401, simulated429/503/malformed output/ambiguous write tested. Earlier successful code repair, resources, restart, restore are documented.

## Blocker and next work
Rehearsal1 start passed healthy deploy/config error diagnosis/config fix/buggy deploy/code diagnosis/diff. Reviewed patch ac497fb3ba7a13303740a75ff9a605e516010fac created but GitHub never returned a run or check suite, even after explicit fast-forward push on codex/repair-retry-d4c41702-94ac-4fd5-8a45-3bcfc0e6ff10. Workflow active; reading actions/permissions returns403 with current PAT. Don't claim outage or known root cause. Need inspect GitHub Actions settings/status via account. CI timeout correctly blocked publication. Do not run .local/rehearsal.mjs 1 finish blindly: sample has been restored, base changed, needs fresh incident/approval. Rehearsal2 not started.

server/github.ts now creates branch at base and PATCHes fast-forward force:false. Local test tests/github-push.test.ts verifies order/no retry on ambiguity. This is loaded after restart but not verified to solve absent CI. Original main, workflow and test contract unchanged. .local scripts contain private evidence and must not be published.

No new service purchases/resize, custom DNS/SSL, online assistant persistent disk or visual QA. Exact tax/cost approval needed for new purchases. Metrics units unknown. Main repo all untracked; do not overwrite user changes. Docs not pushed, no video or two successful full rehearsals. Browser had Local browser use disabled. Full detail in docs/VALIDATION.fa.md.

## 18:05 UTC follow-up
Owner screenshots: Allow all actions, read-only workflow token, no Actions Policies. No settings changed. Official githubstatus summary incident wq8305lppdc2 reports Actions degraded15:28–17:41UTC overlapping original repair; not proven root cause. Original SHA still no run. Fresh same-content SHA e0d9974e361e5f3d4c31e469c28ac88045ec8917 created via createRepairCommit on codex/repair-ci-recovery-1792692082441. Normal git push of SAME SHA to codex/repair-git-transport-1792692176823 also succeeded. Still no workflow run after3min; .local/ci-recovery.json, .local/git-push-check.json. Repo public, notarchived, notdisabled. No website/main modification; healthy final state above unchanged. Policy insights screenshot requested next; no settings or token expansion yet.

18:07UTC: Owner Policy insights screenshot is Enterprise upsell only; no report available. Fresh CI still no run. POST rerun known-good workflow39799713525 returned403 PAT insufficient; notexecuted. Next owner action: open https://github.com/MohammadBadzohreh/hamyar-liara-sample/actions/runs/39799713525 and Re-run all jobs, report resulting run status/banner. No token expansion or Enterprise purchase. This rerun tests priorSHA only, never authorizes newpatch. Evidence .local/ci-rerun-check.json.

18:14UTC continuation: owner reran39799713525 throughUI; APIverified attempt2completed/success (test5sec). FreshSHAe0 stillnorun. Further diagnostic normalGit localcommit-tree with unchanged tree produced0a28e88dabdadde430116174591e7d312cd3785c, fast-forwardpushed existing codex/repair-git-transport-1792692176823 at18:10:52UTC. Stillnorun duringboundedpoll; .local/git-new-commit-check.json. No main/site changes. Diagnostic docs/CI-DIAGNOSTIC.md prepared, notsent. No more settings screenshots needed; cause remains unconfirmed, do notmisrepresent rerunoldSHAasnewpatchsuccess. Healthy site remains d5ebcf. User has done requested account UI check.

## Latest checkpoint — 2026-10-23 Tehran, 20:54UTC Oct22
CI BLOCKER RESOLVED empirically. User upgraded PAT Actions:write; reset workflow succeeded active. Run39834459285 for555dbcc delayed26min but passed. Fresh independent SHA4eb3744197c6728301cbbdc1edef29fa221185fc passed automatic push run39852528819 promptly. See VALIDATION.fa.md and CI-DIAGNOSTIC.md. Don't claim proven backend root cause or credit reset alone.
Partial workflow_dispatch implementation removed entirely (sampleworkflow, verifyTestContractupgrade, createRepairCommitupgrade, dispatchTests); no remote workflow/main edits. Retained empty204 support, not_started distinct fromqueued, exactpushrepoSHAchecks, branchbase+fastforward logic. 28tests +buildpass;18livechecks pass. Server restarted session68077 after verifying noactiveoperations, postrestartHTTPverified. Current sample remains d5ebcf2820678518551565619593aedfa90c47b1 release6ada4d244400f7631d57a846, DEMO_MODEfalse, sandbox. No deployment this turn. Two full rehearsals stillneed freshstart; originalrehearsal1 cannotblindfinish becausebasechanged. No needmoretokenchanges. User request currentturn was finishCIrepair; achieved.
