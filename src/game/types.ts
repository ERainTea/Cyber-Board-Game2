/**
 * @file src/game/types.ts
 * @description นิยามชนิดข้อมูล (Type Definitions) ทั้งหมดของระบบเกมกระดาน
 * รองรับการจัดการ GameState เดี่ยว เพื่อเตรียมพร้อมสำหรับ Multiplayer ในอนาคต
 */

/** สถานะขั้นตอนของเกม (Game Phase) */
export type GamePhase =
  | 'WAITING_FOR_PLAYERS' // กำลังรอผู้เล่น / ตั้งค่าห้อง
  | 'READY_TO_ROLL'       // พร้อมสำหรับการทอดลูกเต๋า
  | 'ROLLING_DICE'        // กำลังหมุน/ทอดลูกเต๋า
  | 'MOVING_PLAYER'       // กำลังเคลื่อนที่ตัวหมาก
  | 'TILE_ACTION'         // กำลังทำแอคชั่นในช่องที่ตก
  | 'PROPERTY_DECISION'   // กำลังตัดสินใจซื้อ/ไม่ซื้ออสังหาริมทรัพย์
  | 'BUILDING_DECISION'   // กำลังสร้างบ้าน/แลนด์มาร์ก
  | 'CARD_DRAWN'          // กำลังเปิดการ์ดเสี่ยงโชค/หีบสมบัติ
  | 'IN_JAIL_DECISION'    // อยู่ในคุก (เลือกว่าจะจ่ายเงิน หรือวัดดวง)
  | 'TRADE_NEGOTIATION'   // กำลังเจรจาซื้อขายอสังหาริมทรัพย์
  | 'BANKRUPT_PENDING'    // กำลังจัดการหนี้สิน/ล้มละลาย
  | 'GAME_OVER';          // จบเกม มีผู้ชนะ

/** ประเภทของช่องบนกระดาน */
export type TileType =
  | 'START'         // จุดเริ่มต้น (Pass GO)
  | 'PROPERTY'      // อสังหาริมทรัพย์ (เมือง/ที่ดิน)
  | 'UTILITY'       // สาธารณูปโภค (ประปา/ไฟฟ้า)
  | 'TRANSPORT'     // สถานีรถไฟ/การขนส่ง
  | 'CHANCE'        // การ์ดโชคชะตา
  | 'CHEST'         // การ์ดหีบสมบัติ
  | 'TAX'           // ภาษี (รายได้/บำรุงเมือง)
  | 'JAIL'          // คุก / พื้นที่เยี่ยมชม
  | 'GO_TO_JAIL'    // ส่งเข้าคุกทันที
  | 'FREE_PARKING'; // จุดพักผ่อนฟรี

/** กลุ่มสีของที่ดิน (Color Group) */
export type PropertyColorGroup =
  | 'BROWN'
  | 'LIGHT_BLUE'
  | 'PINK'
  | 'ORANGE'
  | 'RED'
  | 'YELLOW'
  | 'GREEN'
  | 'BLUE'
  | 'SPECIAL';

/** ข้อมูลช่องบนกระดาน (Board Tile) */
export interface BoardTile {
  /** รหัสช่อง */
  id: number;
  /** ชื่อช่อง (ภาษาไทย) */
  name: string;
  /** ประเภทช่อง */
  type: TileType;
  /** กลุ่มสี */
  colorGroup?: PropertyColorGroup;
  /** ราคาซื้อที่ดิน (บาท) */
  price?: number;
  /** ค่าเช่าพื้นฐาน (บาท) */
  baseRent?: number;
  /** ค่าเช่าแยกตามจำนวนบ้าน [บ้าน 1, บ้าน 2, บ้าน 3, บ้าน 4, โรงแรม/แลนด์มาร์ก] */
  rentLevels?: number[];
  /** ราคาในการสร้างบ้านแต่ละหลัง (บาท) */
  housePrice?: number;
  /** เจ้าของปัจจุบัน (player id หรือ null หากไม่มีเจ้าของ) */
  ownerId: number | null;
  /** จำนวนบ้านที่สร้างอยู่ปัจจุบัน (0 = ที่ดินเปล่า, 1-4 = บ้าน, 5 = โรงแรม) */
  houseCount: number;
  /** สถานะติดจำนองหรือไม่ */
  isMortgaged: boolean;
  /** ข้อความอธิบายหรือรายละเอียดช่อง */
  description?: string;
  /** URL รูปภาพประกอบประจำช่อง (Cloudinary CDN) */
  imageUrl?: string;
}

/** ประเภทของตัวผู้เล่น */
export type PlayerType = 'HUMAN' | 'BOT_EASY' | 'BOT_MEDIUM' | 'BOT_HARD';

