/**
 * @file src/Network/SyncManager.js
 * @description มอดูลจัดการ State Synchronization & Anti-Cheat (Phase 18)
 * ยึดหลัก Server Authority (Server เป็นผู้กำหนดผลลัพธ์ลูกเต๋า ตำแหน่ง และการ์ด)
 * รองรับ Client Prediction และ Reconnect State Restoration
 */

import { gameStateStore } from '../GameState.js';
import { eventBus, GAME_EVENTS } from '../Engine/EventBus.js';

export class SyncManager {
  constructor() {
    this.serverSequenceNumber = 0;
  }

  /**
   * ตรวจสอบว่า Action/Packet จาก Client ถูกต้องตามกฎ Server Authority หรือไม่ (Anti-Cheat)
   * Client ไม่มีสิทธิ์กำหนดผลลูกเต๋า, ตำแหน่ง หรือการ์ดเอง
   * @param {Object} actionPacket 
   * @returns {boolean} ผ่านการตรวจสอบ Anti-Cheat หรือไม่
   */
  validateClientAction(actionPacket) {
    if (!actionPacket || !actionPacket.header) return false;

    // กฎ Anti-Cheat: ห้าม Client ส่งผลลัพธ์ลูกเต๋ามาเองใน Request Action
    if (actionPacket.header.type === 'REQUEST_ROLL_DICE') {
      if (actionPacket.payload && actionPacket.payload.diceValue !== undefined) {
        console.warn('[Anti-Cheat Alert] Client attempted to specify dice result! Rejected.');
        return false;
      }
    }

    // กฎ Anti-Cheat: ห้าม Client ส่งตำแหน่งที่เดินเอง
    if (actionPacket.header.type === 'REQUEST_MOVE_PLAYER') {
      if (actionPacket.payload && actionPacket.payload.targetPosition !== undefined) {
        console.warn('[Anti-Cheat Alert] Client attempted to set position directly! Rejected.');
        return false;
      }
    }

    return true;
  }

  /**
   * ซิงค์ GameState ที่ได้รับการยืนยันจาก Server (Server Authoritative Sync)
   * @param {Object} authoritativeGameState - State ฉบับทางการจาก Server
   */
  syncAuthoritativeState(authoritativeGameState) {
    if (!authoritativeGameState) return;

    this.serverSequenceNumber++;
    gameStateStore.restoreGameState(authoritativeGameState);

    eventBus.emit(GAME_EVENTS.STATE_RESTORED, {
      sequenceNumber: this.serverSequenceNumber,
      state: authoritativeGameState,
    });
  }

  /**
   * ทำ State Snapshot สำหรับส่งออกไปป้อนให้ Client อื่นๆ
   * @returns {Object} JSON Snapshot ของ GameState
   */
  createStateSnapshot() {
    const currentState = gameStateStore.getState();
    return {
      sequenceNumber: this.serverSequenceNumber,
      timestamp: Date.now(),
      state: JSON.parse(JSON.stringify(currentState)),
    };
  }

  /**
   * กู้คืน GameState เมื่อผู้เล่น Reconnect กลับเข้ามา
   * @param {Object} reconnectedSnapshot 
   */
  restoreOnReconnect(reconnectedSnapshot) {
    if (reconnectedSnapshot && reconnectedSnapshot.state) {
      this.syncAuthoritativeState(reconnectedSnapshot.state);
      console.log('[SyncManager] Successfully restored GameState on Reconnect.');
    }
  }
}
