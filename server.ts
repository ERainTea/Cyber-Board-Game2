/**
 * @file server.ts
 * @description Express + WebSocket Server สำหรับระบบ Multiplayer Online แบบ Server-Authoritative (Phase 19)
 * รองรับ Room Management, GameState Sync, Dice/Move/Card Sync, Auto Save, Reconnect, Anti-Cheat, Latency Compensation และ Host Migration
 */

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import boardMapData from "./src/Board/boardMap.json";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// --- WEBSOCKET SERVER INITIALIZATION ---
const wss = new WebSocketServer({ server });

// --- SERVER-SIDE ROOM & GAME STATE IN-MEMORY STORAGE (AUTO SAVE) ---
interface NetworkPlayer {
  id: string;
  name: string;
  colorId?: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  ws?: WebSocket;
  position: number;
  cash: number;
  netWorth: number;
  isBankrupt: boolean;
  isInJail: boolean;
  skipTurnCount: number;
  pendingCardDraw?: boolean;
  orderRollScore?: number | null;
  turnOrderRank?: number | null;
  turnOrder?: string;
}

interface GameLog {
  id: string;
  timestamp: string;
  message: string;
  type: string;
}

interface Room {
  roomCode: string;
  roomName: string;
  password?: string | null;
  orderMode: 'RANDOM' | 'DICE' | 'JOIN';
  finishMode: 'EXACT_ROLL' | 'FIRST_REACH';
  hostId: string;
  maxPlayers: number;
  isGameStarted: boolean;
  players: NetworkPlayer[];
  activePlayerIndex: number;
  currentRollPlayerIndex: number;
  turnNumber: number;
  phase: string; // 'LOBBY' | 'DETERMINE_ORDER' | 'PLAYING' | 'GAME_OVER'
  logs: GameLog[];
  lastDiceResult: { die1: number; die2: number; total: number } | null;
  currentCardDrawn: any | null;
  winnerPlayerId: string | null;
  updatedAt: number;
}

const rooms = new Map<string, Room>();

// --- CARD DECKS FOR SERVER AUTHORITY ---
const GREEN_CARDS = [
  { id: 'g1', title: 'โชคดี! พบทางลัด', description: 'ก้าวไปข้างหน้า 3 ช่อง', type: 'MOVE', effectValue: 3 },
  { id: 'g2', title: 'พลังงานเทคโนโลยี', description: 'ก้าวไปข้างหน้า 2 ช่อง', type: 'MOVE', effectValue: 2 },
  { id: 'g3', title: 'ระบบป้องกันตัว', description: 'รับโล่ป้องกันและเดินหน้า 1 ช่อง', type: 'MOVE', effectValue: 1 },
  { id: 'g4', title: 'โบนัสเครือข่าย', description: 'ก้าวไปข้างหน้า 4 ช่อง', type: 'MOVE', effectValue: 4 },
];

const RED_CARDS = [
  { id: 'r1', title: 'ไวรัสโจมตีระบบ!', description: 'ถอยหลัง 2 ช่อง', type: 'MOVE', effectValue: -2 },
  { id: 'r2', title: 'สัญญาณอินเทอร์เน็ตหลุด', description: 'เสีย lượt หยุดพัก 1 เทิร์น', type: 'SKIP', effectValue: 1 },
  { id: 'r3', title: 'ข้อมูลรั่วไหล', description: 'ถอยหลัง 3 ช่อง', type: 'MOVE', effectValue: -3 },
  { id: 'r4', title: 'เขาวงกตไซเบอร์', description: 'ถูกส่งกลับไปเริ่มต้นที่ช่อง 0', type: 'GO_TO', effectValue: 0 },
];

/**
 * สุ่มสร้างรหัสห้อง 6 หลักภาษาอังกฤษตัวใหญ่
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * ส่ง Packet ไปยัง WebSocket Client รายบุคคล
 */
function sendToClient(ws: WebSocket, type: string, payload: any = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      header: {
        type,
        timestamp: Date.now(),
        packetId: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
      },
      payload
    }));
  }
}

/**
 * กระจาย Packet ไปยังผู้เล่นทุกคนในห้อง (Broadcast to Room)
 */
function broadcastToRoom(room: Room, type: string, payload: any = {}) {
  const packet = JSON.stringify({
    header: {
      type,
      timestamp: Date.now(),
      packetId: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    },
    payload
  });

  console.log(`[Server] 📡 บรอดแคสต์ ${type} ไปยังผู้เล่นในห้อง ${room.roomCode} (รวม ${room.players.length} คน)`);
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.isOnline = true;
      p.ws.send(packet);
      console.log(`[Server]   -> ส่ง ${type} ถึงผู้เล่น [${p.name}] (${p.id}) สำเร็จ`);
    } else {
      console.warn(`[Server]   -> ไม่สามารถส่ง ${type} ถึงผู้เล่น [${p.name}] (${p.id}): WebSocket ไม่พร้อมใช้งาน`);
    }
  });
}

/**
 * แปลง Room State เป็น Clean Serializable State สำหรับ Sync ไปให้ Clients
 */
const AVAILABLE_COLORS = [
  { id: 'gold', name: 'สีทอง', hex: '#f59e0b', icon: '🪙' },
  { id: 'cyan', name: 'สีฟ้า', hex: '#38bdf8', icon: '💎' },
  { id: 'green', name: 'สีเขียว', hex: '#10b981', icon: '🍀' },
  { id: 'red', name: 'สีแดง', hex: '#f43f5e', icon: '🔥' },
  { id: 'purple', name: 'สีม่วง', hex: '#a855f7', icon: '🔮' },
  { id: 'orange', name: 'สีส้ม', hex: '#f97316', icon: '⚡' }
];

function getUnusedColor(usedColorIds: string[]) {
  const available = AVAILABLE_COLORS.find(c => !usedColorIds.includes(c.id));
  return available || AVAILABLE_COLORS[0];
}

