/**
 * @file src/UI/index.js
 * @description มอดูลจัดการแสดงผลอินเทอร์เฟซผู้ใช้ (UI Module)
 */

export { LoadingScreen } from './LoadingScreen.js';
export { MainMenu } from './MainMenu.js';
export { LobbyScreen } from './LobbyScreen.js';
export { PlayerSelectScreen } from './PlayerSelectScreen.js';
export { PieceSelectScreen, TOKEN_COLORS } from './PieceSelectScreen.js';
export { GameBoardScreen } from './GameBoardScreen.js';
export { GameGuideModal } from './GameGuideModal.js';
export { DebugPanelModal } from './DebugPanelModal.js';

export const UIModule = {
  name: 'UIModule',
};
