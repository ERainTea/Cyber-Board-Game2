/**
 * @file src/Engine/Dice.js
 * @description มอดูลระบบลูกเต๋า 3D และ Animation สำหรับ Cyber Board Game
 * สุ่มแต้ม 1-6 พร้อมป้องกันการกดซ้ำและส่ง Callback onDiceRoll
 */

export class Dice {
  /**
   * @param {Object} options
   * @param {number} options.diceCount - จำนวนลูกเต๋า (เริ่มต้น 1 ลูก)
   * @param {Function} options.onRollStart - Callback เมื่อเริ่มทอย
   * @param {Function} options.onDiceRoll - Callback เมื่อทอยเสร็จสิ้น พร้อมผลลัพธ์แต้ม
   */
  constructor(options = {}) {
    this.diceCount = options.diceCount || 1;
    this.onRollStart = options.onRollStart || null;
    this.onDiceRoll = options.onDiceRoll || null;
    this.isRolling = false;
    this.lastResult = null;
  }

  /**
   * สุ่มเลข 1 ถึง 6 สำหรับลูกเต๋า 1 ลูก
   * @returns {number} แต้ม 1-6
   */
  getRandomDieValue() {
    return Math.floor(Math.random() * 6) + 1;
  }

  /**
   * ทำการทอยลูกเต๋า
   * @returns {Promise<{ values: number[], total: number }>}
   */
  async roll() {
    if (this.isRolling) {
      console.warn('[Dice] กำลังทอยลูกเต๋าอยู่ ไม่สามารถกดซ้ำได้');
      return null;
    }

    this.isRolling = true;
    if (typeof this.onRollStart === 'function') {
      this.onRollStart();
    }

    // ระยะเวลาแอนิเมชันทอยเต๋า (1.2 วินาที)
    const animationDuration = 1200;

    return new Promise((resolve) => {
      setTimeout(() => {
        const values = [];
        let total = 0;

        for (let i = 0; i < this.diceCount; i++) {
          const val = this.getRandomDieValue();
          values.push(val);
          total += val;
        }

        this.lastResult = {
          values,
          total,
          timestamp: new Date(),
        };

        this.isRolling = false;

        if (typeof this.onDiceRoll === 'function') {
          this.onDiceRoll(this.lastResult);
        }

        resolve(this.lastResult);
      }, animationDuration);
    });
  }

  /**
   * ตรวจสอบว่ากำลังทอยเต๋าอยู่หรือไม่
   * @returns {boolean}
   */
  getIsRolling() {
    return this.isRolling;
  }

  /**
   * ดึงผลลัพธ์การทอยครั้งล่าสุด
   * @returns {Object|null}
   */
  getLastResult() {
    return this.lastResult;
  }
}
