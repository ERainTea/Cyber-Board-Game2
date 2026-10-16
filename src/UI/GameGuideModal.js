/**
 * @file src/UI/GameGuideModal.js
 * @description หน้าต่างคู่มือการเล่นและสารานุกรมกติกา Cyber Board Game
 * ออกแบบเพื่อรองรับทุกแพลตฟอร์ม (Desktop, Tablet, Mobile) ปรับ UI ให้เข้ากับอุปกรณ์ อ่านง่าย สบายตา
 * ฟีเจอร์เด่น:
 * - 4 แท็บจัดหมวดหมู่อ่านง่าย: กติกาสรุปด่วน, วิธีเล่นบนอุปกรณ์ต่างๆ, สารานุกรมช่องกระดาน (เขียว/แดง), และหนังสือคู่มือ 11 หน้า
 * - Touch Swipe & Touch Pinch-to-zoom บนรูปคู่มือสำหรับสมาร์ตโฟนและแท็บเล็ต
 * - Quick Jump Chips ไปยังหน้าสำคัญได้ใน 1 สัมผัส
 * - ตัวกรองค้นหาช่องพิเศษ (ทั้งหมด / ช่องเขียว / ช่องแดง)
 * - Lightbox ขยายอ่านแบบเต็มจอ (Fullscreen Reader)
 */

import { ASSET_MANIFEST } from '../Assets/AssetManager.js';
import { escapeHtml } from '../Utils/security.js';

export class GameGuideModal {
  /**
   * เปิด Modal หน้าคู่มือ
   * @param {Object} options
   * @param {Function} [options.onClose] - Callback เมื่อปิดคู่มือ
   * @param {boolean} [options.isGameActive=false] - สถานะว่าเปิดขณะกำลังแข่งหรือไม่
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
    this.activeTab = 'RULES'; // 'RULES' | 'DEVICE_GUIDE' | 'TILES_SUMMARY' | 'MANUAL_PAGES'
    this.manualPages = this.buildManualPagesList();
    this.currentManualIndex = 0;
    this.zoomLevel = 1;
    this.tileFilter = 'ALL'; // 'ALL' | 'GREEN' | 'RED'
  }

  /**
   * สร้างรายการรูปคู่มือฉบับเต็มจาก ASSET_MANIFEST พร้อมกำกับชื่อหน้าภาษาไทย
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

    const labelsMap = {
      cover: 'หน้า 1 (ปกหน้า Cyber Board Game)',
      page1: 'หน้า 2 (กติกาและอุปกรณ์การเล่น)',
      page2: 'หน้า 3 (ขั้นตอนและวิธีเริ่มเล่น)',
      page3: 'หน้า 4 (ช่องความปลอดภัย & สิทธิประโยชน์)',
      page4: 'หน้า 5 (ช่องภัยคุกคาม & บทลงโทษ)',
      page5: 'หน้า 6 (การสุ่มการ์ดพิเศษ)',
      page6: 'หน้า 7 (การเดินตัวหมากและเส้นชัย)',
      page7: 'หน้า 8 (คำถาม-คำตอบที่พบบ่อย)',
      page8: 'หน้า 9 (ทักษะไซเบอร์ 8 ประการ)',
      page9: 'หน้า 10 (ตารางสรุปคะแนน)',
      page10: 'หน้า 11 (ปกหลังและข้อมูลติดต่อ)',
    };

    const pages = [];
    for (const key of orderedKeys) {
      if (manualObj[key]) {
        pages.push({
          key,
          label: labelsMap[key] || `หน้าที่ ${pages.length + 1}`,
          url: manualObj[key],
        });
      }
    }
    return pages.length > 0
      ? pages
      : Object.entries(manualObj).map(([k, u], idx) => ({ key: k, label: `หน้าที่ ${idx + 1}`, url: u }));
  }

  /**
   * เรนเดอร์โครงสร้าง Modal แบบ Responsive ลงใน document.body
   */
  render() {
    const overlay = document.createElement('div');
    overlay.id = 'game-guide-modal-overlay';
    overlay.className = 'modal-overlay game-guide-overlay';

    overlay.innerHTML = `
      <div class="guide-modal-card" id="guide-modal-card">
        <!-- แถบด้านบนของ Modal (Header) -->
        <header class="guide-modal-header">
          <div class="guide-header-title-group">
            <span class="guide-header-icon">📖</span>
            <div>
              <h2 class="guide-header-title">คู่มือการเล่น Cyber Board Game</h2>
              <p class="guide-header-subtitle">กติกาเข้าใจง่าย วิธีควบคุมบนทุกอุปกรณ์ และหนังสือคู่มือฉบับเต็ม</p>
            </div>
          </div>

          <div class="guide-header-actions">
            ${
              this.isGameActive
                ? `<span class="guide-pause-badge">
                    <span>⏸️</span> <span>เกมหยุดชั่วคราว</span>
                  </span>`
                : ''
            }
            <button id="guide-modal-close-btn" class="guide-close-btn" aria-label="ปิดคู่มือ" title="ปิดคู่มือ (Esc)">✕</button>
          </div>
        </header>

        <!-- แถบเลือกประเภทเนื้อหา (Nav Tabs) ปรับให้เลื่อนง่ายบนมือถือ -->
        <nav class="guide-tabs-bar" role="tablist">
          <button class="guide-tab-btn ${this.activeTab === 'RULES' ? 'active' : ''}" data-tab="RULES">
            <span>📚</span> <span>กติกาสรุปด่วน</span>
          </button>
          <button class="guide-tab-btn ${this.activeTab === 'DEVICE_GUIDE' ? 'active' : ''}" data-tab="DEVICE_GUIDE">
            <span>📱</span> <span>วิธีเล่นบนมือถือ/คอม</span>
          </button>
          <button class="guide-tab-btn ${this.activeTab === 'TILES_SUMMARY' ? 'active' : ''}" data-tab="TILES_SUMMARY">
            <span>🎯</span> <span>สรุปช่องเขียว/แดง</span>
          </button>
          <button class="guide-tab-btn ${this.activeTab === 'MANUAL_PAGES' ? 'active' : ''}" data-tab="MANUAL_PAGES">
            <span>🖼️</span> <span>หนังสือคู่มือ (${this.manualPages.length} หน้า)</span>
          </button>
        </nav>

        <!-- พื้นที่เนื้อหาหลัก (Body Content) -->
        <div id="guide-modal-body" class="guide-modal-body">
          <!-- เรนเดอร์ตามแท็บ -->
        </div>

        <!-- แถบด้านล่าง (Footer Bar) -->
        <footer class="guide-modal-footer">
          <span class="guide-footer-hint">
            <span>💡</span> <span>รองรับการเล่นทั้งบนสมาร์ตโฟน แท็บเล็ต และคอมพิวเตอร์อย่างราบรื่น</span>
          </span>
          <button id="guide-modal-bottom-close-btn" class="guide-footer-btn">
            ${this.isGameActive ? '▶️ กลับเข้าสู่การแข่งขัน' : 'ปิดคู่มือ'}
          </button>
        </footer>
      </div>
    `;

    document.body.appendChild(overlay);

    this.bindEvents(overlay);
    this.renderBodyContent();
  }

