/**
 * @file src/UI/PlayerSelectScreen.js
 * @description หน้าจอเลือกจำนวนผู้เล่น (2 - 6 คน) สำหรับ Cyber Board Game
 * บันทึกลง GameState โดยยังไม่เริ่มเกมตามข้อกำหนด
 */

import { gameStateStore } from '../GameState.js';
import { CONFIG } from '../Config.js';

export class PlayerSelectScreen {
  /**
   * @param {HTMLElement} container - DOM Container สำหรับวาง UI หน้าเลือกจำนวนผู้เล่น
   * @param {Function} onBack - Callback เมื่อกดปุ่มย้อนกลับสู่เมนูหลัก
   */
  constructor(container, onBack) {
    this.container = container;
    this.onBack = onBack;
    
    // ดึงค่าปัจจุบันจาก GameState หากเคยเลือกไว้
    const currentState = gameStateStore.getState();
    this.selectedCount = currentState.playerCount || currentState.players?.length || 4;
    this.orderMode = currentState.orderMode || 'RANDOM'; // 'RANDOM' | 'DICE'
    this.finishMode = currentState.finishMode || 'FIRST_REACH'; // 'FIRST_REACH' | 'EXACT_ROLL'
  }

  /**
   * เรนเดอร์หน้าจอเลือกจำนวนผู้เล่นและตั้งค่ากติกาเกม
   */
  render() {
    const currentState = gameStateStore.getState();
    const savedCount = currentState.playerCount || currentState.players?.length;
    const isSaved = Boolean(savedCount);

    this.container.innerHTML = `
      <div class="player-select-container">
        <div class="player-select-bg-glow"></div>

        <div class="player-select-card">
          <!-- ส่วนหัวหน้าจอ -->
          <div class="select-header">
            <span class="select-badge">MATCH SETUP</span>
            <h2 class="select-title">🎮 ตั้งค่าการแข่งขัน</h2>
            <p class="select-subtitle">เลือกจำนวนผู้เล่น ลำดับการเดิน และกติกาการเข้าเส้นชัย</p>
          </div>

          <!-- กล่องตัวเลือกจำนวนผู้เล่น (2, 3, 4, 5, 6) -->
          <div class="mode-section-wrapper" style="margin-bottom: 1.25rem;">
            <div class="mode-section-title">👥 จำนวนผู้เล่น</div>
            <div class="player-options-grid">
              ${[2, 3, 4, 5, 6]
                .map(
                  (count) => `
                <button 
                  class="player-option-card ${this.selectedCount === count ? 'active' : ''}" 
                  data-count="${count}"
                  id="btn-player-count-${count}"
                >
                  <div class="player-count-number">${count}</div>
                  <div class="player-count-label">${count} คน</div>
                  <div class="player-avatars-preview">
                    ${Array.from({ length: count })
                      .map(
                        (_, idx) => `
                      <span class="avatar-dot avatar-color-${idx + 1}"></span>
                    `
                      )
                      .join('')}
                  </div>
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- รูปแบบการจัดลำดับคนเดิน -->
          <div class="mode-section-wrapper" style="margin-bottom: 1.25rem;">
            <div class="mode-section-title">🎲 การจัดลำดับคนเดิน</div>
            <div class="mode-options-grid">
              <button 
                class="mode-option-card ${this.orderMode === 'RANDOM' ? 'active' : ''}" 
                data-order-mode="RANDOM" 
                id="btn-order-random"
              >
                <div class="mode-card-info">
                  <div class="mode-card-title">🔀 สุ่มลำดับอัตโนมัติ</div>
                  <div class="mode-card-desc">สุ่มสลับลำดับคนเดินให้อัตโนมัติเมื่อเริ่มเกม</div>
                </div>
              </button>

              <button 
                class="mode-option-card ${this.orderMode === 'DICE' ? 'active' : ''}" 
                data-order-mode="DICE" 
                id="btn-order-dice"
              >
                <div class="mode-card-info">
                  <div class="mode-card-title">🎲 ทอยเต๋าวัดแต้ม</div>
                  <div class="mode-card-desc">ทอยเต๋าวัดแต้ม ใครแต้มสูงสุดได้เดินก่อน</div>
                </div>
              </button>
            </div>
          </div>

          <!-- กติกาการเข้าเส้นชัย -->
          <div class="mode-section-wrapper" style="margin-bottom: 1.25rem;">
            <div class="mode-section-title">🏆 กติกาการเข้าเส้นชัย</div>
            <div class="mode-options-grid">
              <button 
                class="mode-option-card ${this.finishMode === 'FIRST_REACH' ? 'active' : ''}" 
                data-finish-mode="FIRST_REACH" 
                id="btn-finish-first"
              >
                <div class="mode-card-info">
                  <div class="mode-card-title">🏁 ใครถึงก่อนชนะ</div>
                  <div class="mode-card-desc">ทอยแต้มถึงหรือเกินเส้นชัย ถือว่าชนะทันที</div>
                </div>
              </button>

              <button 
                class="mode-option-card ${this.finishMode === 'EXACT_ROLL' ? 'active' : ''}" 
                data-finish-mode="EXACT_ROLL" 
                id="btn-finish-exact"
              >
                <div class="mode-card-info">
                  <div class="mode-card-title">🎯 ทอยแต้มลงพอดี</div>
                  <div class="mode-card-desc">ต้องทอยแต้มลงพอดี หากเกินจะเด้งถอยหลัง</div>
                </div>
              </button>
            </div>
          </div>

          <!-- แถบแสดงสถานะ GameState -->
          <div class="gamestate-status-box ${isSaved ? 'saved' : ''}" id="gamestate-status-box">
            <div class="status-icon">${isSaved ? '✅' : 'ℹ️'}</div>
            <div class="status-info">
              <div class="status-title" id="status-title">
                ${isSaved ? `ตั้งค่าแล้ว: ผู้เล่น ${this.selectedCount} คน | ${this.orderMode === 'RANDOM' ? 'สุ่มลำดับ' : 'ทอยเต๋าวัดแต้ม'} | ${this.finishMode === 'EXACT_ROLL' ? 'ทอยลงพอดี' : 'ถึงก่อนชนะ'}` : 'พร้อมบันทึกตั้งค่าการแข่งขัน'}
              </div>
              <div class="status-desc" id="status-desc">
                ${
                  isSaved
                    ? `พร้อมเข้าสู่ขั้นตอนเลือกตัวหมาก (กดปุ่ม "เลือกตัวหมาก ➔")`
                    : 'เลือกจำนวนผู้เล่น ลำดับ และกติกา แล้วกด "เลือกตัวหมาก"'
                }
              </div>
            </div>
          </div>

          <!-- ปุ่มการทำงาน -->
          <div class="select-actions">
            <button class="btn-action btn-save-gamestate" id="btn-save-gamestate">
              <span class="btn-icon">💾</span>
              <span>บันทึกตั้งค่า</span>
            </button>

            <button class="btn-action btn-next-piece" id="btn-next-piece">
              <span class="btn-icon">♟️</span>
              <span>เลือกตัวหมาก ➔</span>
            </button>

            <button class="btn-action btn-back-menu" id="btn-back-menu">
              <span class="btn-icon">⬅</span>
              <span>ย้อนกลับ</span>
            </button>
          </div>

          <div class="select-footer-note">
            * ระบบบันทึกการตั้งค่าลงในเกมอัตโนมัติก่อนเข้าสู่ขั้นตอนเลือกตัวหมาก
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * ผูกการทำงานของปุ่มเลือกและสวิตช์
   */
  bindEvents() {
    const optionCards = Array.from(this.container.querySelectorAll('.player-option-card'));
    const orderCards = Array.from(this.container.querySelectorAll('[data-order-mode]'));
    const finishCards = Array.from(this.container.querySelectorAll('[data-finish-mode]'));
    const btnSave = this.container.querySelector('#btn-save-gamestate');
    const btnBack = this.container.querySelector('#btn-back-menu');

    // คลิกเลือกจำนวนผู้เล่น
    optionCards.forEach((card) => {
      card.onclick = () => {
        const count = parseInt(card.getAttribute('data-count'), 10);
        this.selectedCount = count;

        optionCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');

        // อัปเดตการแสดงผลเบื้องต้น
        const statusBox = this.container.querySelector('#gamestate-status-box');
        const statusTitle = this.container.querySelector('#status-title');
        const statusDesc = this.container.querySelector('#status-desc');

        if (statusBox) statusBox.classList.remove('saved');
        if (statusTitle) statusTitle.textContent = `เลือกผู้เล่น ${count} คน (รอยืนยันการบันทึก)`;
        if (statusDesc) statusDesc.textContent = 'กดปุ่ม "บันทึกลง GameState" เพื่ออัปเดตข้อมูล';
      };
    });

    // คลิกเลือกรูปแบบการจัดลำดับคนเดิน (Random vs Dice)
    orderCards.forEach((card) => {
      card.onclick = () => {
        const mode = card.getAttribute('data-order-mode');
        this.orderMode = mode;

        orderCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');

        const statusBox = this.container.querySelector('#gamestate-status-box');
        if (statusBox) statusBox.classList.remove('saved');
      };
    });

    // คลิกเลือกกติกาเข้าเส้นชัย (First Reach vs Exact Roll)
    finishCards.forEach((card) => {
      card.onclick = () => {
        const mode = card.getAttribute('data-finish-mode');
        this.finishMode = mode;

        finishCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');

        const statusBox = this.container.querySelector('#gamestate-status-box');
        if (statusBox) statusBox.classList.remove('saved');
      };
    });

    // ปุ่มบันทึกลง GameState
    if (btnSave) {
      btnSave.onclick = () => {
        this.saveToGameState();
      };
    }

    // ปุ่มเลือกตัวหมาก ➔
    const btnNextPiece = this.container.querySelector('#btn-next-piece');
    if (btnNextPiece) {
      btnNextPiece.onclick = () => {
        this.saveToGameState();
        gameStateStore.setState({ phase: 'PIECE_SELECT' });
      };
    }

    // ปุ่มย้อนกลับสู่เมนูหลัก
    if (btnBack) {
      btnBack.onclick = () => {
        if (typeof this.onBack === 'function') {
          this.onBack();
        } else {
          gameStateStore.setState({ phase: 'MAIN_MENU' });
        }
      };
    }
  }

  /**
   * บันทึกข้อมูลจำนวนผู้เล่นและกติกาลงใน GameState กลาง
   */
  saveToGameState() {
    const count = this.selectedCount;
    const defaultStartMoney = CONFIG.INITIAL_MONEY || 15000;

    const colors = [
      '#f59e0b', // สีทอง
      '#38bdf8', // สีฟ้า
      '#10b981', // สีเขียว
      '#f43f5e', // สีชมพูแดง
      '#a855f7', // สีม่วง
      '#ec4899', // สีชมพูบานเย็น
    ];

    // สร้างโครงสร้างข้อมูลผู้เล่นตามจำนวนที่เลือก (เกมเดินหมากสุ่มลูกเต๋า)
    const playersData = Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      name: `ผู้เล่นที่ ${index + 1}`,
      position: 0,
      color: colors[index % colors.length],
      isAi: false,
      pauseTurns: 0,
      status: 'ปกติ',
      turnOrder: index + 1,
    }));

    // อัปเดต GameStateStore
    gameStateStore.setState({
      playerCount: count,
      players: playersData,
      orderMode: this.orderMode,
      finishMode: this.finishMode,
      setupCompleted: true,
    });

    // แจ้งเตือนการบันทึกสำเร็จ
    const statusBox = this.container.querySelector('#gamestate-status-box');
    const statusTitle = this.container.querySelector('#status-title');
    const statusDesc = this.container.querySelector('#status-desc');

    if (statusBox) {
      statusBox.classList.add('saved');
      statusBox.style.animation = 'none';
      // Trigger reflow
      void statusBox.offsetWidth;
      statusBox.style.animation = 'pulseGlow 0.5s ease-out';
    }

    const orderText = this.orderMode === 'RANDOM' ? '🔀 สุ่มลำดับออโต้' : '🎲 ทอยเต๋ากำหนดลำดับ';
    const finishText = this.finishMode === 'EXACT_ROLL' ? '🎯 ทอยแต้มพอดี' : '🏁 ใครถึงก่อนชนะ';

    if (statusTitle) {
      statusTitle.textContent = `✅ บันทึกข้อมูล GameState เรียบร้อยแล้ว (${count} คน | ${orderText} | ${finishText})`;
    }

    if (statusDesc) {
      statusDesc.textContent = `ตั้งค่าผู้เล่น ${count} คน, ${orderText}, และ ${finishText} ลงใน GameStateStore เรียบร้อยแล้ว`;
    }
  }
}
