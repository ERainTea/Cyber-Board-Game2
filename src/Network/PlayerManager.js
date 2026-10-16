/**
 * @file src/Network/PlayerManager.js
 * @description มอดูลบริหารจัดการผู้เล่นในระบบ Network Multiplayer (Phase 18)
 * ติดตามสถานะออนไลน์, Disconnection, Reconnection และลำดับการเล่น
 */

export class PlayerManager {
  constructor() {
    /** @type {Map<string, Object>} */
    this.networkPlayers = new Map();
  }

  /**
   * ลงทะเบียน/อัปเดตผู้เล่นในระบบ Network
   * @param {Object} playerData 
   */
  registerPlayer(playerData) {
    const pId = playerData.id || playerData.color;
    this.networkPlayers.set(pId, {
      id: pId,
      name: playerData.name,
      color: playerData.color,
      isOnline: true,
      lastPingTime: Date.now(),
      ipAddress: playerData.ipAddress || '127.0.0.1',
    });
  }

  /**
   * ทำเครื่องหมายว่าผู้เล่นหลุดการเชื่อมต่อ
   * @param {string} playerId 
   */
  markDisconnected(playerId) {
    const player = this.networkPlayers.get(playerId);
    if (player) {
      player.isOnline = false;
      player.disconnectedAt = Date.now();
    }
  }

  /**
   * ทำเครื่องหมายว่าผู้เล่นต่อกลับเข้ามาใหม่ (Reconnect)
   * @param {string} playerId 
   */
  markReconnected(playerId) {
    const player = this.networkPlayers.get(playerId);
    if (player) {
      player.isOnline = true;
      player.reconnectedAt = Date.now();
    }
  }

  /**
   * ตรวจสอบว่าผู้เล่นออนไลน์อยู่หรือไม่
   * @param {string} playerId 
   * @returns {boolean}
   */
  isPlayerOnline(playerId) {
    const player = this.networkPlayers.get(playerId);
    return player ? player.isOnline : false;
  }

  /**
   * ดึงรายชื่อผู้เล่นทั้งหมด
   */
  getAllPlayers() {
    return Array.from(this.networkPlayers.values());
  }

  /**
   * ล้างข้อมูล
   */
  clear() {
    this.networkPlayers.clear();
  }
}
