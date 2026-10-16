/**
 * @file src/Network/NetworkManager.js
 * @description ศูนย์กลาง Network Layer (Facade Pattern) สำหรับระบบ Multiplayer (Phase 18)
 * ประสานงาน ConnectionManager, RoomManager, PlayerManager และ SyncManager
 * สลับโหมดการทำงานระหว่าง Offline Mode และ Online Mode โดยใช้ Game Logic เดียวกัน
 */

import { ConnectionManager } from './ConnectionManager.js';
import { RoomManager } from './RoomManager.js';
import { PlayerManager } from './PlayerManager.js';
import { SyncManager } from './SyncManager.js';
import { PacketManager, PACKET_TYPES } from './PacketManager.js';
import { eventBus, GAME_EVENTS } from '../Engine/EventBus.js';
import { commandProcessor } from '../Engine/CommandSystem.js';

export const NETWORK_MODES = {
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
};

export class NetworkManager {
  constructor() {
    this.mode = NETWORK_MODES.OFFLINE;
    this.connectionManager = new ConnectionManager();
    this.roomManager = new RoomManager();
    this.playerManager = new PlayerManager();
    this.syncManager = new SyncManager();
    this.myPlayerId = null;

    this.connectionManager.onMessage((packet) => {
      this.handleIncomingPacket(packet);
    });

    this.initListeners();
  }

  /**
   * สลับโหมดการทำงาน (OFFLINE / ONLINE)
   * @param {string} newMode 
   */
  setMode(newMode) {
    if (Object.values(NETWORK_MODES).includes(newMode)) {
      this.mode = newMode;
      console.log(`[NetworkManager] Switched Network Mode to: ${this.mode}`);
    }
  }

  /**
   * ดึงโหมดปัจจุบัน
   * @returns {string}
   */
  getMode() {
    return this.mode;
  }

  /**
   * เริ่มต้นลงทะเบียนการดักจับ Event จาก EventBus
   */
  initListeners() {
    // ดักฟัง Event การทอยลูกเต๋า
    eventBus.on(GAME_EVENTS.DICE_ROLLED, (data) => {
      if (this.mode === NETWORK_MODES.ONLINE) {
        const packet = PacketManager.createPacket(PACKET_TYPES.DICE_ROLLED, data);
        this.sendPacket(packet);
      }
    });

    // ดักฟัง Event การเดินผู้เล่น
    eventBus.on(GAME_EVENTS.PLAYER_MOVED, (data) => {
      if (this.mode === NETWORK_MODES.ONLINE) {
        const packet = PacketManager.createPacket(PACKET_TYPES.MOVE_PLAYER, data);
        this.sendPacket(packet);
      }
    });
  }

  /**
   * ส่ง Packet ไปยัง Server
   * @param {Object} packet 
   */
  sendPacket(packet) {
    if (this.mode === NETWORK_MODES.OFFLINE) {
      return false;
    }
    if (packet && packet.header) {
      if (!packet.header.senderId && this.myPlayerId) {
        packet.header.senderId = this.myPlayerId;
      }
      if (packet.payload) {
        if (!packet.payload.playerId && this.myPlayerId) {
          packet.payload.playerId = this.myPlayerId;
        }
        if (!packet.payload.roomCode && this.roomManager.currentRoom?.roomCode) {
          packet.payload.roomCode = this.roomManager.currentRoom.roomCode;
        }
      }
    }
    return this.connectionManager.send(packet);
  }

