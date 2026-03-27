import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom은 CSS를 처리하지 않으므로 모든 CSS import를 전역 mock 처리
// 각 테스트 파일에서 vi.mock('./styles/*.css') 를 반복 선언할 필요 없음
vi.mock('../styles/tokens.css', () => ({}));
vi.mock('../styles/global.css', () => ({}));
vi.mock('../styles/animations.css', () => ({}));
