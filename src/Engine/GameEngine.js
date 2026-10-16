/**
 * @file src/Engine/GameEngine.js
 * @description โครงสร้างหลักของ Game Engine
 */

import { gameStateStore } from '../GameState.js';

export class GameEngine {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * เริ่มการตั้งค่าโครงสร้างเครื่องมือ Game Engine
   */
  init() {
    this.isInitialized = true;
    gameStateStore.setState({ phase: 'READY' });
  }

  /**
   * ลูปประมวลผลหลักของ Engine
   */
  update() {
    // โครงสร้างสำหรับระบบลูปในอนาคต
  }
}

export const gameEngine = new GameEngine();
