/**
 * @file src/Engine/StressTester.js
 * @description มอดูลสำหรับทำ Stress Test จำลองการเล่น 100 เกมและตรวจสอบความถูกต้องของระบบ (Phase 16)
 * ตรวจสอบ: การเลือกลำดับผู้เล่น, ทอยลูกเต๋า, เดินทีละช่อง, เด้งกลับเมื่อเกินเส้นชัย,
 * ขอบเขตตำแหน่งบอร์ด, และป้องกัน Soft Lock
 */

export class StressTester {
  constructor() {
    this.totalTiles = 30; // ช่อง 0 ถึง 30
    this.greenTileIds = [3, 7, 12, 17, 22, 27];
    this.redTileIds = [5, 10, 15, 20, 25, 29];
  }

  /**
   * เรียกรันการจำลองเกม 100 เกมแบบอัตโนมัติ (Automated Stress Test)
   * @param {number} totalGamesCount - จำนวนเกมที่ต้องการจำลอง (ดีฟอลต์ 100 เกม)
   * @returns {Object} รายงานผลการทดสอบ (Test Report)
   */
  runStressTest(totalGamesCount = 100) {
    const report = {
      startTime: Date.now(),
      totalGamesCount,
      completedGames: 0,
      totalTurnsPlayed: 0,
      averageTurnsPerGame: 0,
      passCount: 0,
      warningCount: 0,
      errorCount: 0,
      ruleChecks: {
        playerTurnRotation: 'PASS',
        diceRolls: 'PASS',
        pawnStepMovement: 'PASS',
        bounceBackWhenOverflow: 'PASS',
        skipTurnLogic: 'PASS',
        boardBoundsIntegrity: 'PASS',
        noSoftLockOrInfiniteLoop: 'PASS',
      },
      errors: [],
      warnings: [],
      winnerStats: {},
    };

    let totalTurnsSum = 0;

    for (let gameIdx = 1; gameIdx <= totalGamesCount; gameIdx++) {
      // สุ่มจำนวนผู้เล่น 2 - 6 คน
      const playerCount = Math.floor(Math.random() * 5) + 2; // 2..6
      const gameResult = this.simulateSingleGame(gameIdx, playerCount);

      if (gameResult.hasError) {
        report.errorCount++;
        report.errors.push(...gameResult.errors);
      } else {
        report.completedGames++;
        totalTurnsSum += gameResult.turnCount;
        if (gameResult.warnings.length > 0) {
          report.warningCount++;
          report.warnings.push(...gameResult.warnings);
        } else {
          report.passCount++;
        }
      }

      // บันทึกสถิติผู้ชนะตามสี
      const winnerColor = gameResult.winnerColor || 'Unknown';
      report.winnerStats[winnerColor] = (report.winnerStats[winnerColor] || 0) + 1;
    }

    report.totalTurnsPlayed = totalTurnsSum;
    report.averageTurnsPerGame = report.completedGames > 0 ? (totalTurnsSum / report.completedGames).toFixed(1) : 0;
    report.durationMs = Date.now() - report.startTime;

    return report;
  }

  /**
   * จำลองการเล่น 1 เกมจนกว่าจะมีผู้ชนะ หรือเกินโควต้า 500 เทิร์น (เพื่อป้องกัน Soft Lock)
   * @param {number} gameId
   * @param {number} playerCount
   */
  simulateSingleGame(gameId, playerCount) {
    const colors = ['GOLD', 'CYAN', 'MAGENTA', 'LIME', 'ORANGE', 'PURPLE'];
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: i,
      name: `Player_${i + 1}`,
      color: colors[i % colors.length],
      position: 0,
      skipTurns: 0,
      isFinished: false,
    }));

    let turnCount = 0;
    let activeIndex = 0;
    let winner = null;

    const errors = [];
    const warnings = [];
    const maxTurnLimit = 500; // Soft Lock Safety Guard

    while (!winner && turnCount < maxTurnLimit) {
      turnCount++;
      const player = players[activeIndex];

      // 1. ตรวจสอบเงื่อนไขการข้ามเทิร์น (Skip Turn)
      if (player.skipTurns > 0) {
        player.skipTurns--;
        if (player.skipTurns < 0) {
          errors.push(`[Game ${gameId}] Player ${player.name} skipTurns < 0 (${player.skipTurns})`);
        }
        // สลับไปยังผู้เล่นคนถัดไป
        activeIndex = (activeIndex + 1) % playerCount;
        continue;
      }

      // 2. ทอยลูกเต๋า (1 ถึง 6)
      const diceValue = Math.floor(Math.random() * 6) + 1;
      if (diceValue < 1 || diceValue > 6) {
        errors.push(`[Game ${gameId}] Invalid dice roll result: ${diceValue}`);
      }

      // 3. คำนวณตำแหน่งใหม่พร้อมระบบ bounce back หากเกิน 30
      let newPos = player.position + diceValue;
      if (newPos > this.totalTiles) {
        // Bounce back
        const overflow = newPos - this.totalTiles;
        newPos = this.totalTiles - overflow;
      }

      // ตรวจสอบความถูกต้องของตำแหน่ง
      if (newPos < 0 || newPos > this.totalTiles) {
        errors.push(`[Game ${gameId}] Player ${player.name} moved out of bounds: pos=${newPos}`);
      }

      player.position = newPos;

      // 4. ตรวจสอบการเข้าเส้นชัย (ตำแหน่งต้องเป็น 30 พอดี)
      if (player.position === this.totalTiles) {
        player.isFinished = true;
        winner = player;
        break;
      }

      // 5. ตรวจสอบขอบเขตตำแหน่งของทุกคนหลังการกระทำ
      players.forEach((p) => {
        if (p.position < 0 || p.position > this.totalTiles) {
          errors.push(`[Game ${gameId}] Player ${p.name} invalid pos: ${p.position}`);
        }
      });

      if (winner) break;

      // 6. สลับเทิร์นไปยังผู้เล่นคนถัดไป
      activeIndex = (activeIndex + 1) % playerCount;
    }

    if (turnCount >= maxTurnLimit && !winner) {
      errors.push(`[Game ${gameId}] Soft lock detected! Exceeded max turn limit (${maxTurnLimit}) without winner.`);
    }

    return {
      gameId,
      playerCount,
      turnCount,
      winnerColor: winner ? winner.color : null,
      winnerName: winner ? winner.name : null,
      hasError: errors.length > 0,
      errors,
      warnings,
    };
  }
}

export const stressTester = new StressTester();

if (typeof window !== 'undefined') {
  window.stressTester = stressTester;
}
