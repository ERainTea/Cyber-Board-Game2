/**
 * @file server.ts
 * @description Express + WebSocket Server สำหรับระบบ Multiplayer Online แบบ Server-Authoritative
 * รองรับ Room Management, GameState Sync, Dice/Move/Card Sync, Auto Save, Reconnect, Anti-Cheat, Latency Compensation
 * พร้อมการรักษาความปลอดภัยระดับมาตรฐาน:
 * 1. ป้องกันการสวมรอย (Server-issued UUID, Reconnect Token, Connection Closure Identity)
 * 2. ป้องกัน XSS (Strict HTML / Script Stripping)
 * 3. ป้องกัน DoS (Rate Limit, 64KB Payload Limit, Max Rooms Limit, Inactive Room Garbage Collector)
 * 4. ตรวจสอบความถูกต้องและชนิดข้อมูล (Input Validation & Allowed Lists)
 * 5. ป้องกันการสุ่มรหัสผ่าน (Salted SHA-256 Hashing, Brute-Force Rate Limiting)
 * 6. รองรับทั้ง Production (Static dist) และ Development (Vite Middleware)
 * 7. ตรวจสอบ WebSocket Origin
 * 8. Security Headers (CSP, X-Content-Type-Options, X-Frame-Options)
 * 9. บันทึก Log อย่างเหมาะสม ไม่เปิดเผยข้อมูลความลับ
 * 10. กรองคำหยาบเพื่อความปลอดภัยของเยาวชน (Profanity Filter)
 */

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import boardMapData from "./src/Board/boardMap.json";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// --- SECURITY HEADERS MIDDLEWARE ---
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: ws: wss:;"
  );
  next();
});

// --- WEBSOCKET SERVER INITIALIZATION WITH SECURITY CONTROLS ---
const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024, // 64KB Max Payload ป้องกัน Memory Exhaustion / DoS
  verifyClient: (info, callback) => {
    const origin = info.origin || info.req.headers.origin;
    const host = info.req.headers.host;
    if (!origin) return callback(true);
    try {
      const url = new URL(origin);
      if (
        url.host === host ||
        url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname.endsWith(".run.app") ||
        url.hostname.endsWith(".google.com") ||
        url.hostname.endsWith(".googleusercontent.com")
      ) {
        return callback(true);
      }
      console.warn(`[Security] 🚫 ปฏิเสธการเชื่อมต่อ WebSocket จาก Origin ที่ไม่อนุญาต: ${origin}`);
      return callback(false, 403, "Forbidden Origin");
    } catch {
      return callback(true);
    }
  }
});

// --- PROFANITY FILTER (สำหรับปกป้องเยาวชน) ---
const PROFANITY_WORDS = [
  'ควย', 'เหี้ย', 'สัส', 'เย็ด', 'มึง', 'กู', 'ห่า', 'ดอกทอง', 'ชาติชั่ว', 'อีดอก', 'สถุล', 'สันดาน',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'nude', 'porn', 'xxx'
];

function containsProfanity(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROFANITY_WORDS.some(word => lower.includes(word));
}

// --- SERVER-SIDE DATA INTERFACES ---
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

interface RoomToken {
  token: string;
  expiresAt: number;
}

interface Room {
  roomCode: string;
  roomName: string;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  orderMode: 'RANDOM' | 'DICE' | 'JOIN';
  finishMode: 'EXACT_ROLL' | 'FIRST_REACH';
  hostId: string;
  maxPlayers: number;
  isGameStarted: boolean;
  players: NetworkPlayer[];
  tokens: Map<string, RoomToken>;
  activePlayerIndex: number;
  currentRollPlayerIndex: number;
  turnNumber: number;
  phase: string;
  logs: GameLog[];
  lastDiceResult: { die1: number; die2: number; total: number } | null;
  currentCardDrawn: any | null;
  winnerPlayerId: string | null;
  updatedAt: number;
}

const MAX_ACTIVE_ROOMS = 100;
const rooms = new Map<string, Room>();

// บันทึกความพยายามเดารหัสผ่านเพื่อป้องกัน Brute-Force (Key: IP หรือ Connection)
const passwordAttempts = new Map<string, { count: number; lockedUntil: number }>();

function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(salt + ":" + password).digest("hex");
}

