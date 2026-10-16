/**
 * @file src/Network/LatencyManager.js
 * @description มอดูลคำนวณและวัดค่า Latency, RTT (Round Trip Time) และ Ping/Pong (Phase 18)
 */

export class LatencyManager {
  constructor() {
    this.pingTime = 0;
    this.rtt = 0; // Round Trip Time (ms)
    this.jitter = 0;
    this.pingHistory = [];
    this.pingIntervalId = null;
  }

  /**
   * บันทึกการส่ง Ping
   */
  startPing() {
    this.pingTime = Date.now();
  }

  /**
   * รับคำตอบ Pong และคำนวณ RTT
   */
  receivePong() {
    if (this.pingTime === 0) return;
    const now = Date.now();
    const currentRtt = now - this.pingTime;
    
    // คำนวณ Jitter (ความผันผวนของ Latency)
    if (this.rtt > 0) {
      this.jitter = Math.abs(currentRtt - this.rtt);
    }
    
    this.rtt = currentRtt;
    this.pingHistory.push(currentRtt);
    if (this.pingHistory.length > 10) {
      this.pingHistory.shift();
    }
    this.pingTime = 0;
  }

  /**
   * ดึงค่าเฉลี่ย Latency
   * @returns {number} ค่า Latency เฉลี่ย (ms)
   */
  getAverageLatency() {
    if (this.pingHistory.length === 0) return 0;
    const sum = this.pingHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.pingHistory.length / 2); // Ping เป็นเวลาขาเดียวโดยประมาณ
  }

  /**
   * ดึงค่า RTT ปัจจุบัน
   */
  getRTT() {
    return this.rtt;
  }

  /**
   * ล้างค่าสถิติ
   */
  reset() {
    this.pingTime = 0;
    this.rtt = 0;
    this.jitter = 0;
    this.pingHistory = [];
  }
}