  /**
   * ผูกเหตุการณ์หลักของ Modal
   */
  bindEvents(overlay) {
    const closeBtn = overlay.querySelector('#guide-modal-close-btn');
    const bottomCloseBtn = overlay.querySelector('#guide-modal-bottom-close-btn');
    const tabBtns = overlay.querySelectorAll('.guide-tab-btn');

    const handleClose = () => {
      window.removeEventListener('keydown', keyNavListener);
      overlay.remove();
      if (typeof this.onCloseCallback === 'function') {
        this.onCloseCallback();
      }
    };

    if (closeBtn) closeBtn.onclick = handleClose;
    if (bottomCloseBtn) bottomCloseBtn.onclick = handleClose;

    // คีย์ลัด Esc เพื่อปิด
    const keyNavListener = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (this.activeTab === 'MANUAL_PAGES') {
        if (e.key === 'ArrowLeft' && this.currentManualIndex > 0) {
          this.currentManualIndex--;
          this.renderBodyContent();
        } else if (e.key === 'ArrowRight' && this.currentManualIndex < this.manualPages.length - 1) {
          this.currentManualIndex++;
          this.renderBodyContent();
        }
      }
    };
    window.addEventListener('keydown', keyNavListener);

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
   * เรนเดอร์เนื้อหาตามแท็บที่เลือก
   */
  renderBodyContent() {
    const bodyContainer = document.getElementById('guide-modal-body');
    if (!bodyContainer) return;

    if (this.activeTab === 'MANUAL_PAGES') {
      bodyContainer.innerHTML = this.getManualPagesSectionHTML();
      this.bindManualPageEvents();
    } else if (this.activeTab === 'TILES_SUMMARY') {
      bodyContainer.innerHTML = this.getTilesSummaryHTML();
      this.bindTilesSummaryEvents();
    } else if (this.activeTab === 'DEVICE_GUIDE') {
      bodyContainer.innerHTML = this.getDeviceGuideHTML();
    } else {
      bodyContainer.innerHTML = this.getRulesSectionHTML();
    }
  }

