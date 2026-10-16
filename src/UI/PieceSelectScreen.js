/**
 * @file src/UI/PieceSelectScreen.js
 * @description หน้าจอเลือกตัวหมากสำหรับ Cyber Board Game
 * มีตัวหมากทั้งหมด 6 สี ผู้เล่นแต่ละคนเลือกได้เพียง 1 สี ไม่ซ้ำกัน
 * ปุ่ม "เริ่มเกม" จะกดได้ต่อเมื่อทุกคนเลือกครบแล้วเท่านั้น
 */

import { gameStateStore } from '../GameState.js';
import { CONFIG } from '../Config.js';

export const TOKEN_COLORS = [
  {
    id: 'gold',
    name: 'สีทอง',
    hex: '#f59e0b',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
    border: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.5)',
    icon: '🪙',
  },
  {
    id: 'cyan',
    name: 'สีฟ้า',
    hex: '#38bdf8',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
    border: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.5)',
    icon: '💎',
  },
  {
    id: 'green',
    name: 'สีเขียว',
    hex: '#10b981',
    gradient: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    border: '#10b981',
    glow: 'rgba(16, 185, 129, 0.5)',
    icon: '🍀',
  },
  {
    id: 'red',
    name: 'สีแดง',
    hex: '#f43f5e',
    gradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    border: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.5)',
    icon: '🔥',
  },
  {
    id: 'purple',
    name: 'สีม่วง',
    hex: '#a855f7',
    gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)',
    border: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.5)',
    icon: '🔮',
  },
  {
    id: 'orange',
    name: 'สีส้ม',
    hex: '#f97316',
    gradient: 'linear-gradient(135deg, #fb923c 0%, #c2410c 100%)',
    border: '#f97316',
    glow: 'rgba(249, 115, 22, 0.5)',
    icon: '⚡',
  },
];

export class PieceSelectScreen {
  /**
   * @param {HTMLElement} container - DOM Container สำหรับแสดงผลหน้าเลือกตัวหมาก
   * @param {Function} onBack - Callback เมื่อกดปุ่มย้อนกลับ
   */
  constructor(container, onBack) {
    this.container = container;
    this.onBack = onBack;

    const currentState = gameStateStore.getState();
    const playersList = currentState.players || [];
    this.playerCount = currentState.playerCount || playersList.length || 4;

    // สร้างข้อมูลผู้เล่นเริ่มต้นถ้ายังไม่มี
    this.players = Array.from({ length: this.playerCount }, (_, idx) => {
      const existing = playersList[idx];
      return {
        id: idx + 1,
        name: existing?.name || `ผู้เล่นที่ ${idx + 1}`,
        colorId: existing?.colorId || null, // ID ของสีตัวหมากที่เลือก
      };
    });
  }

