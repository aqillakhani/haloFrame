#!/usr/bin/env node
// scripts/codemagic-probe.mjs
//
// Reusable Codemagic helper. Reads CODEMAGIC_API_TOKEN from
// .env.codemagic.local (gitignored). Uses the v1 REST API.
//
// Subcommands:
//   list                          — list 10 most recent builds for this app
//   status [buildId]              — show build summary (defaults to newest)
//   log <buildId>                 — fetch combined log for all steps of a build
//   step-log <buildId> <stepId>   — fetch log of a single step
//   trigger <tag-or-branch>       — trigger ios-testflight workflow at a ref
//   poll [buildId]                — poll status every 30s until terminal
//
// Examples:
//   node scripts/codemagic-probe.mjs status
//   node scripts/codemagic-probe.mjs trigger v1.0.0-rc3
//   node scripts/codemagic-probe.mjs poll 6a021d98...
//   node scripts/codemagic-probe.mjs log 6a021d98...

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_FILE = join(ROOT, '.env.codemagic.local');
const APP_ID = '69f50db033172bbb569e2285';
const WORKFLOW_ID = 'ios-testflight';
const API = 'https://api.codemagic.io';
const TERMINAL_STATUSES = new Set(['finished', 'failed', 'canceled', 'timeout', 'skipped']);

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

function token() {
  const env = loadEnv(ENV_FILE);
  const t = env.CODEMAGIC_API_TOKEN;
  if (!t) {
    throw new Error(`CODEMAGIC_API_TOKEN not found in ${ENV_FILE}`);
  }
  return t;
}

async function api(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const r = await fetch(url, {
    ...init,
    headers: {
      'x-auth-token': token(),
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status} on ${url}\n${txt.slice(0, 500)}`);
  }
  return r;
}

async function apiJson(path, init) {
  const r = await api(path, init);
  return r.json();
}

async function apiText(path, init) {
  const r = await api(path, init);
  return r.text();
}

function fmtBuild(b) {
  return [
    `  id=${b._id}`,
    `status=${b.status}`,
    `tag=${b.tag || '-'}`,
    `branch=${b.branch || '-'}`,
    `commit=${(b.commit?.hash || '-').slice(0, 10)}`,
    `started=${b.startedAt || 'queued'}`,
  ].join('  ');
}

async function cmdList() {
  const j = await apiJson(`/builds?appId=${APP_ID}`);
  const builds = (j.builds || []).slice(0, 10);
  console.log(`Recent builds for app ${APP_ID} (${builds.length}):`);
  for (const b of builds) console.log(fmtBuild(b));
}

async function cmdStatus(buildId) {
  if (!buildId) {
    const j = await apiJson(`/builds?appId=${APP_ID}`);
    buildId = j.builds?.[0]?._id;
    if (!buildId) {
      console.log('No builds found.');
      return;
    }
  }
  const j = await apiJson(`/builds/${buildId}`);
  const b = j.build || j;
  console.log(`Build ${b._id}`);
  console.log(`  workflow:   ${b.config?.name || '-'}`);
  console.log(`  status:     ${b.status}`);
  console.log(`  tag:        ${b.tag || '-'}`);
  console.log(`  branch:     ${b.branch || '-'}`);
  console.log(`  commit:     ${b.commit?.hash || '-'}`);
  console.log(`  commitMsg:  ${(b.commit?.commitMessage || '-').split('\n')[0].slice(0, 80)}`);
  console.log(`  startedAt:  ${b.startedAt || 'queued'}`);
  console.log(`  finishedAt: ${b.finishedAt || '-'}`);
  console.log(`  steps:`);
  for (const a of b.buildActions || []) {
    const dur = a.startedAt && a.finishedAt
      ? `${Math.round((Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000)}s`
      : (a.startedAt ? 'running' : 'queued');
    console.log(`    ${(a.status || 'pending').padEnd(8)}  ${dur.padEnd(10)}  ${a.name}`);
  }
  return b;
}

async function cmdLog(buildId) {
  if (!buildId) throw new Error('Usage: log <buildId>');
  const j = await apiJson(`/builds/${buildId}`);
  const b = j.build || j;
  for (const a of b.buildActions || []) {
    console.log(`\n========== ${a.name} (${a.status}) ==========`);
    if (a.logUrl) {
      try {
        const txt = await apiText(a.logUrl);
        console.log(txt);
      } catch (e) {
        console.log(`(could not fetch log: ${e.message})`);
      }
    } else {
      // Some steps store output inside subactions
      for (const sub of a.subactions || []) {
        if (sub.command) console.log(`$ ${sub.command.split('\n')[0]}`);
        if (sub.output) console.log(sub.output);
      }
    }
  }
}

async function cmdStepLog(buildId, stepId) {
  if (!buildId || !stepId) throw new Error('Usage: step-log <buildId> <stepId>');
  const txt = await apiText(`/builds/${buildId}/step/${stepId}`);
  console.log(txt);
}

async function cmdTrigger(ref, workflow) {
  if (!ref) throw new Error('Usage: trigger <tag-or-branch> [workflowId]');
  const wf = workflow || WORKFLOW_ID;
  // Heuristic: ref starting with `v` and containing a digit = tag; else = branch.
  const isTag = /^v\d/.test(ref);
  const body = {
    appId: APP_ID,
    workflowId: wf,
    ...(isTag ? { tag: ref } : { branch: ref }),
  };
  console.log(`Triggering ${wf} on ${isTag ? 'tag' : 'branch'} ${ref}...`);
  const j = await apiJson('/builds', { method: 'POST', body: JSON.stringify(body) });
  console.log(`Triggered build: ${j.buildId}`);
  console.log(`Dashboard: https://codemagic.io/app/${APP_ID}/build/${j.buildId}`);
  return j.buildId;
}

async function cmdPoll(buildId) {
  if (!buildId) {
    const j = await apiJson(`/builds?appId=${APP_ID}`);
    buildId = j.builds?.[0]?._id;
  }
  console.log(`Polling build ${buildId} every 30s...`);
  let last = '';
  for (;;) {
    const b = await cmdStatus(buildId);
    if (b && TERMINAL_STATUSES.has(b.status)) {
      console.log(`\nTerminal status: ${b.status}`);
      return;
    }
    const summary = `${b?.status} · ${(b?.buildActions || []).filter(a => a.status === 'success').length} step(s) done`;
    if (summary !== last) {
      console.log(`[${new Date().toISOString()}] ${summary}`);
      last = summary;
    }
    await sleep(30_000);
  }
}

const [cmd, ...args] = process.argv.slice(2);
const dispatch = {
  list: cmdList,
  status: cmdStatus,
  log: cmdLog,
  'step-log': cmdStepLog,
  trigger: cmdTrigger,
  poll: cmdPoll,
};
const fn = dispatch[cmd];
if (!fn) {
  console.error(`Unknown subcommand: ${cmd || '(none)'}\n`);
  console.error('Subcommands: list | status [buildId] | log <buildId> | step-log <buildId> <stepId> | trigger <ref> | poll [buildId]');
  process.exit(2);
}
fn(...args).catch((e) => { console.error(e.message); process.exit(1); });
