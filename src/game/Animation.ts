/**
 * @file src/game/Animation.ts
 * @description ระบบแอนิเมชันสำหรับควบคุมการเดินของตัวหมาก, ลูกเต๋าหมุน และข้อความตัวเลขลอย (Floating Cash VFX)
 */

export interface FloatingText {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  opacity: number;
}

/**
 * คำนวณพิกัดมุมช่องบนกระดานทรงสี่เหลี่ยมผืนผ้า 24 ช่อง
 * @param tileIndex ดัชนีช่อง (0 ถึง 25)
 * @param boardWidth ความกว้างกระดาน
 * @param boardHeight ความสูงกระดาน
 * @returns { x: number, y: number } พิกัดเปอร์เซ็นต์ (0-100%)
 */
export function getTileCoordinates(tileIndex: number, boardWidth: number = 800, boardHeight: number = 800): { x: number; y: number } {
  // กระดานมี 26 ช่อง
  // แถวล่าง: 0 ถึง 6 (7 ช่อง)
  // คอลัมน์ซ้าย: 7 ถึง 11 (5 ช่อง)
  // แถวบน: 12 ถึง 18 (7 ช่อง)
  // คอลัมน์ขวา: 19 ถึง 25 (7 ช่อง)

  const margin = 8; // ระยะขอบ %
  const stepX = (100 - margin * 2) / 6;
  const stepY = (100 - margin * 2) / 6;

  if (tileIndex >= 0 && tileIndex <= 6) {
    // แถวล่าง เดินจากขวาไปซ้าย
    return {
      x: 100 - margin - tileIndex * stepX,
      y: 100 - margin,
    };
  } else if (tileIndex >= 7 && tileIndex <= 11) {
    // คอลัมน์ซ้าย เดินจากล่างขึ้นบน
    const step = tileIndex - 6;
    return {
      x: margin,
      y: 100 - margin - step * stepY,
    };
  } else if (tileIndex >= 12 && tileIndex <= 18) {
    // แถวบน เดินจากซ้ายไปขวา
    const step = tileIndex - 12;
    return {
      x: margin + step * stepX,
      y: margin,
    };
  } else {
    // คอลัมน์ขวา เดินจากบนลงล่าง (19 ถึง 25)
    const step = tileIndex - 18;
    return {
      x: 100 - margin,
      y: margin + step * stepY,
    };
  }
}
