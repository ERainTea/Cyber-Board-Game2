/**
 * @file src/Network/RoomManager.js
 * @description มอดูลจัดการระบบห้อง (Room System) ในโหมด Multiplayer (Phase 18)
 * ควบคุมการสร้างห้อง, เข้าห้อง, ออกห้อง, เจ้าของห้อง (Host) และ Ready System
 */

export class RoomManager {
  constructor() {
    this.currentRoom = null;
  }

  /**
   * สุ่มสร้างรหัสห้อง (6 หลัก)
   * @returns {string} รหัสห้อง
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * สร้างห้องใหม่
   * @param {Object} hostUser - ข้อมูลผู้สร้างห้อง
   * @param {number} [maxPlayers=6] - จำนวนผู้เล่นสูงสุด
   * @returns {Object} ข้อมูลห้องที่ถูกสร้าง
   */
  createRoom(hostUser, maxPlayers = 6) {
    const roomCode = this.generateRoomCode();
    this.currentRoom = {
      roomCode,
      hostId: hostUser.id || hostUser.color,
      maxPlayers,
      isGameStarted: false,
      players: [
        {
          id: hostUser.id || hostUser.color,
          name: hostUser.name,
          color: hostUser.color,
          isHost: true,
          isReady: true, // Host พร้อมอัตโนมัติ
        },
      ],
    };
    return this.currentRoom;
  }

  /**
   * เข้าร่วมห้องที่มีอยู่แล้ว
   * @param {string} roomCode - รหัสห้อง
   * @param {Object} joiningUser - ข้อมูลผู้เล่นที่ต้องการเข้า
   * @returns {{success: boolean, message?: string, room?: Object}}
   */
  joinRoom(roomCode, joiningUser) {
    if (!this.currentRoom || this.currentRoom.roomCode !== roomCode.toUpperCase()) {
      // สี่ว์สร้างห้องชั่วคราวรองรับสถาปัตยกรรม
      this.currentRoom = {
        roomCode: roomCode.toUpperCase(),
        hostId: 'HOST_PLAYER',
        maxPlayers: 6,
        isGameStarted: false,
        players: [],
      };
    }

    if (this.currentRoom.players.length >= this.currentRoom.maxPlayers) {
      return { success: false, message: 'ห้องเต็มแล้ว' };
    }

    const newPlayer = {
      id: joiningUser.id || joiningUser.color,
      name: joiningUser.name,
      color: joiningUser.color,
      isHost: false,
      isReady: false,
    };

    this.currentRoom.players.push(newPlayer);
    return { success: true, room: this.currentRoom };
  }

  /**
   * เปลี่ยนสถานะ Ready ของผู้เล่น
   * @param {string} playerId 
   * @param {boolean} isReady 
   */
  setPlayerReady(playerId, isReady) {
    if (!this.currentRoom) return false;
    const player = this.currentRoom.players.find((p) => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      return true;
    }
    return false;
  }

  /**
   * ตรวจสอบว่าผู้เล่นทุกคนพร้อมสำหรับเริ่มเกมหรือไม่
   * @returns {boolean}
   */
  isAllPlayersReady() {
    if (!this.currentRoom || this.currentRoom.players.length < 2) return false;
    return this.currentRoom.players.every((p) => p.isReady);
  }

  /**
   * ออกจากห้องปัจจุบัน
   * @param {string} playerId 
   */
  leaveRoom(playerId) {
    if (!this.currentRoom) return null;
    this.currentRoom.players = this.currentRoom.players.filter((p) => p.id !== playerId);

    // หาก Host ออก ย้ายตำแหน่ง Host ให้คนถัดไป
    if (this.currentRoom.players.length > 0) {
      if (!this.currentRoom.players.some((p) => p.isHost)) {
        this.currentRoom.players[0].isHost = true;
        this.currentRoom.players[0].isReady = true;
        this.currentRoom.hostId = this.currentRoom.players[0].id;
      }
    } else {
      this.currentRoom = null;
    }
    return this.currentRoom;
  }
}
