# 디자인 시스템 — NextDoor CS

> 토큰 요약: `.claude/rules/design-tokens.md`
> 테마: 라이트 (토스 스타일) — 흰 배경 + 파란 강조 + 넓은 여백 + 둥근 모서리
> 스타일링: CSS Modules + CSS Custom Properties
> 아이콘: lucide-react (tree-shakeable)

---

## 1. 토큰 정의

```css
/* src/styles/tokens.css */
:root {
  /* Backgrounds */
  --color-bg-base:      #ffffff;   /* 앱 배경 — 흰색 */
  --color-bg-surface:   #f9fafb;   /* 카드/패널 — 아주 연한 회색 */
  --color-bg-input:     #f2f4f6;   /* 입력창/비활성 버튼 — 연한 회색 */

  /* Accent */
  --color-accent:       #3182f6;   /* 파란색 */
  --color-accent-dim:   #1b64da;   /* 진한 파란색 (hover) */

  /* Confidence */
  --color-conf-high:    #05c46b;   /* 초록색     — 신뢰도 80%+ */
  --color-conf-high-bg: #f0fff8;   /* 연한 초록  — solved 카드 배경 */
  --color-conf-mid:     #ff9f43;   /* 주황색     — 신뢰도 60~79% */
  --color-conf-low:     #ff5e57;   /* 빨간색     — 신뢰도 <60% → 수리기사 배너 */
  --color-conf-low-bg:  #fff4f4;   /* 연한 빨강  — failed 카드 배경 */

  /* Text */
  --color-text-primary: #191f28;   /* 거의 검정 */
  --color-text-muted:   #4e5968;   /* 중간 회색 */
  --color-text-hint:    #6b7684;   /* 회색 — WCAG AA 대비 충족 (4.6:1) */
  --color-border:       #e5e8eb;   /* 아주 연한 회색 */

  /* Spacing (4px 기반) */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;

  /* Typography */
  --font-sans: 'Pretendard', 'Noto Sans KR', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-weight-regular: 400;
  --font-weight-bold:    700;
  --line-height-normal:  1.5;

  --text-xs: 12px;  --text-sm: 14px;  --text-md: 16px;
  --text-lg: 20px;  --text-xl: 24px;  --text-2xl: 32px;

  /* Radius */
  --radius-sm:   8px;    /* 배지, 태그 */
  --radius-md:   16px;   /* 카드, 버튼 */
  --radius-lg:   24px;   /* bottom-sheet 상단 */
  --radius-pill: 999px;  /* pill 버튼 */

  /* Shadow */
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
  --shadow-md: 0 2px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.10);

  /* Transition */
  --transition-fast: 0.15s ease;   /* 버튼 hover */
  --transition-base: 0.2s ease;    /* 카드 상태 전환 */

  /* Z-index */
  --z-statusbar: 50;
  --z-modal:     100;
}
```

```css
/* src/styles/animations.css */
@keyframes diagPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

---

## 2. 프로젝트 구조

```
src/
├── styles/
│   ├── tokens.css
│   ├── global.css
│   └── animations.css
└── components/
    ├── desktop/
    │   ├── SystemStatusBar/
    │   ├── HypothesisTracker/
    │   ├── ReproductionMode/
    │   └── QRDisplay/
    ├── mobile/
    │   ├── CameraView/
    │   ├── ShootingGuide/
    │   └── BiosTypeSelector/
    └── shared/
        ├── DiagnosisConfidence/
        ├── DiagnosisResult/
        ├── PCDiagram/
        └── SessionManager/
```

각 컴포넌트 폴더: `ComponentName.jsx` + `ComponentName.module.css`

---

## 3. 글로벌 스타일

```css
/* src/styles/global.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  font-size: var(--text-md);
  color: var(--color-text-primary);
  background: var(--color-bg-base);
  -webkit-font-smoothing: antialiased;
}

/* 최소 터치 타겟 48px (모바일 UX 기준) */
button, [role="button"] { min-height: 48px; cursor: pointer; }
```

---

## 4. 컴포넌트 스타일 스펙

### 버튼
```css
/* 토스 스타일: pill 형태, 굵은 폰트 */
.btnPrimary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0 var(--space-6);
  font-size: var(--text-md);
  font-weight: var(--font-weight-bold);
  min-height: 48px;
  transition: background var(--transition-fast);
}
.btnPrimary:hover { background: var(--color-accent-dim); }

.btnSecondary {
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: 0 var(--space-6);
  font-size: var(--text-md);
  font-weight: var(--font-weight-bold);
  min-height: 48px;
  transition: background var(--transition-fast);
}
```

### HypothesisCard
```css
/* 테두리 대신 shadow + border-left 강조 */
.card {
  background: var(--color-bg-base);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-4) var(--space-6);
  transition: box-shadow var(--transition-base);
  animation: fadeInUp 0.2s ease;
}
.card.active {
  border-left: 4px solid var(--color-accent);
}
.card.failed {
  opacity: 0.5;
  background: var(--color-conf-low-bg);
  border-left: 4px solid var(--color-conf-low);
}
.card.solved {
  background: var(--color-conf-high-bg);
  border-left: 4px solid var(--color-conf-high);
}
```

### DiagnosisConfidence (원형 게이지)
```css
.gauge      { transition: stroke 0.4s; stroke-linecap: round; }
.high       { stroke: var(--color-conf-high); }
.mid        { stroke: var(--color-conf-mid); }
.low        { stroke: var(--color-conf-low); }