  /**
   * เรนเดอร์หน้าจอเลือกตัวหมาก
   */
  render() {
    const currentState = gameStateStore.getState();
    const totalPlayers = this.playerCount;
    const selectedCount = this.players.filter((p) => p.colorId !== null).length;
    const isAllSelected = selectedCount === totalPlayers;

    // หา Mapping สีที่ถูกเลือกแล้วโดยใคร
    const colorOwnerMap = {};
    this.players.forEach((p) => {
      if (p.colorId) {
        colorOwnerMap[p.colorId] = p;
      }
    });

    this.container.innerHTML = `
      <div class="piece-select-container">
        <div class="piece-select-bg-glow"></div>

        <div class="piece-select-card">
          <!-- ส่วนหัว -->
          <div class="select-header">
            <span class="select-badge">CHARACTER SELECTION</span>
            <h2 class="select-title">♟️ เลือกตัวหมากประจำตัว</h2>
            <p class="select-subtitle">ผู้เล่นแต่ละคนเลือกตัวหมากได้ 1 สี (ไม่สามารถเลือกสีซ้ำกันได้)</p>
          </div>

          <!-- แถบแสดงความคืบหน้าการเลือก -->
          <div class="selection-progress-box ${isAllSelected ? 'complete' : ''}">
            <div class="progress-info">
              <span class="progress-text">
                ${
                  isAllSelected
                    ? '✅ เลือกตัวหมากครบทุกคนแล้ว พร้อมเริ่มเกม!'
                    : `🎯 เลือกตัวหมากแล้ว ${selectedCount} / ${totalPlayers} คน`
                }
              </span>
              <span class="progress-percent-badge">${Math.round((selectedCount / totalPlayers) * 100)}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-bar-inner" style="width: ${(selectedCount / totalPlayers) * 100}%;"></div>
            </div>
          </div>

          <!-- สรุปการตั้งค่าการแข่งขัน -->
          <div class="game-setup-summary-badge" style="margin-top: 0.75rem; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.75rem; padding: 0.5rem 0.85rem; display: flex; align-items: center; justify-content: space-around; font-size: 0.82rem; color: #cbd5e1; flex-wrap: wrap; gap: 0.5rem;">
            <span>🎲 การจัดลำดับ: <b style="color: #fbbf24;">${currentState.orderMode === 'DICE' ? '🎲 ทอยเต๋ากำหนดลำดับ' : '🔀 สุ่มลำดับออโต้'}</b></span>
            <span style="opacity: 0.4;">|</span>
            <span>🏆 กติกา: <b style="color: #4ade80;">${currentState.finishMode === 'EXACT_ROLL' ? '🎯 ต้องทอยแต้มพอดี' : '🏁 ใครเข้าเส้นชัยก่อนชนะ'}</b></span>
          </div>

          <!-- รายการผู้เล่นและตัวเลือกสี -->
          <div class="players-piece-list">
            ${this.players
              .map((player) => {
                const currentColor = TOKEN_COLORS.find((c) => c.id === player.colorId);

                return `
                <div class="player-piece-row ${player.colorId ? 'selected' : ''}" data-player-id="${player.id}">
                  <!-- ข้อมูลฝั่งผู้เล่น -->
                  <div class="player-info-badge">
                    <div class="player-avatar-preview" style="${
                      currentColor
                        ? `background: ${currentColor.gradient}; box-shadow: 0 0 12px ${currentColor.glow}; border-color: ${currentColor.border};`
                        : 'background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2);'
                    }">
                      ${currentColor ? currentColor.icon : '❓'}
                    </div>
                    <div class="player-name-text">
                      <span class="player-title-label">${player.name}</span>
                      <span class="player-status-sub">
                        ${currentColor ? `เลือก: ${currentColor.name}` : 'ยังไม่ได้เลือกสี'}
                      </span>
                    </div>
                  </div>

