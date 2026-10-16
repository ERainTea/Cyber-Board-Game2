/**
 * @file src/Engine/FinishManager.js
 * @description ระบบจัดการการเข้าเส้นชัย และการเด้งกลับเมื่อแต้มเกิน (Phase 13: Finish Manager)
 * ภาษาไทยทั้งหมด พร้อมระบบจัดอันดับ และ Modal แสดงผู้ชนะ
 */

import { CONFIG } from '../Config.js';
import { gameStateStore } from '../GameState.js';
import { soundManager } from '../Audio/SoundManager.js';
import { networkManager, NETWORK_MODES } from '../Network/NetworkManager.js';
import { PacketManager, PACKET_TYPES } from '../Network/PacketManager.js';
import { escapeHtml } from '../Utils/security.js';

export class FinishManager {
  constructor() {
    this.finishIndex = (CONFIG.BOARD_TILES_COUNT || 39) - 1; // Default: ดัชนี 38 (ช่องที่ 39 เส้นชัย)
    this.confettiAnimationId = null;
  }

  /**
   * ดึงตำแหน่งช่องเป้าหมายเส้นชัย
   * @returns {number} ดัชนีช่องเส้นชัย (ดัชนี 38 สำหรับกระดาน 39 ช่อง)
   */
  getFinishTileIndex() {
    return (CONFIG.BOARD_TILES_COUNT || 39) - 1;
  }

  /**
   * คำนวณเส้นทางการก้าวเดินทีละช่อง พร้อมรองรับกติกาเข้าเส้นชัย 2 แบบ
   * @param {number} startPos - ตำแหน่งเริ่มต้นก่อนทอย
   * @param {number} stepsCount - แต้มจากลูกเต๋าหรือ Effect
   * @param {string} [finishMode='FIRST_REACH'] - โหมดเข้าเส้นชัย ('FIRST_REACH' | 'EXACT_ROLL')
   * @returns {{ path: number[], finalPosition: number, didBounce: boolean, bounceAtStepIndex: number }}
   */
  calculateMovementPath(startPos, stepsCount, finishMode = 'FIRST_REACH') {
    const finishIndex = this.getFinishTileIndex();

    // โหมด 1: "ใครเข้าเส้นชัยก่อนให้เป็นผู้ชนะ" (FIRST_REACH) — ทอยได้แต้มถึงหรือเกินช่องเส้นชัย จะเดินถึงเส้นชัยแล้วหยุดชนะทันที
    if (finishMode === 'FIRST_REACH' || finishMode === 'FIRST') {
      const path = [];
      let currentPos = startPos;

      for (let i = 0; i < stepsCount; i++) {
        currentPos++;
        if (currentPos >= finishIndex) {
          currentPos = finishIndex;
          path.push(currentPos);
          break; // ถึงเส้นชัยแล้วหยุดเดินทันที ไม่เด้งกลับ
        }
        path.push(currentPos);
      }

      return {
        path,
        finalPosition: currentPos,
        didBounce: false,
        bounceAtStepIndex: -1,
      };
    }

    // โหมด 2: "ทอยจนกว่าจะได้แต้มพอดีที่เข้าเส้นชัย" (EXACT_ROLL) — หากทอยเกินจะเดินเด้งถอยหลังกลับตามจำนวนแต้มที่เกิน
    const path = [];
    let currentPos = startPos;
    let direction = 1; // 1 = เดินหน้า, -1 = ถอยหลัง (เด้งกลับ)
    let didBounce = false;
    let bounceAtStepIndex = -1;

    for (let i = 0; i < stepsCount; i++) {
      if (currentPos === finishIndex && direction === 1) {
        direction = -1;
        didBounce = true;
        bounceAtStepIndex = i;
      }

      currentPos += direction;
      path.push(currentPos);
    }

    return {
      path,
      finalPosition: currentPos,
      didBounce,
      bounceAtStepIndex,
    };
  }

  /**
   * ตรวจสอบว่าผู้เล่นคนนี้เข้าเส้นชัยแล้วหรือยัง
   * @param {Object} player - ข้อมูลผู้เล่น
   * @returns {boolean}
   */
  isWinner(player) {
    const finishIndex = this.getFinishTileIndex();
    return (player.position || 0) === finishIndex;
  }

