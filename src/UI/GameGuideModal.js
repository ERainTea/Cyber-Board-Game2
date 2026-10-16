/**
 * @file src/UI/GameGuideModal.js
 * @description หน้าคู่มือการเล่นและสารานุกรมการ์ด (Phase 14: Manual & Card Reference)
 * รองรับการคลิกขยายรูปภาพ (Lightbox Fullscreen Zoom) อ่านคู่มือและรายละเอียดการ์ดได้ง่ายและชัดเจน
 * ภาษาไทย 100%
 */

import { ASSET_MANIFEST } from '../Assets/AssetManager.js';

export class GameGuideModal {
  /**
   * เปิด Modal หน้าคู่มือ
   * @param {Object} options
   * @param {Function} [options.onClose] - Callback เมื่อปิดคู่มือ
   * @param {boolean} [options.isGameActive=false] - สถานะว่าเปิดขณะกำลังแข่งหรือไม่ (สำหรับแสดงสถานะหยุดเกม)
   */
  static show({ onClose, isGameActive = false } = {}) {
    const existingOverlay = document.getElementById('game-guide-modal-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const modal = new GameGuideModal(onClose, isGameActive);
    modal.render();
  }

  constructor(onClose, isGameActive = false) {
    this.onCloseCallback = onClose;
    this.isGameActive = isGameActive;
    this.activeTab = 'RULES'; // 'RULES' | 'MANUAL_PAGES'
    this.searchQuery = '';
    this.manualPages = this.buildManualPagesList();
    this.currentManualIndex = 0;
    this.isZoomedInLightbox = false;
  }

  /**
   * สร้างรายการรูปคู่มือฉบับเต็มจาก ASSET_MANIFEST พร้อมกำกับชื่อหน้า
   */
  buildManualPagesList() {
    const manualObj = ASSET_MANIFEST.manual || {};
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
        let label = key;
        if (key === 'cover') label = 'หน้า 1 (ปกหน้า Cyber Board Game)';
        else {
          const num = parseInt(key.replace('page', ''), 10);
          label = `หน้า ${num + 1} (คู่มือการเล่น)`;
        }
        pages.push({ key, label, url: manualObj[key] });
      }
    }
    return pages.length > 0
      ? pages
      : Object.entries(manualObj).map(([k, u], idx) => ({ key: k, label: `หน้าที่ ${idx + 1}`, url: u }));
  }

  /**
   * เรนเดอร์โครงสร้าง Modal ลงใน document.body
   */
  render() {
    const overlay = document.createElement('div');
    overlay.id = 'game-guide-modal-overlay';
    overlay.className = 'modal-overlay game-guide-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(2, 6, 23, 0.92);
      backdrop-filter: blur(10px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      animation: fadeIn 0.25s ease-out;
    `;

    overlay.innerHTML = `
      <div class="modal-content guide-modal-container" style="
        width: 100%;
        max-width: 1020px;
        height: 92vh;
        max-height: 880px;
        background: #0f172a;
        border: 2px solid #3b82f6;
        border-radius: 16px;
        box-shadow: 0 0 40px rgba(59, 130, 246, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: #f8fafc;
        font-family: 'Plus Jakarta Sans', sans-serif;
      ">
        <!-- แถบด้านบนของ Modal (Header) -->
        <header style="
          padding: 1.1rem 1.5rem;
          background: linear-gradient(135deg, #1e293b, #0f172a);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-shrink: 0;
        ">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div style="font-size: 2.2rem; background: rgba(59, 130, 246, 0.15); border-radius: 12px; padding: 0.2rem 0.6rem; border: 1px solid rgba(59, 130, 246, 0.3);">📖</div>
            <div>
              <h2 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #60a5fa; display: flex; align-items: center; gap: 0.5rem;">
                <span>คู่มือและกติกาการเล่น Cyber Board Game</span>
              </h2>
              <p style="margin: 0.2rem 0 0 0; font-size: 0.85rem; color: #94a3b8;">
                ศูนย์รวมกติกาและหนังสือคู่มือฉบับเต็ม Cyber Board Game (คลิกรูปเพื่อขยายอ่านชัดเจน)
              </p>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${
              this.isGameActive
                ? `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.8rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 20px; display: flex; align-items: center; gap: 0.4rem;">
                    <span>⏸️</span> <span>เกมหยุดชั่วคราว</span>
                  </span>`
                : ''
            }
            <button id="guide-modal-close-btn" style="
              background: rgba(239, 68, 68, 0.15);
              border: 1px solid #ef4444;
              color: #fca5a5;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              font-size: 1.2rem;
              font-weight: bold;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s;
            " title="ปิดคู่มือ">✕</button>
          </div>
        </header>

        <!-- แถบเลือกประเภทเนื้อหา (Nav Tabs) -->
        <div style="
          padding: 0.9rem 1.5rem;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        ">
          <button class="guide-tab-btn ${this.activeTab === 'RULES' ? 'active' : ''}" data-tab="RULES">
            <span>📚</span> <span>กติกาทั้งหมด</span>
          </button>
          <button class="guide-tab-btn ${this.activeTab === 'MANUAL_PAGES' ? 'active' : ''}" data-tab="MANUAL_PAGES">
            <span>🖼️</span> <span>หนังสือคู่มือ (${this.manualPages.length} หน้า)</span>
          </button>
        </div>

        <!-- พื้นที่เนื้อหาหลัก (Body Content) -->
        <div id="guide-modal-body" style="
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem 1.5rem;
          background: #0f172a;
        ">
          <!-- เนื้อหาจะถูกเรนเดอร์ผ่าน renderBodyContent() -->
        </div>

        <!-- แถบด้านล่าง (Footer Bar) -->
        <footer style="
          padding: 0.85rem 1.5rem;
          background: #1e293b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        ">
          <span style="font-size: 0.85rem; color: #94a3b8; display: flex; align-items: center; gap: 0.4rem;">
            <span>💡</span> <span>คำแนะนำ: สามารถคลิกที่รูปหนังสือคู่มือหรือรูปการ์ดเพื่อขยายอ่านเต็มจอได้เสมอ</span>
          </span>
          <button id="guide-modal-bottom-close-btn" style="
            background: linear-gradient(135deg, #3b82f6, #2563eb);
            color: white;
            padding: 0.6rem 1.5rem;
            border-radius: 8px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
            transition: all 0.2s;
          ">
            ${this.isGameActive ? '▶️ กลับเข้าสู่การแข่งขัน' : 'ปิดคู่มือ'}
          </button>
        </footer>
      </div>

      <style>
        .guide-tab-btn {
          background: #0f172a;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.2s;
        }
        .guide-tab-btn:hover {
          background: #1e293b;
          color: #f8fafc;
          border-color: #475569;
        }
        .guide-tab-btn.active {
          background: #3b82f6;
          color: #ffffff;
          border-color: #60a5fa;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }
        .guide-card-item {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 1.2rem;
          display: flex;
          gap: 1.25rem;
          align-items: flex-start;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
        }
        .guide-card-item:hover {
          transform: translateY(-2px);
          border-color: #3b82f6;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .guide-card-item.good {
          border-left: 4px solid #10b981;
        }
        .guide-card-item.bad {
          border-left: 4px solid #ef4444;
        }
        .guide-manual-thumb-item {
          width: 72px;
          height: 96px;
          flex-shrink: 0;
          background: #0f172a;
          border: 2px solid #334155;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }
        .guide-manual-thumb-item:hover {
          border-color: #60a5fa;
          transform: scale(1.05);
        }
        .guide-manual-thumb-item.active {
          border-color: #3b82f6;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.6);
          transform: scale(1.06);
        }
        .manual-image-zoom-trigger {
          position: relative;
          cursor: zoom-in;
          overflow: hidden;
          border-radius: 12px;
          transition: transform 0.25s, box-shadow 0.25s;
        }
        .manual-image-zoom-trigger:hover {
          transform: scale(1.01);
          box-shadow: 0 0 25px rgba(59, 130, 246, 0.4);
        }
        .manual-image-zoom-trigger .zoom-hint-badge {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid #3b82f6;
          color: #60a5fa;
          font-size: 0.82rem;
          font-weight: 700;
          padding: 0.4rem 0.85rem;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          pointer-events: none;
          transition: all 0.2s;
        }
        .manual-image-zoom-trigger:hover .zoom-hint-badge {
          background: #3b82f6;
          color: #ffffff;
        }
      </style>
    `;

    document.body.appendChild(overlay);

    this.bindEvents(overlay);
    this.renderBodyContent();
  }

  /**
   * ผูกเหตุการณ์ปุ่ม
   * @param {HTMLElement} overlay
   */
  bindEvents(overlay) {
    const closeBtn = overlay.querySelector('#guide-modal-close-btn');
    const bottomCloseBtn = overlay.querySelector('#guide-modal-bottom-close-btn');
    const tabBtns = overlay.querySelectorAll('.guide-tab-btn');

    const handleClose = () => {
      overlay.remove();
      if (typeof this.onCloseCallback === 'function') {
        this.onCloseCallback();
      }
    };

    if (closeBtn) closeBtn.onclick = handleClose;
    if (bottomCloseBtn) bottomCloseBtn.onclick = handleClose;

    // สลับแท็บ
    tabBtns.forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) {
          this.activeTab = tab;
          tabBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.renderBodyContent();
        }
      };
    });
  }

  /**
   * เรนเดอร์เนื้อหาหลักตามแท็บ
   */
  renderBodyContent() {
    const bodyContainer = document.getElementById('guide-modal-body');
    if (!bodyContainer) return;

    if (this.activeTab === 'MANUAL_PAGES') {
      bodyContainer.innerHTML = this.getManualPagesSectionHTML();
      this.bindManualPageEvents();
      return;
    }

    bodyContainer.innerHTML = this.getRulesSectionHTML();
  }

  /**
   * ดึง HTML โครงสร้างกติกาทั้งหมดของเกม
   */
  getRulesSectionHTML() {
    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 880px; margin: 0 auto;">
        
        <!-- ส่วนที่ 1: วิธีการเล่น (How to Play) -->
        <div style="background: #1e293b; border-radius: 14px; padding: 1.35rem; border: 1px solid rgba(59, 130, 246, 0.3); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <span style="font-size: 1.6rem;">📜</span>
            <div>
              <h3 style="margin: 0; color: #60a5fa; font-size: 1.25rem; font-weight: 800;">วิธีการเล่น</h3>
              <p style="margin: 0.15rem 0 0 0; color: #94a3b8; font-size: 0.85rem;">กติกาและลำดับขั้นตอนการแข่งขันหลัก</p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- ข้อ 1 -->
            <div style="background: rgba(15, 23, 42, 0.7); border-left: 4px solid #38bdf8; border-radius: 10px; padding: 1rem 1.15rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                <span style="background: #0284c7; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">1</span>
                <h4 style="margin: 0; color: #38bdf8; font-size: 1.05rem; font-weight: 700;">จัดลำดับผู้เล่นที่จุดเริ่มต้น</h4>
              </div>
              <p style="margin: 0; color: #f1f5f9; font-size: 0.95rem; font-weight: 600; line-height: 1.6;">
                นำตัวผู้เล่นมาที่จุดเริ่มต้นและผลัดกันทอยลูกเต๋า ผู้เล่นที่ได้แต้มมากจะเป็นผู้เล่นก่อนตามลำดับคะแนน
              </p>
              <p style="margin: 0.35rem 0 0 0; color: #94a3b8; font-size: 0.85rem; line-height: 1.5;">
                <i>(ผู้เล่นทุกคนจะเริ่มต้นที่จุด START ช่องที่ 0 ในรอบแรกระบบจะให้ทุกคนทอยเต๋า 1 ครั้งเพื่อจัดคิวการเล่นตามคะแนนจากมากไปน้อย)</i>
              </p>
            </div>

            <!-- ข้อ 2 -->
            <div style="background: rgba(15, 23, 42, 0.7); border-left: 4px solid #fbbf24; border-radius: 10px; padding: 1rem 1.15rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                <span style="background: #d97706; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">2</span>
                <h4 style="margin: 0; color: #fbbf24; font-size: 1.05rem; font-weight: 700;">เริ่มเล่นและเดินตามช่องพิเศษ</h4>
              </div>
              <p style="margin: 0; color: #f1f5f9; font-size: 0.95rem; font-weight: 600; line-height: 1.6;">
                ผู้เล่นผลัดกันทอยลูกเต๋า และเดินตามกระดานเท่ากับ แต้มที่ได้ หากผู้เล่นเดินไปตกยังช่องพิเศษ ให้ผู้เล่น ปฏิบัติตามคำสั่งนั้น
              </p>
              <div style="margin-top: 0.6rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.6rem;">
                <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.85rem; color: #6ee7b7;">
                  🟢 <b>ช่องรางวัลพิเศษ:</b> ได้รับผลประโยชน์ เช่น เดินหน้าโบนัส หรือได้สิทธิ์ทอยเต๋าเพิ่ม
                </div>
                <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 0.5rem 0.75rem; font-size: 0.85rem; color: #fca5a5;">
                  🔴 <b>ช่องบทลงโทษ:</b> ได้รับผลกระทบ เช่น เดินถอยหลัง, หยุดเดิน 1 ตา หรือกลับจุดเริ่มต้น
                </div>
              </div>
            </div>

            <!-- ข้อ 3 -->
            <div style="background: rgba(15, 23, 42, 0.7); border-left: 4px solid #a855f7; border-radius: 10px; padding: 1rem 1.15rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.35rem;">
                <span style="background: #9333ea; color: white; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem;">3</span>
                <h4 style="margin: 0; color: #c084fc; font-size: 1.05rem; font-weight: 700;">การตัดสินผู้ชนะ</h4>
              </div>
              <p style="margin: 0; color: #f1f5f9; font-size: 0.95rem; font-weight: 600; line-height: 1.6;">
                ผู้ที่มาถึงเส้นชัยก่อนคือผู้ชนะ
              </p>
              <p style="margin: 0.35rem 0 0 0; color: #94a3b8; font-size: 0.85rem; line-height: 1.5;">
                <i>(ผู้เล่นคนแรกที่สามารถนำตัวหมากเคลื่อนที่มาถึงช่องเส้นชัย FINISH จะได้รับชัยชนะและจบเกมทันที)</i>
              </p>
            </div>
          </div>
        </div>

        <!-- ส่วนที่ 2: โหมดการเล่น (Game Modes) & ขั้นตอนก่อนสร้างห้อง -->
        <div style="background: #1e293b; border-radius: 14px; padding: 1.35rem; border: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <span style="font-size: 1.6rem;">🕹️</span>
            <div>
              <h3 style="margin: 0; color: #38bdf8; font-size: 1.25rem; font-weight: 800;">โหมดการเล่นและการเตรียมตัว</h3>
              <p style="margin: 0.15rem 0 0 0; color: #94a3b8; font-size: 0.85rem;">รายละเอียดโหมดออฟไลน์, โหมดออนไลน์ และสิ่งที่ต้องทำก่อนสร้างห้อง</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
            <!-- โหมดออฟไลน์ -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 12px; padding: 1.15rem; display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; color: #34d399;">
                <span style="font-size: 1.4rem;">🎮</span>
                <h4 style="margin: 0; font-size: 1.1rem; font-weight: 800;">1. โหมดออฟไลน์ (Offline / Local)</h4>
              </div>
              <p style="margin: 0; color: #cbd5e1; font-size: 0.88rem; line-height: 1.5;">
                เล่นร่วมกันบนหน้าจออุปกรณ์เดียวกัน (Pass & Play) สำหรับ 2 - 4 คน โดยไม่ต้องใช้อินเทอร์เน็ต
              </p>
              <div style="background: rgba(30, 41, 59, 0.8); border-radius: 8px; padding: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-weight: 700; color: #a7f3d0; font-size: 0.85rem; margin-bottom: 0.4rem;">📌 ขั้นตอนการเล่น:</div>
                <ol style="margin: 0; padding-left: 1.2rem; color: #cbd5e1; font-size: 0.83rem; line-height: 1.6;">
                  <li>กดปุ่ม <b>"เริ่มเกม (Offline / Local)"</b> จากหน้าเมนูหลัก</li>
                  <li>เลือกจำนวนผู้เล่นที่ต้องการ (2, 3 หรือ 4 คน)</li>
                  <li>ตั้งชื่อผู้เล่น และเลือกสี/ตัวละครหมากของแต่ละคน (แดง, น้ำเงิน, เขียว, เหลือง)</li>
                  <li>เข้าสู่กระดานเกมและผลัดกันทอยเต๋าเล่นได้ทันที</li>
                </ol>
              </div>
            </div>

            <!-- โหมดออนไลน์ -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid #2563eb; border-radius: 12px; padding: 1.15rem; display: flex; flex-direction: column; gap: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; color: #60a5fa;">
                <span style="font-size: 1.4rem;">🌐</span>
                <h4 style="margin: 0; font-size: 1.1rem; font-weight: 800;">2. โหมดออนไลน์ (Multiplayer)</h4>
              </div>
              <p style="margin: 0; color: #cbd5e1; font-size: 0.88rem; line-height: 1.5;">
                เล่นกับเพื่อนข้ามเครื่องผ่านระบบเครือข่ายอินเทอร์เน็ตแบบ Real-time พร้อมระบบซิงโครไนซ์ตำแหน่งและการทอยเต๋า
              </p>
              <div style="background: rgba(30, 41, 59, 0.8); border-radius: 8px; padding: 0.75rem; border: 1px solid rgba(255,255,255,0.05);">
                <div style="font-weight: 700; color: #93c5fd; font-size: 0.85rem; margin-bottom: 0.4rem;">📌 ก่อนสร้างห้อง / เข้าเล่น มีขั้นตอนดังนี้:</div>
                <ul style="margin: 0; padding-left: 1.2rem; color: #cbd5e1; font-size: 0.83rem; line-height: 1.6;">
                  <li><b>การตั้งค่าก่อนสร้างห้อง (Host):</b>
                    <div style="margin-left: 0.5rem; color: #94a3b8; font-size: 0.8rem; margin-top: 0.2rem;">
                      • ตั้งชื่อผู้เล่นของตนเอง<br>
                      • เลือกจำนวนผู้เล่นสูงสุดในห้อง (2, 3 หรือ 4 คน)<br>
                      • กดสร้างห้อง และรับ <b>รหัสห้อง 6 หลัก (Room Code)</b> เพื่อส่งให้เพื่อน
                    </div>
                  </li>
                  <li style="margin-top: 0.35rem;"><b>การเข้าร่วมห้อง (Join):</b> กรอกรหัสห้อง 6 หลัก และตั้งชื่อผู้เล่น แล้วกดเข้าร่วมห้อง</li>
                  <li style="margin-top: 0.35rem;"><b>ในห้องรอ (Lobby):</b> ผู้เล่นทุกคนเลือกตัวละครหมาก (ห้ามซ้ำกัน) แล้วกดยืนยัน <b>"พร้อม"</b></li>
                  <li style="margin-top: 0.35rem;"><b>เริ่มเกม:</b> เมื่อทุกคนพร้อม หัวหน้าห้อง (Host) จะกดปุ่ม <b>"เริ่มเกม"</b> เพื่อเข้าสู่กระดานพร้อมกัน</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  /**
   * ดึง HTML แสดงหนังสือคู่มือฉบับเต็มทีละหน้า พร้อมระบบค้นหน้าและแถบรูปย่อ
   */
  getManualPagesSectionHTML() {
    const totalPages = this.manualPages.length;
    const pageObj = this.manualPages[this.currentManualIndex] || { url: '', label: '' };

    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; max-width: 920px; margin: 0 auto;">
        <!-- แถบเลือกหน้าแบบด่วน (Quick Jump Bar) -->
        <div style="
          width: 100%; 
          background: #1e293b; 
          border: 1px solid rgba(255,255,255,0.08); 
          border-radius: 12px; 
          padding: 0.75rem 1.25rem; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 1rem; 
          flex-wrap: wrap;
        ">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span style="font-size: 0.9rem; color: #94a3b8; font-weight: 600;">📖 ข้ามไปที่หน้า:</span>
            <select id="guide-manual-page-select" style="
              background: #0f172a;
              border: 1px solid #3b82f6;
              color: #38bdf8;
              padding: 0.45rem 1rem;
              border-radius: 8px;
              font-weight: 700;
              font-size: 0.88rem;
              outline: none;
              cursor: pointer;
            ">
              ${this.manualPages
                .map(
                  (p, idx) => `
                <option value="${idx}" ${idx === this.currentManualIndex ? 'selected' : ''}>
                  ${p.label} (${idx + 1}/${totalPages})
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button id="guide-manual-zoom-btn" style="
              background: linear-gradient(135deg, #3b82f6, #1d4ed8);
              color: white;
              border: none;
              padding: 0.45rem 1rem;
              border-radius: 8px;
              font-size: 0.85rem;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 0.4rem;
              box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
            ">
              <span>🔍</span> <span>ขยายรูปเต็มจอ (Fullscreen)</span>
            </button>
          </div>
        </div>

        <!-- กรอบแสดงรูปภาพขนาดใหญ่ (คลิกเพื่อขยาย) -->
        <div 
          id="guide-manual-main-image-frame"
          class="manual-image-zoom-trigger" 
          title="คลิกที่รูปภาพเพื่อเปิดโหมดขยายอ่านชัดเจนเต็มจอ (Lightbox)"
          style="
            background: #020617; 
            border: 2px solid #334155; 
            border-radius: 12px; 
            padding: 0.5rem; 
            max-width: 780px; 
            width: 100%; 
            text-align: center; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            position: relative;
          "
        >
          <img 
            src="${pageObj.url}" 
            alt="${pageObj.label}"
            style="max-width: 100%; max-height: 480px; border-radius: 8px; object-fit: contain; display: block; margin: 0 auto;" 
          />
          <div class="zoom-hint-badge">
            <span>🔍</span> <span>คลิกที่รูปเพื่อขยายอ่านชัดเจน</span>
          </div>
        </div>

        <!-- แถบปุ่มนำทางเปลี่ยนหน้า -->
        <div style="display: flex; align-items: center; gap: 0.75rem; background: #1e293b; padding: 0.6rem 1.25rem; border-radius: 30px; border: 1px solid rgba(255,255,255,0.1);">
          <button id="guide-manual-first-btn" ${this.currentManualIndex === 0 ? 'disabled' : ''} style="
            background: #334155; color: white; border: none; padding: 0.4rem 0.75rem; border-radius: 20px; font-weight: 700; cursor: pointer; opacity: ${this.currentManualIndex === 0 ? '0.4' : '1'};
          " title="หน้าแรก">|◀</button>

          <button id="guide-manual-prev-btn" ${this.currentManualIndex === 0 ? 'disabled' : ''} style="
            background: #334155; color: white; border: none; padding: 0.4rem 1rem; border-radius: 20px; font-weight: 700; cursor: pointer; opacity: ${this.currentManualIndex === 0 ? '0.4' : '1'};
          ">◀ ก่อนหน้า</button>

          <span style="font-weight: 800; color: #38bdf8; font-size: 0.92rem; min-width: 140px; text-align: center;">
            ${pageObj.label} (${this.currentManualIndex + 1}/${totalPages})
          </span>

          <button id="guide-manual-next-btn" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''} style="
            background: #334155; color: white; border: none; padding: 0.4rem 1rem; border-radius: 20px; font-weight: 700; cursor: pointer; opacity: ${this.currentManualIndex === totalPages - 1 ? '0.4' : '1'};
          ">ถัดไป ▶</button>

          <button id="guide-manual-last-btn" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''} style="
            background: #334155; color: white; border: none; padding: 0.4rem 0.75rem; border-radius: 20px; font-weight: 700; cursor: pointer; opacity: ${this.currentManualIndex === totalPages - 1 ? '0.4' : '1'};
          " title="หน้าสุดท้าย">▶|</button>
        </div>

        <!-- แถบอัลบั้มรูปย่อแบบแถวนวนแนวนอน (Thumbnail Ribbon) -->
        <div style="width: 100%; margin-top: 0.25rem;">
          <div style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.4rem; font-weight: 600;">
            🖼️ เลือกดูหน้าคู่มือแบบรวดเร็ว (คลิกรูปย่อล่างนี้):
          </div>
          <div 
            id="guide-manual-thumbs-scroll"
            style="
              display: flex; 
              gap: 0.6rem; 
              overflow-x: auto; 
              padding: 0.5rem 0.25rem 0.75rem 0.25rem; 
              scrollbar-width: thin; 
              scrollbar-color: #3b82f6 #0f172a;
            "
          >
            ${this.manualPages
              .map(
                (p, idx) => `
              <div 
                class="guide-manual-thumb-item ${idx === this.currentManualIndex ? 'active' : ''}" 
                data-manual-index="${idx}"
                title="${p.label}"
              >
                <img src="${p.url}" alt="${p.label}" style="width: 100%; height: 100%; object-fit: cover;" />
                <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.85); color: #fff; font-size: 0.6rem; font-weight: 800; padding: 0px 4px; border-radius: 3px;">
                  ${idx + 1}
                </span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * ผูกเหตุการณ์เปลี่ยนหน้าและคลิกขยายรูปภาพ
   */
  bindManualPageEvents() {
    const prevBtn = document.getElementById('guide-manual-prev-btn');
    const nextBtn = document.getElementById('guide-manual-next-btn');
    const firstBtn = document.getElementById('guide-manual-first-btn');
    const lastBtn = document.getElementById('guide-manual-last-btn');
    const pageSelect = document.getElementById('guide-manual-page-select');
    const zoomBtn = document.getElementById('guide-manual-zoom-btn');
    const mainImgFrame = document.getElementById('guide-manual-main-image-frame');
    const thumbScroll = document.getElementById('guide-manual-thumbs-scroll');

    // คลิกเพื่อขยาย Lightbox
    const openCurrentPageInLightbox = () => {
      const pageObj = this.manualPages[this.currentManualIndex];
      if (pageObj) {
        this.openLightboxForManual();
      }
    };

    if (mainImgFrame) mainImgFrame.onclick = openCurrentPageInLightbox;
    if (zoomBtn) zoomBtn.onclick = openCurrentPageInLightbox;

    // เลือกหน้าจาก Dropdown
    if (pageSelect) {
      pageSelect.onchange = (e) => {
        this.currentManualIndex = parseInt(e.target.value, 10) || 0;
        this.renderBodyContent();
      };
    }

    // ปุ่มเปลี่ยนหน้า
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentManualIndex > 0) {
          this.currentManualIndex--;
          this.renderBodyContent();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentManualIndex < this.manualPages.length - 1) {
          this.currentManualIndex++;
          this.renderBodyContent();
        }
      };
    }

    if (firstBtn) {
      firstBtn.onclick = () => {
        this.currentManualIndex = 0;
        this.renderBodyContent();
      };
    }

    if (lastBtn) {
      lastBtn.onclick = () => {
        this.currentManualIndex = this.manualPages.length - 1;
        this.renderBodyContent();
      };
    }

    // คลิก Thumbnail รูปย่อ
    if (thumbScroll) {
      thumbScroll.querySelectorAll('.guide-manual-thumb-item').forEach((thumb) => {
        thumb.onclick = () => {
          const idx = parseInt(thumb.getAttribute('data-manual-index'), 10);
          if (!isNaN(idx)) {
            this.currentManualIndex = idx;
            this.renderBodyContent();
          }
        };
      });

      // เลื่อน Scroll ไปยัง Thumb ที่ Active
      const activeThumb = thumbScroll.querySelector('.guide-manual-thumb-item.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  /**
   * เปิด Lightbox เต็มจอสำหรับอ่านหนังสือคู่มือ (รองรับปุ่มก่อนหน้า/ถัดไป/ซูมขยายเพิ่มเติม)
   */
  openLightboxForManual() {
    this.openLightbox(null, null, true);
  }

  /**
   * เปิด Modal Lightbox ขยายรูปภาพเต็มจอพร้อมเอฟเฟกต์และฟังก์ชันปุ่มนำทาง
   * @param {string|null} [singleImageUrl] - URL รูปภาพเดี่ยว (กรณีขยายการ์ด)
   * @param {string|null} [singleTitle] - หัวข้อภาพเดี่ยว
   * @param {boolean} [isManualMode=false] - สถานะว่าขยายจากหนังสือคู่มือหรือไม่
   */
  openLightbox(singleImageUrl = null, singleTitle = null, isManualMode = false) {
    const existingLightbox = document.getElementById('guide-lightbox-overlay');
    if (existingLightbox) existingLightbox.remove();

    const totalPages = this.manualPages.length;
    let pageObj = isManualMode ? this.manualPages[this.currentManualIndex] : null;
    let imgUrl = singleImageUrl || pageObj?.url || '';
    let titleText = singleTitle || pageObj?.label || 'ขยายรูปภาพ';

    const lightbox = document.createElement('div');
    lightbox.id = 'guide-lightbox-overlay';
    lightbox.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(2, 6, 23, 0.95);
      backdrop-filter: blur(12px);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 1rem;
      color: #f8fafc;
      font-family: 'Plus Jakarta Sans', sans-serif;
      animation: fadeIn 0.2s ease-out;
    `;

    const renderLightboxContent = () => {
      if (isManualMode) {
        pageObj = this.manualPages[this.currentManualIndex];
        imgUrl = pageObj?.url || '';
        titleText = `หนังสือคู่มือ: ${pageObj?.label || ''} (${this.currentManualIndex + 1}/${totalPages})`;
      }

      lightbox.innerHTML = `
        <!-- Lightbox Header -->
        <header style="
          width: 100%;
          max-width: 1200px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          backdrop-filter: blur(8px);
        ">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.4rem;">🔍</span>
            <span style="font-size: 1.05rem; font-weight: 800; color: #60a5fa;">${titleText}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 0.8rem; color: #94a3b8;" class="desktop-only">
              💡 ดับเบิลคลิกรูปเพื่อสลับขนาด 100% / 150% | กด Esc หรือ คลิกพื้นหลังดำเพื่อปิด
            </span>
            <button id="lightbox-close-btn" style="
              background: #ef4444;
              color: white;
              border: none;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              font-size: 1.2rem;
              font-weight: bold;
              cursor: pointer;
              box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
            " title="ปิดหน้าต่างขยายรูป (Esc)">✕</button>
          </div>
        </header>

        <!-- Lightbox Image Stage -->
        <div id="lightbox-image-stage" style="
          flex: 1;
          width: 100%;
          max-width: 1200px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: auto;
          margin: 0.75rem 0;
          cursor: zoom-in;
        ">
          ${
            isManualMode && this.currentManualIndex > 0
              ? `<button id="lightbox-prev-btn" style="
                  position: absolute; left: 1rem; top: 50%; transform: translateY(-50%);
                  background: rgba(15, 23, 42, 0.85); border: 2px solid #3b82f6; color: #60a5fa;
                  padding: 0.8rem 1.2rem; border-radius: 30px; font-weight: 800; font-size: 1.1rem;
                  cursor: pointer; z-index: 10; backdrop-filter: blur(4px); box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                  transition: all 0.2s;
                " title="หน้าก่อนหน้า (◄)">◀ หน้าก่อนหน้า</button>`
              : ''
          }

          <img 
            id="lightbox-target-img"
            src="${imgUrl}" 
            alt="${titleText}"
            style="
              max-width: 95%; 
              max-height: 82vh; 
              object-fit: contain; 
              border-radius: 12px; 
              box-shadow: 0 0 40px rgba(0,0,0,0.8);
              border: 1px solid rgba(255,255,255,0.15);
              transition: transform 0.25s ease;
            " 
          />

          ${
            isManualMode && this.currentManualIndex < totalPages - 1
              ? `<button id="lightbox-next-btn" style="
                  position: absolute; right: 1rem; top: 50%; transform: translateY(-50%);
                  background: rgba(15, 23, 42, 0.85); border: 2px solid #3b82f6; color: #60a5fa;
                  padding: 0.8rem 1.2rem; border-radius: 30px; font-weight: 800; font-size: 1.1rem;
                  cursor: pointer; z-index: 10; backdrop-filter: blur(4px); box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                  transition: all 0.2s;
                " title="หน้าถัดไป (►)">หน้าถัดไป ▶</button>`
              : ''
          }
        </div>

        <!-- Lightbox Footer -->
        <footer style="
          width: 100%;
          max-width: 1200px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1.2rem;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          backdrop-filter: blur(8px);
        ">
          ${
            isManualMode
              ? `<span style="font-size: 0.9rem; font-weight: 700; color: #38bdf8;">
                  หน้าที่ ${this.currentManualIndex + 1} จากทั้งหมด ${totalPages} หน้า
                </span>`
              : `<span style="font-size: 0.9rem; font-weight: 700; color: #38bdf8;">ภาพขยายรายละเอียดการ์ด</span>`
          }

          <div style="display: flex; gap: 0.75rem;">
            <button id="lightbox-toggle-zoom" style="
              background: #334155; color: white; border: none; padding: 0.4rem 1rem; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem;
            ">🔍 สลับการซูม (Zoom 1.5x)</button>
            <button id="lightbox-done-btn" style="
              background: #3b82f6; color: white; border: none; padding: 0.4rem 1.2rem; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem;
            ">ปิดรูปขยาย</button>
          </div>
        </footer>
      `;

      // ผูกเหตุการณ์ภายใน Lightbox
      const closeBtn = lightbox.querySelector('#lightbox-close-btn');
      const doneBtn = lightbox.querySelector('#lightbox-done-btn');
      const prevBtn = lightbox.querySelector('#lightbox-prev-btn');
      const nextBtn = lightbox.querySelector('#lightbox-next-btn');
      const toggleZoomBtn = lightbox.querySelector('#lightbox-toggle-zoom');
      const targetImg = lightbox.querySelector('#lightbox-target-img');
      const imgStage = lightbox.querySelector('#lightbox-image-stage');

      const closeLightbox = () => {
        window.removeEventListener('keydown', keyNavHandler);
        lightbox.remove();
      };

      if (closeBtn) closeBtn.onclick = closeLightbox;
      if (doneBtn) doneBtn.onclick = closeLightbox;

      // คลิกพื้นที่ว่างเพื่อปิด
      if (imgStage) {
        imgStage.onclick = (e) => {
          if (e.target === imgStage) closeLightbox();
        };
      }

      // ซูมขยายรูปภาพ
      let isEnlarged = false;
      const toggleZoom = () => {
        isEnlarged = !isEnlarged;
        if (targetImg) {
          if (isEnlarged) {
            targetImg.style.transform = 'scale(1.45)';
            targetImg.style.cursor = 'zoom-out';
            if (toggleZoomBtn) toggleZoomBtn.innerText = '🔍 ย่อกลับขนาดปกติ (Fit)';
          } else {
            targetImg.style.transform = 'scale(1)';
            targetImg.style.cursor = 'zoom-in';
            if (toggleZoomBtn) toggleZoomBtn.innerText = '🔍 สลับการซูม (Zoom 1.5x)';
          }
        }
      };

      if (toggleZoomBtn) toggleZoomBtn.onclick = toggleZoom;
      if (targetImg) targetImg.ondblclick = toggleZoom;

      // เปลี่ยนหน้า Manual ขณะอยู่ใน Lightbox
      if (prevBtn) {
        prevBtn.onclick = () => {
          if (this.currentManualIndex > 0) {
            this.currentManualIndex--;
            this.renderBodyContent();
            renderLightboxContent();
          }
        };
      }

      if (nextBtn) {
        nextBtn.onclick = () => {
          if (this.currentManualIndex < totalPages - 1) {
            this.currentManualIndex++;
            this.renderBodyContent();
            renderLightboxContent();
          }
        };
      }
    };

    // ปุ่มกดบนคีย์บอร์ด (Esc, ArrowLeft, ArrowRight)
    const keyNavHandler = (e) => {
      if (e.key === 'Escape') {
        lightbox.remove();
        window.removeEventListener('keydown', keyNavHandler);
      } else if (isManualMode && e.key === 'ArrowLeft') {
        if (this.currentManualIndex > 0) {
          this.currentManualIndex--;
          this.renderBodyContent();
          renderLightboxContent();
        }
      } else if (isManualMode && e.key === 'ArrowRight') {
        if (this.currentManualIndex < totalPages - 1) {
          this.currentManualIndex++;
          this.renderBodyContent();
          renderLightboxContent();
        }
      }
    };

    window.addEventListener('keydown', keyNavHandler);

    document.body.appendChild(lightbox);
    renderLightboxContent();
  }
}
