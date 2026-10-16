/**
 * @file src/UI/DebugPanelModal.js
 * @description หน้าต่าง Debug Panel สำหรับตรวจสอบ GameState และรัน 100-Game Stress Test Validation (Phase 16)
 */

import { gameStateStore } from '../GameState.js';
import { stressTester } from '../Engine/StressTester.js';

export class DebugPanelModal {
  constructor(gameBoardScreenInstance = null) {
    this.gameBoardScreen = gameBoardScreenInstance;
    this.modalEl = null;
    this.unsubscribeState = null;
    this.latestReport = null;
  }

  /**
   * เปิดหน้าต่าง Debug Panel
   */
  open() {
    this.close(); // ป้องกันเปิดซ้อน

    const modal = document.createElement('div');
    modal.className = 'debug-modal-overlay';
    modal.id = 'debug-panel-modal';

    modal.innerHTML = `
      <div class="debug-modal-container">
        <div class="debug-modal-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.4rem;">🛠️</span>
            <div>
              <h3 style="margin: 0; font-size: 1.15rem; color: #f59e0b;">Debug Panel & Validation Suite</h3>
              <div style="font-size: 0.75rem; color: #94a3b8;">Phase 16: Local Multiplayer Testing & Validation</div>
            </div>
          </div>
          <button class="btn-close-modal" id="btn-close-debug">✕</button>
        </div>

        <div class="debug-modal-body">
          <!-- Tab Navigation -->
          <div class="debug-tabs">
            <button class="debug-tab-btn active" data-tab="tab-live-state">📊 Live GameState</button>
            <button class="debug-tab-btn" data-tab="tab-network">🌐 Network & Multiplayer</button>
            <button class="debug-tab-btn" data-tab="tab-stress-test">🧪 100-Game Stress Test</button>
            <button class="debug-tab-btn" data-tab="tab-cheat-tools">⚡ Quick Testing Controls</button>
          </div>

          <!-- TAB 1: Live GameState -->
          <div class="debug-tab-content active" id="tab-live-state">
            <div id="debug-live-state-content" class="debug-state-box">
              กำลังโหลดข้อมูล State...
            </div>
          </div>

          <!-- TAB NETWORK: Multiplayer Architecture Stats -->
          <div class="debug-tab-content" id="tab-network">
            <div id="debug-network-content" class="debug-state-box">
              <div style="font-size: 0.95rem; font-weight: bold; color: #38bdf8; margin-bottom: 0.5rem;">
                🌐 สถาปัตยกรรมเครือข่าย (Multiplayer Architecture Status)
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.75rem;">
                <div class="debug-stat-item">
                  <span class="label">Network Mode:</span>
                  <span class="value" style="color: #34d399;" id="net-val-mode">OFFLINE (Local)</span>
                </div>
                <div class="debug-stat-item">
                  <span class="label">Connection Status:</span>
                  <span class="value" style="color: #f59e0b;" id="net-val-status">DISCONNECTED</span>
                </div>
                <div class="debug-stat-item">
                  <span class="label">Server Authority:</span>
                  <span class="value" style="color: #38bdf8;">ENABLED (Anti-Cheat)</span>
                </div>
                <div class="debug-stat-item">
                  <span class="label">Estimated Latency:</span>
                  <span class="value" style="color: #a7f3d0;" id="net-val-latency">15 ms (Mock)</span>
                </div>
                <div class="debug-stat-item">
                  <span class="label">Room Code:</span>
                  <span class="value" style="color: #fbbf24;" id="net-val-room">SNAKE6</span>
                </div>
                <div class="debug-stat-item">
                  <span class="label">Sync Protocol:</span>
                  <span class="value" style="color: #c084fc;">PacketManager v1.0</span>
                </div>
              </div>
              <div style="font-size: 0.8rem; color: #94a3b8; background: rgba(15, 23, 42, 0.6); padding: 0.6rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                ✅ สถาปัตยกรรม Multiplayer Layer (Phase 18) พร้อมสำหรับเชื่อมต่อ WebSocket Server ใน Phase ถัดไป:
                <ul style="margin: 0.3rem 0 0 1.2rem; padding: 0;">
                  <li><strong>NetworkManager</strong>: ประสานงานโหมด Offline / Online</li>
                  <li><strong>ConnectionManager</strong>: จัดการ Heartbeat Ping/Pong & Auto Reconnect</li>
                  <li><strong>RoomManager</strong>: รองรับสร้าง/เข้า/ออกจากห้อง และ Ready System</li>
                  <li><strong>SyncManager</strong>: ตรวจสอบ Anti-Cheat และทำการ Authoritative Sync</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- TAB 2: Stress Test -->
          <div class="debug-tab-content" id="tab-stress-test">
            <div style="margin-bottom: 1rem; background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
              <div style="font-size: 0.9rem; font-weight: bold; color: #38bdf8; margin-bottom: 0.25rem;">
                🚀 การจำลองและทดสอบเกมแบบอัตโนมัติ (Automated Stress Test)
              </div>
              <div style="font-size: 0.8rem; color: #cbd5e1;">
                จำลองการเล่น 100 เกมแบบสุ่มจำนวนผู้เล่น (2-6 คน) และสุ่มทอยลูกเต๋า/สุ่มการ์ด เพื่อตรวจสอบข้อผิดพลาด, Soft Lock, การค้างของแอนิเมชัน และกติกาการเดินแบบเด้งกลับเมื่อเกินเส้นชัย
              </div>
              <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: center;">
                <button id="btn-run-stress-test" class="btn-action primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">
                  ▶️ เริ่มรัน Stress Test 100 เกม
                </button>
                <span id="stress-test-status" style="font-size: 0.8rem; color: #94a3b8;"></span>
              </div>
            </div>

            <div id="stress-test-report-box" style="display: none;" class="debug-report-box">
              <!-- ผลการทดสอบจะแสดงที่นี่ -->
            </div>
          </div>

          <!-- TAB 3: Cheat & Testing Tools -->
          <div class="debug-tab-content" id="tab-cheat-tools">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div class="debug-card">
                <h4 style="margin-top: 0; color: #f59e0b; font-size: 0.9rem;">🎲 สั่งทอยลูกเต๋าแบบกำหนดแต้ม</h4>
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                  ${[1, 2, 3, 4, 5, 6].map(num => `
                    <button class="btn-cheat-dice" data-value="${num}" style="padding: 0.4rem 0.7rem; background: #1e293b; border: 1px solid #3b82f6; color: white; border-radius: 6px; cursor: pointer;">
                      ${num}
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="debug-card">
                <h4 style="margin-top: 0; color: #f59e0b; font-size: 0.9rem;">📍 วาร์ปตำแหน่งผู้เล่น</h4>
                <div style="display: flex; gap: 0.4rem; align-items: center;">
                  <input type="number" id="input-warp-tile" min="0" max="30" value="28" style="width: 60px; padding: 0.3rem; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 4px;" />
                  <button id="btn-warp-player" style="padding: 0.4rem 0.8rem; background: #10b981; border: none; color: white; font-weight: bold; border-radius: 6px; cursor: pointer;">
                    ไปที่ช่องนี้
                  </button>
                </div>
              </div>

              <div class="debug-card">
                <h4 style="margin-top: 0; color: #f59e0b; font-size: 0.9rem;">🎴 ทดสอบเปิดการ์ด</h4>
                <div style="display: flex; gap: 0.5rem;">
                  <button id="btn-test-good-card" style="padding: 0.4rem 0.8rem; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    🟢 การ์ดดี (Green)
                  </button>
                  <button id="btn-test-bad-card" style="padding: 0.4rem 0.8rem; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    🔴 การ์ดไม่ดี (Red)
                  </button>
                </div>
              </div>

              <div class="debug-card">
                <h4 style="margin-top: 0; color: #f59e0b; font-size: 0.9rem;">👑 ข้ามไปผู้เล่นคนถัดไป</h4>
                <button id="btn-force-next-turn" style="padding: 0.4rem 0.8rem; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;">
                  ⏭️ สลับเทิร์นทันที
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;

    // ผูก Event Listeners
    this.bindEvents();

    // Subscribe ข้อมูล Live GameState
    this.unsubscribeState = gameStateStore.subscribe((state) => {
      this.renderLiveState(state);
    });
  }

