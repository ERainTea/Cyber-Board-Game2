/**
 * @file src/game/Systems.ts
 * @description ระบบกฎกติกาการเล่น (Game Logic Systems)
 * จัดการการคำนวณค่าเช่า, การซื้อขาย, การประมวลผลผลการ์ด และเงื่อนไขการล้มละลาย
 */

import { BoardTile, GameCard, GameState, PlayerState } from './types';

/**
 * คำนวณค่าเช่าอสังหาริมทรัพย์สำหรับผู้เล่นที่เดินตก
 * @param tile ช่องอสังหาริมทรัพย์
 * @param board ข้อมูลตารางกระดานทั้งหมด
 * @returns number จำนวนเงินค่าเช่าที่ต้องจ่าย
 */
export function calculateRent(tile: BoardTile, board: BoardTile[]): number {
  if (!tile.ownerId || tile.isMortgaged) return 0;

  // กรณีเป็นประเภทพิเศษ เช่น รถไฟ หรือ สาธารณูปโภค
  if (tile.type === 'TRANSPORT') {
    const ownerTransports = board.filter((t) => t.type === 'TRANSPORT' && t.ownerId === tile.ownerId).length;
    return (tile.baseRent || 250) * Math.pow(2, ownerTransports - 1);
  }

  if (tile.type === 'UTILITY') {
    const ownerUtilities = board.filter((t) => t.type === 'UTILITY' && t.ownerId === tile.ownerId).length;
    return ownerUtilities >= 2 ? 600 : 200;
  }

  // กรณีเป็นอสังหาริมทรัพย์ปกติ (PROPERTY)
  if (!tile.rentLevels || tile.rentLevels.length === 0) {
    return tile.baseRent || 100;
  }

  // ตรวจสอบระดับบ้าน (0 = ที่ดินเปล่า, 1-4 = บ้าน 1-4 หลัง, 5 = โรงแรม)
  if (tile.houseCount > 0 && tile.houseCount <= tile.rentLevels.length) {
    return tile.rentLevels[tile.houseCount - 1];
  }

  // หากเป็นที่ดินเปล่า แต่เจ้าของครอบครองครบทุกเมืองในกลุ่มสีเดียวกัน (Monopoly) ค่าเช่าจะเพิ่มเป็น 2 เท่า
  const isColorMonopoly = checkColorMonopoly(tile.colorGroup, tile.ownerId, board);
  const baseRent = tile.baseRent || 100;

  return isColorMonopoly ? baseRent * 2 : baseRent;
}

/**
 * ตรวจสอบว่าผู้เล่นคนนี้ครอบครองที่ดินครบทุกช่องในกลุ่มสีเดียวกันหรือไม่
 * @param colorGroup กลุ่มสีที่ต้องการตรวจ
 * @param ownerId รหัสผู้เล่นเจ้าของ
 * @param board ข้อมูลกระดาน
 * @returns boolean ครบหรือไม่
 */
export function checkColorMonopoly(colorGroup: string | undefined, ownerId: number, board: BoardTile[]): boolean {
  if (!colorGroup || colorGroup === 'SPECIAL') return false;

  const colorTiles = board.filter((t) => t.colorGroup === colorGroup);
  if (colorTiles.length === 0) return false;

  return colorTiles.every((t) => t.ownerId === ownerId);
}

/**
 * ประมวลผลการทำงานของการ์ดเสี่ยงโชค/หีบสมบัติ
 * @param card การ์ดที่เปิดได้
 * @param state สถานะเกมปัจจุบัน
 * @returns GameState สถานะเกมใหม่หลังประมวลผล
 */
export function processCardEffect(card: GameCard, state: GameState): { updatedState: GameState; logMessage: string } {
  const activePlayer = state.players[state.activePlayerIndex];
  let logMessage = `${activePlayer.name} เปิดได้การ์ด "${card.title}": ${card.description}`;
  const updatedPlayers = [...state.players];
  const updatedPlayer = { ...activePlayer };

  switch (card.actionType) {
    case 'ADD_CASH':
      updatedPlayer.cash += card.value;
      logMessage += ` (ได้รับเงิน +${card.value.toLocaleString()} บาท)`;
      break;

    case 'DEDUCT_CASH':
      updatedPlayer.cash = Math.max(0, updatedPlayer.cash - card.value);
      logMessage += ` (จ่ายเงิน -${card.value.toLocaleString()} บาท)`;
      break;

    case 'MOVE_TO':
      if (card.targetTileId !== undefined) {
        // หากเดินผ่านจุดเริ่มต้น
        if (card.targetTileId < updatedPlayer.position && card.targetTileId !== 0) {
          updatedPlayer.cash += state.settings.passGoSalary;
          logMessage += ` (ผ่านจุดเริ่มต้น รับเงิน +${state.settings.passGoSalary.toLocaleString()} บาท)`;
        }
        updatedPlayer.position = card.targetTileId;
      }
      break;

    case 'MOVE_STEPS': {
      const totalTiles = state.board.length;
      const newPos = (updatedPlayer.position + card.value) % totalTiles;
      if (newPos < updatedPlayer.position) {
        updatedPlayer.cash += state.settings.passGoSalary;
      }
      updatedPlayer.position = newPos;
      break;
    }

    case 'GO_TO_JAIL':
      updatedPlayer.isInJail = true;
      updatedPlayer.jailTurns = 0;
      // ช่องคุกคือช่องที่ 6
      updatedPlayer.position = 6;
      logMessage += ' (ถูกส่งเข้าคุก!)';
      break;

    case 'GET_JAIL_FREE':
      updatedPlayer.jailFreeCards += 1;
      logMessage += ' (ได้รับการ์ดออกจากคุกฟรี 1 ใบ)';
      break;

    case 'COLLECT_FROM_ALL': {
      let collected = 0;
      updatedPlayers.forEach((p, idx) => {
        if (idx !== state.activePlayerIndex && !p.isBankrupt) {
          const payAmount = Math.min(p.cash, card.value);
          p.cash -= payAmount;
          collected += payAmount;
        }
      });
      updatedPlayer.cash += collected;
      logMessage += ` (เก็บเงินรวมได้ +${collected.toLocaleString()} บาท)`;
      break;
    }

    case 'PAY_TO_ALL': {
      updatedPlayers.forEach((p, idx) => {
        if (idx !== state.activePlayerIndex && !p.isBankrupt) {
          const payAmount = Math.min(updatedPlayer.cash, card.value);
          updatedPlayer.cash -= payAmount;
          p.cash += payAmount;
        }
      });
      break;
    }
  }

  updatedPlayers[state.activePlayerIndex] = updatedPlayer;

  return {
    updatedState: {
      ...state,
      players: updatedPlayers,
    },
    logMessage,
  };
}

/**
 * ตรวจสอบสถานะการจบเกม (มีผู้เหลือรอดเพียงคนเดียว)
 * @param state สถานะเกมปัจจุบัน
 * @returns { isGameOver: boolean, winnerId: number | null }
 */
export function checkGameOver(state: GameState): { isGameOver: boolean; winnerId: number | null } {
  const activePlayers = state.players.filter((p) => !p.isBankrupt);

  if (activePlayers.length === 1) {
    return {
      isGameOver: true,
      winnerId: activePlayers[0].id,
    };
  }

  return {
    isGameOver: false,
    winnerId: null,
  };
}