/* 수리기사 배너 — confidence < 0.6 자동 표시 */
.repairBanner {
  background: var(--color-conf-low-bg);
  border: 1px solid var(--color-conf-low);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-conf-low);
}
```

### SystemStatusBar
```css
.bar {
  background: var(--color-bg-base);
  border-bottom: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 0 var(--space-6);
  display: flex; gap: var(--space-6); align-items: center;
  height: 44px;
}
.warning  { color: var(--color-conf-mid); font-weight: var(--font-weight-bold); }
.critical { color: var(--color-conf-low); font-weight: var(--font-weight-bold); animation: diagPulse 1s infinite; }
```

### PCDiagram SVG 오버레이
```css
/* 오류 부품: stroke --color-conf-low + diagPulse */
/* 경고 부품: stroke --color-conf-mid */
/* 라이트 테마에서 이미지 CSS filter 불필요 — 흰 배경 그대로 어울림 */
.diagramWrapper {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
```

---

## 5. 레이아웃

### Electron
```css
/* 사이드바 없음 — 상단 step bar로 단계 표시 */
.electronLayout {
  display: grid;
  grid-template-rows: 44px 1fr;
  grid-template-columns: 1fr;
  height: 100vh;
  background: var(--color-bg-surface);
}
.statusBar   { z-index: var(--z-statusbar); background: var(--color-bg-base); border-bottom: 1px solid var(--color-border); }
.mainContent { padding: var(--space-8); overflow-y: auto; }
```

### 진단 단계 인디케이터 (상단 step bar)
```css
/* 토스 스타일: 상단 선형 진행 바 */
.stepBar {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-base);
}
.step         { flex: 1; height: 4px; border-radius: var(--radius-pill); background: var(--color-bg-input); }
.step.done    { background: var(--color-accent); }
.step.current { background: var(--color-accent); opacity: 0.4; }
```

### PWA
```css
.pwaLayout {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #000;            /* 카메라 배경은 검정 유지 */
}
.cameraArea  { flex: 1; position: relative; overflow: hidden; }

/* bottom-sheet: 라이트 테마로 */
.bottomSheet {
  background: var(--color-bg-base);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
  padding: var(--space-6);
  padding-bottom: max(var(--space-6), env(safe-area-inset-bottom)); /* iPhone 홈바 대응 */
  max-height: 55dvh;
  overflow-y: auto;
  animation: slideUp 0.3s ease;
}
```

---

## 6. 아이콘

```bash
npm install lucide-react
```

```jsx
import { AlertTriangle, Cpu, HardDrive, Thermometer, Zap, Database } from 'lucide-react';

const PART_ICONS = {
  GPU:       <Zap size={16} />,
  CPU:       <Cpu size={16} />,
  RAM:       <Database size={16} />,
  STORAGE:   <HardDrive size={16} />,
  COOLING:   <Thermometer size={16} />,
  MAINBOARD: <AlertTriangle size={16} />,
};
```

---

## 7. PCDiagram 부품 좌표 (% 기준)

> 이미지: `public/pc-diagram.png`
> 라이트 테마: CSS filter 불필요, 이미지 그대로 사용
> SVG: `preserveAspectRatio="xMidYMid meet"` 필수 — `none` 사용 시 비율 변경으로 좌표 틀어짐
> `@keyframes diagPulse`는 `animations.css`에서 정의 — 컴포넌트 내 인라인 `<style>` 태그 금지
> 개발 중 좌표 조정: onClick에서 `((e.clientX - rect.left) / rect.width * 100).toFixed(1)` 출력

| 부품 키 | x | y | w | h |
|---|---|---|---|---|
| `CPU_COOLER` | 60 | 5  | 30 | 45 |
| `M2_SSD`     | 27 | 5  | 28 | 20 |
| `GPU`        | 5  | 60 | 72 | 35 |
| `CPU`        | 32 | 47 | 20 | 18 |
| `RAM`        | 12 | 20 | 15 | 40 |
| `SSD`        | 67 | 60 | 14 | 22 |
| `HDD`        | 82 | 55 | 14 | 30 |
| `MAINBOARD`  | 2  | 2  | 90 | 95 |

---

## 8. 반응형 방침

- **Electron**: 최소 1024px 고정, breakpoint 없음
- **PWA**: 320~430px 모바일 전용, `100dvh` 사용 (주소창 대응), 터치 타겟 최소 48px
- `useRuntimeMode()`로 Electron/PWA 분기 → 각 레이아웃 컴포넌트 조건부 렌더링
