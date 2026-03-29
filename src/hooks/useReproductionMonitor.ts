// useReproductionMonitor — SW 재현 모드 베이스라인 수집 & delta 계산 훅
// 베이스라인 수집 직후 CPU 90%+ / 메모리 95%+ 경고
// delta 임계값: CPU 5%p 이상 OR 메모리 200MB 이상 증가 → 재현 성공

import { useState, useCallback } from 'react';
import type { SystemSnapshot } from '../types/electron';
import type { SystemMetrics } from '../types';

// 재현 성공 임계값 (checklist 10-0-1)
const CPU_DELTA_THRESHOLD_PCT  = 5;    // CPU 5%p 이상 증가
const MEM_DELTA_THRESHOLD_MB   = 200;  // 메모리 200MB 이상 증가

export type ReproductionPhase =
  | 'idle'
  | 'collecting-baseline'
  | 'waiting-reproduction'
  | 'collecting-delta'
  | 'done';

interface ReproductionResult {
  success: boolean;            // delta 임계값 초과 여부
  baseline: SystemMetrics;
  delta: SystemMetrics;
}

interface UseReproductionMonitorReturn {
  phase: ReproductionPhase;
  baselineWarning: boolean;    // CPU 90%+ 또는 메모리 95%+ 경고
  result: ReproductionResult | null;
  collectBaseline: (snapshot: SystemSnapshot) => void;
  collectDelta: (snapshot: SystemSnapshot) => void;
  reset: () => void;
}

function toMetrics(snapshot: SystemSnapshot): SystemMetrics {
  return {
    cpuUsage: snapshot.cpu.usage,
    memoryUsed: snapshot.memory.used,
    memoryTotal: snapshot.memory.total,
  };
}

export function useReproductionMonitor(): UseReproductionMonitorReturn {
  const [phase, setPhase] = useState<ReproductionPhase>('idle');
  const [baseline, setBaseline] = useState<SystemMetrics | null>(null);
  const [baselineWarning, setBaselineWarning] = useState(false);
  const [result, setResult] = useState<ReproductionResult | null>(null);

  const collectBaseline = useCallback((snapshot: SystemSnapshot) => {
    setPhase('collecting-baseline');
    const metrics = toMetrics(snapshot);

    // checklist 10-1: 베이스라인 이상 상태 감지
    const memPct = (snapshot.memory.used / snapshot.memory.total) * 100;
    const isAbnormal = snapshot.cpu.usage >= 90 || memPct >= 95;
    setBaselineWarning(isAbnormal);

    setBaseline(metrics);
    setPhase('waiting-reproduction');
  }, []);

  const collectDelta = useCallback((snapshot: SystemSnapshot) => {
    if (!baseline) return;
    setPhase('collecting-delta');

    const current = toMetrics(snapshot);
    const cpuDeltaPct  = current.cpuUsage - baseline.cpuUsage;
    const memDeltaMB   = (current.memoryUsed - baseline.memoryUsed) / (1024 * 1024);

    const deltaMetrics: SystemMetrics = {
      ...current,
      cpuDeltaPct,
      memoryDeltaMB: memDeltaMB,
    };

    // checklist 10-0-1: 재현 성공 조건 — delta 임계값 초과
    const success =
      cpuDeltaPct >= CPU_DELTA_THRESHOLD_PCT ||
      memDeltaMB  >= MEM_DELTA_THRESHOLD_MB;

    setResult({ success, baseline, delta: deltaMetrics });
    setPhase('done');
  }, [baseline]);

  const reset = useCallback(() => {
    setPhase('idle');
    setBaseline(null);
    setBaselineWarning(false);
    setResult(null);
  }, []);

  return { phase, baselineWarning, result, collectBaseline, collectDelta, reset };
}