                  <!-- จานเลือกตัวหมาก 6 สี -->
                  <div class="color-picker-grid">
                    ${TOKEN_COLORS.map((color) => {
                      const isChosenByMe = player.colorId === color.id;
                      const owner = colorOwnerMap[color.id];
                      const isTakenByOther = owner && owner.id !== player.id;

                      let btnClass = 'color-chip-btn';
                      if (isChosenByMe) btnClass += ' active-me';
                      if (isTakenByOther) btnClass += ' taken-disabled';

                      return `
                        <button 
                          class="${btnClass}" 
                          data-player-id="${player.id}" 
                          data-color-id="${color.id}"
                          ${isTakenByOther ? 'disabled' : ''}
                          title="${
                            isTakenByOther
                              ? `${color.name} (เลือกโดย ${owner?.name || ''})`
                              : isChosenByMe
                              ? `${color.name} (คุณเลือกอยู่)`
                              : `เลือก${color.name}`
                          }"
                        >
                          <span class="chip-color-dot" style="background: ${color.gradient}; box-shadow: 0 0 8px ${color.glow};"></span>
                          <span class="chip-color-name">${color.name}</span>
                          ${isChosenByMe ? '<span class="chip-check">✓</span>' : ''}
                          ${isTakenByOther ? `<span class="chip-taken-tag">${owner?.name || ''}</span>` : ''}
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>

          <!-- ปุ่มการทำงานหลัก -->
          <div class="select-actions" style="margin-top: 1.5rem;">
            <button 
              class="btn-action btn-start-game-final ${isAllSelected ? 'ready' : 'disabled-btn'}" 
              id="btn-start-game-final"
              ${!isAllSelected ? 'disabled' : ''}
            >
              <span class="btn-icon">🚀</span>
              <span>${isAllSelected ? 'เริ่มเกม (Start Game)' : `โปรดเลือกตัวหมากให้ครบทุกคน (เหลืออีก ${totalPlayers - selectedCount} คน)`}</span>
            </button>

            <button class="btn-action btn-back-menu" id="btn-back-player-select">
              <span class="btn-icon">⬅</span>
              <span>ย้อนกลับไปเลือกจำนวนผู้เล่น</span>
            </button>
          </div>

          <div class="select-footer-note">
            * สีตัวหมากจะแสดงอยู่บนกระดานเกมเพื่อระบุตำแหน่งของผู้เล่นแต่ละคน
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * ผูกการทำงานปุ่มเลือกสีและปุ่มเริ่มเกม
   */
  bindEvents() {
    // ปุ่มเลือกสีในแต่ละแถบผู้เล่น
    const colorBtns = Array.from(this.container.querySelectorAll('.color-chip-btn:not([disabled])'));
    colorBtns.forEach((btn) => {
      btn.onclick = () => {
        const playerId = parseInt(btn.getAttribute('data-player-id'), 10);
        const colorId = btn.getAttribute('data-color-id');

        const player = this.players.find((p) => p.id === playerId);
        if (player) {
          // สลับสี: ถ้ากดสีเดิม ให้ยกเลิกการเลือก ถ้าเลือกสีใหม่ ให้ตั้งเป็นสีนั้น
          if (player.colorId === colorId) {
            player.colorId = null;
          } else {
            player.colorId = colorId;
          }
          // บันทึกลง GameState และเรนเดอร์ใหม่
          this.updateGameStateStore();
          this.render();
        }
      };
    });

    // ปุ่มย้อนกลับไปเลือกจำนวนผู้เล่น
    const btnBackPlayer = this.container.querySelector('#btn-back-player-select');
    if (btnBackPlayer) {
      btnBackPlayer.onclick = () => {
        gameStateStore.setState({ phase: 'PLAYER_SELECT' });
      };
    }

    // ปุ่มเริ่มเกม (จะกดได้เฉพาะเมื่อทุกคนเลือกครบ)
    const btnStart = this.container.querySelector('#btn-start-game-final');
    if (btnStart) {
      btnStart.onclick = () => {
        const selectedCount = this.players.filter((p) => p.colorId !== null).length;
        if (selectedCount === this.playerCount) {
          this.updateGameStateStore();
          // เปลี่ยนสถานะเป็น IN_GAME
          gameStateStore.setState({ phase: 'IN_GAME' });
        }
      };
    }
  }

  /**
   * บันทึกการตั้งค่าตัวหมากผู้เล่นลงใน GameStateStore
   */
  updateGameStateStore() {
    const currentState = gameStateStore.getState();
    const defaultStartMoney = CONFIG.INITIAL_MONEY || 15000;

    const updatedPlayers = this.players.map((p, idx) => {
      const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId);
      const existing = currentState.players?.[idx] || {};

      return {
        ...existing,
        id: p.id,
        name: p.name,
        colorId: p.colorId,
        color: colorObj ? colorObj.hex : '#f59e0b',
        colorName: colorObj ? colorObj.name : 'ยังไม่เลือก',
        colorGradient: colorObj ? colorObj.gradient : '',
        money: existing.money || defaultStartMoney,
        position: existing.position || 0,
        isAi: false,
        isBankrupt: false,
        properties: existing.properties || [],
      };
    });

    gameStateStore.setState({
      players: updatedPlayers,
      playerCount: this.playerCount,
    });
  }
}