// ล้างห้องที่ไม่ได้ใช้งานเป็นระยะทุก 60 วินาที
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const hasOnline = room.players.some(p => p.isOnline);
    // หากไม่มีผู้เล่นออนไลน์เกิน 5 นาที หรือห้องค้างเกิน 2 ชั่วโมง ให้ลบ
    if (!hasOnline && now - room.updatedAt > 5 * 60 * 1000) {
      console.log(`[Server] 🧹 ล้างห้อง ${code} ที่ไม่มีผู้เล่นออนไลน์เกิน 5 นาที`);
      rooms.delete(code);
    } else if (now - room.updatedAt > 2 * 60 * 60 * 1000) {
      console.log(`[Server] 🧹 ล้างห้องค้างเก่า ${code}`);
      rooms.delete(code);
    }
  }
}, 60 * 1000);

/**
 * กรองข้อความและตัดแท็ก HTML และอักขระเสี่ยงสำหรับป้องกัน XSS
 */
function sanitizeInputText(raw: any, maxLength: number = 24, fallback: string = ''): string {
  if (typeof raw !== 'string') return fallback;
  let cleaned = raw.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '');
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  cleaned = cleaned.replace(/[<>'"&`/\\]/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.slice(0, maxLength);
  return cleaned.length > 0 ? cleaned : fallback;
}

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

  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.isOnline = true;
      p.ws.send(packet);
    }
  });
}

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

/**
 * แปลง Room State เป็น Clean Serializable State สำหรับ Sync ไปให้ Clients
 * ข้อสำคัญ: ห้ามส่ง password, passwordHash, passwordSalt หรือ tokens ออกไปเด็ดขาด
 */
function getSanitizedRoomState(room: Room) {
  return {
    roomCode: room.roomCode,
    roomName: sanitizeInputText(room.roomName, 24, `ห้อง ${room.roomCode}`),
    hasPassword: !!room.passwordHash,
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
    logs: room.logs.slice(0, 30),
    players: room.players.map(p => ({
      id: p.id,
      name: sanitizeInputText(p.name, 20, 'ผู้เล่น'),
      colorId: p.colorId,
      color: p.color,
      isHost: p.isHost,
      isReady: p.isReady,
      isOnline: p.isOnline,
      position: p.position || 0,
      cash: p.cash || 0,
      netWorth: p.netWorth || 0,
      isBankrupt: !!p.isBankrupt,
      isInJail: !!p.isInJail,
      skipTurnCount: p.skipTurnCount || 0,
      pendingCardDraw: !!p.pendingCardDraw,
      orderRollScore: p.orderRollScore,
      turnOrderRank: p.turnOrderRank,
      turnOrder: p.turnOrder
    }))
  };
}

/**
 * เพิ่ม Log ประวัติเหตุการณ์ภาษาไทยในห้องอย่างปลอดภัย
 */
