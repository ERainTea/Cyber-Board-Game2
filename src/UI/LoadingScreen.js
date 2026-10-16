/**
 * @file src/UI/LoadingScreen.js
 * @description คอมโพเนนต์หน้าจอโหลด Asset (Loading Screen) ภาษาไทย พร้อมเปอร์เซ็นต์และ Error Handling
 */

import { assetManager, ASSET_MANIFEST } from '../Assets/AssetManager.js';

export class LoadingScreen {
  /**
   * @param {HTMLElement} container - DOM Container สำหรับแสดงผล
   * @param {Function} onComplete - Callback เมื่อโหลด Asset ทั้งหมดเสร็จสิ้น
   */
  constructor(container, onComplete) {
    this.container = container;
    this.onComplete = onComplete;
    this.element = null;
  }

  /**
   * สร้างและแสดงผล Loading Screen HTML
   */
  render() {
    this.container.innerHTML = `
      <div class="loading-screen" id="loading-screen">
        <div class="loading-bg-glow"></div>
        <div class="loading-content">
          <div class="loading-logo-wrapper">
            ${(ASSET_MANIFEST.logos || []).map((url, idx, arr) => `
              <img 
                src="${url}" 
                alt="โลโก้ Cyber Board Game" 
                class="loading-logo logo-img-${idx + 1}" 
                onerror="this.style.display='none'"
              />
              ${idx < arr.length - 1 ? '<span class="logo-x-divider">✕</span>' : ''}
            `).join('')}
          </div>
          <h2 class="loading-title">Cyber Board Game</h2>
          <p class="loading-status-text" id="loading-status-text">กำลังเตรียมระบบทรัพยากรเกม...</p>

          <div class="progress-container">
            <div class="progress-bar-fill" id="progress-bar-fill" style="width: 0%;"></div>
          </div>

          <div class="progress-stats">
            <span id="loading-count">0 / 0 รายการ</span>
            <span class="progress-percentage" id="progress-percentage">0%</span>
          </div>

          <div id="loading-error-box" style="display: none;" class="error-box">
            <p id="error-message">เกิดข้อผิดพลาดในการโหลดรูปภาพบางรายการ</p>
            <button id="btn-retry-loading" class="btn-retry">ลองใหม่อีกครั้ง</button>
          </div>
        </div>
      </div>
    `;

    this.startLoading();
  }

  /**
   * เริ่มต้นกระบวนการโหลด Asset ทั้งหมด
   */
  async startLoading() {
    const statusText = document.getElementById('loading-status-text');
    const progressBar = document.getElementById('progress-bar-fill');
    const progressPercent = document.getElementById('progress-percentage');
    const loadingCount = document.getElementById('loading-count');
    const errorBox = document.getElementById('loading-error-box');

    if (errorBox) errorBox.style.display = 'none';

    try {
      const success = await assetManager.loadAllAssets((percent, loaded, total, currentUrl) => {
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (loadingCount) loadingCount.textContent = `${loaded} / ${total} รายการ`;
        if (statusText) {
          // แปลงชื่อไฟล์แบบสั้นเพื่อแสดงผลอย่างสวยงาม
          const fileName = currentUrl.split('/').pop().split('?')[0];
          statusText.textContent = `กำลังโหลด: ${decodeURIComponent(fileName)}`;
        }
      });

      if (success) {
        if (statusText) statusText.textContent = 'โหลดข้อมูลสมบูรณ์! กำลังเข้าสู่เมนูหลัก...';
        setTimeout(() => {
          if (typeof this.onComplete === 'function') {
            this.onComplete();
          }
        }, 500);
      } else {
        if (errorBox) {
          errorBox.style.display = 'block';
          const retryBtn = document.getElementById('btn-retry-loading');
          if (retryBtn) {
            retryBtn.onclick = () => this.startLoading();
          }
        }
      }
    } catch (err) {
      console.error('[LoadingScreen Error]', err);
      if (errorBox) {
        errorBox.style.display = 'block';
        const retryBtn = document.getElementById('btn-retry-loading');
        if (retryBtn) {
          retryBtn.onclick = () => this.startLoading();
        }
      }
    }
  }
}
