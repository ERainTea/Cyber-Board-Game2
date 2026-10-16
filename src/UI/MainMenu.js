/**
 * @file src/UI/MainMenu.js
 * @description หน้าจอเมนูหลัก (Main Menu UI) ภาษาไทย พร้อมระบบ Animation และ ป๊อปอัปย่อย
 */

import { ASSET_MANIFEST, assetManager } from '../Assets/AssetManager.js';
import { gameStateStore } from '../GameState.js';
import { GameGuideModal } from './GameGuideModal.js';

export class MainMenu {
  /**
   * @param {HTMLElement} container - DOM Container สำหรับวาง UI เมนูหลัก
   */
  constructor(container) {
    this.container = container;
    this.activeModal = null;
    this.manualPages = this.buildManualPagesList();
    this.currentManualIndex = 0;
  }

  /**
   * รวบรวมรายการหน้าคู่มือการเล่นทั้งหมดจาก ASSET_MANIFEST
   * @returns {string[]} อาร์เรย์ของ URL รูปหน้าคู่มือ
   */
  buildManualPagesList() {
    const manualObj = ASSET_MANIFEST.manual;
    const orderedKeys = [
      'cover',
      'page1',
      'page2',
      'page3',
      'page4',
      'page5',
      'page6',
      'page7',
      'page8',
      'page9',
      'page10',
    ];

    const pages = [];
    for (const key of orderedKeys) {
      if (manualObj[key]) {
        pages.push(manualObj[key]);
      }
    }
    return pages.length > 0 ? pages : Object.values(manualObj);
  }

  /**
   * เรนเดอร์หน้าจอเมนูหลัก
   */
  render() {
    this.container.innerHTML = `
      <div class="main-menu-container">
        <div class="main-menu-bg-decoration"></div>
        
        <div class="main-menu-card">
          <!-- ชื่อเกม Cyber Boardgame ตัวใหญ่ เข้ากับธีมเกม -->
          <div class="main-menu-title-wrapper">
            <div class="cyber-subtitle-tag">⚡ CYBER BOARD GAME ⚡</div>
            <h1 class="main-menu-game-title">
              <span class="cyber-text">CYBER</span>
              <span class="boardgame-text">BOARDGAME</span>
            </h1>
          </div>

          <!-- ส่วนโลโก้เกม -->
          <div class="menu-logo-wrapper">
            ${(ASSET_MANIFEST.logos || []).map((url, idx, arr) => `
              <img 
                src="${url}" 
                alt="โลโก้ Cyber Board Game" 
                class="menu-logo-img logo-img-${idx + 1}"
              />
              ${idx < arr.length - 1 ? '<span class="logo-x-divider">✕</span>' : ''}
            `).join('')}
          </div>

          <!-- รายการปุ่มกดเมนูหลัก -->
          <div class="menu-buttons-list">
            <button class="menu-btn menu-btn-start" id="btn-start-game">
              <span class="menu-btn-icon">🎮</span>
              <span>เริ่มเกม (Offline / Local)</span>
            </button>

            <button class="menu-btn menu-btn-multiplayer" id="btn-multiplayer" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); border: 1px solid #60a5fa;">
              <span class="menu-btn-icon">🌐</span>
              <span>เล่นออนไลน์ (Multiplayer)</span>
            </button>

            <button class="menu-btn menu-btn-manual" id="btn-how-to-play">
              <span class="menu-btn-icon">📖</span>
              <span>วิธีเล่น</span>
            </button>

            <button class="menu-btn menu-btn-settings" id="btn-settings">
              <span class="menu-btn-icon">⚙️</span>
              <span>ตั้งค่า</span>
            </button>

            <button class="menu-btn menu-btn-exit" id="btn-exit-game">
              <span class="menu-btn-icon">🚪</span>
              <span>ออกจากเกม</span>
            </button>
          </div>

          <!-- ส่วนท้ายเครดิต -->
          <div class="menu-footer">
            <p>© 2026 Cyber Board Game</p>
          </div>
        </div>
      </div>

      <!-- พื้นที่สำหรับแสดง Modal / Dialog -->
      <div id="modal-container"></div>
    `;

    this.bindEvents();
  }

