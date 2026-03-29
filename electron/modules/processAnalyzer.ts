import si from 'systeminformation';
import { cpus as osCpus } from 'os';

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
// processes().list[].mem 단위 = 전체 메모리 대비 % (0~100).
// 절대 MB = (mem% / 100) × totalMemMB
// totalMB 캐시: si.mem()을 매 호출마다 병렬 실행하면 si.processes() CPU 샘플링을 방해함 →
// 첫 호출 시 1회만 가져오고 이후 재사용 (총 메모리는 자주 바뀌지 않음)
let cachedTotalMB: number | null = null;

export async function getTopProcesses(limit = 10): Promise<ProcessData> {
  if (cachedTotalMB === null) {
    const memInfo = await si.mem();
    cachedTotalMB = memInfo.total / 1024 / 1024; // bytes → MB
  }
  const totalMB = cachedTotalMB;

  // si.processes().cpu는 이전 호출과의 delta로 계산됨.
  // 첫 호출 시 기준값이 없어 전부 0 반환 → 500ms 후 재샘플링으로 실제 값 획득.
  await si.processes(); // 워밍업 — 기준값 수집
  await new Promise(resolve => setTimeout(resolve, 500));
  const procs = await si.processes();

  // null/undefined 방어: 커널 프로세스(System Idle 등)는 mem/cpu가 null/undefined일 수 있음
  // sort에서 NaN 발생 시 정렬 순서가 깨짐 → ?? 0 으로 안전 처리
  const safeMem = (p: si.Systeminformation.ProcessesProcessData) => p.mem ?? 0;
  const safeCpu = (p: si.Systeminformation.ProcessesProcessData) => p.cpu ?? 0;

  // si.processes().cpu = 단일 코어 기준 % → 전체 CPU % 로 정규화
  // 예) 24코어 시스템에서 System Idle 187% → 187/24 ≈ 7.8%
  const cpuCount = osCpus().length;

  const toSummary = (p: si.Systeminformation.ProcessesProcessData): ProcessSummary => ({
    name: p.name,
    pid: p.pid,
    cpu: (safeCpu(p) / cpuCount).toFixed(1), // 단일코어% → 전체CPU%
    mem: ((safeMem(p) / 100) * totalMB).toFixed(0), // % → 절대 MB
  });

  const byCpu = [...procs.list]
    .sort((a, b) => safeCpu(b) - safeCpu(a))
    .slice(0, limit)
    .map(toSummary);

  const byMem = [...procs.list]
    .sort((a, b) => safeMem(b) - safeMem(a))
    .slice(0, limit)
    .map(toSummary);

  return { byCpu, byMem, total: procs.all };
}
