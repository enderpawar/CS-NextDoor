import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemDashboard from './SystemDashboard';
import type { SystemSnapshot } from '../../types/electron';

// useSystemInfo를 mock으로 대체
vi.mock('../../hooks/useSystemInfo');
import { useSystemInfo } from '../../hooks/useSystemInfo';
const mockUseSystemInfo = vi.mocked(useSystemInfo);

const BASE: SystemSnapshot = {
  cpu: { usage: 42, temperature: 55 },
  memory: { used: 8_589_934_592, total: 17_179_869_184 }, // 8 / 16 GB
  gpu: { model: 'NVIDIA RTX 4070', vram: 12288 },
  disk: { read: 1024, write: 512 },
};

describe('SystemDashboard', () => {
  beforeEach(() => mockUseSystemInfo.mockReturnValue(null));

  it('데이터 로딩 중 스켈레톤 표시', () => {
    render(<SystemDashboard />);
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('CPU 사용률 표시', () => {
    mockUseSystemInfo.mockReturnValue(BASE);
    render(<SystemDashboard />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('CPU 온도 표시', () => {
    mockUseSystemInfo.mockReturnValue(BASE);
    render(<SystemDashboard />);
    expect(screen.getByText(/55°C/)).toBeInTheDocument();
  });

  it('CPU 온도 null → "측정 불가" 표시', () => {
    mockUseSystemInfo.mockReturnValue({
      ...BASE,
      cpu: { usage: 30, temperature: null },
    });
    render(<SystemDashboard />);
    expect(screen.getByText('측정 불가')).toBeInTheDocument();
  });

  it('메모리 used / total GB 표시', () => {
    mockUseSystemInfo.mockReturnValue(BASE);
    render(<SystemDashboard />);
    expect(screen.getByText(/8\.0/)).toBeInTheDocument();
    expect(screen.getByText(/16\.0 GB/)).toBeInTheDocument();
  });

  it('GPU 모델명 + VRAM 표시', () => {
    mockUseSystemInfo.mockReturnValue(BASE);
    render(<SystemDashboard />);
    expect(screen.getByText('NVIDIA RTX 4070')).toBeInTheDocument();
    expect(screen.getByText(/12288 MB/)).toBeInTheDocument();
  });

  it('GPU 없으면 "GPU 정보 없음" 표시', () => {
    mockUseSystemInfo.mockReturnValue({ ...BASE, gpu: null });
    render(<SystemDashboard />);
    expect(screen.getByText('GPU 정보 없음')).toBeInTheDocument();
  });

  it('GPU 사용률·온도 수집 불가 안내 표시', () => {
    mockUseSystemInfo.mockReturnValue(BASE);
    render(<SystemDashboard />);
    expect(screen.getByText('사용률·온도 수집 불가')).toBeInTheDocument();
  });
});
