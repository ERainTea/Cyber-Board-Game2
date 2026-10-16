/**
 * @file src/Engine/EventBus.js
 * @description ระบบ Event Bus กลางสำหรับสื่อสารระหว่าง Game Logic, UI, Animation และ Audio (Phase 17)
 * รองรับการกระจาย Event แบบ Decoupled เพื่อเตรียมพร้อมสำหรับ Multiplayer
 */

export const GAME_EVENTS = {
  GAME_STARTED: 'GameStarted',
  DICE_ROLLED: 'DiceRolled',
  PLAYER_MOVED: 'PlayerMoved',
  CARD_DRAWN: 'CardDrawn',
  PLAYER_SKIPPED: 'PlayerSkipped',
  TURN_CHANGED: 'TurnChanged',
  PLAYER_WON: 'PlayerWon',
  GAME_ENDED: 'GameEnded',
  STATE_RESTORED: 'StateRestored',
};

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.events = new Map();
  }

  /**
   * ลงทะเบียนรับฟัง Event
   * @param {string} eventName - ชื่อ Event (จาก GAME_EVENTS)
   * @param {Function} callback - ฟังก์ชัน Callback
   * @returns {Function} ฟังก์ชัน Unsubscribe สำหรับยกเลิกการฟัง
   */
  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    this.events.get(eventName).add(callback);

    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * ยกเลิกการรับฟัง Event
   * @param {string} eventName - ชื่อ Event
   * @param {Function} callback - ฟังก์ชัน Callback
   */
  off(eventName, callback) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).delete(callback);
    }
  }

  /**
   * ส่งกระจาย Event พร้อม payload ข้อมูล
   * @param {string} eventName - ชื่อ Event
   * @param {Object} [payload={}] - ข้อมูลประกอบ Event
   */
  emit(eventName, payload = {}) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`[EventBus] Error in listener for event '${eventName}':`, error);
        }
      });
    }
  }

  /**
   * ล้าง Event Listeners ทั้งหมด
   */
  clearAll() {
    this.events.clear();
  }
}

export const eventBus = new EventBus();

if (typeof window !== 'undefined') {
  window.eventBus = eventBus;
}
