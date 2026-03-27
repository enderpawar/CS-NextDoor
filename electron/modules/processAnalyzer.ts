import si from 'systeminformation';

// ── 타입 동기화 주의 ────────────────────────────────────────────────────────
// 아래 타입들은 src/types/electron.d.ts의 동명 interface와 구조가 반드시 일치해야 함.
// tsconfig.electron.json의 rootDir:"electron" 제약으로 src/ import 불가 → 불가피한 중복.
// 필드 추가·변경 시 electron.d.ts도 함께 수정할 것.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessSummary {
  name: string;
  pid: number;
  cpu: string;   // CPU 사용률 % (소수점 1자리 문자열)
  mem: string;   // 메모리 사용량 MB (정수 문자열)
}

export interface ProcessData {
  byCpu: ProcessSummary[];
  byMem: ProcessSummary[];
  total: number;
}

// Phase 4: CPU / 메모리 기준 상위 프로세스 수집
// systeminformation.processes() — 현 시점 스냅샷. 주기적 폴링은 renderer에서 담당.
export async function getTopProcesses(limit = 10): Promise<ProcessData> {
  const procs = await si.processes();

  const toSummary = (p: si.Systeminformation.ProcessesProcessData): ProcessSummary => ({
    name: p.name,
    pid: p.pid,
    cpu: p.cpu.toFixed(1),
    // mem: systeminformation processes().list[].mem 단위 = KB
    mem: (p.mem / 1024).toFixed(0),
  });

  const byCpu = [...procs.list]
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, limit)
    .map(toSummary);

  const byMem = [...procs.list]
    .sort((a, b) => b.mem - a.mem)
    .slice(0, limit)
    .map(toSummary);

  return { byCpu, byMem, total: procs.all };
}