  /**
   * ผูกเหตุการณ์การคลิกปุ่มต่างๆ
   */
  bindEvents() {
    const btnStart = document.getElementById('btn-start-game');
    const btnMultiplayer = document.getElementById('btn-multiplayer');
    const btnManual = document.getElementById('btn-how-to-play');
    const btnSettings = document.getElementById('btn-settings');
    const btnExit = document.getElementById('btn-exit-game');

    if (btnStart) btnStart.onclick = () => this.onStartGame();
    if (btnMultiplayer) btnMultiplayer.onclick = () => gameStateStore.setState({ phase: 'MULTIPLAYER_LOBBY' });
    if (btnManual) btnManual.onclick = () => this.openManualModal();
    if (btnSettings) btnSettings.onclick = () => this.openSettingsModal();
    if (btnExit) btnExit.onclick = () => this.openExitModal();
  }

  /**
   * เมื่อผู้เล่นกดปุ่ม "เริ่มเกม"
   */
  onStartGame() {
    gameStateStore.setState({ phase: 'PLAYER_SELECT' });
  }

  /**
   * เปิด Modal คู่มือการเล่นและสารานุกรมการ์ด (Phase 14)
   */
  openManualModal() {
    GameGuideModal.show({ isGameActive: false });
  }

  /**
   * เรนเดอร์เนื่อหาคู่มือการเล่นพร้อมระบบเปลี่ยนหน้า
   */
  renderManualContent() {
    const totalPages = this.manualPages.length;
    const currentUrl = this.manualPages[this.currentManualIndex];

    this.openModal(`
      <div class="modal-content manual-modal-content">
        <div class="modal-header">
          <h3 class="modal-title">📖 คู่มือการเล่น (วิธีเล่น)</h3>
          <button class="btn-close-modal" id="btn-close-manual">✕</button>
        </div>
        <div class="modal-body manual-viewer-body">
          <div class="manual-image-container">
            <img 
              src="${currentUrl}" 
              alt="คู่มือการเล่น หน้าที่ ${this.currentManualIndex + 1}" 
              class="manual-image"
              id="manual-current-img"
            />
          </div>

          <div class="manual-controls">
            <button class="btn-manual-nav" id="btn-prev-page" ${this.currentManualIndex === 0 ? 'disabled' : ''}>
              ◀ หน้าก่อนหน้า
            </button>

            <span class="manual-page-counter">
              หน้าที่ ${this.currentManualIndex + 1} / ${totalPages}
            </span>

            <button class="btn-manual-nav" id="btn-next-page" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''}>
              หน้าถัดไป ▶
            </button>
          </div>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-manual');
    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');

    if (closeBtn) closeBtn.onclick = () => this.closeModal();
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentManualIndex > 0) {
          this.currentManualIndex--;
          this.renderManualContent();
        }
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentManualIndex < totalPages - 1) {
          this.currentManualIndex++;
          this.renderManualContent();
        }
      };
    }
  }

  /**
   * เปิด Modal ตั้งค่าเสียงและตัวเลือกระบบ
   */
  openSettingsModal() {
    const bgmVal = Math.round((soundManager.bgmVolume || 0.6) * 100);
    const sfxVal = Math.round((soundManager.sfxVolume || 0.8) * 100);
    const isBgmMuted = soundManager.bgmMuted;
    const isSfxMuted = soundManager.sfxMuted;

    this.openModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">⚙️ ตั้งค่าเกม (Audio & Animation Settings)</h3>
          <button class="btn-close-modal" id="btn-close-settings">✕</button>
        </div>
        <div class="modal-body">
          <div class="setting-item">
            <div class="setting-label">
              <span>🎵 เสียงเพลงประกอบ (BGM) <span id="bgm-vol-text">${bgmVal}%</span></span>
              <span class="setting-desc">ปรับระดับเสียงเพลงพื้นหลัง</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; margin-top: 0.3rem;">
              <input type="range" min="0" max="100" value="${bgmVal}" class="slider-control" id="slider-bgm" style="flex: 1;" />
              <label style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" id="chk-bgm-mute" ${isBgmMuted ? 'checked' : ''} /> ปิดเสียง
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🔔 เสียงเอฟเฟกต์ (SFX) <span id="sfx-vol-text">${sfxVal}%</span></span>
              <span class="setting-desc">ปรับระดับเสียงการทอดลูกเต๋าและการเดิน</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; margin-top: 0.3rem;">
              <input type="range" min="0" max="100" value="${sfxVal}" class="slider-control" id="slider-sfx" style="flex: 1;" />
              <label style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" id="chk-sfx-mute" ${isSfxMuted ? 'checked' : ''} /> ปิดเสียง
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>⚡ ความเร็วแอนิเมชัน</span>
              <span class="setting-desc">ความเร็วการเดินของหมากบนกระดาน</span>
            </div>
            <label class="switch-toggle">
              <input type="checkbox" id="toggle-speed" checked />
              <span class="switch-slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🖥️ โหมดแสดงผลเต็มหน้าจอ</span>
              <span class="setting-desc">สลับเข้าสู่โหมด Fullscreen</span>
            </div>
            <button class="btn-manual-nav" id="btn-toggle-fullscreen" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
              เต็มหน้าจอ
            </button>
          </div>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-settings');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    const sliderBgm = document.getElementById('slider-bgm');
    const chkBgmMute = document.getElementById('chk-bgm-mute');
    const bgmVolText = document.getElementById('bgm-vol-text');

    if (sliderBgm) {
      sliderBgm.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        soundManager.setBGMVolume(val);
        if (bgmVolText) bgmVolText.textContent = `${val}%`;
      };
    }

    if (chkBgmMute) {
      chkBgmMute.onchange = (e) => {
        soundManager.toggleBGMMute(e.target.checked);
      };
    }

    const sliderSfx = document.getElementById('slider-sfx');
    const chkSfxMute = document.getElementById('chk-sfx-mute');
    const sfxVolText = document.getElementById('sfx-vol-text');

    if (sliderSfx) {
      sliderSfx.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        soundManager.setSFXVolume(val);
        if (sfxVolText) sfxVolText.textContent = `${val}%`;
      };
    }

    if (chkSfxMute) {
      chkSfxMute.onchange = (e) => {
        soundManager.toggleSFXMute(e.target.checked);
      };
    }

    const fsBtn = document.getElementById('btn-toggle-fullscreen');
    if (fsBtn) {
      fsBtn.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      };
    }
  }

  /**
   * เปิด Dialog ยืนยันการออกจากเกม
   */
  openExitModal() {
    this.openModal(`
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-body exit-dialog-body">
          <span class="exit-icon">🚪</span>
          <h3 class="exit-title">ยืนยันการออกจากเกม</h3>
          <p class="exit-desc">คุณต้องการออกจาก Cyber Board Game ใช่หรือไม่?</p>
          <div class="exit-actions">
            <button class="btn-confirm-exit" id="btn-confirm-exit">ยืนยัน</button>
            <button class="btn-cancel-exit" id="btn-cancel-exit">ยกเลิก</button>
          </div>
        </div>
      </div>
    `);

    const confirmBtn = document.getElementById('btn-confirm-exit');
    const cancelBtn = document.getElementById('btn-cancel-exit');

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        alert('ขอบคุณที่ร่วมเล่น Cyber Board Game!');
        this.closeModal();
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = () => this.closeModal();
    }
  }

  /**
   * เปิด Modal กลาง
   * @param {string} htmlContent - โครงสร้าง HTML สำหรับแสดงใน Modal
   */
  openModal(htmlContent) {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
          ${htmlContent}
        </div>
      `;

      const overlay = document.getElementById('modal-overlay');
      if (overlay) {
        overlay.onclick = (e) => {
          if (e.target === overlay) {
            this.closeModal();
          }
        };
      }
    }
  }

  /**
   * ปิด Modal ปัจจุบัน
   */
  closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = '';
    }
  }
}
