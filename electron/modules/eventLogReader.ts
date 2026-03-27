import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── 타입 동기화 주의 ────────────────────────────────────────────────────────
// 아래 EventLog 타입은 src/types/electron.d.ts의 동명 interface와 구조가 반드시 일치해야 함.
// tsconfig.electron.json의 rootDir:"electron" 제약으로 src/ import 불가 → 불가피한 중복.
// 필드 추가·변경 시 electron.d.ts도 함께 수정할 것.
// ─────────────────────────────────────────────────────────────────────────────

export interface EventLog {
  timeCreated: string;     // ISO 8601
  id: number;
  levelDisplayName: string;
  message: string;
  providerName?: string;   // Application 로그에만 포함
}

// PowerShell ConvertTo-Json 출력 — PascalCase 키
interface RawEventEntry {
  TimeCreated: string | { value: number };
  Id: number;
  LevelDisplayName: string;
  Message: string;
  ProviderName?: string;
}

// ConvertTo-Json: 이벤트 1개 → 객체, 복수 → 배열. 정규화 필수.
function normalizeJson(raw: string): RawEventEntry[] {
  const parsed = JSON.parse(raw) as RawEventEntry | RawEventEntry[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

// PowerShell DateTime → ISO 8601 문자열 변환
// PS 5.1: /Date(epoch)/ 형식 또는 직렬화 문자열 → 최대한 파싱
function parseTimeCreated(value: string | { value: number }): string {
  if (typeof value === 'object' && value.value != null) {
    return new Date(value.value).toISOString();
  }
  // /Date(1234567890000)/ 형식 처리
  const match = String(value).match(/\/Date\((\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString();
  return String(value);
}

function toEventLog(raw: RawEventEntry): EventLog {
  return {
    timeCreated: parseTimeCreated(raw.TimeCreated),
    id: raw.Id,
    levelDisplayName: raw.LevelDisplayName,
    // 메시지는 멀티라인 + 매우 길 수 있음 → 첫 200자만 보관
    message: (raw.Message ?? '').slice(0, 200),
    ...(raw.ProviderName != null && { providerName: raw.ProviderName }),
  };
}

// Phase 4: Windows System 이벤트 로그에서 최근 에러/경고 수집
// execSync 대신 exec + Promise — Get-WinEvent 수집 시 메인 프로세스 블로킹 방지
// Level -le 2: Critical(1) + Error(2)
export async function getEventLogs(maxEvents = 30): Promise<EventLog[]> {
  // 비-Windows 환경(macOS 등)에서는 빈 배열 반환
  if (process.platform !== 'win32') return [];

  try {
    const ps = `Get-WinEvent -LogName System -MaxEvents ${maxEvents} | Where-Object { $_.Level -le 2 } | Select-Object TimeCreated, Id, LevelDisplayName, Message | ConvertTo-Json`;
    const { stdout } = await execAsync(
      `powershell -ExecutionPolicy Bypass -Command "${ps}"`,
      { encoding: 'utf8' },
    );
    if (!stdout.trim()) return [];
    return normalizeJson(stdout.trim()).map(toEventLog);
  } catch (e) {
    console.error('[eventLogReader] getEventLogs 실패:', e);
    return [];
  }
}
