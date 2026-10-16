/**
 * @file src/Network/PacketManager.js
 * @description มอดูลจัดการข้อความ Message Protocol และสร้าง Packets สำหรับระบบ Multiplayer (Phase 18)
 * กำหนดประเภทของ Packet ทั้งหมด และมีฟังก์ชัน Serialization / Deserialization
 */

export const PACKET_TYPES = {
  // Connection & Room Management
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  LEAVE_ROOM: 'LEAVE_ROOM',
  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_UPDATE: 'ROOM_UPDATE',
  ROOM_CLOSED: 'ROOM_CLOSED',
  READY: 'READY',
  CHANGE_COLOR: 'CHANGE_COLOR',
  UPDATE_ROOM_SETTINGS: 'UPDATE_ROOM_SETTINGS',
  START_GAME: 'START_GAME',
  REQUEST_REMATCH: 'REQUEST_REMATCH',
  REMATCH_REQUESTED: 'REMATCH_REQUESTED',
  REMATCH_READY: 'REMATCH_READY',
  
  // Gameplay Actions (Client -> Server)
  REQUEST_ROLL_DICE: 'REQUEST_ROLL_DICE',
  REQUEST_MOVE_PLAYER: 'REQUEST_MOVE_PLAYER',
  REQUEST_DRAW_CARD: 'REQUEST_DRAW_CARD',
  REQUEST_FLIP_CARD: 'REQUEST_FLIP_CARD',
  REQUEST_CONFIRM_CARD: 'REQUEST_CONFIRM_CARD',
  REQUEST_CONFIRM_TILE_EVENT: 'REQUEST_CONFIRM_TILE_EVENT',
  
  // Game Events (Server -> Clients: Server-Authoritative)
  DICE_ROLLED: 'DICE_ROLLED',
  MOVE_PLAYER: 'MOVE_PLAYER',
  DRAW_CARD: 'DRAW_CARD',
  CARD_EFFECT: 'CARD_EFFECT',
  CARD_FLIPPED: 'CARD_FLIPPED',
  CARD_CONFIRMED: 'CARD_CONFIRMED',
  TILE_EVENT_CONFIRMED: 'TILE_EVENT_CONFIRMED',
  SKIP_TURN: 'SKIP_TURN',
  TURN_CHANGED: 'TURN_CHANGED',
  GAME_STATE_SYNC: 'GAME_STATE_SYNC',
  GAME_END: 'GAME_END',

  // Network & Disconnection
  PING: 'PING',
  PONG: 'PONG',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  RECONNECT: 'RECONNECT',
  ERROR: 'ERROR',
};

export class PacketManager {
  /**
   * สร้าง Packet ตามโครงสร้างมาตรฐาน
   * @param {string} type - ประเภทของ Packet (จาก PACKET_TYPES)
   * @param {Object} payload - ข้อมูลประกอบ Packet
   * @param {string} [senderId=''] - ID ของผู้ส่ง
   * @returns {Object} Packet Object
   */
  static createPacket(type, payload = {}, senderId = '') {
    return {
      header: {
        type,
        senderId,
        timestamp: Date.now(),
        packetId: `pkt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      },
      payload,
    };
  }

  /**
   * แปลง Packet เป็น JSON String
   * @param {Object} packet
   * @returns {string}
   */
  static serialize(packet) {
    try {
      return JSON.stringify(packet);
    } catch (err) {
      console.error('[PacketManager] Serialization error:', err);
      return null;
    }
  }

  /**
   * แปลง JSON String กลับมาเป็น Packet Object
   * @param {string} jsonString
   * @returns {Object|null}
   */
  static deserialize(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.header && parsed.header.type) {
        return parsed;
      }
    } catch (err) {
      console.error('[PacketManager] Deserialization error:', err);
    }
    return null;
  }
}