function getSanitizedRoomState(room: Room) {
  return {
    roomCode: room.roomCode,
    roomName: room.roomName || `ห้อง ${room.roomCode}`,
    hasPassword: !!room.password,
    orderMode: room.orderMode || 'DICE',
    finishMode: room.finishMode || 'EXACT_ROLL',
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    isGameStarted: room.isGameStarted,
    activePlayerIndex: room.activePlayerIndex,
    currentRollPlayerIndex: room.currentRollPlayerIndex || 0,
    turnNumber: room.turnNumber,
    phase: room.phase,
    lastDiceResult: room.lastDiceResult,
    currentCardDrawn: room.currentCardDrawn,
    winnerPlayerId: room.winnerPlayerId,
    logs: room.logs,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      colorId: p.colorId,
      color: p.color,
      isHost: p.isHost,
      isReady: p.isReady,
      isOnline: p.isOnline,
      position: p.position,
      cash: p.cash,
      netWorth: p.netWorth,
      isBankrupt: p.isBankrupt,
      isInJail: p.isInJail,
      skipTurnCount: p.skipTurnCount,
      pendingCardDraw: p.pendingCardDraw || false,
      orderRollScore: p.orderRollScore,
      turnOrderRank: p.turnOrderRank,
      turnOrder: p.turnOrder
    }))
  };
}

/**
 * เพิ่ม Log ประวัติเหตุการณ์ภาษาไทยในห้อง
 */
function addRoomLog(room: Room, message: string, type: string = 'INFO') {
  const timeStr = new Date().toLocaleTimeString('th-TH', { hour12: false });
  const log: GameLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    timestamp: timeStr,
    message,
    type
  };
  room.logs.unshift(log);
  if (room.logs.length > 50) room.logs.pop();
}

function advanceToNextValidTurn(room: any) {
  if (!room || !room.players || room.players.length === 0) return;
  let attempts = 0;
  while (attempts < room.players.length) {
    const p = room.players[room.activePlayerIndex];
    if (p && !p.isBankrupt && p.skipTurnCount > 0) {
      p.skipTurnCount--;
      addRoomLog(room, `⏳ [${p.name}] ติดโทษหยุดเดิน 1 ตา จึงถูกข้ามเทิร์นอัตโนมัติ`, 'WARNING');
      room.activePlayerIndex = (room.activePlayerIndex + 1) % room.players.length;
      attempts++;
    } else {
      break;
    }
  }
}

function applyCardEffectOnServer(room: any, player: any, card: any) {
  if (!card || !card.effect) return;
  const effect = card.effect;
  const MAX_POS = 52;

  switch (effect.type) {
    case 'MOVE_FORWARD': {
      const steps = effect.steps || 1;
      player.position = Math.min(MAX_POS, (player.position || 0) + steps);
      const tile = (boardMapData as any[])[player.position];
      const tType = (tile?.type || 'normal').toLowerCase();
      if (tType === 'green' || tType === 'red') {
        player.pendingCardDraw = true;
      }
      break;
    }
    case 'MOVE_BACKWARD': {
      const steps = effect.steps || 1;
      player.position = Math.max(0, (player.position || 0) - steps);
      const tile = (boardMapData as any[])[player.position];
      const tType = (tile?.type || 'normal').toLowerCase();
      if (tType === 'green' || tType === 'red') {
        player.pendingCardDraw = true;
      }
      break;
    }
    case 'GO_START': {
      player.position = 0;
      break;
    }
    case 'SKIP_TURN': {
      const turns = effect.turns || 1;
      player.skipTurnCount = (player.skipTurnCount || 0) + turns;
      break;
    }
    case 'ALL_BACKWARD': {
      const steps = effect.steps || 1;
      room.players.forEach((p: any) => {
        p.position = Math.max(0, (p.position || 0) - steps);
        const tile = (boardMapData as any[])[p.position];
        const tType = (tile?.type || 'normal').toLowerCase();
        if (tType === 'green' || tType === 'red') {
          p.pendingCardDraw = true;
        }
      });
      break;
    }
  }
}

