# Figma 디자인 시스템 규칙

> Figma MCP로 디자인을 가져올 때 이 규칙을 참조하여 코드로 변환합니다.

---

## 1. 토큰 정의 위치

| 파일 | 역할 |
|---|---|
| `src/styles/tokens.css` | CSS Custom Properties 전체 정의 (단일 진실 공급원) |
| `src/styles/animations.css` | `@keyframes diagPulse` 등 애니메이션 정의 |
| `src/styles/global.css` | 리셋 + body 기본 스타일 |

**토큰은 반드시 CSS Custom Property로만 사용합니다. 하드코딩 금지.**

```css
/* ✅ 올바른 사용 */
color: var(--color-accent);

/* ❌ 금지 */
color: #3182f6;
```

---

## 2. 색상 토큰

```css
:root {
  /* 배경 */
  --color-bg-base:    #ffffff;   /* 앱 전체 배경 */
  --color-bg-surface: #f9fafb;   /* 카드, 패널 */
  --color-bg-input:   #f2f4f6;   /* 입력창, 비활성 버튼 */

  /* 강조 */
  --color-accent:     #3182f6;   /* 주 강조색 (파랑) */
  --color-accent-dim: #1b64da;   /* hover 상태 */

  /* 신뢰도 */
  --color-conf-high:    #05c46b; /* 80%+ */
  --color-conf-high-bg: #f0fff8;
  --color-conf-mid:     #ff9f43; /* 60~79% */
  --color-conf-low:     #ff5e57; /* 60% 미만 */
  --color-conf-low-bg:  #fff4f4;

  /* 텍스트 */
  --color-text-primary: #191f28;
  --color-text-muted:   #4e5968;
  --color-text-hint:    #6b7684; /* WCAG AA 충족 */

  /* 테두리 */
  --color-border: #e5e8eb;
}
```

---

## 3. 타이포그래피

```css
:root {
  --font-sans: 'Pretendard', 'Noto Sans KR', sans-serif; /* UI 전반 */
  --font-mono: 'JetBrains Mono', monospace;               /* 수치, 코드 */
  --font-weight-regular: 400;
  --font-weight-bold: 700;
  --line-height-normal: 1.5;
}
```

**Figma 폰트 매핑:**
- Figma의 `Regular` → `font-weight: 400`
- Figma의 `Bold` / `SemiBold` → `font-weight: 700`
- 수치 표시 텍스트 → `font-family: var(--font-mono)`

---

## 4. 스페이싱

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
}
```

**Figma 스페이싱 → CSS 변수 매핑:**
- 4px 배수 → `--space-N` 사용
- 컴포넌트 내부 padding → `--space-4` (16px) 기본
- 섹션 간 간격 → `--space-6` ~ `--space-8`

---

## 5. Border Radius

```css
:root {
  --radius-sm:   8px;   /* 배지, 태그, 인풋 */
  --radius-md:   16px;  /* 카드, 패널 (기본) */
  --radius-lg:   24px;  /* bottom-sheet 상단 */
  --radius-pill: 999px; /* 버튼 pill 형태 */
}
```

---

## 6. 컴포넌트 스타일 패턴

### 스타일링 방식
- **CSS Modules** 사용 (`Component.module.css`)
- Tailwind **미사용**
- Styled Components **미사용**

```jsx
// ✅ 올바른 패턴
import styles from './HypothesisCard.module.css';
<div className={`${styles.card} ${styles.active}`} />

// ❌ 인라인 스타일 금지 (토큰 참조 불가)
<div style={{ color: '#3182f6' }} />
```

### 버튼

```css
.btnPrimary {
  background: var(--color-accent);
  color: #fff;
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-6);
  font-weight: var(--font-weight-bold);
  transition: background var(--transition-fast);
}
.btnPrimary:hover { background: var(--color-accent-dim); }

.btnSecondary {
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  border-radius: var(--radius-pill);
}
```

### 카드 (HypothesisCard)

```css
.card {
  background: var(--color-bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid transparent;
  box-shadow: 0 1px 8px rgba(0,0,0,0.08);
  transition: all var(--transition-base);
}
.card.active { border-left-color: var(--color-accent); }
.card.solved { background: var(--color-conf-high-bg); border-left-color: var(--color-conf-high); }
.card.failed { background: var(--color-conf-low-bg); border-left-color: var(--color-conf-low); opacity: 0.5; }
```

### 시스템 수치 (SystemStatusBar)

```css
.normal   { color: var(--color-text-primary); }
.warning  { color: var(--color-conf-mid); }
.critical { color: var(--color-conf-low); animation: diagPulse 1s infinite; }
```

---

## 7. 레이아웃 구조

### Electron (Desktop)

```css
.appShell {
  display: grid;
  grid-template-rows: 44px 1fr;
  height: 100vh;
}
/* 상단: SystemStatusBar (44px 고정) */
/* 하단: 메인 콘텐츠 영역 */
```

### PWA (Mobile)

```css
.appShell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
}
.cameraArea  { flex: 1; }
.bottomSheet {
  max-height: 55dvh;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: max(var(--space-6), env(safe-area-inset-bottom));
}
```

---

## 8. 아이콘

- 라이브러리: `lucide-react`
- Figma 아이콘 → lucide-react 아이콘명으로 매핑
- 크기: `16px` (인라인), `20px` (버튼), `24px` (독립 아이콘)

```jsx
import { AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
```

---

## 9. 애니메이션

```css
/* animations.css에서만 정의 — 인라인 <style> 태그 금지 */
@keyframes diagPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
```

```css
:root {
  --transition-fast: 0.15s ease;  /* 버튼 hover */
  --transition-base: 0.2s ease;   /* 카드 상태 전환 */
}
```

---

## 10. z-index 레이어

```css
:root {
  --z-statusbar: 50;  /* SystemStatusBar */
  --z-modal:    100;  /* QR 모달, 오버레이 */
}
```

---

## 11. Figma → 코드 변환 규칙

| Figma 속성 | 코드 변환 |
|---|---|
| Fill color | `var(--color-*)` CSS 변수로 교체 |
| Corner radius | `var(--radius-*)` 변수로 교체 |
| Auto layout gap | `gap: var(--space-N)` |
| Auto layout padding | `padding: var(--space-N)` |
| Text style | `font-family`, `font-weight` 변수 적용 |
| Shadow | `box-shadow: 0 1px 8px rgba(0,0,0,0.08)` |
| Opacity (disabled) | `opacity: 0.5` |

---

## 12. 컴포넌트 파일 위치

```
src/
├── styles/
│   ├── tokens.css         ← CSS 변수 단일 정의
│   ├── animations.css     ← @keyframes
│   └── global.css         ← 리셋 + body
├── components/
│   ├── desktop/           ← Electron 전용
│   ├── mobile/            ← PWA 전용
│   └── shared/            ← 공통 (DiagnosisResult 등)
```

---

## 13. 에셋

```
public/
├── pc-diagram.png         ← PC 부품 구조도 (SVG 오버레이용)
│                             preserveAspectRatio="xMidYMid meet" 필수
├── icons/icon-192.png
└── opencv.js              ← Service Worker precache 대상
```

**PCDiagram 부품 키:** `GPU` `CPU` `RAM` `SSD` `HDD` `CPU_COOLER` `MAINBOARD` `M2_SSD`
