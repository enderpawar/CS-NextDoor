import si from 'systeminformation';

// ── 타입 동기화 주의 ────────────────────────────────────────────────────────
// 아래 타입들은 src/types/electron.d.ts의 동명 interface와 구조가 반드시 일치해야 함.
// tsconfig.electron.json의 rootDir:"electron" 제약으로 src/ import 불가 → 불가피한 중복.
// 필드 추가·변경 시 electron.d.ts도 함께 수정할 것.
// ─────────────────────────────────────────────────────────────────────────────

export interface CpuInfo {
  usage: number;
  temperature: number | null;
}

export interface MemoryInfo {
  used: number;
  total: number;
}

export interface GpuInfo {
  model: string;
  vram: number;
}

export interface DiskInfo {
  read: number;
  write: number;
}

export interface SystemSnapshot {
  cpu: CpuInfo;
  memory: MemoryInfo;
  gpu: GpuInfo | null;
  disk: DiskInfo | null;
  biosType?: string;
}

// Phase 2: 기본 스냅샷 수집 — Phase 3에서 실시간 모니터링 + CPU 온도로 확장
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [cpu, mem, graphics, disksIO] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.graphics(),
    si.disksIO().catch(() => null),
  ]);

  const gpuController = graphics.controllers[0] ?? null;

  return {
    cpu: {
      usage: Math.round(cpu.currentLoad),
      temperature: null, // Phase 3에서 si.cpuTemperature()로 채움
    },
    memory: {
      used: mem.used,
      total: mem.total,
    },
    gpu: gpuController
      ? {
          model: gpuController.model,
          vram: gpuController.vram ?? 0,
        }
      : null,
    disk: disksIO
      ? { read: disksIO.rIO_sec ?? 0, write: disksIO.wIO_sec ?? 0 }
      : null,
  };
}