// --- WEBSOCKET EVENT HANDLERS ---
wss.on("connection", (ws: WebSocket) => {
  let playerRoomCode: string | null = null;
  let clientPlayerId: string | null = null;

  ws.on("message", (data: string) => {
    try {
      const packet = JSON.parse(data.toString());
      if (!packet || !packet.header || !packet.header.type) return;

      const { type } = packet.header;
      const payload = packet.payload || {};

      // Auto-bind WebSocket & Active state สำหรับผู้เล่นในห้อง เพื่อป้องกัน Socket หลุดหรือ stale
      const currentSenderId = packet.header?.senderId || payload.playerId || clientPlayerId;
      const currentRoomCode = payload.roomCode || playerRoomCode;
      if (currentRoomCode && currentSenderId) {
        const targetRoom = rooms.get(currentRoomCode);
        if (targetRoom) {
          playerRoomCode = currentRoomCode;
          clientPlayerId = currentSenderId;
          const targetPlayer = targetRoom.players.find(p => p.id === currentSenderId);
          if (targetPlayer) {
            targetPlayer.ws = ws;
            targetPlayer.isOnline = true;
          }
        }
      }

      switch (type) {
        // --- 1. PING / PONG (Latency Measurement) ---
        case 'PING': {
          sendToClient(ws, 'PONG', { clientTimestamp: payload.timestamp });
          break;
        }

        // --- 2. CREATE ROOM (สร้างห้อง) ---
        case 'CREATE_ROOM': {
          let customRoomName = (payload.roomName || '').trim();
          
          // ตรวจสอบชื่อห้อง: ต้องไม่ซ้ำกับรูปแบบรหัสห้อง 6 หลัก (เช่น ABC123)
          if (customRoomName && /^[A-Za-z0-9]{6}$/.test(customRoomName)) {
            sendToClient(ws, 'ERROR', { message: 'ชื่อห้องต้องไม่เป็นรหัส 6 หลัก (กรุณาตั้งชื่อห้องอื่นที่ไม่ซ้ำกับรูปแบบรหัสห้อง)' });
            return;
          }

          const roomCode = generateRoomCode();
          const hostColor = getUnusedColor([]);
          const hostPlayer: NetworkPlayer = {
            id: payload.user?.id || `p_${Date.now()}`,
            name: payload.user?.name || 'เจ้าของห้อง',
            colorId: hostColor.id,
            color: hostColor.hex,
            isHost: true,
            isReady: true,
            isOnline: true,
            ws,
            position: 0,
            cash: 15000,
            netWorth: 15000,
            isBankrupt: false,
            isInJail: false,
            skipTurnCount: 0
          };

          const finalRoomName = customRoomName || `ห้องของ ${hostPlayer.name}`;
          const rawPassword = payload.password ? String(payload.password).trim() : null;
          const orderMode = payload.orderMode === 'RANDOM' || payload.orderMode === 'JOIN' ? payload.orderMode : 'DICE';
          const finishMode = payload.finishMode === 'FIRST_REACH' ? 'FIRST_REACH' : 'EXACT_ROLL';

          const newRoom: Room = {
            roomCode,
            roomName: finalRoomName,
            password: rawPassword && rawPassword.length > 0 ? rawPassword : null,
            orderMode,
            finishMode,
            hostId: hostPlayer.id,
            maxPlayers: payload.maxPlayers || 6,
            isGameStarted: false,
            players: [hostPlayer],
            activePlayerIndex: 0,
            currentRollPlayerIndex: 0,
            turnNumber: 1,
            phase: 'LOBBY',
            logs: [],
            lastDiceResult: null,
            currentCardDrawn: null,
            winnerPlayerId: null,
            updatedAt: Date.now()
          };

          rooms.set(roomCode, newRoom);
          playerRoomCode = roomCode;
          clientPlayerId = hostPlayer.id;

          const orderName = orderMode === 'RANDOM' ? 'สุ่มลำดับ' : orderMode === 'JOIN' ? 'ตามลำดับเข้าห้อง' : 'ทอยเต๋าวัดแต้ม';
          const finishName = finishMode === 'FIRST_REACH' ? 'ถึงก่อนชนะ' : 'ทอยลงพอดี';
          addRoomLog(newRoom, `สร้างห้อง "${finalRoomName}" [${roomCode}] โดย ${hostPlayer.name} (${orderName} | ${finishName}${newRoom.password ? ' | 🔒 มีรหัสผ่าน' : ''})`, 'SUCCESS');

          sendToClient(ws, 'ROOM_JOINED', {
            roomCode,
            playerId: hostPlayer.id,
            room: getSanitizedRoomState(newRoom)
          });
          break;
        }

        // --- 3. JOIN ROOM (เข้าห้อง) ---
        case 'JOIN_ROOM': {
          const roomCode = (payload.roomCode || '').toUpperCase().trim();
          const room = rooms.get(roomCode);

          if (!room) {
            sendToClient(ws, 'ERROR', { message: `ไม่พบห้องรหัส ${roomCode}` });
            return;
          }

          if (room.isGameStarted) {
            sendToClient(ws, 'ERROR', { message: 'เกมในห้องนี้เริ่มเล่นไปแล้ว' });
            return;
          }

          if (room.players.length >= room.maxPlayers) {
            sendToClient(ws, 'ERROR', { message: 'ห้องนี้เต็มแล้ว (ผู้เล่นครบจำนวนสูงสุด)' });
            return;
          }

          // ตรวจสอบรหัสผ่านห้อง (หากมีการตั้งรหัสผ่านไว้)
          if (room.password) {
            const inputPassword = payload.password ? String(payload.password).trim() : '';
            if (inputPassword !== room.password) {
              sendToClient(ws, 'ERROR', { 
                message: inputPassword.length === 0 ? 'ห้องนี้ต้องการรหัสผ่านเพื่อเข้าร่วม' : 'รหัสผ่านห้องไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
                requiresPassword: true,
                roomCode: room.roomCode,
                roomName: room.roomName
              });
              return;
            }
          }

          const usedColorIds = room.players.map(p => p.colorId || '');
          const assignedColor = getUnusedColor(usedColorIds);

          const newPlayer: NetworkPlayer = {
            id: payload.user?.id || `p_${Date.now()}`,
            name: payload.user?.name || `ผู้เล่น ${room.players.length + 1}`,
            colorId: assignedColor.id,
            color: assignedColor.hex,
            isHost: false,
            isReady: false,
            isOnline: true,
            ws,
            position: 0,
            cash: 15000,
            netWorth: 15000,
            isBankrupt: false,
            isInJail: false,
            skipTurnCount: 0
          };

          room.players.push(newPlayer);
          room.updatedAt = Date.now();
          playerRoomCode = roomCode;
          clientPlayerId = newPlayer.id;

          addRoomLog(room, `${newPlayer.name} เข้าร่วมห้องแล้ว`, 'INFO');

          sendToClient(ws, 'ROOM_JOINED', {
            roomCode,
            playerId: newPlayer.id,
            room: getSanitizedRoomState(room)
          });

          broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          break;
        }

        // --- 3.1 CHANGE COLOR (เลือก/เปลี่ยนสีหมากในห้อง) ---
        case 'CHANGE_COLOR': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          const targetPlayerId = payload.playerId || clientPlayerId;

          if (!targetRoomCode || !targetPlayerId) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          const targetColorId = payload.colorId;
          const colorObj = AVAILABLE_COLORS.find(c => c.id === targetColorId);
          if (!colorObj) {
            sendToClient(ws, 'ERROR', { message: 'สีที่เลือกไม่ถูกต้อง' });
            return;
          }

          // ตรวจสอบว่าสีนี้ถูกผู้เล่นคนอื่นในห้องเลือกไปแล้วหรือไม่
          const isUsedByOther = room.players.some(p => p.id !== targetPlayerId && p.colorId === targetColorId);
          if (isUsedByOther) {
            sendToClient(ws, 'ERROR', { message: 'สีนี้ถูกผู้เล่นคนอื่นเลือกไปแล้ว กรุณาเลือกสีอื่น' });
            return;
          }

          const player = room.players.find(p => p.id === targetPlayerId);
          if (player) {
            player.colorId = colorObj.id;
            player.color = colorObj.hex;
            player.ws = ws;
            player.isOnline = true;
            room.updatedAt = Date.now();

            addRoomLog(room, `${player.name} เปลี่ยนสีหมากเป็น ${colorObj.name} ${colorObj.icon}`, 'INFO');
            broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          }
          break;
        }

        // --- 3.2 UPDATE ROOM SETTINGS (เจ้าของห้องปรับเปลี่ยนกติกา/โหมด) ---
        case 'UPDATE_ROOM_SETTINGS': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          const targetPlayerId = payload.playerId || clientPlayerId;

          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          const player = room.players.find(p => (targetPlayerId && p.id === targetPlayerId) || p.ws === ws);
          if (!player || !player.isHost) {
            sendToClient(ws, 'ERROR', { message: 'เฉพาะเจ้าของห้องเท่านั้นที่สามารถปรับเปลี่ยนการตั้งค่าได้' });
            return;
          }

          if (payload.orderMode && ['RANDOM', 'DICE', 'JOIN'].includes(payload.orderMode)) {
            room.orderMode = payload.orderMode;
          }

          if (payload.finishMode && ['EXACT_ROLL', 'FIRST_REACH'].includes(payload.finishMode)) {
            room.finishMode = payload.finishMode;
          }

          if (payload.roomName && typeof payload.roomName === 'string') {
            const trimmedName = payload.roomName.trim();
            if (trimmedName && !/^[A-Za-z0-9]{6}$/.test(trimmedName)) {
              room.roomName = trimmedName;
            }
          }

          if (payload.password !== undefined) {
            const rawPass = String(payload.password || '').trim();
            room.password = rawPass.length > 0 ? rawPass : null;
          }

          room.updatedAt = Date.now();
          const orderLabel = room.orderMode === 'RANDOM' ? 'สุ่มลำดับอัตโนมัติ' : room.orderMode === 'JOIN' ? 'เรียงตามลำดับเข้าห้อง' : 'ทอยเต๋าวัดแต้ม';
          const finishLabel = room.finishMode === 'FIRST_REACH' ? 'ใครถึงก่อนชนะ' : 'ทอยแต้มลงพอดี';
          addRoomLog(room, `👑 ${player.name} อัปเดตการตั้งค่า: ${orderLabel} | ${finishLabel}${room.password ? ' | 🔒 มีรหัสผ่าน' : ' | 🌐 สาธารณะ'}`, 'INFO');

          broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          break;
        }

        // --- 4. TOGGLE READY (กดพร้อม / ยกเลิกพร้อม) ---
        case 'READY': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          const targetPlayerId = payload.playerId || clientPlayerId;

          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === targetPlayerId || p.ws === ws);
          if (player) {
            player.isReady = payload.isReady !== undefined ? payload.isReady : !player.isReady;
            player.ws = ws;
            player.isOnline = true;
            room.updatedAt = Date.now();
            
            addRoomLog(room, `${player.name} ${player.isReady ? 'พร้อมแล้ว ✅' : 'ยกเลิกความพร้อม ⏳'}`, 'INFO');
            console.log(`[Server] 🟢 ผู้เล่น ${player.name} (${player.id}) ในห้อง ${room.roomCode} เปลี่ยนสถานะพร้อมเป็น: ${player.isReady}`);
            broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          } else {
            console.warn(`[Server] ⚠️ ไม่พบผู้เล่น ${targetPlayerId} ในห้อง ${targetRoomCode} สำหรับ READY`);
          }
          break;
        }

        // --- 5. START GAME (เจ้าของห้องกดเริ่มเกม) ---
        case 'START_GAME': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          const targetPlayerId = payload.playerId || clientPlayerId;

          console.log(`[Server] 🎮 เจ้าของห้อง (${targetPlayerId}) ขอเริ่มเกมในห้อง: ${targetRoomCode}`);

          if (!targetRoomCode) {
            console.error('[Server] ❌ เริ่มเกมไม่สำเร็จ: ไม่พบรหัสห้อง');
            sendToClient(ws, 'ERROR', { message: 'ไม่พบรหัสห้องสำหรับเริ่มเกม' });
            return;
          }

          const room = rooms.get(targetRoomCode);
          if (!room) {
            console.error(`[Server] ❌ เริ่มเกมไม่สำเร็จ: ไม่พบห้อง ${targetRoomCode}`);
            sendToClient(ws, 'ERROR', { message: 'ไม่พบห้องที่ต้องการเริ่มเกม' });
            return;
          }

          // อัปเดตข้อมูล Socket ประจำตัวกรณี Reconnect หรือเชื่อมต่อใหม่
          playerRoomCode = targetRoomCode;
          if (targetPlayerId) {
            clientPlayerId = targetPlayerId;
            const pInRoom = room.players.find(p => p.id === targetPlayerId);
            if (pInRoom) {
              pInRoom.ws = ws;
              pInRoom.isOnline = true;
            }
          }

          const player = room.players.find(p => (targetPlayerId && p.id === targetPlayerId) || p.ws === ws || p.id === clientPlayerId);
          if (!player || !player.isHost) {
            console.error(`[Server] ❌ เริ่มเกมไม่สำเร็จ: ผู้เล่น ${targetPlayerId} ไม่ใช่เจ้าของห้อง`);
            sendToClient(ws, 'ERROR', { message: 'เฉพาะเจ้าของห้องเท่านั้นที่สามารถเริ่มเกมได้' });
            return;
          }

          if (room.players.length < 2) {
            console.error(`[Server] ❌ เริ่มเกมไม่สำเร็จ: มีผู้เล่นแค่ ${room.players.length} คน (ต้องการอย่างน้อย 2)`);
            sendToClient(ws, 'ERROR', { message: 'ต้องมีผู้เล่นอย่างน้อย 2 คนจึงจะเริ่มเกมได้' });
            return;
          }

          const allReady = room.players.every(p => p.isReady || p.isHost);
          if (!allReady) {
            const unreadyNames = room.players.filter(p => !p.isReady && !p.isHost).map(p => p.name).join(', ');
            console.error(`[Server] ❌ เริ่มเกมไม่สำเร็จ: ผู้เล่นยังไม่พร้อม (${unreadyNames})`);
            sendToClient(ws, 'ERROR', { message: `ผู้เล่นทุกคนในห้องต้องกด "พร้อม" ก่อนเริ่มเกม (ยังไม่พร้อม: ${unreadyNames})` });
            return;
          }

          room.isGameStarted = true;
          room.turnNumber = 1;
          room.updatedAt = Date.now();

          // รีเซ็ตตำแหน่งและสถานะเริ่มต้นของผู้เล่นทุกคน
          room.players.forEach(p => {
            p.position = 0;
            p.orderRollScore = null;
            p.skipTurnCount = 0;
          });

          // ดำเนินการตามโหมดการจัดลำดับคนเดิน (Turn Order Mode)
          if (room.orderMode === 'RANDOM') {
            // สุ่มลำดับผู้เล่น (Fisher-Yates Shuffle)
            for (let i = room.players.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
            }
            room.players.forEach((p, idx) => {
              p.turnOrderRank = idx + 1;
              p.turnOrder = `ลำดับที่ ${idx + 1}`;
              p.orderRollScore = Math.floor(Math.random() * 6) + 1;
            });
            room.phase = 'PLAYING';
            room.activePlayerIndex = 0;
            room.currentRollPlayerIndex = 0;
            addRoomLog(room, `🔀 สุ่มลำดับคนเดินเรียบร้อยแล้ว! [${room.players[0].name}] ได้เริ่มเดินคนแรก`, 'SUCCESS');
          } else if (room.orderMode === 'JOIN') {
            // เรียงตามลำดับที่เข้าร่วมห้อง
            room.players.forEach((p, idx) => {
              p.turnOrderRank = idx + 1;
              p.turnOrder = `ลำดับที่ ${idx + 1}`;
            });
            room.phase = 'PLAYING';
            room.activePlayerIndex = 0;
            room.currentRollPlayerIndex = 0;
            addRoomLog(room, `📋 เรียงตามลำดับเข้าร่วมห้อง! [${room.players[0].name}] ได้เริ่มเดินคนแรก`, 'SUCCESS');
          } else {
            // ทอยเต๋าวัดแต้ม (DICE)
            room.phase = 'DETERMINE_ORDER';
            room.currentRollPlayerIndex = 0;
            room.activePlayerIndex = 0;
            addRoomLog(room, '🎲 เกมเริ่มต้นแล้ว! กำลังเข้าสู่ขั้นตอนทอยเต๋าวัดแต้มสุ่มลำดับการเล่น', 'SUCCESS');
          }

          const sanitizedState = getSanitizedRoomState(room);

          console.log(`[Server] 🚀 เริ่มเกมสำเร็จ! กระจายสัญญาณเริ่มเกม (GAME_STATE_SYNC & ROOM_UPDATE) ให้ผู้เล่นทุกคนในห้อง ${room.roomCode}`);
          broadcastToRoom(room, 'GAME_STATE_SYNC', { state: sanitizedState });
          broadcastToRoom(room, 'ROOM_UPDATE', { room: sanitizedState });
          break;
        }

        // --- 6. SERVER-AUTHORITATIVE DICE ROLL (ขอทอดลูกเต๋า) ---
        case 'REQUEST_ROLL_DICE': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room || !room.isGameStarted) return;

          // ระบุผู้เล่นผู้ส่งคำขอทอยเต๋าจาก senderId / playerId หรือ websocket connection
          const senderPlayer = room.players.find(p => (currentSenderId && p.id === currentSenderId) || p.ws === ws);

          // --- A) DETERMINE_ORDER PHASE (ทอยเต๋าสุ่มลำดับ) ---
          if (room.phase === 'DETERMINE_ORDER') {
            const currentRollPlayer = room.players[room.currentRollPlayerIndex || 0];
            if (!currentRollPlayer || !senderPlayer || currentRollPlayer.id !== senderPlayer.id) {
              sendToClient(ws, 'ERROR', { message: `ยังไม่ถึงตาทอยเต๋ากำหนดลำดับของคุณ (ขณะนี้ถึงตาผู้เล่น ${currentRollPlayer ? currentRollPlayer.name : ''})` });
              return;
            }

            const die = Math.floor(Math.random() * 6) + 1;
            currentRollPlayer.orderRollScore = die;
            addRoomLog(room, `${currentRollPlayer.name} ทอยเต๋าสุ่มลำดับได้ ${die} แต้ม 🎲`, 'DICE');

            const rollIdx = room.currentRollPlayerIndex || 0;
            room.currentRollPlayerIndex = rollIdx + 1;

            if (room.currentRollPlayerIndex >= room.players.length) {
              // จัดลำดับผู้เล่นตามคะแนนทอยเต๋าสูงไปต่ำ (หากแต้มเท่ากัน คนทอยก่อนได้ลำดับก่อน)
              const originalOrder = room.players.map(p => p.id);
              room.players.sort((a, b) => {
                const scoreDiff = (b.orderRollScore || 0) - (a.orderRollScore || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id);
              });
              room.players.forEach((p, idx) => {
                p.turnOrderRank = idx + 1;
                p.turnOrder = `ลำดับที่ ${idx + 1}`;
              });
              room.phase = 'PLAYING';
              room.activePlayerIndex = 0;
              addRoomLog(room, `🎯 กำหนดลำดับการเล่นเสร็จสิ้น! ผู้เล่นที่ทอยได้แต้มสูงสุดเริ่มเล่นก่อน`, 'SUCCESS');
            }

            room.updatedAt = Date.now();

            broadcastToRoom(room, 'DICE_ROLLED', {
              isDetermineOrder: true,
              playerId: currentRollPlayer.id,
              playerName: currentRollPlayer.name,
              dice: { die1: die, die2: 0, total: die },
              currentRollPlayerIndex: rollIdx,
              nextPhase: room.phase
            });

            broadcastToRoom(room, 'GAME_STATE_SYNC', { state: getSanitizedRoomState(room) });
            break;
          }

          // --- B) PLAYING PHASE (เดินตามเทิร์น) ---
          const activePlayer = room.players[room.activePlayerIndex];
          if (!activePlayer || !senderPlayer || activePlayer.id !== senderPlayer.id) {
            sendToClient(ws, 'ERROR', { message: `ยังไม่ถึงตาการเล่นของคุณ (ขณะนี้ถึงตาผู้เล่น ${activePlayer ? activePlayer.name : ''})` });
            return;
          }

          // ตรวจสอบหากผู้เล่นติดโทษหยุดเดิน (skipTurnCount > 0)
          if (activePlayer.skipTurnCount > 0) {
            activePlayer.skipTurnCount--;
            addRoomLog(room, `⏳ [${activePlayer.name}] ติดโทษหยุดเดิน 1 ตา จึงถูกข้ามเทิร์นอัตโนมัติ (เหลือ ${activePlayer.skipTurnCount} ตา)`, 'WARNING');
            let nextIndex = (room.activePlayerIndex + 1) % room.players.length;
            if (nextIndex === 0) room.turnNumber++;
            room.activePlayerIndex = nextIndex;
            room.updatedAt = Date.now();
            broadcastToRoom(room, 'GAME_STATE_SYNC', { state: getSanitizedRoomState(room) });
            return;
          }

          // หากผู้เล่นมีสถานะค้างสุ่มการ์ด ให้ล้างค่า
          if (activePlayer.pendingCardDraw) {
            activePlayer.pendingCardDraw = false;
          }

          // ทอยเต๋า 1 ลูก (1 - 6 แต้ม)
          const die = Math.floor(Math.random() * 6) + 1;
          const oldPosition = activePlayer.position || 0;
          room.lastDiceResult = { die1: die, die2: 0, total: die };
          addRoomLog(room, `${activePlayer.name} ทอดลูกเต๋าได้ ${die} แต้ม 🎲`, 'DICE');

          // คำนวณตำแหน่งก้าวเดินบนกระดาน 39 ช่อง (ดัชนี 0 ถึง boardMapData.length - 1 = 38 ตาม finishMode)
          const MAX_POS = Math.max(0, (boardMapData as any[]).length - 1); // 38
          let newPos = oldPosition + die;

          if (room.finishMode === 'FIRST_REACH') {
            // โหมดถึงก่อนชนะ (FIRST_REACH): ทอยแต้มถึงหรือเกินเส้นชัย ถือว่าเข้าเส้นชัยทันที
            if (newPos >= MAX_POS) {
              newPos = MAX_POS;
              activePlayer.position = MAX_POS;
              room.phase = 'GAME_OVER';
              room.winnerPlayerId = activePlayer.id;
              addRoomLog(room, `🏆 ${activePlayer.name} ทอยได้ ${die} แต้ม ก้าวข้ามเส้นชัยเป็นผู้ชนะเลิศในเกมนี้!`, 'SUCCESS');
            } else {
              activePlayer.position = newPos;
            }
          } else {
            // โหมดทอยลงพอดี (EXACT_ROLL): ต้องลงช่องเส้นชัย (ดัชนี 38 หรือช่องที่ 39) พอดี หากเกินจะเด้งถอยหลัง (Bounce Back)
            if (newPos > MAX_POS) {
              const over = newPos - MAX_POS;
              newPos = MAX_POS - over;
              addRoomLog(room, `${activePlayer.name} ทอยได้ ${die} แต้ม เกินเส้นชัย ${over} ช่อง จึงเด้งกลับมาช่องที่ ${newPos + 1}`, 'WARNING');
            }

            activePlayer.position = newPos;

            if (newPos === MAX_POS) {
              room.phase = 'GAME_OVER';
              room.winnerPlayerId = activePlayer.id;
              addRoomLog(room, `🏆 ${activePlayer.name} เดินลงช่องเส้นชัยพอดี เป็นผู้ชนะเลิศในเกมนี้!`, 'SUCCESS');
            }
          }

          if (room.phase !== 'GAME_OVER') {
            // ตรวจสอบประเภทช่องใน boardMap.json เพื่อให้ทำงานรางวัลและบทลงโทษเหมือน Offline Mode
            const currentTile = (boardMapData as any[])[newPos];
            const tileType = (currentTile?.type || 'normal').toLowerCase();
            const tileEffect = currentTile?.effect;

            let extraTurnGranted = false;

            if (tileType === 'green') {
              addRoomLog(room, `🟢 [${activePlayer.name}] ตกช่องสีเขียว (${currentTile?.title || 'ช่องความปลอดภัย'}): ${currentTile?.actionText || ''}`, 'TILE');
              if (tileEffect) {
                if (tileEffect.type === 'MOVE_FORWARD' && tileEffect.steps > 0) {
                  const bonusSteps = tileEffect.steps;
                  let afterBonusPos = activePlayer.position + bonusSteps;
                  if (room.finishMode === 'FIRST_REACH') {
                    if (afterBonusPos >= MAX_POS) {
                      afterBonusPos = MAX_POS;
                      activePlayer.position = MAX_POS;
                      room.phase = 'GAME_OVER';
                      room.winnerPlayerId = activePlayer.id;
                      addRoomLog(room, `🏆 ${activePlayer.name} ได้รับโบนัสก้าวเดินหน้าเข้าเส้นชัยเป็นผู้ชนะ!`, 'SUCCESS');
                    } else {
                      activePlayer.position = afterBonusPos;
                    }
                  } else {
                    if (afterBonusPos > MAX_POS) {
                      const over = afterBonusPos - MAX_POS;
                      afterBonusPos = MAX_POS - over;
                    }
                    activePlayer.position = afterBonusPos;
                    if (afterBonusPos === MAX_POS) {
                      room.phase = 'GAME_OVER';
                      room.winnerPlayerId = activePlayer.id;
                      addRoomLog(room, `🏆 ${activePlayer.name} ได้รับโบนัสก้าวเดินหน้าเข้าเส้นชัยพอดีเป็นผู้ชนะ!`, 'SUCCESS');
                    }
                  }
                } else if (tileEffect.type === 'EXTRA_TURN') {
                  extraTurnGranted = true;
                  addRoomLog(room, `✨ [${activePlayer.name}] ได้รับสิทธิ์เล่นอีก 1 รอบ!`, 'SUCCESS');
                }
              }
            } else if (tileType === 'red') {
              addRoomLog(room, `🔴 [${activePlayer.name}] ตกช่องสีแดง (${currentTile?.title || 'ช่องภัยคุกคาม'}): ${currentTile?.actionText || ''}`, 'TILE');
              if (tileEffect) {
                if (tileEffect.type === 'MOVE_BACKWARD' && tileEffect.steps > 0) {
                  const penaltySteps = tileEffect.steps;
                  activePlayer.position = Math.max(0, activePlayer.position - penaltySteps);
                } else if (tileEffect.type === 'GOTO_START') {
                  activePlayer.position = 0;
                  addRoomLog(room, `⚠️ [${activePlayer.name}] ถูกส่งกลับไปยังจุดเริ่มต้น`, 'WARNING');
                } else if (tileEffect.type === 'SKIP_TURN') {
                  const skipCount = tileEffect.turns || 1;
                  activePlayer.skipTurnCount = (activePlayer.skipTurnCount || 0) + skipCount;
                  addRoomLog(room, `⛔ [${activePlayer.name}] ถูกลงโทษหยุดเล่น ${skipCount} รอบ`, 'WARNING');
                }
              }
            }
            room.currentCardDrawn = null;

            // สลับ Turn ถัดไป (ยกเว้นได้ EXTRA_TURN)
            if (room.phase !== 'GAME_OVER') {
              if (!extraTurnGranted) {
                let nextIndex = (room.activePlayerIndex + 1) % room.players.length;
                if (nextIndex === 0) room.turnNumber++;
                room.activePlayerIndex = nextIndex;
                if (typeof (global as any).advanceToNextValidTurn === 'function') {
                  (global as any).advanceToNextValidTurn(room);
                }
              }
              room.phase = 'PLAYING';
            }
          }

          room.updatedAt = Date.now();

          // Broadcast real-time results to room
          broadcastToRoom(room, 'DICE_ROLLED', {
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            dice: room.lastDiceResult,
            oldPosition,
            newPosition: newPos,
            finalPosition: activePlayer.position,
            steps: die,
            cardDrawn: null,
            nextActivePlayerIndex: room.activePlayerIndex,
            phase: room.phase
          });

          broadcastToRoom(room, 'GAME_STATE_SYNC', { state: getSanitizedRoomState(room) });
          break;
        }

        // --- 6.4. REQUEST_FLIP_CARD (เจ้าของการ์ดกดคลิกเปิดการ์ด) ---
        case 'REQUEST_FLIP_CARD': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'CARD_FLIPPED', {
            playerId: payload.playerId || currentSenderId,
            card: payload.card
          });
          break;
        }

        // --- 6.5. REQUEST_CONFIRM_CARD (เจ้าของการ์ดกดยืนยันปิดการ์ด) ---
        case 'REQUEST_CONFIRM_CARD': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'CARD_CONFIRMED', {
            playerId: payload.playerId || currentSenderId,
            card: payload.card
          });
          break;
        }

        // --- 6.6. REQUEST_CONFIRM_TILE_EVENT (ผู้เล่นที่ได้รางวัล/บทลงโทษกดยืนยันปิดป็อปอัพ) ---
        case 'REQUEST_CONFIRM_TILE_EVENT': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'TILE_EVENT_CONFIRMED', {
            playerId: payload.playerId || currentSenderId,
            tileId: payload.tileId
          });
          break;
        }

        // --- 7. RECONNECT (ต่อการเชื่อมต่อกลับเข้ามา) ---
        case 'RECONNECT': {
          const roomCode = (payload.roomCode || '').toUpperCase().trim();
          const targetPlayerId = payload.playerId;
          const room = rooms.get(roomCode);

          if (!room) {
            sendToClient(ws, 'ERROR', { message: 'ไม่พบห้องสำรองสำหรับการ Reconnect' });
            return;
          }

          const existingPlayer = room.players.find(p => p.id === targetPlayerId);
          if (existingPlayer) {
            existingPlayer.ws = ws;
            existingPlayer.isOnline = true;
            playerRoomCode = roomCode;
            clientPlayerId = existingPlayer.id;

            addRoomLog(room, `${existingPlayer.name} กลับเข้าสู่ห้องแล้ว (Reconnected)`, 'SUCCESS');

            sendToClient(ws, 'ROOM_JOINED', {
              roomCode,
              playerId: existingPlayer.id,
              room: getSanitizedRoomState(room)
            });

            broadcastToRoom(room, 'PLAYER_RECONNECTED', {
              playerId: existingPlayer.id,
              room: getSanitizedRoomState(room)
            });
          } else {
            sendToClient(ws, 'ERROR', { message: 'ไม่พบข้อมูลผู้เล่นสำหรับการ Reconnect' });
          }
          break;
        }

        // --- 7.5. REQUEST_SKIP_TURN (แจ้งข้ามเทิร์นเมื่อติดโทษ) ---
        case 'REQUEST_SKIP_TURN': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room || !room.isGameStarted) return;

          const senderPlayer = room.players.find(p => (currentSenderId && p.id === currentSenderId) || p.ws === ws);
          const activePlayer = room.players[room.activePlayerIndex];

          if (activePlayer && senderPlayer && activePlayer.id === senderPlayer.id) {
            if (activePlayer.skipTurnCount > 0) {
              activePlayer.skipTurnCount--;
              addRoomLog(room, `⏳ [${activePlayer.name}] ชำระโทษหยุดเดิน 1 ตา (เหลือ ${activePlayer.skipTurnCount} ตา)`, 'WARNING');
            }
            let nextIndex = (room.activePlayerIndex + 1) % room.players.length;
            if (nextIndex === 0) room.turnNumber++;
            room.activePlayerIndex = nextIndex;
            room.updatedAt = Date.now();

            broadcastToRoom(room, 'GAME_STATE_SYNC', { state: getSanitizedRoomState(room) });
          }
          break;
        }

        // --- 7.8. REQUEST_REMATCH (ขอเล่นใหม่อีกครั้ง / ถามความพร้อมก่อนเริ่มเกม) ---
        case 'REQUEST_REMATCH': {
          const targetRoomCode = payload.roomCode || playerRoomCode;
          if (!targetRoomCode) return;
          const room = rooms.get(targetRoomCode);
          if (!room) return;

          const senderPlayer = room.players.find(p => (currentSenderId && p.id === currentSenderId) || (payload.playerId && p.id === payload.playerId) || p.ws === ws);
          if (!senderPlayer) return;

          // รีเซ็ตสถานะของผู้เล่นเพื่อเข้าสู่ช่วงตรวจเช็กความพร้อมก่อนเริ่มแมตช์ใหม่
          room.phase = 'REMATCH_READY_CHECK';
          room.winnerPlayerId = null;
          room.players.forEach(p => {
            p.position = 0;
            p.orderRollScore = null;
            p.turnOrderRank = null;
            p.turnOrder = 'รอทอยเต๋า';
            p.skipTurnCount = 0;
            p.pendingCardDraw = false;
            // ผู้เล่นที่กดยื่นข้อเสนอเล่นใหม่จะถือว่าพร้อมทันที คนอื่นต้องกดยืนยันความพร้อม
            p.isReady = (p.id === senderPlayer.id);
          });
          room.updatedAt = Date.now();

          addRoomLog(room, `🔄 [${senderPlayer.name}] ขอเล่นใหม่อีกครั้ง — กรุณายืนยันความพร้อมก่อนเริ่มเกม`, 'INFO');
          console.log(`[Server] 🔄 ผู้เล่น ${senderPlayer.name} เสนอเล่นใหม่อีกครั้งในห้อง ${room.roomCode}`);

          const sanitizedState = getSanitizedRoomState(room);
          broadcastToRoom(room, 'REMATCH_REQUESTED', {
            room: sanitizedState,
            requestedBy: senderPlayer.id,
            requestedByName: senderPlayer.name
          });
          broadcastToRoom(room, 'ROOM_UPDATE', { room: sanitizedState });
          broadcastToRoom(room, 'GAME_STATE_SYNC', { state: sanitizedState });
          break;
        }

        // --- 8. LEAVE ROOM (ออกจากห้อง) ---
        case 'LEAVE_ROOM': {
          if (!playerRoomCode) return;
          handlePlayerLeave(playerRoomCode, clientPlayerId || payload.playerId);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[WebSocket Error]:', err);
    }
  });

  // --- DISCONNECT / CLOSE CONNECTION HANDLER ---
  ws.on("close", () => {
    if (playerRoomCode && clientPlayerId) {
      const room = rooms.get(playerRoomCode);
      if (room) {
        const player = room.players.find(p => p.id === clientPlayerId);
        if (player) {
          player.isOnline = false;
          addRoomLog(room, `${player.name} ขาดการเชื่อมต่อเครือข่าย`, 'DANGER');

          // หากผู้สร้างห้อง (Host) ขาดการเชื่อมต่อ ให้ปิดห้องและแจ้งเตือนผู้เล่นทุกคนว่า "ผู้สร้างห้องปิดห้องแล้ว"
          if (player.isHost || player.id === room.hostId) {
            console.log(`[Server] 👑 ผู้สร้างห้อง ${player.name} ตัดการเชื่อมต่อ -> ปิดห้อง ${playerRoomCode}`);
            broadcastToRoom(room, 'ROOM_CLOSED', {
              message: 'ผู้สร้างห้องปิดห้องแล้ว',
              reason: 'HOST_LEFT',
              hostName: player.name,
              roomCode: playerRoomCode
            });
            rooms.delete(playerRoomCode);
            return;
          }

          broadcastToRoom(room, 'PLAYER_DISCONNECTED', {
            playerId: clientPlayerId,
            room: getSanitizedRoomState(room)
          });
        }
      }
    }
  });
});