  /**
   * คำนวณจัดอันดับผู้เล่นทั้งหมดเมื่อมีผู้เข้าเส้นชัย
   * @param {Object} winnerPlayer - ผู้เล่นที่เข้าเส้นชัย
   * @param {Array<Object>} allPlayers - รายชื่อผู้เล่นทุกคน
   * @returns {Array<Object>} รายชื่อผู้เล่นเรียงตามอันดับ (Rank 1, 2, 3...)
   */
  calculateLeaderboard(winnerPlayer, allPlayers) {
    const finishIndex = this.getFinishTileIndex();

    // คัดลอก Array และคำนวณระยะทางถึงเส้นชัย
    const playersCopy = [...allPlayers].map((p) => {
      const isWin = p.id === winnerPlayer.id || p.position === finishIndex;
      const distanceToFinish = finishIndex - (p.position || 0);
      return {
        ...p,
        isWinner: isWin,
        distanceToFinish: isWin ? 0 : distanceToFinish,
      };
    });

    // เรียงลำดับ: ผู้ชนะอันดับ 1 ขึ้นก่อน, ตามด้วยตำแหน่งใกล้เส้นชัยที่สุด (position มากสุด)
    playersCopy.sort((a, b) => {
      if (a.isWinner) return -1;
      if (b.isWinner) return 1;
      return (b.position || 0) - (a.position || 0);
    });

    // กำหนดค่า rank
    return playersCopy.map((p, idx) => ({
      ...p,
      rank: idx + 1,
    }));
  }

