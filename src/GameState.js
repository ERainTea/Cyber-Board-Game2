/**
 * @file src/GameState.js
 * @description ตัวจัดการ GameState กลางเพียงตัวเดียว (Single Source of Truth)
 * ออกแบบเพื่อรองรับ Multiplayer ในอนาคต
 */

/**
 * โครงสร้าง GameState หลัก
 * @typedef {Object} GameStateData
 * @property {string} roomId - รหัสห้องเกม
 * @property {number} turnNumber - รอบการเล่นปัจจุบัน
 * @property {number} activePlayerIndex - ลำดับผู้เล่นที่กำลังเล่นอยู่
 * @property {string} phase - สถานะขั้นตอนในเกม
 * @property {Array} players - ข้อมูลผู้เล่นทั้งหมด
 * @property {Array} board - ข้อมูลช่องบนกระดาน
 * @property {Object|null} lastDiceResult - ผลการทอดลูกเต๋าล่าสุด
 * @property {Array} logs - ประวัติเหตุการณ์
 */

class GameStateStore {
  constructor() {
    /** @type {GameStateData} */
    this.state = {
      roomId: 'ROOM_LOCAL',
      turnNumber: 1,
      activePlayerIndex: 0,
      phase: 'INIT',
      players: [],
      board: [],
      lastDiceResult: null,
      logs: [],
      orderMode: 'RANDOM', // 'RANDOM' | 'DICE'
      finishMode: 'FIRST_REACH', // 'FIRST_REACH' | 'EXACT_ROLL'
    };

    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  /**
   * ดึงข้อมูล State ปัจจุบัน
   * @returns {GameStateData} ข้อมูล GameState
   */
  getState() {
    return this.state;
  }

  /**
   * อัปเดต State กลางเพียงตัวเดียว
   * @param {Partial<GameStateData>} partialState - ข้อมูล State ใหม่บางส่วน
   */
  setState(partialState) {
    this.state = {
      ...this.state,
      ...partialState,
    };
    this.notify();
  }

  /**
   * ลงทะเบียนรับแจ้งเตือนเมื่อ State มีการเปลี่ยนแปลง
   * @param {Function} listener - ฟังก์ชัน Subscriber
   * @returns {Function} ฟังก์ชันสำหรับยกเลิกการลงทะเบียน
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * ส่งออก GameState ปัจจุบันเป็นข้อความ JSON (Export JSON Serialization)
   * @returns {string} ข้อความ JSON ของ GameState
   */
  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * นำเข้า GameState จากข้อความ JSON (Import JSON Serialization)
   * @param {string} jsonString - ข้อความ JSON ของ GameState
   * @returns {boolean} สำเร็จหรือไม่
   */
  importJSON(jsonString) {
    try {
      const parsedState = JSON.parse(jsonString);
      if (parsedState && typeof parsedState === 'object') {
        this.state = { ...parsedState };
        this.notify();
        return true;
      }
    } catch (e) {
      console.error('[GameStateStore] Error parsing JSON state:', e);
    }
    return false;
  }

  /**
   * กู้คืน State เต็มรูปแบบ
   * @param {GameStateData} snapshotState 
   */
  restoreGameState(snapshotState) {
    if (snapshotState && typeof snapshotState === 'object') {
      this.state = { ...snapshotState };
      this.notify();
    }
  }

  /**
   * รีเซ็ต State กลับสู่ค่าเริ่มต้น
   */
  resetState() {
    this.state = {
      roomId: 'ROOM_LOCAL',
      turnNumber: 1,
      activePlayerIndex: 0,
      phase: 'INIT',
      players: [],
      board: [],
      lastDiceResult: null,
      logs: [],
      orderMode: 'RANDOM',
      finishMode: 'FIRST_REACH',
    };
    this.notify();
  }

  /**
   * แจ้งเตือน Subscriber ทั้งหมด
   * @private
   */
  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const gameStateStore = new GameStateStore();
