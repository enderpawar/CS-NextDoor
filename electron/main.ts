import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { getSystemSnapshot } from './modules/systemMonitor';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // TS 빌드 후 .js 출력
      contextIsolation: true,  // 보안: 필수
      nodeIntegration: false,  // 보안: 필수
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  win.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../dist/index.html')}`,
  );

  // Phase 2: 2초마다 시스템 스냅샷 푸시 — Phase 3에서 CPU 온도 포함으로 확장
  const timer = setInterval(async () => {
    try {
      const snapshot = await getSystemSnapshot();
      win.webContents.send('system-update', snapshot);
    } catch {
      // 수집 실패 시 무시 — 다음 주기에 재시도
    }
  }, 2000);

  win.on('closed', () => clearInterval(timer));
}

// Phase 2: 1회성 조회
ipcMain.handle('get-system-info', () => getSystemSnapshot());

// Phase 4: 이벤트 로그 조회 (스텁 — Phase 4에서 eventLogReader.ts로 구현)
ipcMain.handle('get-event-logs', async () => []);

// Phase 11: 세션 ID 조회 (스텁 — Phase 11에서 SessionController 연동)
ipcMain.handle('get-session-id', async () => null);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