  /**
   * แสดง Modal สรุปผลผู้ชนะและอันดับการแข่งขัน
   * @param {Object} winner - ผู้ชนะอันดับ 1
   * @param {Array<Object>} players - ผู้เล่นทุกคน
   * @param {Object} screenInstance - อินสแตนซ์ของ GameBoardScreen
   */
  showVictoryModal(winner, players, screenInstance) {
    soundManager.play('victory');
    soundManager.playBGM('win');

    const leaderboard = this.calculateLeaderboard(winner, players);
    const finishIndex = this.getFinishTileIndex();

    const winnerColorHex = winner.color || winner.colorHex || '#f59e0b';
    const winnerColorName = winner.colorName ? `สี${winner.colorName}` : '';

    const htmlContent = `
      <div class="modal-content victory-modal-content" style="max-width: 580px; width: 95%; max-height: 88vh; display: flex; flex-direction: column; border: 2px solid #f59e0b; box-shadow: 0 0 30px rgba(245, 158, 11, 0.4); background: #0f172a; color: #f8fafc; border-radius: 16px; position: relative; overflow: hidden;">
        
        <!-- Canvas เอฟเฟกต์พลุฉลอง (Confetti) -->
        <canvas id="victory-confetti-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;"></canvas>

        <!-- ส่วนเนื้อหาหลักที่รองรับการ Scroll ในกรณีมีผู้เล่นหลายคน -->
        <div class="modal-body" style="padding: 1.5rem; overflow-y: auto; flex: 1; min-height: 0; position: relative; z-index: 2; text-align: center;">
          <!-- ส่วนหัวของ Modal -->
          <div class="victory-header" style="margin-bottom: 1.25rem;">
            <div style="font-size: 3rem; margin-bottom: 0.25rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.6));">🏆</div>
            <h2 style="font-size: 1.75rem; font-weight: 800; color: #fbbf24; margin: 0; text-shadow: 0 2px 8px rgba(0,0,0,0.5);">
              ยินดีด้วย! ได้ผู้ชนะแล้ว
            </h2>
            <p style="color: #94a3b8; font-size: 0.9rem; margin-top: 0.25rem;">
              การแข่งขัน Cyber Board Game สิ้นสุดลงอย่างเป็นทางการ
            </p>
          </div>

          <!-- การ์ดไฮไลท์ผู้ชนะอันดับ 1 -->
          <div class="winner-spotlight-card" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.1)); border: 2px solid #f59e0b; border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.25rem;">
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.4rem;">
              <span style="font-size: 1.4rem;">🥇</span>
              <span style="color: #fef08a; font-weight: 700; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">
                ผู้ชนะเลิศอันดับ 1
              </span>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: ${winnerColorHex}; border: 2px solid #ffffff; box-shadow: 0 0 8px ${winnerColorHex};"></div>
              <span style="font-size: 1.4rem; font-weight: 800; color: #ffffff;">
                ${escapeHtml(winner.name)} <span style="font-size: 0.95rem; color: #cbd5e1; font-weight: 500;">(${escapeHtml(winnerColorName)})</span>
              </span>
            </div>
            <p style="color: #4ade80; font-size: 0.85rem; margin-top: 0.4rem; font-weight: 600;">
              🎯 เดินเข้าเส้นชัยสำเร็จที่ช่องที่ ${finishIndex}!
            </p>
          </div>

          <!-- ตารางสรุปอันดับผู้เล่นทุกคน -->
          <div class="leaderboard-section">
            <h4 style="color: #cbd5e1; font-size: 0.95rem; text-align: left; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>📊</span> <span>ตารางสรุปอันดับผู้เล่นทั้งหมด:</span>
            </h4>

            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${leaderboard
                .map((p) => {
                  const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
                  const rankIcon = rankIcons[p.rank - 1] || `${p.rank}`;
                  const pColorHex = p.color || p.colorHex || '#64748b';
                  const isWin = p.rank === 1;

                  return `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: ${isWin ? 'rgba(245, 158, 11, 0.15)' : 'rgba(30, 41, 59, 0.7)'}; border: 1px solid ${isWin ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; border-radius: 8px; padding: 0.6rem 0.9rem; text-align: left;">
                      <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.2rem; width: 28px; text-align: center;">${rankIcon}</span>
                        <div style="width: 16px; height: 16px; border-radius: 50%; background: ${pColorHex}; border: 1px solid white;"></div>
                        <span style="font-weight: 700; color: ${isWin ? '#fbbf24' : '#f8fafc'}; font-size: 0.95rem;">
                          ${escapeHtml(p.name)}
                        </span>
                      </div>

                      <div style="text-align: right;">
                        ${
                          isWin
                            ? '<span style="color: #4ade80; font-weight: 700; font-size: 0.85rem;">🏁 เข้าเส้นชัย</span>'
                            : `<span style="color: #94a3b8; font-size: 0.85rem;">ช่องที่ ${p.position || 0} <small>(ห่าง ${p.distanceToFinish} ช่อง)</small></span>`
                        }
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </div>

        <!-- ส่วนท้าย Modal ตรึงปุ่มกดไว้ด้านล่างตลอดเวลา -->
        <div class="modal-footer" style="position: relative; z-index: 2; padding: 1rem 1.5rem; background: rgba(15, 23, 42, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.1); flex-shrink: 0;">
          <div style="display: flex; gap: 0.85rem; justify-content: center;">
            <button class="btn-action" id="btn-restart-game" style="flex: 1; background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 0.85rem; border-radius: 10px; font-weight: 700; font-size: 1rem; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); transition: all 0.2s;">
              🔄 เล่นใหม่อีกครั้ง
            </button>

            <button class="btn-action" id="btn-return-main-menu" style="flex: 1; background: linear-gradient(135deg, #475569, #334155); color: white; padding: 0.85rem; border-radius: 10px; font-weight: 700; font-size: 1rem; border: none; cursor: pointer; transition: all 0.2s;">
              🏠 กลับสู่เมนูหลัก
            </button>
          </div>
        </div>
      </div>
    `;

    screenInstance.openModal(htmlContent);

    // เริ่มสร้างภาพเคลื่อนไหว Confetti บน Canvas
    this.startConfettiEffect();

    // ผูกปุ่มการทำงาน
    const btnRestart = document.getElementById('btn-restart-game');
    const btnMainMenu = document.getElementById('btn-return-main-menu');

    if (btnRestart) {
      btnRestart.onclick = () => {
        this.stopConfettiEffect();
        screenInstance.closeModal();

        if (networkManager.getMode() === NETWORK_MODES.ONLINE && networkManager.roomManager.currentRoom) {
          const roomCode = networkManager.roomManager.currentRoom.roomCode;
          const myPlayerId = networkManager.myPlayerId || (networkManager.roomManager.myPlayer ? networkManager.roomManager.myPlayer.id : null);
          const packet = PacketManager.createPacket(
            PACKET_TYPES.REQUEST_REMATCH,
            { roomCode, playerId: myPlayerId },
            myPlayerId
          );
          networkManager.sendPacket(packet);
          if (typeof screenInstance.showRematchReadyModal === 'function') {
            screenInstance.showRematchReadyModal();
          }
        } else {
          this.restartGame(players, screenInstance);
        }
      };
    }

    if (btnMainMenu) {
      btnMainMenu.onclick = () => {
        this.stopConfettiEffect();
        screenInstance.closeModal();

        if (networkManager.getMode() === NETWORK_MODES.ONLINE && networkManager.roomManager.currentRoom) {
          const roomCode = networkManager.roomManager.currentRoom.roomCode;
          const myPlayerId = networkManager.myPlayerId || (networkManager.roomManager.myPlayer ? networkManager.roomManager.myPlayer.id : null);
          const packet = PacketManager.createPacket(
            PACKET_TYPES.LEAVE_ROOM,
            { roomCode, playerId: myPlayerId },
            myPlayerId
          );
          networkManager.sendPacket(packet);
          networkManager.roomManager.currentRoom = null;
        }

        if (typeof screenInstance.onBack === 'function') {
          screenInstance.onBack();
        } else {
          gameStateStore.setState({ phase: 'MAIN_MENU', isGameStarted: false });
        }
      };
    }
  }

  /**
   * เริ่มต้นแมตช์ใหม่ด้วยรายชื่อผู้เล่นเดิม
   * @param {Array<Object>} players - รายชื่อผู้เล่นเดิม
   * @param {Object} screenInstance - GameBoardScreen
   */
  restartGame(players, screenInstance) {
    const resetPlayers = players.map((p) => ({
      ...p,
      position: 0,
      skipTurns: 0,
      pauseTurns: 0,
      skipTurnCount: 0,
      status: 'พร้อมแข่ง',
      turnOrder: 'รอทอยเต๋า',
      turnOrderRank: null,
      rollResult: null,
      orderRollScore: null,
      rollSequenceIndex: null,
      pendingCardDraw: false,
    }));

    gameStateStore.setState({
      players: resetPlayers,
      activePlayerIndex: 0,
      phase: 'IN_GAME',
      isGameStarted: true,
    });

    // รีโหลดหน้าจอกระดานเกม
    if (screenInstance) {
      screenInstance.players = resetPlayers;
      screenInstance.activePlayerIndex = 0;
      screenInstance.phase = 'DETERMINE_ORDER';
      screenInstance.currentRollPlayerIndex = 0;
      screenInstance.orderRollResults = [];
      screenInstance.isMoving = false;
      screenInstance.isDiceRolling = false;
      screenInstance.isStartOfTurnCardDraw = false;

      if (typeof screenInstance.checkAndApplyRandomOrder === 'function') {
        screenInstance.checkAndApplyRandomOrder();
      }

      if (typeof screenInstance.render === 'function') {
        screenInstance.render();
      }
    }
  }

  /**
   * สร้างเอฟเฟกต์พลุกระดาษสี (Confetti Animation) บน Canvas
   */
  startConfettiEffect() {
    const canvas = document.getElementById('victory-confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement.clientWidth || 500;
    canvas.height = canvas.parentElement.clientHeight || 500;

    const particles = [];
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#fef08a'];

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 2 - 1,
        angle: Math.random() * 360,
        spin: Math.random() * 0.2 - 0.1,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.angle += p.spin;

        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      this.confettiAnimationId = requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * หยุดแอนิเมชัน Confetti
   */
  stopConfettiEffect() {
    if (this.confettiAnimationId) {
      cancelAnimationFrame(this.confettiAnimationId);
      this.confettiAnimationId = null;
    }
  }
}

export const finishManager = new FinishManager();
