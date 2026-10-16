/**
 * @file src/game/Dice.ts
 * @description ระบบลูกเต๋าและการสุ่มหน้าลูกเต๋า (Dice System)
 */

import { DiceResult } from './types';

/**
 * สุ่มผลการทอดลูกเต๋า 2 ลูก
 * @param previousConsecutiveDoubles จำนวนครั้งที่ทอดได้หน้าคู่ติดต่อกันก่อนหน้า
 * @returns DiceResult ผลการสุ่มพร้อมการคำนวณเบิ้ล
 */
export function rollDice(previousConsecutiveDoubles: number = 0): DiceResult {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  const isDouble = die1 === die2;
  const consecutiveDoubles = isDouble ? previousConsecutiveDoubles + 1 : 0;

  return {
    die1,
    die2,
    total,
    isDouble,
    consecutiveDoubles,
  };
}

/**
 * แปลงค่าหน้าลูกเต๋าเป็นอักขระ Unicode Dice Symbol (🎲)
 * @param value หน้าลูกเต๋า (1-6)
 * @returns string สัญลักษณ์ Unicode
 */
export function getDiceSymbol(value: number): string {
  const symbols = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return symbols[Math.max(0, Math.min(5, value - 1))] || '🎲';
}
