/**
 * @file src/game/Players.ts
 * @description ระบบจัดการผู้เล่น (Player System) และปัญญาประดิษฐ์ (Bot AI Engine)
 */

import { BoardTile, PlayerState, PlayerType } from './types';
import { ASSET_URLS } from './Assets';

/** รายชื่อผู้เล่นเริ่มต้นมาตรฐาน */
export const DEFAULT_PLAYERS: PlayerState[] = [
  {
    id: 1,
    name: 'ผู้เล่น 1 (คุณ)',
    type: 'HUMAN',
    color: '#ef4444', // สีแดง
    avatarUrl: ASSET_URLS.avatars[0],
    cash: 15000,
    position: 0,
    lapsCompleted: 0,
    isInJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    isBankrupt: false,
    netWorth: 15000,
    stats: { rentPaidTotal: 0, rentCollectedTotal: 0, propertiesBought: 0, housesBuilt: 0 },
  },
  {
    id: 2,
    name: 'บอท นกช้าง (AI)',
    type: 'BOT_MEDIUM',
    color: '#3b82f6', // สีน้ำเงิน
    avatarUrl: ASSET_URLS.avatars[1],
    cash: 15000,
    position: 0,
    lapsCompleted: 0,
    isInJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    isBankrupt: false,
    netWorth: 15000,
    stats: { rentPaidTotal: 0, rentCollectedTotal: 0, propertiesBought: 0, housesBuilt: 0 },
  },
  {
    id: 3,
    name: 'บอท เหมียวชิบะ (AI)',
    type: 'BOT_EASY',
    color: '#10b981', // สีเขียว
    avatarUrl: ASSET_URLS.avatars[2],
    cash: 15000,
    position: 0,
    lapsCompleted: 0,
    isInJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    isBankrupt: false,
    netWorth: 15000,
    stats: { rentPaidTotal: 0, rentCollectedTotal: 0, propertiesBought: 0, housesBuilt: 0 },
  },
  {
    id: 4,
    name: 'บอท แพนด้าเซียน (AI)',
    type: 'BOT_HARD',
    color: '#f59e0b', // สีส้ม
    avatarUrl: ASSET_URLS.avatars[3],
    cash: 15000,
    position: 0,
    lapsCompleted: 0,
    isInJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    isBankrupt: false,
    netWorth: 15000,
    stats: { rentPaidTotal: 0, rentCollectedTotal: 0, propertiesBought: 0, housesBuilt: 0 },
  },
];

/**
 * คำนวณมูลค่าทรัพย์สินรวม (Net Worth) ของผู้เล่น
 * @param player ผู้เล่นที่ต้องการคำนวณ
 * @param board ข้อมูลตารางกระดาน
 * @returns number มูลค่าทรัพย์สินรวม
 */
export function calculateNetWorth(player: PlayerState, board: BoardTile[]): number {
  if (player.isBankrupt) return 0;

  let total = player.cash;
  board.forEach((tile) => {
    if (tile.ownerId === player.id) {
      // ราคาที่ดิน
      total += tile.price || 0;
      // ราคาสิ่งปลูกสร้าง
      if (tile.houseCount > 0 && tile.housePrice) {
        total += tile.houseCount * tile.housePrice;
      }
    }
  });

  return total;
}

/**
 * การตัดสินใจของ Bot AI เมื่อต้องเลือกซื้ออสังหาริมทรัพย์
 * @param bot ผู้เล่นที่เป็น AI
 * @param tile ช่องที่ตก
 * @param currentCash เงินสดของบอท
 * @returns boolean ตัดสินใจซื้อหรือไม่
 */
export function shouldBotBuyProperty(bot: PlayerState, tile: BoardTile, currentCash: number): boolean {
  if (!tile.price) return false;
  const price = tile.price;

  // หากเงินสดไม่พอ ซื้อไม่ได้แน่นอน
  if (currentCash < price) return false;

  const cashAfterBuy = currentCash - price;

  switch (bot.type) {
    case 'BOT_EASY':
      // บอทระดับง่าย: สุ่มซื้อ หากเหลือเงินเกิน 1,000
      return cashAfterBuy >= 1000 && Math.random() < 0.7;

    case 'BOT_MEDIUM':
      // บอทระดับปานกลาง: ซื้อถ้าเหลือเงินสำรอง 2,000 บาท
      return cashAfterBuy >= 2000;

    case 'BOT_HARD':
      // บอทระดับยาก: คำนวณความคุ้มค่า ซื้อทันทีถ้าเหลือเงินสำรอง 1,500 บาท
      return cashAfterBuy >= 1500;

    default:
      return cashAfterBuy >= 2000;
  }
}

/**
 * การตัดสินใจของ Bot AI เมื่อต้องการอัปเกรด/สร้างบ้าน
 * @param bot ผู้เล่นที่เป็น AI
 * @param tile ช่องที่ต้องการอัปเกรด
 * @returns boolean สร้างหรือไม่
 */
export function shouldBotBuildHouse(bot: PlayerState, tile: BoardTile): boolean {
  if (!tile.housePrice) return false;
  if (tile.houseCount >= 5) return false; // เต็มแล้ว

  const cost = tile.housePrice;
  const reserveCashNeeded = bot.type === 'BOT_HARD' ? 1200 : 2500;

  return bot.cash - cost >= reserveCashNeeded;
}