/** ข้อมูลของผู้เล่น (Player State) */
export interface PlayerState {
  /** รหัสผู้เล่น (1, 2, 3, 4) */
  id: number;
  /** ชื่อผู้เล่น */
  name: string;
  /** ประเภทผู้เล่น */
  type: PlayerType;
  /** สีประจำตัวผู้เล่น (Hex code) */
  color: string;
  /** รูปโปรไฟล์ Avatar URL */
  avatarUrl: string;
  /** เงินสดคงเหลือ (บาท) */
  cash: number;
  /** ตำแหน่งปัจจุบันบนกระดาน (0 ถึง totalTiles-1) */
  position: number;
  /** จำนวนรอบที่เดินครบกระดาน */
  lapsCompleted: number;
  /** อยู่ในคุกหรือไม่ */
  isInJail: boolean;
  /** จำนวนรอบที่อยู่ในคุก */
  jailTurns: number;
  /** จำนวนการ์ดออกจากคุกฟรีที่มีอยู่ */
  jailFreeCards: number;
  /** ล้มละลายแล้วหรือไม่ */
  isBankrupt: boolean;
  /** มูลค่าทรัพย์สินรวม (Net Worth) */
  netWorth: number;
  /** สถิติในเกม */
  stats: {
    rentPaidTotal: number;
    rentCollectedTotal: number;
    propertiesBought: number;
    housesBuilt: number;
  };
}

/** ประเภทผลของการ์ด */
export type CardActionType =
  | 'ADD_CASH'        // ได้รับเงิน
  | 'DEDUCT_CASH'     // เสียเงิน
  | 'MOVE_TO'         // ย้ายไปยังช่องที่กำหนด
  | 'MOVE_STEPS'      // เดินไปข้างหน้า N ช่อง
  | 'GO_TO_JAIL'      // ส่งเข้าคุก
  | 'GET_JAIL_FREE'   // ได้รับการ์ดออกจากคุกฟรี
  | 'COLLECT_FROM_ALL'// เก็บเงินจากผู้เล่นทุกคน
  | 'PAY_TO_ALL';     // จ่ายเงินให้ผู้เล่นทุกคน

/** ข้อมูลการ์ดโชคชะตา/หีบสมบัติ */
export interface GameCard {
  id: string;
  title: string;
  description: string;
  actionType: CardActionType;
  value: number; // จำนวนเงิน หรือ ตำแหน่งช่อง
  targetTileId?: number;
  imageUrl?: string;
}

/** บันทึกเหตุการณ์ในเกม (Game Log) */
export interface GameLogEntry {
  id: string;
  timestamp: string;
  playerId?: number;
  playerName?: string;
  playerColor?: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER' | 'DICE' | 'CARD';
}

/** ผลการทอดลูกเต๋า */
export interface DiceResult {
  die1: number;
  die2: number;
  total: number;
  isDouble: boolean;
  consecutiveDoubles: number;
}

/** การตั้งค่าระบบเกม */
export interface GameSettings {
  soundVolume: number;     // 0.0 ถึง 1.0
  musicVolume: number;     // 0.0 ถึง 1.0
  gameSpeed: 'NORMAL' | 'FAST' | 'INSTANT';
  startingCash: number;    // เงินเริ่มต้น (เช่น 15,000 บาท)
  passGoSalary: number;    // เงินเมื่อผ่านจุดเริ่มต้น (เช่น 2,000 บาท)
  maxDoublesCount: number; // ทอดเต๋าได้หน้าคู่ติดกันกี่ครั้งถึงจะเข้าคุก (3)
}

/**
 * โครงสร้างข้อมูล GameState กลาง
 * Single Source of Truth สำหรับจัดการเกมทั้งหมด
 */
export interface GameState {
  /** รหัสห้องเกม */
  roomId: string;
  /** รอบการเล่นปัจจุบัน (Turn Count) */
  turnNumber: number;
  /** ดัชนีผู้เล่นที่กำลังเล่นอยู่ปัจจุบัน (0 ถึง players.length - 1) */
  activePlayerIndex: number;
  /** สถานะขั้นตอนการเล่น */
  phase: GamePhase;
  /** รายชื่อผู้เล่นทั้งหมด */
  players: PlayerState[];
  /** ข้อมูลช่องบนกระดานทั้งหมด */
  board: BoardTile[];
  /** ข้อมูลผลลูกเต๋าล่าสุด */
  lastDiceResult: DiceResult | null;
  /** รายการประวัติเหตุการณ์ */
  logs: GameLogEntry[];
  /** ข้อมูลการ์ดที่เปิดได้ล่าสุด */
  currentCardDrawn: GameCard | null;
  /** รหัสช่องที่ผู้เล่นเพิ่งเดินไปตก */
  currentLandedTileId: number | null;
  /** ผู้ชนะเลิศ (กรณีจบเกม) */
  winnerPlayerId: number | null;
  /** ตั้งค่าระบบ */
  settings: GameSettings;
  /** เวลาเริ่มเกม */
  startTime: number;
}
