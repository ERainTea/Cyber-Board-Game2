/**
 * @file src/game/Storage.ts
 * @description ระบบจัดการการบันทึกข้อมูลเกมและการตั้งค่าใน LocalStorage
 */

import { GameSettings, GameState } from './types';

const STORAGE_KEYS = {
  SETTINGS: 'thai_board_game_settings_v1',
  SAVED_GAME: 'thai_board_game_save_v1',
};

/** การตั้งค่าเริ่มต้นของเกม */
export const DEFAULT_SETTINGS: GameSettings = {
  soundVolume: 0.8,
  musicVolume: 0.4,
  gameSpeed: 'NORMAL',
  startingCash: 15000,
  passGoSalary: 2000,
  maxDoublesCount: 3,
};

/**
 * บันทึกการตั้งค่าเกม
 * @param settings การตั้งค่าที่ต้องการบันทึก
 */
export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error('ไม่สามารถบันทึกการตั้งค่าได้:', error);
  }
}

/**
 * โหลดการตั้งค่าเกม
 * @returns GameSettings
 */
export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (error) {
    console.error('ไม่สามารถโหลดการตั้งค่าได้:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * บันทึก GameState ปัจจุบันเพื่อเล่นต่อภายหลัง
 * @param state สถานะเกมปัจจุบัน
 */
export function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_GAME, JSON.stringify(state));
  } catch (error) {
    console.error('ไม่สามารถบันทึกสถานะเกมได้:', error);
  }
}

/**
 * โหลด GameState ที่เก็บบันทึกไว้
 * @returns GameState | null
 */
export function loadGameState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_GAME);
    if (raw) {
      return JSON.parse(raw) as GameState;
    }
  } catch (error) {
    console.error('ไม่สามารถโหลดสถานะเกมที่บันทึกไว้ได้:', error);
  }
  return null;
}

/** ลบเกมที่เซฟไว้ */
export function clearSavedGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SAVED_GAME);
  } catch (error) {
    console.error('ไม่สามารถลบเซฟได้:', error);
  }
}
