import si from 'systeminformation';
import type { BrowserWindow } from 'electron';

// ── 타입 동기화 주의 ────────────────────────────────────────────────────────
// 아래 타입들은 src/types/electron.d.ts의 동명 interface와 구조가 반드시 일치해야 함.
// tsconfig.electron.json의 rootDir:"electron" 제약으로 src/ import 불가 → 불가피한 중복.
// 필드 추가·변경 시 electron.d.ts도 함께 수정할 것.
// ─────────────────────────────────────────────────────────────────────────────

export interface CpuInfo {
  usage: number;
  temperature: number | null; // AMD/일부 OEM에서 null — UI에서 "측정 불가" 처리
}

export interface MemoryInfo {
  used: number;   // bytes
  total: number;  // bytes
}

export interface GpuInfo {
  model: string;
  vram: number;   // MB. 사용률·온도는 systeminformation으로 수집 불가
}

export interface DiskInfo {
  read: number;   // bytes/s
  write: number;  // bytes/s
}

export interface SystemSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpu: GpuInfo | null;
  disk: DiskInfo | null;
  biosType?: string;
}

// Phase 3: CPU 온도 포함 전체 스냅샷 수집
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [cpu, mem, graphics, disksIO, temp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.graphics(),
    si.disksIO().catch(() => null),
    si.cpuTemperature().catch(() => null),
  ]);

  // VRAM이 가장 큰 카드 선택 — 내장 GPU(컨트롤러[0])가 아닌 외장 GPU를 우선
  const gpuController = graphics.controllers.length > 0
    ? graphics.controllers.reduce((best, cur) =>
        (cur.vram ?? 0) > (best.vram ?? 0) ? cur : best
      )
    : null;

  return {
    cpu: {
      usage: Math.round(cpu.currentLoad),
      temperature: temp?.main ?? null, // null 전파 — UI에서 "측정 불가" 처리
    },
    memory: {
      used: mem.used,
      total: mem.total,
    },
    gpu: gpuController
      ? {
          model: gpuController.model,
          vram: gpuController.vram ?? 0,
          // 사용률·온도: systeminformation 한계로 수집 불가 → UI와 Gemini 프롬프트에 명시
        }
      : null,
    disk: disksIO
      ? { read: disksIO.rIO_sec ?? 0, write: disksIO.wIO_sec ?? 0 }
      : null,
  };
}

// Phase 3: 2초마다 전체 스냅샷 푸시. main.ts createWindow()에서 호출.
export function startMonitoring(win: BrowserWindow): () => void {
  const timer = setInterval(async () => {
    try {
      const snapshot = await getSystemSnapshot();
      win.webContents.send('system-update', snapshot);
    } catch {
      // 수집 실패 시 무시 — 다음 주기에 재시도
    }
  }, 2000);

  // cleanup 함수 반환 — win.on('closed') 에서 호출
  return () => clearInterval(timer);
}