/**
 * จัดการเมื่อผู้เล่นกดออกจากห้อง
 */
function handlePlayerLeave(roomCode: string, playerId: string | null) {
  if (!roomCode || !playerId) return;
  const room = rooms.get(roomCode);
  if (!room) return;

  const leavingPlayer = room.players.find(p => p.id === playerId);
  if (leavingPlayer) {
    // หากผู้สร้างห้อง (Host) ออกจากห้อง ให้ปิดห้องและแจ้งผู้เล่นทุกคนว่า "ผู้สร้างห้องปิดห้องแล้ว"
    if (leavingPlayer.isHost || leavingPlayer.id === room.hostId) {
      console.log(`[Server] 👑 ผู้สร้างห้อง ${leavingPlayer.name} ออกจากห้อง ${roomCode} -> ปิดห้องและแจ้งเตือนผู้เล่นทุกคน`);
      addRoomLog(room, `ผู้สร้างห้อง (${leavingPlayer.name}) ออกจากห้องแล้ว — ปิดห้อง`, 'DANGER');
      broadcastToRoom(room, 'ROOM_CLOSED', {
        message: 'ผู้สร้างห้องปิดห้องแล้ว',
        reason: 'HOST_LEFT',
        hostName: leavingPlayer.name,
        roomCode
      });
      rooms.delete(roomCode);
      return;
    }

    // หากเป็นผู้เล่นทั่วไปออกจากห้อง ให้เอาออกจากรายชื่อห้อง ผู้เล่นคนอื่นยังคงอยู่ในห้องได้
    room.players = room.players.filter(p => p.id !== playerId);
    addRoomLog(room, `${leavingPlayer.name} ออกจากห้องแล้ว`, 'INFO');
    console.log(`[Server] 🚶 ผู้เล่นทั่วไป ${leavingPlayer.name} ออกจากห้อง ${roomCode}`);

    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
      // หากกำลังเล่นเกมอยู่ และคิวเทิร์นชี้ไปเกินจำนวนผู้เล่นที่เหลือ
      if (room.activePlayerIndex >= room.players.length) {
        room.activePlayerIndex = 0;
      }
      room.updatedAt = Date.now();
      const sanitizedState = getSanitizedRoomState(room);
      broadcastToRoom(room, 'ROOM_UPDATE', { room: sanitizedState });
      if (room.isGameStarted) {
        broadcastToRoom(room, 'GAME_STATE_SYNC', { state: sanitizedState });
      }
    }
  }
}

