/**
 * @file src/main.js
 * @description จุดเริ่มต้นหลักของแอปพลิเคชัน (Main Entry Point)
 */

// ดักจับและละเว้นข้อผิดพลาด Benign WebSocket HMR จาก Vite
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && (
    event.reason.toString().includes('WebSocket closed without opened') ||
    event.reason.toString().includes('failed to connect to websocket')
  )) {
    event.preventDefault();
    console.warn('[HMR] ละเว้นข้อผิดพลาด WebSocket Benign:', event.reason);
  }
});

import { CONFIG } from './Config.js';
import { gameStateStore } from './GameState.js';
import { gameEngine } from './Engine/GameEngine.js';
import { soundManager } from './Audio/SoundManager.js';
import { LoadingScreen, MainMenu, LobbyScreen, PlayerSelectScreen, PieceSelectScreen, GameBoardScreen } from './UI/index.js';

let mainMenuInstance = null;
let lobbyInstance = null;
let playerSelectInstance = null;
let pieceSelectInstance = null;
let gameBoardInstance = null;

/**
 * ฟังก์ชันเริ่มต้นสำหรับโหลดมอดูลและโครงสร้างพื้นฐานของโปรเจกต์
 */
function initApp() {
  console.log(`[Phase 15] เริ่มต้นระบบ ${CONFIG.GAME_TITLE} v${CONFIG.VERSION}`);

  const appRoot = document.getElementById('app-root');
  if (!appRoot) {
    console.error('ไม่พบ #app-root ใน index.html');
    return;
  }

  // ตัวรับฟังการคลิกปุ่มทุกปุ่มทั่วทั้งแอปเพื่อเล่นเสียง click
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .menu-btn, .btn-action, .color-chip-btn, .player-option-card, .btn-close-modal, .card-modal-confirm-btn, .header-btn');
    if (btn) {
      soundManager.play('click');
    }
  });

  // เริ่มทำงาน GameEngine โครงหลัก
  gameEngine.init();

  // สร้างและแสดงหน้าจอ Loading Screen ก่อนเริ่มเกม
  gameStateStore.setState({ phase: 'LOADING' });

  const loadingScreen = new LoadingScreen(appRoot, () => {
    // เมื่อโหลด Asset สำเร็จ ให้เปลี่ยน phase เข้าสู่ MAIN_MENU
    gameStateStore.setState({ phase: 'MAIN_MENU' });
  });

  loadingScreen.render();

  let currentPhase = null;

  const IN_GAME_PHASES = [
    'IN_GAME',
    'READY_TO_ROLL',
    'ROLLING',
    'MOVE',
    'DRAW_CARD',
    'DETERMINE_ORDER',
    'PLAYING',
    'END_TURN',
    'BUY_ASSET',
    'PAY_RENT',
    'BANKRUPT',
    'GAME_OVER'
  ];

  function isGamePhase(state) {
    if (!state) return false;
    return Boolean(state.isGameStarted || IN_GAME_PHASES.includes(state.phase));
  }

  // ลงทะเบียนรับฟังความเปลี่ยนแปลงของ GameState
  gameStateStore.subscribe((state) => {
    console.log('[GameState] สถานะปัจจุบัน:', state.phase, '| isGameStarted:', state.isGameStarted);

    const inGame = isGamePhase(state);
    const effectivePhase = inGame ? 'IN_GAME' : state.phase;

    if (effectivePhase === currentPhase) {
      return;
    }
    currentPhase = effectivePhase;

    if (!inGame && state.phase !== 'MULTIPLAYER_LOBBY' && lobbyInstance) {
      lobbyInstance.destroy();
      lobbyInstance = null;
    }

    if (!inGame && gameBoardInstance) {
      gameBoardInstance.destroy();
      gameBoardInstance = null;
    }

    if (state.phase === 'MAIN_MENU') {
      soundManager.playBGM('menu');
      mainMenuInstance = new MainMenu(appRoot);
      mainMenuInstance.render();
    } else if (state.phase === 'MULTIPLAYER_LOBBY' && !inGame) {
      soundManager.playBGM('menu');
      lobbyInstance = new LobbyScreen(appRoot, () => {
        gameStateStore.setState({ phase: 'MAIN_MENU' });
      });
      lobbyInstance.initNetwork();
      lobbyInstance.render();
    } else if (state.phase === 'PLAYER_SELECT') {
      soundManager.playBGM('menu');
      playerSelectInstance = new PlayerSelectScreen(appRoot, () => {
        gameStateStore.setState({ phase: 'MAIN_MENU' });
      });
      playerSelectInstance.render();
    } else if (state.phase === 'PIECE_SELECT') {
      soundManager.playBGM('menu');
      pieceSelectInstance = new PieceSelectScreen(appRoot, () => {
        gameStateStore.setState({ phase: 'PLAYER_SELECT' });
      });
      pieceSelectInstance.render();
    } else if (inGame) {
      if (lobbyInstance) {
        lobbyInstance.destroy();
        lobbyInstance = null;
      }
      soundManager.playBGM('game');
      gameBoardInstance = new GameBoardScreen(appRoot, () => {
        gameStateStore.setState({ phase: 'MAIN_MENU', isGameStarted: false });
      });
      gameBoardInstance.render();
    }
  });
}

/**
 * แสดงผลหน้าจอกระดานเกมเบื้องต้นเมื่อเริ่มเกม
 * @param {HTMLElement} appRoot - Root element
 */
function renderGamePlaceholder(appRoot) {
  appRoot.innerHTML = `
    <div style="min-height: 100vh; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center;">
      <h2 style="color: #fbbf24; font-size: 2rem; margin-bottom: 1rem;">🎲 เข้าสู่ Cyber Board Game</h2>
      <p style="color: #94a3b8; max-width: 500px; margin-bottom: 2rem; line-height: 1.6;">
        หน้าจอกระดานเกมพร้อมสำหรับโครงสร้างใน Phase ถัดไป
      </p>
      <button id="btn-back-to-menu" class="btn-cancel-exit" style="padding: 0.75rem 1.5rem; cursor: pointer;">
        ⬅ กลับสู่เมนูหลัก
      </button>
    </div>
  `;

  const btnBack = document.getElementById('btn-back-to-menu');
  if (btnBack) {
    btnBack.onclick = () => {
      gameStateStore.setState({ phase: 'MAIN_MENU' });
    };
  }
}

// เรียกทำงานเมื่อ DOM พร้อมใช้งาน
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