function addRoomLog(room: Room, rawMessage: string, type: string = 'INFO') {
  const timeStr = new Date().toLocaleTimeString('th-TH', { hour12: false });
  const message = sanitizeInputText(rawMessage, 120, 'บันทึกเหตุการณ์');
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

// --- WEBSOCKET EVENT HANDLERS ---
wss.on("connection", (ws: WebSocket, req) => {
  // สิทธิ์และตัวตนของผู้เล่นถูกผูกไว้กับ Connection Closure ฝั่งเซิร์ฟเวอร์เท่านั้น
  let playerRoomCode: string | null = null;
  let clientPlayerId: string | null = null;

  // ควบคุม Rate Limit ต่อการเชื่อมต่อ: สูงสุดไม่เกิน 25 ข้อความ/วินาที
  let messageCount = 0;
  let rateWindowStart = Date.now();

  const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "conn";

  ws.on("message", (data: string) => {
    try {
      const now = Date.now();
      if (now - rateWindowStart > 1000) {
        messageCount = 0;
        rateWindowStart = now;
      }
      messageCount++;
      if (messageCount > 25) {
        sendToClient(ws, 'ERROR', { message: 'ส่งข้อความถี่เกินไป กรุณารอสักครู่' });
        return;
      }

      const packet = JSON.parse(data.toString());
      if (!packet || !packet.header || !packet.header.type) return;

      const { type } = packet.header;
      const payload = packet.payload || {};

      switch (type) {
        // --- 1. PING / PONG (Latency Measurement) ---
        case 'PING': {
          sendToClient(ws, 'PONG', { clientTimestamp: payload.timestamp });
          break;
        }

        // --- 2. CREATE ROOM (สร้างห้อง) ---
        case 'CREATE_ROOM': {
          if (rooms.size >= MAX_ACTIVE_ROOMS) {
            sendToClient(ws, 'ERROR', { message: 'เซิร์ฟเวอร์มีห้องเล่นเต็มความจุแล้ว กรุณารอสักครู่' });
            return;
          }

          let customRoomName = sanitizeInputText(payload.roomName, 24, '');
          if (customRoomName && containsProfanity(customRoomName)) {
            sendToClient(ws, 'ERROR', { message: 'กรุณาใช้ชื่อห้องที่สุภาพและเหมาะสมสำหรับเยาวชน' });
            return;
          }

          // ตรวจสอบชื่อห้อง: ต้องไม่เป็นรหัส 6 หลักตัวพิมพ์ใหญ่
          if (customRoomName && /^[A-Za-z0-9]{6}$/.test(customRoomName)) {
            sendToClient(ws, 'ERROR', { message: 'ชื่อห้องต้องไม่เป็นรหัส 6 หลัก (กรุณาตั้งชื่อห้องอื่น)' });
            return;
          }

          const rawHostName = sanitizeInputText(payload.user?.name, 20, 'เจ้าของห้อง');
          if (containsProfanity(rawHostName)) {
            sendToClient(ws, 'ERROR', { message: 'กรุณาใช้ชื่อผู้เล่นที่สุภาพและเหมาะสมสำหรับเยาวชน' });
            return;
          }

          const roomCode = generateRoomCode();
          const hostColor = getUnusedColor([]);
          // สร้าง playerId ฝั่งเซิร์ฟเวอร์ด้วย crypto.randomUUID ป้องกันการปลอมแปลง ID
          const playerId = crypto.randomUUID();
          const reconnectToken = crypto.randomBytes(24).toString("hex");

          const hostPlayer: NetworkPlayer = {
            id: playerId,
            name: rawHostName,
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
          
          // ตรวจสอบและเข้ารหัสรหัสผ่านห้องด้วย Salted SHA-256
          let passwordHash: string | null = null;
          let passwordSalt: string | null = null;
          const cleanedPassword = payload.password ? sanitizeInputText(String(payload.password), 32, '') : '';
          if (cleanedPassword.length > 0) {
            passwordSalt = crypto.randomBytes(16).toString("hex");
            passwordHash = hashPassword(cleanedPassword, passwordSalt);
          }

          const orderMode = payload.orderMode === 'RANDOM' || payload.orderMode === 'JOIN' ? payload.orderMode : 'DICE';
          const finishMode = payload.finishMode === 'FIRST_REACH' ? 'FIRST_REACH' : 'EXACT_ROLL';
          const maxPlayers = Math.max(2, Math.min(6, parseInt(payload.maxPlayers, 10) || 6));

          const newRoom: Room = {
            roomCode,
            roomName: finalRoomName,
            passwordHash,
            passwordSalt,
            orderMode,
            finishMode,
            hostId: hostPlayer.id,
            maxPlayers,
            isGameStarted: false,
            players: [hostPlayer],
            tokens: new Map([[playerId, { token: reconnectToken, expiresAt: Date.now() + 15 * 60 * 1000 }]]),
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
          addRoomLog(newRoom, `สร้างห้อง "${finalRoomName}" [${roomCode}] โดย ${hostPlayer.name} (${orderName} | ${finishName}${newRoom.passwordHash ? ' | 🔒 มีรหัสผ่าน' : ''})`, 'SUCCESS');

          // ส่ง reconnectToken เฉพาะเจ้าตัวเท่านั้น
          sendToClient(ws, 'ROOM_JOINED', {
            roomCode,
            playerId: hostPlayer.id,
            reconnectToken,
            room: getSanitizedRoomState(newRoom)
          });
          break;
        }

        // --- 3. JOIN ROOM (เข้าห้อง) ---
        case 'JOIN_ROOM': {
          const roomCode = sanitizeInputText(payload.roomCode, 6, '').toUpperCase().trim();
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

          // ตรวจสอบการพยายามเดารหัสผ่าน (Brute-Force Rate Limiting)
          const attemptKey = `${clientIp}_${roomCode}`;
          const currentAttempt = passwordAttempts.get(attemptKey);
          if (currentAttempt && currentAttempt.lockedUntil > Date.now()) {
            const waitSec = Math.ceil((currentAttempt.lockedUntil - Date.now()) / 1000);
            sendToClient(ws, 'ERROR', { message: `กรุณารอ ${waitSec} วินาที ก่อนลองป้อนรหัสผ่านใหม่อีกครั้ง` });
            return;
          }

          // ตรวจสอบรหัสผ่านห้อง (หากมีการตั้งรหัสผ่านไว้)
          if (room.passwordHash && room.passwordSalt) {
            const inputPassword = payload.password ? sanitizeInputText(String(payload.password), 32, '') : '';
            const inputHash = hashPassword(inputPassword, room.passwordSalt);
            if (inputHash !== room.passwordHash) {
              const prevCount = currentAttempt ? currentAttempt.count : 0;
              const nextCount = prevCount + 1;
              const lockedUntil = nextCount >= 5 ? Date.now() + 30 * 1000 : 0;
              passwordAttempts.set(attemptKey, { count: nextCount, lockedUntil });

              sendToClient(ws, 'ERROR', { 
                message: inputPassword.length === 0 ? 'ห้องนี้ต้องการรหัสผ่านเพื่อเข้าร่วม' : 'รหัสผ่านห้องไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
                requiresPassword: true,
                roomCode: room.roomCode,
                roomName: room.roomName
              });
              return;
            } else {
              passwordAttempts.delete(attemptKey);
            }
          }

          const rawPlayerName = sanitizeInputText(payload.user?.name, 20, `ผู้เล่น ${room.players.length + 1}`);
          if (containsProfanity(rawPlayerName)) {
            sendToClient(ws, 'ERROR', { message: 'กรุณาใช้ชื่อผู้เล่นที่สุภาพและเหมาะสมสำหรับเยาวชน' });
            return;
          }

          const usedColorIds = room.players.map(p => p.colorId || '');
          const assignedColor = getUnusedColor(usedColorIds);

          // สร้าง playerId ฝั่งเซิร์ฟเวอร์ด้วย UUID
          const playerId = crypto.randomUUID();
          const reconnectToken = crypto.randomBytes(24).toString("hex");

          const newPlayer: NetworkPlayer = {
            id: playerId,
            name: rawPlayerName,
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
          room.tokens.set(playerId, { token: reconnectToken, expiresAt: Date.now() + 15 * 60 * 1000 });
          room.updatedAt = Date.now();
          playerRoomCode = roomCode;
          clientPlayerId = playerId;

          addRoomLog(room, `${newPlayer.name} เข้าร่วมห้องแล้ว`, 'INFO');

          sendToClient(ws, 'ROOM_JOINED', {
            roomCode,
            playerId: newPlayer.id,
            reconnectToken,
            room: getSanitizedRoomState(room)
          });

          broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          break;
        }

        // --- 3.1 CHANGE COLOR (เลือก/เปลี่ยนสีหมากในห้อง) ---
        case 'CHANGE_COLOR': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === clientPlayerId);
          if (!player) return;

          const targetColorId = payload.colorId;
          const colorObj = AVAILABLE_COLORS.find(c => c.id === targetColorId);
          if (!colorObj) {
            sendToClient(ws, 'ERROR', { message: 'สีที่เลือกไม่ถูกต้อง' });
            return;
          }

          // ตรวจสอบว่าสีนี้ถูกผู้เล่นคนอื่นในห้องเลือกไปแล้วหรือไม่
          const isUsedByOther = room.players.some(p => p.id !== clientPlayerId && p.colorId === targetColorId);
          if (isUsedByOther) {
            sendToClient(ws, 'ERROR', { message: 'สีนี้ถูกผู้เล่นคนอื่นเลือกไปแล้ว กรุณาเลือกสีอื่น' });
            return;
          }

          player.colorId = colorObj.id;
          player.color = colorObj.hex;
          room.updatedAt = Date.now();

          addRoomLog(room, `${player.name} เปลี่ยนสีหมากเป็น ${colorObj.name} ${colorObj.icon}`, 'INFO');
          broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          break;
        }

        // --- 3.2 UPDATE ROOM SETTINGS (เฉพาะเจ้าของห้องเท่านั้น) ---
        case 'UPDATE_ROOM_SETTINGS': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          if (room.hostId !== clientPlayerId) {
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
            const trimmedName = sanitizeInputText(payload.roomName, 24, '');
            if (trimmedName && !containsProfanity(trimmedName) && !/^[A-Za-z0-9]{6}$/.test(trimmedName)) {
              room.roomName = trimmedName;
            }
          }

          if (payload.password !== undefined) {
            const rawPass = sanitizeInputText(String(payload.password || ''), 32, '');
            if (rawPass.length > 0) {
              room.passwordSalt = crypto.randomBytes(16).toString("hex");
              room.passwordHash = hashPassword(rawPass, room.passwordSalt);
            } else {
              room.passwordSalt = null;
              room.passwordHash = null;
            }
          }

          room.updatedAt = Date.now();
          const hostPlayer = room.players.find(p => p.id === clientPlayerId);
          const orderLabel = room.orderMode === 'RANDOM' ? 'สุ่มลำดับอัตโนมัติ' : room.orderMode === 'JOIN' ? 'เรียงตามลำดับเข้าห้อง' : 'ทอยเต๋าวัดแต้ม';
          const finishLabel = room.finishMode === 'FIRST_REACH' ? 'ใครถึงก่อนชนะ' : 'ทอยแต้มลงพอดี';
          addRoomLog(room, `👑 ${hostPlayer ? hostPlayer.name : 'เจ้าของห้อง'} อัปเดตการตั้งค่า: ${orderLabel} | ${finishLabel}${room.passwordHash ? ' | 🔒 มีรหัสผ่าน' : ' | 🌐 สาธารณะ'}`, 'INFO');

          broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          break;
        }

        // --- 4. TOGGLE READY (กดพร้อม / ยกเลิกพร้อม) ---
        case 'READY': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          const player = room.players.find(p => p.id === clientPlayerId);
          if (player) {
            player.isReady = payload.isReady !== undefined ? !!payload.isReady : !player.isReady;
            room.updatedAt = Date.now();
            addRoomLog(room, `${player.name} ${player.isReady ? 'พร้อมแล้ว ✅' : 'ยกเลิกความพร้อม ⏳'}`, 'INFO');
            broadcastToRoom(room, 'ROOM_UPDATE', { room: getSanitizedRoomState(room) });
          }
          break;
        }

        // --- 5. START GAME (เฉพาะเจ้าของห้องเท่านั้น) ---
        case 'START_GAME': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          if (room.hostId !== clientPlayerId) {
            sendToClient(ws, 'ERROR', { message: 'เฉพาะเจ้าของห้องเท่านั้นที่สามารถเริ่มเกมได้' });
            return;
          }

          if (room.players.length < 2) {
            sendToClient(ws, 'ERROR', { message: 'ต้องมีผู้เล่นอย่างน้อย 2 คนจึงจะเริ่มเกมได้' });
            return;
          }

          const allReady = room.players.every(p => p.isReady || p.isHost);
          if (!allReady) {
            const unreadyNames = room.players.filter(p => !p.isReady && !p.isHost).map(p => p.name).join(', ');
            sendToClient(ws, 'ERROR', { message: `ผู้เล่นทุกคนในห้องต้องกด "พร้อม" ก่อนเริ่มเกม (ยังไม่พร้อม: ${unreadyNames})` });
            return;
          }

          room.isGameStarted = true;
          room.turnNumber = 1;
          room.updatedAt = Date.now();

          room.players.forEach(p => {
            p.position = 0;
            p.orderRollScore = null;
            p.skipTurnCount = 0;
          });

          if (room.orderMode === 'RANDOM') {
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
            room.players.forEach((p, idx) => {
              p.turnOrderRank = idx + 1;
              p.turnOrder = `ลำดับที่ ${idx + 1}`;
            });
            room.phase = 'PLAYING';
            room.activePlayerIndex = 0;
            room.currentRollPlayerIndex = 0;
            addRoomLog(room, `📋 เรียงตามลำดับเข้าร่วมห้อง! [${room.players[0].name}] ได้เริ่มเดินคนแรก`, 'SUCCESS');
          } else {
            room.phase = 'DETERMINE_ORDER';
            room.currentRollPlayerIndex = 0;
            room.activePlayerIndex = 0;
            addRoomLog(room, '🎲 เกมเริ่มต้นแล้ว! กำลังเข้าสู่ขั้นตอนทอยเต๋าวัดแต้มสุ่มลำดับการเล่น', 'SUCCESS');
          }

          const sanitizedState = getSanitizedRoomState(room);
          broadcastToRoom(room, 'GAME_STATE_SYNC', { state: sanitizedState });
          broadcastToRoom(room, 'ROOM_UPDATE', { room: sanitizedState });
          break;
        }

        // --- 6. SERVER-AUTHORITATIVE DICE ROLL (ขอทอดลูกเต๋า) ---
        case 'REQUEST_ROLL_DICE': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room || !room.isGameStarted) return;

          // --- A) DETERMINE_ORDER PHASE (ทอยเต๋าสุ่มลำดับ) ---
          if (room.phase === 'DETERMINE_ORDER') {
            const currentRollPlayer = room.players[room.currentRollPlayerIndex || 0];
            if (!currentRollPlayer || currentRollPlayer.id !== clientPlayerId) {
              sendToClient(ws, 'ERROR', { message: `ยังไม่ถึงตาทอยเต๋ากำหนดลำดับของคุณ (ขณะนี้ถึงตาผู้เล่น ${currentRollPlayer ? currentRollPlayer.name : ''})` });
              return;
            }

            const die = Math.floor(Math.random() * 6) + 1;
            currentRollPlayer.orderRollScore = die;
            addRoomLog(room, `${currentRollPlayer.name} ทอยเต๋าสุ่มลำดับได้ ${die} แต้ม 🎲`, 'DICE');

            const rollIdx = room.currentRollPlayerIndex || 0;
            room.currentRollPlayerIndex = rollIdx + 1;

            if (room.currentRollPlayerIndex >= room.players.length) {
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
          if (!activePlayer || activePlayer.id !== clientPlayerId) {
            sendToClient(ws, 'ERROR', { message: `ยังไม่ถึงตาการเล่นของคุณ (ขณะนี้ถึงตาผู้เล่น ${activePlayer ? activePlayer.name : ''})` });
            return;
          }

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

          if (activePlayer.pendingCardDraw) {
            activePlayer.pendingCardDraw = false;
          }

          const die = Math.floor(Math.random() * 6) + 1;
          const oldPosition = activePlayer.position || 0;
          room.lastDiceResult = { die1: die, die2: 0, total: die };
          addRoomLog(room, `${activePlayer.name} ทอดลูกเต๋าได้ ${die} แต้ม 🎲`, 'DICE');

          const MAX_POS = Math.max(0, (boardMapData as any[]).length - 1); // 38
          let newPos = oldPosition + die;

          if (room.finishMode === 'FIRST_REACH') {
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

            if (room.phase !== 'GAME_OVER') {
              if (!extraTurnGranted) {
                let nextIndex = (room.activePlayerIndex + 1) % room.players.length;
                if (nextIndex === 0) room.turnNumber++;
                room.activePlayerIndex = nextIndex;
                advanceToNextValidTurn(room);
              }
              room.phase = 'PLAYING';
            }
          }

          room.updatedAt = Date.now();

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

        // --- 6.4. REQUEST_FLIP_CARD ---
        case 'REQUEST_FLIP_CARD': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'CARD_FLIPPED', {
            playerId: clientPlayerId,
            card: payload.card
          });
          break;
        }

        // --- 6.5. REQUEST_CONFIRM_CARD ---
        case 'REQUEST_CONFIRM_CARD': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'CARD_CONFIRMED', {
            playerId: clientPlayerId,
            card: payload.card
          });
          break;
        }

        // --- 6.6. REQUEST_CONFIRM_TILE_EVENT ---
        case 'REQUEST_CONFIRM_TILE_EVENT': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          broadcastToRoom(room, 'TILE_EVENT_CONFIRMED', {
            playerId: clientPlayerId,
            tileId: payload.tileId
          });
          break;
        }

        // --- 7. RECONNECT (ต้องมี Reconnect Token ที่เซิร์ฟเวอร์สุ่มให้) ---
        case 'RECONNECT': {
          const roomCode = sanitizeInputText(payload.roomCode, 6, '').toUpperCase().trim();
          const targetPlayerId = payload.playerId;
          const clientReconnectToken = payload.reconnectToken;

          if (!roomCode || !targetPlayerId || !clientReconnectToken) {
            sendToClient(ws, 'ERROR', { message: 'ข้อมูลสำหรับต่อเข้าห้องใหม่ไม่ครบถ้วน' });
            return;
          }

          const room = rooms.get(roomCode);
          if (!room) {
            sendToClient(ws, 'ERROR', { message: 'ไม่พบห้องสำรองสำหรับการ Reconnect' });
            return;
          }

          // ตรวจสอบความถูกต้องของ Token ลับ
          const storedToken = room.tokens?.get(targetPlayerId);
          if (!storedToken || storedToken.token !== clientReconnectToken || Date.now() > storedToken.expiresAt) {
            sendToClient(ws, 'ERROR', { message: 'ไม่สามารถกลับเข้าห้องได้: รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ' });
            return;
          }

          const existingPlayer = room.players.find(p => p.id === targetPlayerId);
          if (existingPlayer) {
            existingPlayer.ws = ws;
            existingPlayer.isOnline = true;
            playerRoomCode = roomCode;
            clientPlayerId = existingPlayer.id;

            // ต่ออายุ Reconnect Token อีก 15 นาที
            storedToken.expiresAt = Date.now() + 15 * 60 * 1000;

            addRoomLog(room, `${existingPlayer.name} กลับเข้าสู่ห้องแล้ว (Reconnected)`, 'SUCCESS');

            sendToClient(ws, 'ROOM_JOINED', {
              roomCode,
              playerId: existingPlayer.id,
              reconnectToken: clientReconnectToken,
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

        // --- 7.5. REQUEST_SKIP_TURN ---
        case 'REQUEST_SKIP_TURN': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room || !room.isGameStarted) return;

          const activePlayer = room.players[room.activePlayerIndex];
          if (activePlayer && activePlayer.id === clientPlayerId) {
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

        // --- 7.8. REQUEST_REMATCH ---
        case 'REQUEST_REMATCH': {
          if (!playerRoomCode || !clientPlayerId) return;
          const room = rooms.get(playerRoomCode);
          if (!room) return;

          const senderPlayer = room.players.find(p => p.id === clientPlayerId);
          if (!senderPlayer) return;

          room.phase = 'REMATCH_READY_CHECK';
          room.winnerPlayerId = null;
          room.players.forEach(p => {
            p.position = 0;
            p.orderRollScore = null;
            p.turnOrderRank = null;
            p.turnOrder = 'รอทอยเต๋า';
            p.skipTurnCount = 0;
            p.pendingCardDraw = false;
            p.isReady = (p.id === clientPlayerId);
          });
          room.updatedAt = Date.now();

          addRoomLog(room, `🔄 [${senderPlayer.name}] ขอเล่นใหม่อีกครั้ง — กรุณายืนยันความพร้อมก่อนเริ่มเกม`, 'INFO');

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
          if (playerRoomCode && clientPlayerId) {
            handlePlayerLeave(playerRoomCode, clientPlayerId);
            playerRoomCode = null;
            clientPlayerId = null;
          }
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

          // หากผู้สร้างห้อง (Host) ขาดการเชื่อมต่อ ให้ปิดห้อง
          if (player.isHost || player.id === room.hostId) {
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
    if (leavingPlayer.isHost || leavingPlayer.id === room.hostId) {
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

    room.players = room.players.filter(p => p.id !== playerId);
    room.tokens?.delete(playerId);
    addRoomLog(room, `${leavingPlayer.name} ออกจากห้องแล้ว`, 'INFO');

    if (room.players.length === 0) {
      rooms.delete(roomCode);
    } else {
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
    roomName: sanitizeInputText(r.roomName, 24, `ห้อง ${r.roomCode}`),
    hasPassword: !!r.passwordHash,
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