  /**
   * แท็บที่ 1: กติกาสรุปด่วนแบบข้อความ (Quick Text Guide) อ่านสบายตาบนทุกอุปกรณ์
   */
  getRulesSectionHTML() {
    return `
      <div class="guide-content-wrapper">
        <!-- การแข่งขันและเป้าหมาย -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num">1</span>
            <div>
              <h3 class="guide-card-title">เป้าหมายและการตัดสินผู้ชนะ</h3>
              <p class="guide-card-subtitle">กติกาการเคลื่อนที่และเข้าสู่เส้นชัย</p>
            </div>
          </div>
          <div class="guide-card-body">
            <p>ผู้เล่นแต่ละคนเลือกตัวหมาก 1 สี (ไม่ซ้ำกัน) และผลัดกันทอยลูกเต๋าเพื่อเดินตัวหมากไปตามช่องทางเดิน 39 ช่อง โดยผู้สร้างห้องหรือผู้เล่นสามารถเลือกกติกาการชนะได้ 2 รูปแบบ:</p>
            <div class="guide-mode-pills">
              <div class="guide-mode-pill">
                <strong>🏁 ใครถึงก่อนชนะ (First Reach):</strong>
                <span>ผู้เล่นคนแรกที่ทอยเต๋าได้แต้มถึงช่องเส้นชัย หรือแต้มเกินเส้นชัย จะเป็นผู้ชนะทันที</span>
              </div>
              <div class="guide-mode-pill">
                <strong>🎯 ทอยแต้มลงพอดี (Exact Roll):</strong>
                <span>ผู้เล่นต้องทอยลูกเต๋าให้แต้มลงช่องเส้นชัยพอดีเป๊ะ หากแต้มเกิน ตัวหมากจะเด้งถอยหลัง (Bounce Back) ตามแต้มส่วนเกิน</span>
              </div>
            </div>
          </div>
        </section>

        <!-- การจัดลำดับคนเดิน -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num">2</span>
            <div>
              <h3 class="guide-card-title">การจัดลำดับคนเดิน</h3>
              <p class="guide-card-subtitle">3 โหมดการเลือกคิวการเล่น</p>
            </div>
          </div>
          <div class="guide-card-body">
            <div class="guide-mode-pills">
              <div class="guide-mode-pill">
                <strong>🎲 ทอยเต๋าวัดแต้ม (Dice Roll):</strong>
                <span>ผู้เล่นทุกคนทอยเต๋าคนละ 1 ครั้ง ใครได้แต้มสูงสุดจะได้เริ่มเดินเป็นคนแรก เรียงตามลำดับแต้ม</span>
              </div>
              <div class="guide-mode-pill">
                <strong>🔀 สุ่มลำดับอัตโนมัติ (Random):</strong>
                <span>ระบบสุ่มสลับลำดับคนเดินอย่างยุติธรรม เริ่มเล่นได้ทันทีโดยไม่ต้องรอทอยวัดแต้ม</span>
              </div>
              <div class="guide-mode-pill">
                <strong>📋 ตามลำดับเข้าห้อง (Join Order - เฉพาะออนไลน์):</strong>
                <span>เรียงตามลำดับเวลาที่ผู้เล่นกดเข้าร่วมห้อง โฮสต์เดินคนแรก</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ประเภทช่องบนกระดาน -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num">3</span>
            <div>
              <h3 class="guide-card-title">ประเภทของช่องบนกระดาน</h3>
              <p class="guide-card-subtitle">ช่องทางเดินธรรมดาและช่องเหตุการณ์ไซเบอร์</p>
            </div>
          </div>
          <div class="guide-card-body">
            <div class="guide-tile-types-grid">
              <div class="tile-type-card green">
                <div class="tile-type-header">
                  <span class="tile-type-icon">🟢</span>
                  <h4>ช่องความปลอดภัย (โบนัส)</h4>
                </div>
                <p>พฤติกรรมปลอดภัยทางไซเบอร์ เช่น สนทนากับผู้ปกครอง, บล็อกคนน่าสงสัย, ตั้งรหัสผ่านที่รัดกุม</p>
                <div class="tile-type-reward">✨ ได้เดินหน้าเพิ่ม หรือได้สิทธิ์เล่นอีกตา</div>
              </div>

              <div class="tile-type-card red">
                <div class="tile-type-header">
                  <span class="tile-type-icon">🔴</span>
                  <h4>ช่องภัยคุกคาม (บทลงโทษ)</h4>
                </div>
                <p>พฤติกรรมเสี่ยง เช่น โพสต์ข้อความหยาบคาย, นัดเจอคนแปลกหน้าตามลำพัง, หลงเชื่อกลโกง</p>
                <div class="tile-type-penalty">⚠️ โดนถอยหลัง, หยุดเดิน 1 ตา หรือกลับจุดเริ่มต้น</div>
              </div>

              <div class="tile-type-card special">
                <div class="tile-type-header">
                  <span class="tile-type-icon">❓</span>
                  <h4>ช่องสุ่มการ์ดพิเศษ</h4>
                </div>
                <p>สุ่มเปิดการ์ดเหตุการณ์หรือคำถามความปลอดภัยไซเบอร์เพื่อรับโบนัสหรือทดสอบความรู้</p>
                <div class="tile-type-info">🎲 สุ่มผลลัพธ์หลากหลายตามการ์ด</div>
              </div>
            </div>
          </div>
        </section>

        <!-- โหมดการเล่น -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num">4</span>
            <div>
              <h3 class="guide-card-title">โหมดการเล่น (Offline & Online)</h3>
              <p class="guide-card-subtitle">เล่นสนุกได้ทั้งแบบคนเดียว กับเพื่อน หรือข้ามอุปกรณ์</p>
            </div>
          </div>
          <div class="guide-card-body">
            <div class="guide-platforms-grid">
              <div class="platform-box">
                <h4>🕹️ โหมดเล่นเครื่องเดียวกัน (Offline Pass & Play)</h4>
                <p>เล่นได้ 2 - 6 คน สลับกันทอยเต๋าบนหน้าจอเดียวกัน ไม่ต้องต่ออินเทอร์เน็ต เมื่อถึงตาใครระบบจะมีป้ายแจ้งเตือนให้ส่งเครื่องให้ผู้เล่นนั้น</p>
              </div>
              <div class="platform-box">
                <h4>🌐 โหมดออนไลน์ผ่านห้อง (Online Multiplayer)</h4>
                <p>เล่นข้ามเครื่องแบบเรียลไทม์ผ่าน WebSocket สร้างห้องพร้อมตั้งรหัสผ่าน หรือเลือกเข้าห้องสาธารณะจากรายชื่อห้องได้ทันที</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  /**
   * แท็บที่ 2: วิธีควบคุมและแนะนำการเล่นบนแต่ละอุปกรณ์ (Device Guide)
   */
  getDeviceGuideHTML() {
    return `
      <div class="guide-content-wrapper">
        <div class="guide-section-intro">
          <h3 style="color: #38bdf8; font-size: 1.25rem; font-weight: 800; margin-bottom: 0.35rem;">
            📱 คำแนะนำการเล่นบนอุปกรณ์ต่างๆ
          </h3>
          <p style="color: #94a3b8; font-size: 0.9rem;">
            Cyber Board Game ได้รับการปรับแต่งให้เล่นง่าย สะดวก และสบายตาทั้งบนมือถือ แท็บเล็ต และคอมพิวเตอร์
          </p>
        </div>

        <!-- สมาร์ตโฟน -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num" style="background: linear-gradient(135deg, #38bdf8, #0284c7);">📱</span>
            <div>
              <h3 class="guide-card-title">การเล่นบนสมาร์ตโฟน (Mobile Optimization)</h3>
              <p class="guide-card-subtitle">ออกแบบให้ควบคุมได้ด้วยมือเดียวอย่างคล่องตัว</p>
            </div>
          </div>
          <div class="guide-card-body">
            <div class="device-tips-grid">
              <div class="device-tip-item">
                <span class="device-tip-icon">🔘</span>
                <div>
                  <strong>แผงควบคุมลอยด้านล่าง (Mobile Dock):</strong>
                  <p>ปุ่มทอยลูกเต๋าขนาดใหญ่ลอยอยู่ด้านล่างหน้าจอเสมอ สามารถแตะทอยเต๋าได้ทันทีโดยไม่ต้องเลื่อนจอไปมา</p>
                </div>
              </div>

              <div class="device-tip-item">
                <span class="device-tip-icon">🔍</span>
                <div>
                  <strong>เครื่องมือซูมและจัดมุมมอง (Zoom HUD):</strong>
                  <p>แตะปุ่ม <b>[+]</b> หรือ <b>[-]</b> เพื่อขยายกระดาน, ปุ่ม <b>[↺]</b> เพื่อกลับสู่ขนาดเต็มจอ หรือแตะปุ่ม <b>[🎯 โฟกัส]</b> เพื่อให้หน้าจอเลื่อนไปหาตัวหมากของผู้เล่นปัจจุบันทันที</p>
                </div>
              </div>

              <div class="device-tip-item">
                <span class="device-tip-icon">👆</span>
                <div>
                  <strong>การปัดเลื่อนและ Pinch-to-Zoom:</strong>
                  <p>เมื่อซูมกระดาน สามารถใช้นิ้วลากเลื่อนกระดาน (Touch Pan) ได้อย่างอิสระ หรือใช้ 2 นิ้วบีบ/ถ่างเพื่อซูมได้เหมือนแอปดูรูป</p>
                </div>
              </div>

              <div class="device-tip-item">
                <span class="device-tip-icon">📑</span>
                <div>
                  <strong>แท็บสลับข้อมูลด่วน:</strong>
                  <p>แตะแท็บด้านล่างเพื่อสลับดู <b>แผงทอยเต๋า</b>, <b>รายชื่อผู้เล่น</b> หรือ <b>ประวัติบันทึกเกม (Logs)</b> ได้ทันที</p>
                </div>
              </div>

              <div class="device-tip-item">
                <span class="device-tip-icon">🤝</span>
                <div>
                  <strong>การส่งเครื่องในโหมด Offline:</strong>
                  <p>เมื่อจบเทิร์น ระบบจะแสดงป้ายแจ้งเตือนชื่อและสีผู้เล่นถัดไปอย่างเด่นชัด เพื่อให้ส่งมือถือให้เพื่อนเล่นต่อได้อย่างสะดวก</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- แท็บเล็ตและ iPad -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num" style="background: linear-gradient(135deg, #a855f7, #7e22ce);">📟</span>
            <div>
              <h3 class="guide-card-title">การเล่นบนแท็บเล็ตและ iPad</h3>
              <p class="guide-card-subtitle">มุมมองกว้างและพื้นที่สัมผัสที่สบายตา</p>
            </div>
          </div>
          <div class="guide-card-body">
            <p>บนหน้าจอแท็บเล็ต ตัวเกมจะจัดวางกระดานและแผงควบคุมให้อยู่ในระยะสัมผัสที่เหมาะสม รองรับทั้งการเล่นในแนวตั้ง (Portrait) และแนวนอน (Landscape) อย่างสมดุล</p>
          </div>
        </section>

        <!-- คอมพิวเตอร์และโน้ตบุ๊ก -->
        <section class="guide-card">
          <div class="guide-card-header">
            <span class="guide-badge-num" style="background: linear-gradient(135deg, #10b981, #059669);">💻</span>
            <div>
              <h3 class="guide-card-title">การเล่นบนคอมพิวเตอร์และโน้ตบุ๊ก (Desktop)</h3>
              <p class="guide-card-subtitle">มุมมองเต็มรูปแบบพร้อมทางลัดคีย์บอร์ด</p>
            </div>
          </div>
          <div class="guide-card-body">
            <ul class="guide-bullet-list">
              <li><strong>แสดงผลแบบ Wide Side-by-Side:</strong> กระดานเกมอยู่ทางซ้าย และแผงทอยเต๋า/ผู้เล่น/แชตอยู่ทางขวาพร้อมกันอย่างครบถ้วน</li>
              <li><strong>คลิกเมาส์ลากเลื่อนกระดาน:</strong> คลิกซ้ายค้างแล้วลากเพื่อเลื่อนมุมมองกระดานเมื่อซูมขยาย</li>
              <li><strong>คีย์ลัด Esc:</strong> กดแป้น Esc บนคีย์บอร์ดเพื่อปิดหน้าต่างคู่มือหรือเมนูได้ทันที</li>
            </ul>
          </div>
        </section>
      </div>
    `;
  }

  /**
   * แท็บที่ 3: สรุปช่องเขียวและช่องแดง (Tiles Summary) พร้อมปุ่มกรอง
   */
  getTilesSummaryHTML() {
    const specialTiles = [
      {
        num: 'ช่อง 3',
        type: 'green',
        title: 'สนทนากับผู้ปกครอง',
        desc: 'สนทนากับผู้ปกครองเกี่ยวกับภัยคุกคามออนไลน์จากอินเทอร์เน็ต',
        action: '⏩ เดินหน้า 3 ช่อง',
        badge: 'โบนัส',
      },
      {
        num: 'ช่อง 5',
        type: 'red',
        title: 'ไม่อ้างอิงแหล่งที่มา',
        desc: 'นำข้อมูลที่คัดลอกจากอินเทอร์เน็ตมาใช้โดยไม่อ้างอิงแหล่งที่มา',
        action: '⛔ หยุดเล่น 1 รอบ',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 10',
        type: 'red',
        title: 'โพสต์ข้อความหยาบคาย',
        desc: 'โพสต์ข้อความที่หยาบคาย ก้าวร้าว หรือกลั่นแกล้งผู้อื่นบนโลกออนไลน์',
        action: '⛔ หยุดเล่น 1 รอบ',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 11',
        type: 'red',
        title: 'นัดพบคนแปลกหน้า',
        desc: 'นัดพบคนแปลกหน้าที่คุยผ่านทางอินเทอร์เน็ตตามลำพัง โดยไม่ได้บอกพ่อแม่ให้ทราบก่อน',
        action: '⚠️ กลับไปที่จุดเริ่มต้น (ช่อง 0)',
        badge: 'บทลงโทษรุนแรง',
      },
      {
        num: 'ช่อง 14',
        type: 'red',
        title: 'แชร์ข่าวปลอม',
        desc: 'แชร์โพสต์หรือข้อมูลที่ไม่เป็นความจริง โดยไม่ตรวจสอบข้อเท็จจริง',
        action: '⛔ หยุดเล่น 1 รอบ',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 17',
        type: 'green',
        title: 'รู้เท่าทันกลโกง',
        desc: 'รู้เท่าทันโปรโมชันสุดคุ้มและโฆษณาเกินจริงว่าเป็นกลโกงออนไลน์',
        action: '⏩ เดินหน้า 6 ช่อง',
        badge: 'โบนัส',
      },
      {
        num: 'ช่อง 19',
        type: 'red',
        title: 'ติดเน็ตจนเสียเวลาชีวิต',
        desc: 'ปฏิเสธการไปเที่ยวหรือทำกิจกรรมร่วมกับครอบครัว เพราะกลัวไม่ได้ใช้งานอินเทอร์เน็ต',
        action: '⏪ เดินถอยหลัง 6 ช่อง',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 21',
        type: 'green',
        title: 'บล็อกคนน่าสงสัย',
        desc: 'บล็อกคนน่าสงสัย และจำกัดการมองเห็นรูปโปรไฟล์ให้เห็นเฉพาะกลุ่มเพื่อน',
        action: '🎲 เล่นอีกครั้ง (ได้ทอยเต๋าอีกตา)',
        badge: 'โบนัสพิเศษ',
      },
      {
        num: 'ช่อง 22',
        type: 'red',
        title: 'กดไลก์ข้อความว่าร้าย',
        desc: 'กดไลก์ข้อความหรือโพสต์ที่ว่าร้ายและสร้างความเสียหายแก่ผู้อื่น',
        action: '⏪ เดินถอยหลัง 4 ช่อง',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 24',
        type: 'green',
        title: 'พักสายตาจากหน้าจอ',
        desc: 'พักสายตาจากหน้าจอ แล้วไปออกกำลังกาย ท่องเที่ยว หรืออ่านหนังสือ',
        action: '⏩ เดินหน้า 7 ช่อง',
        badge: 'โบนัส',
      },
      {
        num: 'ช่อง 27',
        type: 'red',
        title: 'โพสต์ด้วยอารมณ์โกรธ',
        desc: 'โพสต์ข้อความลงบนโลกออนไลน์ด้วยอารมณ์โกรธ โดยไม่คิดไตร่ตรองให้รอบคอบ',
        action: '⛔ หยุดเล่น 1 รอบ',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 29',
        type: 'green',
        title: 'ตั้งค่าความเป็นส่วนตัว',
        desc: 'ตั้งค่าโปรไฟล์และข้อมูลส่วนตัว ให้มองเห็นได้เฉพาะกลุ่มเพื่อนที่ไว้ใจได้เท่านั้น',
        action: '⏩ เดินหน้า 4 ช่อง',
        badge: 'โบนัส',
      },
      {
        num: 'ช่อง 32',
        type: 'red',
        title: 'เล่นเกมดึกจนหลับในห้องเรียน',
        desc: 'เล่นเกมออนไลน์จนดึกและแอบนอนหลับในชั่วโมงเรียน',
        action: '⏪ เดินถอยหลัง 9 ช่อง',
        badge: 'บทลงโทษ',
      },
      {
        num: 'ช่อง 35',
        type: 'green',
        title: 'แบ่งปันความรู้ไซเบอร์ปลอดภัย',
        desc: 'ช่วยแนะนำและส่งเสริมให้คนรอบข้างเข้าถึงและใช้งานอินเทอร์เน็ตได้อย่างปลอดภัย',
        action: '🎲 เล่นอีกครั้ง (ได้ทอยเต๋าอีกตา)',
        badge: 'โบนัสพิเศษ',
      },
    ];

    const filtered = specialTiles.filter((t) => {
      if (this.tileFilter === 'GREEN') return t.type === 'green';
      if (this.tileFilter === 'RED') return t.type === 'red';
      return true;
    });

    return `
      <div class="guide-content-wrapper">
        <div class="guide-section-intro">
          <h3 style="color: #60a5fa; font-size: 1.25rem; font-weight: 800; margin-bottom: 0.35rem;">
            🎯 สารานุกรมช่องเหตุการณ์บนกระดาน (39 ช่อง)
          </h3>
          <p style="color: #94a3b8; font-size: 0.9rem;">
            รายละเอียดบทเรียนความปลอดภัยทางไซเบอร์ที่ระบุบนกระดานเกมจริง
          </p>

          <!-- แถบปุ่มกรองประเภทช่อง -->
          <div class="guide-filter-chips">
            <button class="filter-chip-btn ${this.tileFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">
              <span>📋 ทั้งหมด (${specialTiles.length})</span>
            </button>
            <button class="filter-chip-btn green ${this.tileFilter === 'GREEN' ? 'active' : ''}" data-filter="GREEN">
              <span>🟢 ช่องความปลอดภัย (โบนัส 6 ช่อง)</span>
            </button>
            <button class="filter-chip-btn red ${this.tileFilter === 'RED' ? 'active' : ''}" data-filter="RED">
              <span>🔴 ช่องภัยคุกคาม (บทลงโทษ 8 ช่อง)</span>
            </button>
          </div>
        </div>

        <div class="guide-tiles-grid">
          ${filtered
            .map(
              (t) => `
            <div class="guide-tile-card ${t.type}-card">
              <div class="guide-tile-card-top">
                <span class="tile-number-badge ${t.type}">${escapeHtml(t.num)}</span>
                <span class="tile-badge-tag ${t.type}">${escapeHtml(t.badge)}</span>
              </div>
              <h4 class="guide-tile-card-title">${escapeHtml(t.title)}</h4>
              <p class="guide-tile-card-desc">${escapeHtml(t.desc)}</p>
              <div class="guide-tile-card-action ${t.type}">
                ${escapeHtml(t.action)}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  bindTilesSummaryEvents() {
    const filterBtns = document.querySelectorAll('.filter-chip-btn');
    filterBtns.forEach((btn) => {
      btn.onclick = () => {
        const filter = btn.getAttribute('data-filter');
        if (filter) {
          this.tileFilter = filter;
          this.renderBodyContent();
        }
      };
    });
  }

  /**
   * แท็บที่ 4: หนังสือคู่มือฉบับเต็มแบบรูปภาพ (Manual Pages) พร้อม Touch Swipe, Pinch-to-zoom และ Quick Jump
   */
  getManualPagesSectionHTML() {
    const totalPages = this.manualPages.length;
    const pageObj = this.manualPages[this.currentManualIndex] || { url: '', label: '' };

    return `
      <div class="guide-manual-container">
        <!-- แถบควบคุมและเครื่องมือการอ่าน -->
        <div class="guide-manual-toolbar">
          <div class="guide-page-select-group">
            <label for="guide-manual-page-select" class="guide-select-label">📄 หน้าที่:</label>
            <select id="guide-manual-page-select" class="guide-page-select" aria-label="เลือกหน้าคู่มือ">
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

          <div class="guide-zoom-controls">
            <button id="btn-manual-zoom-in" class="manual-tool-btn" title="ซูมขยาย (+)">➕</button>
            <button id="btn-manual-zoom-out" class="manual-tool-btn" title="ซูมย่อ (-)">➖</button>
            <button id="btn-manual-zoom-reset" class="manual-tool-btn" title="ขนาดพอดีหน้าจอ">↺</button>
            <button id="guide-manual-lightbox-btn" class="manual-tool-btn primary" title="ขยายเต็มจอ">⛶ ขยายเต็มจอ</button>
          </div>
        </div>

        <!-- Quick Jump Chips ไปหน้าสำคัญได้ใน 1 สัมผัส -->
        <div class="guide-quick-jump-bar">
          <span class="jump-title">ข้ามด่วน:</span>
          <button class="jump-chip-btn" data-jump-index="0">หน้า 1 ปก</button>
          <button class="jump-chip-btn" data-jump-index="1">หน้า 2 กติกา</button>
          <button class="jump-chip-btn" data-jump-index="3">หน้า 4 ช่องเขียว</button>
          <button class="jump-chip-btn" data-jump-index="4">หน้า 5 ช่องแดง</button>
          <button class="jump-chip-btn" data-jump-index="8">หน้า 9 ทักษะไซเบอร์</button>
        </div>

        <!-- พื้นที่แสดงรูปภาพคู่มือ (พร้อม Touch Swipe และ Pinch/Pan) -->
        <div id="guide-manual-viewer-stage" class="guide-manual-stage" title="ปัดซ้าย/ขวาเพื่อเปลี่ยนหน้า หรือแตะ 2 ครั้งเพื่อซูม">
          <button class="stage-nav-arrow left" id="btn-stage-prev" ${this.currentManualIndex === 0 ? 'disabled style="opacity:0.2;"' : ''} aria-label="หน้าก่อนหน้า">
            ◀
          </button>

          <div class="guide-manual-image-wrapper" id="guide-manual-image-wrapper">
            <img 
              src="${pageObj.url}" 
              alt="${pageObj.label}" 
              id="guide-manual-active-img" 
              class="guide-manual-image"
              draggable="false"
            />
          </div>

          <button class="stage-nav-arrow right" id="btn-stage-next" ${this.currentManualIndex === totalPages - 1 ? 'disabled style="opacity:0.2;"' : ''} aria-label="หน้าถัดไป">
            ▶
          </button>

          <div class="guide-swipe-hint">
            👈 ปัดหน้าจอซ้าย-ขวาเพื่อเปลี่ยนหน้า หรือแตะ 2 ครั้งเพื่อซูม 👉
          </div>
        </div>

        <!-- แถบนำทางด้านล่าง -->
        <div class="guide-manual-bottom-nav">
          <button id="guide-manual-prev-btn" class="guide-nav-btn" ${this.currentManualIndex === 0 ? 'disabled' : ''}>
            ◀ หน้าก่อนหน้า
          </button>

          <span class="guide-page-counter-text">
            ${this.currentManualIndex + 1} / ${totalPages}
          </span>

          <button id="guide-manual-next-btn" class="guide-nav-btn" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''}>
            หน้าถัดไป ▶
          </button>
        </div>

        <!-- แถบรูปย่อ (Thumbnail Ribbon) ข้ามไปหน้าที่ต้องการได้ใน 1 สัมผัส -->
        <div class="guide-thumbs-container">
          <div class="guide-thumbs-scroll" id="guide-manual-thumbs-scroll">
            ${this.manualPages
              .map(
                (p, idx) => `
              <button 
                class="guide-thumb-card ${idx === this.currentManualIndex ? 'active' : ''}" 
                data-manual-index="${idx}"
                title="${p.label}"
                aria-label="${p.label}"
              >
                <img src="${p.url}" alt="${p.label}" class="guide-thumb-img" loading="lazy" />
                <span class="guide-thumb-badge">${idx + 1}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * ผูกเหตุการณ์การเปลี่ยนหน้าและระบบ Touch Gesture
   */
  bindManualPageEvents() {
    const prevBtn = document.getElementById('guide-manual-prev-btn');
    const nextBtn = document.getElementById('guide-manual-next-btn');
    const stagePrevBtn = document.getElementById('btn-stage-prev');
    const stageNextBtn = document.getElementById('btn-stage-next');
    const pageSelect = document.getElementById('guide-manual-page-select');
    const lightboxBtn = document.getElementById('guide-manual-lightbox-btn');
    const zoomInBtn = document.getElementById('btn-manual-zoom-in');
    const zoomOutBtn = document.getElementById('btn-manual-zoom-out');
    const zoomResetBtn = document.getElementById('btn-manual-zoom-reset');
    const stage = document.getElementById('guide-manual-viewer-stage');
    const activeImg = document.getElementById('guide-manual-active-img');
    const thumbScroll = document.getElementById('guide-manual-thumbs-scroll');

    const changePage = (newIdx) => {
      if (newIdx >= 0 && newIdx < this.manualPages.length) {
        this.currentManualIndex = newIdx;
        this.zoomLevel = 1;
        this.renderBodyContent();
      }
    };

    if (prevBtn) prevBtn.onclick = () => changePage(this.currentManualIndex - 1);
    if (nextBtn) nextBtn.onclick = () => changePage(this.currentManualIndex + 1);
    if (stagePrevBtn) stagePrevBtn.onclick = () => changePage(this.currentManualIndex - 1);
    if (stageNextBtn) stageNextBtn.onclick = () => changePage(this.currentManualIndex + 1);

    if (pageSelect) {
      pageSelect.onchange = (e) => {
        changePage(parseInt(e.target.value, 10) || 0);
      };
    }

    // Quick jump chips
    document.querySelectorAll('.jump-chip-btn').forEach((chip) => {
      chip.onclick = () => {
        const idx = parseInt(chip.getAttribute('data-jump-index'), 10);
        if (!isNaN(idx)) changePage(idx);
      };
    });

    if (lightboxBtn) {
      lightboxBtn.onclick = () => this.openLightbox();
    }

    // ระบบซูมและรีเซ็ต
    const applyZoom = (level) => {
      this.zoomLevel = Math.max(1, Math.min(3, level));
      if (activeImg) {
        activeImg.style.transform = `scale(${this.zoomLevel})`;
        activeImg.style.cursor = this.zoomLevel > 1 ? 'grab' : 'zoom-in';
      }
    };

    if (zoomInBtn) zoomInBtn.onclick = () => applyZoom(this.zoomLevel + 0.35);
    if (zoomOutBtn) zoomOutBtn.onclick = () => applyZoom(this.zoomLevel - 0.35);
    if (zoomResetBtn) zoomResetBtn.onclick = () => applyZoom(1);

    // แตะ 2 ครั้งเพื่อซูมบนมือถือ (Double Tap Zoom)
    let lastTapTime = 0;
    if (activeImg) {
      activeImg.onclick = () => {
        const now = Date.now();
        if (now - lastTapTime < 300) {
          applyZoom(this.zoomLevel > 1 ? 1 : 1.8);
        }
        lastTapTime = now;
      };
    }

    // ตรวจสอบ Touch Swipe Gestures และ Pinch-to-zoom บนหน้าจอมือถือ/แท็บเล็ต
    if (stage) {
      let touchStartX = 0;
      let touchStartY = 0;
      let initPinchDist = 0;
      let initZoomOnPinch = 1;

      stage.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
          } else if (e.touches.length === 2) {
            initPinchDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            initZoomOnPinch = this.zoomLevel;
          }
        },
        { passive: true }
      );

      stage.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches.length === 2 && initPinchDist > 0) {
            const currentDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleFactor = currentDist / initPinchDist;
            applyZoom(initZoomOnPinch * scaleFactor);
          }
        },
        { passive: true }
      );

      stage.addEventListener(
        'touchend',
        (e) => {
          if (this.zoomLevel > 1) return; // หากซูมอยู่ ไม่เปลี่ยนหน้าอัตโนมัติเพื่อให้เลื่อนดูได้
          if (e.changedTouches.length === 1) {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;

            // ตรวจสอบการปัดแนวนอนที่ชัดเจน
            if (Math.abs(diffX) > 45 && Math.abs(diffY) < 80) {
              if (diffX < 0) {
                // ปัดซ้าย -> หน้าถัดไป
                changePage(this.currentManualIndex + 1);
              } else {
                // ปัดขวา -> หน้าก่อนหน้า
                changePage(this.currentManualIndex - 1);
              }
            }
          }
        },
        { passive: true }
      );
    }

    // คลิกแถบ Thumbnail ด้านล่าง
    if (thumbScroll) {
      thumbScroll.querySelectorAll('.guide-thumb-card').forEach((thumb) => {
        thumb.onclick = () => {
          const idx = parseInt(thumb.getAttribute('data-manual-index'), 10);
          if (!isNaN(idx)) changePage(idx);
        };
      });

      const activeThumb = thumbScroll.querySelector('.guide-thumb-card.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  /**
   * เปิด Lightbox เต็มจอ (Fullscreen Lightbox Mode)
   */
  openLightbox() {
    const existing = document.getElementById('guide-manual-lightbox');
    if (existing) existing.remove();

    const pageObj = this.manualPages[this.currentManualIndex] || { url: '', label: '' };
    const totalPages = this.manualPages.length;

    const lightbox = document.createElement('div');
    lightbox.id = 'guide-manual-lightbox';
    lightbox.className = 'guide-lightbox-overlay';

    lightbox.innerHTML = `
      <div class="lightbox-top-bar">
        <span class="lightbox-title">${escapeHtml(pageObj.label)} (${this.currentManualIndex + 1}/${totalPages})</span>
        <div class="lightbox-top-actions">
          <button id="lightbox-zoom-btn" class="lightbox-btn">🔍 ซูม 1.8x</button>
          <button id="lightbox-close-btn" class="lightbox-close-btn" aria-label="ปิด">✕</button>
        </div>
      </div>

      <div class="lightbox-stage" id="lightbox-stage">
        <button id="lightbox-prev" class="lightbox-nav-btn left" ${this.currentManualIndex === 0 ? 'disabled' : ''} aria-label="ก่อนหน้า">◀</button>
        <div class="lightbox-img-wrapper" id="lightbox-img-wrapper">
          <img src="${pageObj.url}" alt="${pageObj.label}" id="lightbox-img" class="lightbox-image" />
        </div>
        <button id="lightbox-next" class="lightbox-nav-btn right" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''} aria-label="ถัดไป">▶</button>
      </div>
    `;

    document.body.appendChild(lightbox);

    const closeBtn = lightbox.querySelector('#lightbox-close-btn');
    const zoomBtn = lightbox.querySelector('#lightbox-zoom-btn');
    const prevBtn = lightbox.querySelector('#lightbox-prev');
    const nextBtn = lightbox.querySelector('#lightbox-next');
    const img = lightbox.querySelector('#lightbox-img');
    const stage = lightbox.querySelector('#lightbox-stage');

    let isZoomed = false;

    const updateLightboxPage = (idx) => {
      if (idx >= 0 && idx < totalPages) {
        this.currentManualIndex = idx;
        const newObj = this.manualPages[idx];
        if (img) img.src = newObj.url;
        const title = lightbox.querySelector('.lightbox-title');
        if (title) title.textContent = `${newObj.label} (${idx + 1}/${totalPages})`;
        if (prevBtn) prevBtn.disabled = idx === 0;
        if (nextBtn) nextBtn.disabled = idx === totalPages - 1;
        this.renderBodyContent();
      }
    };

    if (closeBtn) closeBtn.onclick = () => lightbox.remove();
    if (prevBtn) prevBtn.onclick = () => updateLightboxPage(this.currentManualIndex - 1);
    if (nextBtn) nextBtn.onclick = () => updateLightboxPage(this.currentManualIndex + 1);

    if (zoomBtn) {
      zoomBtn.onclick = () => {
        isZoomed = !isZoomed;
        if (img) {
          img.style.transform = isZoomed ? 'scale(1.8)' : 'scale(1)';
          zoomBtn.textContent = isZoomed ? '↺ ขนาดปกติ' : '🔍 ซูม 1.8x';
        }
      };
    }

    if (stage) {
      stage.onclick = (e) => {
        if (e.target === stage || e.target.id === 'lightbox-img-wrapper') lightbox.remove();
      };
    }
  }
}
