/**
 * @file src/game/Cards.ts
 * @description สำรับการ์ดโชคชะตา (Chance Cards) และ การ์ดหีบสมบัติ (Community Chest Cards)
 */

import { GameCard } from './types';

/** สำรับการ์ดโชคชะตา (Chance Cards) */
export const CHANCE_CARDS: GameCard[] = [
  {
    id: 'chance_1',
    title: 'โชคดีจากการลงทุน',
    description: 'หุ้นไทยพุ่งสูงขึ้น! ได้รับเงินปันผล 2,000 บาท',
    actionType: 'ADD_CASH',
    value: 2000,
  },
  {
    id: 'chance_2',
    title: 'จ่ายภาษีรายได้',
    description: 'กรมสรรพากรเรียกเก็บภาษีเพิ่มเติม จ่ายเงิน 1,500 บาท',
    actionType: 'DEDUCT_CASH',
    value: 1500,
  },
  {
    id: 'chance_3',
    title: 'เดินทางเที่ยวเชียงใหม่',
    description: 'นั่งรถไฟไปแอ่วเชียงใหม่ ย้ายไปยังช่องเชียงใหม่ทันที',
    actionType: 'MOVE_TO',
    value: 5, // ID ช่องเชียงใหม่
    targetTileId: 5,
  },
  {
    id: 'chance_4',
    title: 'เลี้ยงอาหารเพื่อนๆ',
    description: 'จัดงานเลี้ยงฉลองความสำเร็จ จ่ายเงินให้ผู้เล่นทุกคนคนละ 500 บาท',
    actionType: 'PAY_TO_ALL',
    value: 500,
  },
  {
    id: 'chance_5',
    title: 'ขับรถเร็วเกินกำหนด',
    description: 'โดนใบสั่งจากตำรวจจราจร ส่งเข้าคุกทันที!',
    actionType: 'GO_TO_JAIL',
    value: 0,
  },
  {
    id: 'chance_6',
    title: 'การ์ดออกจากคุกฟรี',
    description: 'ใบสั่งคำสั่งศาลพิจารณาคดีฟรี ใช้เพื่อออกจากคุกได้ 1 ครั้ง',
    actionType: 'GET_JAIL_FREE',
    value: 0,
  },
  {
    id: 'chance_7',
    title: 'ก้าวหน้าทางธุรกิจ',
    description: 'เดินหน้าไปข้างหน้า 3 ช่อง',
    actionType: 'MOVE_STEPS',
    value: 3,
  },
  {
    id: 'chance_8',
    title: 'ชนะการประกวดนวัตกรรม',
    description: 'ได้รับเงินรางวัลชมนวัตกรรมยอดเยี่ยม 3,000 บาท',
    actionType: 'ADD_CASH',
    value: 3000,
  },
];

/** สำรับการ์ดหีบสมบัติ (Community Chest Cards) */
export const CHEST_CARDS: GameCard[] = [
  {
    id: 'chest_1',
    title: 'ถูกสลากกินแบ่งรัฐบาล',
    description: 'ยินดีด้วย! คุณถูกรางวัลเลขท้าย ได้รับเงิน 2,500 บาท',
    actionType: 'ADD_CASH',
    value: 2500,
  },
  {
    id: 'chest_2',
    title: 'วันเกิดของคุณ',
    description: 'เพื่อนๆ ทุกคนมาร่วมอวยพรและมอบของขวัญ รับเงินจากทุกคนคนละ 500 บาท',
    actionType: 'COLLECT_FROM_ALL',
    value: 500,
  },
  {
    id: 'chest_3',
    title: 'ซ่อมแซมบ้านเรือน',
    description: 'จ่ายค่าปรับปรุงโครงสร้างอาคาร จ่ายเงิน 1,000 บาท',
    actionType: 'DEDUCT_CASH',
    value: 1000,
  },
  {
    id: 'chest_4',
    title: 'กลับไปเริ่มต้นใหม่',
    description: 'ย้ายไปยังจุดเริ่มต้น (Pass GO) และรับเงินตามปกติ',
    actionType: 'MOVE_TO',
    value: 0, // ID ช่องเริ่มต้น
    targetTileId: 0,
  },
  {
    id: 'chest_5',
    title: 'ประกันชีวิตครบกำหนด',
    description: 'รับเงินเวนคืนกรมธรรม์ประกันชีวิต 1,800 บาท',
    actionType: 'ADD_CASH',
    value: 1800,
  },
  {
    id: 'chest_6',
    title: 'บริจาคค่าน้ำค่าไฟ',
    description: 'ช่วยเหลือโรงพยาบาลชุมชน จ่ายเงินบริจาค 800 บาท',
    actionType: 'DEDUCT_CASH',
    value: 800,
  },
];

/**
 * สุ่มเปิดการ์ดโชคชะตา 1 ใบ
 * @returns GameCard
 */
export function drawChanceCard(): GameCard {
  const index = Math.floor(Math.random() * CHANCE_CARDS.length);
  return CHANCE_CARDS[index];
}

/**
 * สุ่มเปิดการ์ดหีบสมบัติ 1 ใบ
 * @returns GameCard
 */
export function drawChestCard(): GameCard {
  const index = Math.floor(Math.random() * CHEST_CARDS.length);
  return CHEST_CARDS[index];
}