  /**
   * รับและประมวลผล Packet ที่ส่งมาจาก Server
   * @param {Object} packet 
   */
  handleIncomingPacket(packet) {
    if (!packet || !packet.header) return;

    // ตรวจสอบ Anti-Cheat ผ่าน SyncManager
    if (!this.syncManager.validateClientAction(packet)) {
      console.warn('[NetworkManager] Packet rejected by Anti-Cheat validator.');
      return;
    }

    const { type } = packet.header;
    const { payload } = packet;

    switch (type) {
      case PACKET_TYPES.ROOM_JOINED:
        if (payload.room) {
          this.roomManager.currentRoom = payload.room;
          if (payload.playerId) this.myPlayerId = payload.playerId;
          eventBus.emit('NET_ROOM_JOINED', payload);
        }
        break;

      case PACKET_TYPES.ROOM_UPDATE:
        if (payload.room) {
          this.roomManager.currentRoom = payload.room;
          if (payload.room.isGameStarted) {
            this.syncManager.syncAuthoritativeState(payload.room);
          }
          eventBus.emit('NET_ROOM_UPDATED', payload.room);
          if (payload.room.isGameStarted) {
            eventBus.emit('NET_STATE_SYNCED', payload.room);
          }
        }
        break;

      case PACKET_TYPES.ROOM_CLOSED:
        this.roomManager.currentRoom = null;
        eventBus.emit('NET_ROOM_CLOSED', payload);
        eventBus.emit('ROOM_CLOSED', payload);
        break;

      case PACKET_TYPES.REMATCH_REQUESTED:
        if (payload.room) {
          this.roomManager.currentRoom = payload.room;
        }
        eventBus.emit('NET_REMATCH_REQUESTED', payload);
        eventBus.emit('REMATCH_REQUESTED', payload);
        break;

      case PACKET_TYPES.GAME_STATE_SYNC:
        if (payload.state) {
          this.roomManager.currentRoom = payload.state;
          this.syncManager.syncAuthoritativeState(payload.state);
          eventBus.emit('NET_STATE_SYNCED', payload.state);
          eventBus.emit('NET_ROOM_UPDATED', payload.state);
        }
        break;

      case PACKET_TYPES.DICE_ROLLED:
        if (this.roomManager.currentRoom) {
          if (payload.nextActivePlayerIndex !== undefined) {
            this.roomManager.currentRoom.activePlayerIndex = payload.nextActivePlayerIndex;
          }
          if (payload.currentRollPlayerIndex !== undefined) {
            this.roomManager.currentRoom.currentRollPlayerIndex = payload.currentRollPlayerIndex;
          }
          if (payload.phase) {
            this.roomManager.currentRoom.phase = payload.phase;
          }
        }
        eventBus.emit(GAME_EVENTS.DICE_ROLLED, payload);
        eventBus.emit('DICE_ROLLED', payload);
        break;

      case PACKET_TYPES.CARD_FLIPPED:
        eventBus.emit('CARD_FLIPPED', payload);
        break;

      case PACKET_TYPES.CARD_CONFIRMED:
        eventBus.emit('CARD_CONFIRMED', payload);
        break;

      case PACKET_TYPES.TILE_EVENT_CONFIRMED:
        eventBus.emit('TILE_EVENT_CONFIRMED', payload);
        eventBus.emit('NET_TILE_EVENT_CONFIRMED', payload);
        break;

      case PACKET_TYPES.PLAYER_DISCONNECTED:
        if (payload.playerId) {
          this.playerManager.markDisconnected(payload.playerId);
        }
        if (payload.room) {
          this.roomManager.currentRoom = payload.room;
          eventBus.emit('NET_ROOM_UPDATED', payload.room);
        }
        break;

      case PACKET_TYPES.PLAYER_RECONNECTED:
        if (payload.playerId) {
          this.playerManager.markReconnected(payload.playerId);
        }
        if (payload.room) {
          this.roomManager.currentRoom = payload.room;
          eventBus.emit('NET_ROOM_UPDATED', payload.room);
        }
        break;

      case PACKET_TYPES.ERROR:
        if (payload.message) {
          eventBus.emit('NET_ERROR', payload.message);
        }
        break;

      default:
        break;
    }
  }

  /**
   * ลงทะเบียนรับฟัง Packet ประเภทเฉพาะ ( Helper wrapper สำหรับ eventBus )
   * @param {string} type 
   * @param {Function} callback 
   * @returns {Function} Unsubscribe function
   */
  onPacket(type, callback) {
    return eventBus.on(type, callback);
  }

  /**
   * ดึงสถิติ Network Performance (Latency, RTT, Status)
   */
  getNetworkStats() {
    return {
      mode: this.mode,
      connectionStatus: this.connectionManager.status,
      rtt: this.connectionManager.latencyManager.getRTT(),
      latency: this.connectionManager.latencyManager.getAverageLatency(),
      roomCode: this.roomManager.currentRoom ? this.roomManager.currentRoom.roomCode : 'N/A',
      playersCount: this.roomManager.currentRoom ? this.roomManager.currentRoom.players.length : 0,
    };
  }
}

export const networkManager = new NetworkManager();

if (typeof window !== 'undefined') {
  window.networkManager = networkManager;
}