// --- REST API ENDPOINTS ---
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/rooms", (_req, res) => {
  const roomList = Array.from(rooms.values()).map(r => ({
    roomCode: r.roomCode,
    roomName: r.roomName || `ห้อง ${r.roomCode}`,
    hasPassword: !!r.password,
    orderMode: r.orderMode || 'DICE',
    finishMode: r.finishMode || 'EXACT_ROLL',
    playersCount: r.players.length,
    maxPlayers: r.maxPlayers,
    isGameStarted: r.isGameStarted
  }));
  res.json({ rooms: roomList });
});

// --- VITE MIDDLEWARE SETUP FOR DEV & PRODUCTION ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api') || url.startsWith('/health')) {
        return next();
      }
      try {
        const rootIndexPath = path.resolve(process.cwd(), 'index.html');
        if (fs.existsSync(rootIndexPath)) {
          let template = fs.readFileSync(rootIndexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const distIndexPath = path.join(distPath, 'index.html');
    const rootIndexPath = path.join(process.cwd(), 'index.html');

    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/health')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }

      const targetPath = fs.existsSync(distIndexPath) ? distIndexPath : rootIndexPath;

      if (fs.existsSync(targetPath)) {
        res.sendFile(targetPath, (err) => {
          if (err && !res.headersSent) {
            res.status(500).send("Error loading application page.");
          }
        });
      } else {
        res.status(500).send("Application build missing. Please run npm run build.");
      }
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Cyber Board Game Server] Express & WebSocket listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
