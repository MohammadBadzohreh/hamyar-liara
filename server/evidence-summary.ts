// Keep current HTTP evidence before bounded historical logs. Never truncate serialized JSON.
export function summarizeEvidence(e: any) {
  const rows: any[] = [];
  for (const stream of e.logs?.value?.data || []) {
    for (const pair of stream.values || []) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      let line = String(pair[1]);
      try { line = JSON.parse(line)._entry ?? line; } catch {}
      rows.push({ time: String(pair[0]), releaseId: stream.metaData?.releaseId, line: String(line).slice(0, 1600) });
    }
  }
  rows.sort((a, b) => b.time.localeCompare(a.time));
  let requestId: string | undefined;
  try { requestId = JSON.parse(e.http?.body).requestId; } catch {}
  const prioritized = requestId
    ? [...rows.filter(r => r.line.includes(requestId!)), ...rows.filter(r => !r.line.includes(requestId!))]
    : rows;
  const series = (v: any) => ({ available: v?.available === true,
    error: v?.error,
    series: (v?.value?.result || []).slice(0, 4).map((r: any) => ({ values: (r.values || []).slice(-12) })),
  });
  return {
    http: e.http, httpSamples: e.httpSamples, units: e.units || { cpu: 'unknown', memory: 'unknown' },
    comparison: e.comparison,
    logs: { available: e.logs?.available === true, rows: prioritized.slice(0, 16), omitted: Math.max(0, rows.length - 16) },
    cpu: series(e.cpu), memory: series(e.memory),
    events: { available: e.events?.available === true, items: (e.events?.value?.data || []).slice(-8) },
    releases: { current: e.releases?.value?.currentRelease,
      items: (e.releases?.value?.releases || []).slice(0, 5).map((r: any) => ({ id: r._id, state: r.state, createdAt: r.createdAt })) },
  };
}