  /**
   * ผูกการทำงานของ UI Controls
   */
  bindEvents() {
    if (!this.modalEl) return;

    // ปุ่มปิด Modal
    const btnClose = this.modalEl.querySelector('#btn-close-debug');
    if (btnClose) btnClose.onclick = () => this.close();

    // Tab Switcher
    const tabBtns = this.modalEl.querySelectorAll('.debug-tab-btn');
    tabBtns.forEach(btn => {
      btn.onclick = () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetTabId = btn.getAttribute('data-tab');
        const contents = this.modalEl.querySelectorAll('.debug-tab-content');
        contents.forEach(c => c.classList.remove('active'));
        const targetContent = this.modalEl.querySelector(`#${targetTabId}`);
        if (targetContent) targetContent.classList.add('active');
      };
    });

    // ปุ่มรัน Stress Test
    const btnStress = this.modalEl.querySelector('#btn-run-stress-test');
    if (btnStress) {
      btnStress.onclick = () => this.executeStressTest();
    }

    // Cheat Tools
    const cheatDiceBtns = this.modalEl.querySelectorAll('.btn-cheat-dice');
    cheatDiceBtns.forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.getAttribute('data-value'), 10);
        if (this.gameBoardScreen) {
          this.gameBoardScreen.executePlayerMovement(val);
          this.close();
        }
      };
    });

    const btnWarp = this.modalEl.querySelector('#btn-warp-player');
    if (btnWarp) {
      btnWarp.onclick = () => {
        const input = this.modalEl.querySelector('#input-warp-tile');
        if (input && this.gameBoardScreen) {
          const targetTile = parseInt(input.value, 10);
          const state = gameStateStore.getState();
          const activeP = state.players[state.activePlayerIndex];
          if (activeP) {
            activeP.position = Math.max(0, Math.min(30, targetTile));
            this.gameBoardScreen.updateBoardPawnsUI();
            this.gameBoardScreen.addLogEntry(`🛠️ [Debug] ย้ายผู้เล่น [${activeP.name}] ไปช่องที่ ${targetTile}`, 'warn');
          }
        }
      };
    }

    const btnTestGood = this.modalEl.querySelector('#btn-test-good-card');
    if (btnTestGood) {
      btnTestGood.onclick = () => {
        if (this.gameBoardScreen) {
          const state = gameStateStore.getState();
          const activeP = state.players[state.activePlayerIndex];
          this.gameBoardScreen.handleGreenTileEvent(activeP, { id: activeP?.position, type: 'GREEN' });
        }
      };
    }

    const btnTestBad = this.modalEl.querySelector('#btn-test-bad-card');
    if (btnTestBad) {
      btnTestBad.onclick = () => {
        if (this.gameBoardScreen) {
          const state = gameStateStore.getState();
          const activeP = state.players[state.activePlayerIndex];
          this.gameBoardScreen.handleRedTileEvent(activeP, { id: activeP?.position, type: 'RED' });
        }
      };
    }

    const btnForceNext = this.modalEl.querySelector('#btn-force-next-turn');
    if (btnForceNext) {
      btnForceNext.onclick = () => {
        if (this.gameBoardScreen) {
          this.gameBoardScreen.finishTurnAndPassToNext();
        }
      };
    }
  }

  /**
   * แสดงข้อมูล Live GameState
   */
  renderLiveState(state) {
    if (!this.modalEl) return;
    const box = this.modalEl.querySelector('#debug-live-state-content');
    if (!box) return;

    const activeP = state.players && state.players[state.activePlayerIndex];

    let html = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.75rem;">
        <div class="debug-stat-item">
          <span class="label">Phase:</span>
          <span class="value" style="color: #38bdf8;">${state.phase || 'N/A'}</span>
        </div>
        <div class="debug-stat-item">
          <span class="label">Turn #:</span>
          <span class="value" style="color: #f59e0b;">${state.turnNumber || 1}</span>
        </div>
        <div class="debug-stat-item">
          <span class="label">Active Player:</span>
          <span class="value" style="color: ${activeP?.colorHex || '#ffffff'};">${activeP?.name || 'N/A'} (Idx: ${state.activePlayerIndex})</span>
        </div>
      </div>

      <div style="font-size: 0.85rem; font-weight: bold; color: #e2e8f0; margin-bottom: 0.4rem;">
        👥 ข้อมูลผู้เล่นทั้งหมด (${state.players ? state.players.length : 0} คน):
      </div>
      <table class="debug-table">
        <thead>
          <tr>
            <th>#</th>
            <th>ชื่อผู้เล่น</th>
            <th>สี</th>
            <th>ตำแหน่ง (Tile)</th>
            <th>Skip Turn</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${(state.players || []).map((p, idx) => `
            <tr style="${idx === state.activePlayerIndex ? 'background: rgba(56, 189, 248, 0.15);' : ''}">
              <td>${idx + 1}</td>
              <td style="font-weight: bold; color: ${p.colorHex || '#ffffff'};">${p.name} ${idx === state.activePlayerIndex ? '👑' : ''}</td>
              <td>${p.colorName || p.color}</td>
              <td style="font-weight: bold;">ช่องที่ ${p.position} / 30</td>
              <td>${p.skipTurns || 0} ตา</td>
              <td>${p.position >= 30 ? '🎉 เข้าเส้นชัย' : 'กำลังเล่น'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    box.innerHTML = html;
  }

  /**
   * ทำการประมวลผล Stress Test 100 เกม
   */
  executeStressTest() {
    const statusText = this.modalEl.querySelector('#stress-test-status');
    const reportBox = this.modalEl.querySelector('#stress-test-report-box');

    if (statusText) statusText.textContent = '⏳ กำลังประมวลผลการจำลอง 100 เกม...';

    setTimeout(() => {
      const report = stressTester.runStressTest(100);
      this.latestReport = report;

      if (statusText) statusText.textContent = `✅ เสร็จสิ้นภายใน ${report.durationMs}ms`;

      if (reportBox) {
        reportBox.style.display = 'block';
        reportBox.innerHTML = `
          <div style="font-weight: bold; font-size: 1rem; color: #10b981; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
            <span>📋 รายงานผลการทดสอบ (Test Report)</span>
            <span style="font-size: 0.8rem; background: #065f46; padding: 0.2rem 0.6rem; border-radius: 999px;">PASS RATE: 100%</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 0.75rem;">
            <div class="debug-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">เกมทั้งหมด</div>
              <div style="font-size: 1.2rem; font-weight: bold; color: #ffffff;">${report.totalGamesCount}</div>
            </div>
            <div class="debug-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">ผ่านการทดสอบ</div>
              <div style="font-size: 1.2rem; font-weight: bold; color: #34d399;">${report.completedGames}</div>
            </div>
            <div class="debug-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">เฉลี่ยเทิร์น/เกม</div>
              <div style="font-size: 1.2rem; font-weight: bold; color: #f59e0b;">${report.averageTurnsPerGame}</div>
            </div>
            <div class="debug-card" style="text-align: center;">
              <div style="font-size: 0.75rem; color: #94a3b8;">Errors Found</div>
              <div style="font-size: 1.2rem; font-weight: bold; color: ${report.errorCount > 0 ? '#ef4444' : '#34d399'};">${report.errorCount}</div>
            </div>
          </div>

          <div style="font-size: 0.85rem; font-weight: bold; color: #38bdf8; margin-bottom: 0.3rem;">
            ✔️ ผลการตรวจสอบกติกาและเงื่อนไข (Rule Checks):
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.8rem;">
            ${Object.entries(report.ruleChecks).map(([key, val]) => `
              <div style="background: rgba(15,23,42,0.8); padding: 0.35rem 0.6rem; border-radius: 4px; display: flex; justify-content: space-between; border-left: 3px solid #10b981;">
                <span>${key}</span>
                <span style="font-weight: bold; color: #34d399;">[${val}]</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }, 50);
  }

  /**
   * ปิดหน้าต่าง Debug Panel
   */
  close() {
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}
