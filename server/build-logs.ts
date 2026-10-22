import {liara} from './liara.ts';
export async function remainingBuildLogs(releaseID: string, since: string) {
  const output: any[] = [];
  let cursor=since;
  // Terminal state may arrive while error output is still on the next page.
  for(let page=0;page<8;page++){
    const data=await liara(`/v2/releases/${encodeURIComponent(releaseID)}/build-logs${cursor?'?since='+encodeURIComponent(cursor):''}`);
    const rows=Array.isArray(data.buildOutput)?data.buildOutput:[];
    if(!rows.length)break;
    output.push(...rows);const next=rows.at(-1)?.createdAt;
    if(!next||next===cursor)break;cursor=next;
  }
  return output.slice(-100);
}
