/**
 * @file src/Board/BoardRenderer.js
 * @description คลาสจัดการเรนเดอร์กระดานเกม (BoardRenderer)
 * อ่านข้อมูลตำแหน่งและประเภทช่องจาก boardMap.json เท่านั้น ห้าม Hardcode ตำแหน่งใน JS
 * พร้อมรองรับระบบ Debug Mode แสดงหมายเลข, พิกัด X/Y, เส้นเชื่อมการเดิน, และสีตามประเภทช่อง
 */

import defaultBoardMap from './boardMap.json';

export class BoardRenderer {
  /**
   * @param {Array<Object>} [boardMapData] - รายการข้อมูลช่องจาก boardMap.json
   * @param {Object} [options] - ตัวเลือกเพิ่มเติม
   * @param {number} [options.imageWidth=4962] - ความกว้างจริงของรูปภาพบอร์ด (พิกเซล)
   * @param {number} [options.imageHeight=3509] - ความสูงจริงของรูปภาพบอร์ด (พิกเซล)
   * @param {boolean} [options.isDebugMode=false] - สถานะเริ่มต้นเปิด/ปิด Debug Mode
   */
  constructor(boardMapData = defaultBoardMap, options = {}) {
    this.imageWidth = options.imageWidth || 4962;
    this.imageHeight = options.imageHeight || 3509;
    this.isDebugMode = options.isDebugMode || false;

    this.boardMap = [];
    this.validationResult = { isValid: true, errors: [], unmappedTiles: [] };

    this.setBoardMap(boardMapData);
  }

  /**
   * กำหนดและตรวจสอบข้อมูล boardMap.json
   * @param {Array<Object>} data - ข้อมูลช่องกระดาน
   */
  setBoardMap(data) {
    if (!Array.isArray(data) || data.length === 0) {
      this.validationResult = {
        isValid: false,
        errors: ['[BoardRenderer Error] ข้อมูล boardMap.json ว่างเปล่าหรือไม่ใช่ Array'],
        unmappedTiles: ['ALL'],
      };
      this.boardMap = [];
      return;
    }

    this.boardMap = data;
    this.validationResult = this.validateBoardMap(data);
  }

  /**
   * ตรวจสอบความถูกต้องและต่อเนื่องของช่อง ตั้งแต่ Start ถึง Finish (Phase 5.5 ข้อ 14 & 15)
   * @param {Array<Object>} mapData - ข้อมูลช่อง
   * @returns {{isValid: boolean, errors: Array<string>, unmappedTiles: Array<number>}}
   */
  validateBoardMap(mapData) {
    const errors = [];
    const unmappedTiles = [];

    // เรียงตามหมายเลข tile 1..N
    const sortedMap = [...mapData].sort((a, b) => a.tile - b.tile);

    // ตรวจสอบว่ามีช่อง Start และ Finish หรือไม่
    const startTile = sortedMap.find((t) => t.type === 'start');
    const finishTile = sortedMap.find((t) => t.type === 'finish');

    if (!startTile) {
      errors.push('ไม่พบช่องประเภท "start" ใน boardMap.json');
    }
    if (!finishTile) {
      errors.push('ไม่พบช่องประเภท "finish" ใน boardMap.json');
    }

    // ตรวจสอบพิกัด X, Y และความต่อเนื่องของหมายเลขช่อง
    for (let i = 0; i < sortedMap.length; i++) {
      const tileObj = sortedMap[i];
      const expectedTileNum = i + 1;

      if (tileObj.tile !== expectedTileNum) {
        errors.push(`ลำดับช่องขาดความต่อเนื่อง: คาดหวังช่องที่ ${expectedTileNum} แต่พบช่องที่ ${tileObj.tile}`);
      }

      if (
        typeof tileObj.x !== 'number' ||
        typeof tileObj.y !== 'number' ||
        isNaN(tileObj.x) ||
        isNaN(tileObj.y)
      ) {
        unmappedTiles.push(tileObj.tile);
        errors.push(`ช่องที่ ${tileObj.tile} ไม่สามารถระบุตำแหน่ง X, Y ได้อย่างชัดเจน`);
      }
    }

    const isValid = errors.length === 0 && unmappedTiles.length === 0;

    if (!isValid) {
      console.warn('[BoardRenderer Validation Warning]', errors);
    }

    return { isValid, errors, unmappedTiles };
  }

  /**
   * เปิด/ปิด Debug Mode
   * @param {boolean} [flag] - ค่าที่ต้องการตั้ง หากไม่ระบุจะเป็นการ toggle
   */
  toggleDebugMode(flag) {
    if (typeof flag === 'boolean') {
      this.isDebugMode = flag;
    } else {
      this.isDebugMode = !this.isDebugMode;
    }
    return this.isDebugMode;
  }

  /**
   * ดึงสีประจำประเภทช่องสำหรับแสดงผลใน Debug Mode
   * @param {string} type - ประเภทช่อง ('start' | 'normal' | 'green' | 'red' | 'finish')
   * @returns {{bg: string, border: string, text: string, name: string}}
   */
  getTileTypeTheme(type) {
    switch (type) {
      case 'start':
        return { bg: '#3b82f6', border: '#60a5fa', text: '#ffffff', name: 'Start' };
      case 'green':
        return { bg: '#10b981', border: '#34d399', text: '#ffffff', name: 'Green' };
      case 'red':
        return { bg: '#ef4444', border: '#f87171', text: '#ffffff', name: 'Red' };
      case 'finish':
        return { bg: '#a855f7', border: '#c084fc', text: '#ffffff', name: 'Finish' };
      case 'normal':
      default:
        return { bg: '#64748b', border: '#94a3b8', text: '#ffffff', name: 'Normal' };
    }
  }

  /**
   * แปลงพิกัดพิกเซล (x, y) เป็นเปอร์เซ็นต์ relative กับขนาดรูปภาพบอร์ด
   * @param {number} x - พิกัด X พิกเซล
   * @param {number} y - พิกัด Y พิกเซล
   * @returns {{xPercent: number, yPercent: number}}
   */
  getTilePercentCoordinates(x, y) {
    const xPercent = (x / this.imageWidth) * 100;
    const yPercent = (y / this.imageHeight) * 100;
    return { xPercent, yPercent };
  }

  /**
   * ดึงข้อมูลช่องจาก tile index (1-based)
   * @param {number} tileNumber - หมายเลขช่อง (1 ถึง N)
   * @returns {Object|null}
   */
  getTileData(tileNumber) {
    return this.boardMap.find((t) => t.tile === tileNumber) || null;
  }

  /**
   * เรนเดอร์เส้นเชื่อมการเดินทุกช่องต่อเนื่องกัน (SVG Polyline) สำหรับ Debug Mode
   * @returns {string} HTML/SVG String
   */
  renderConnectingLinesSVG() {
    if (!this.isDebugMode || this.boardMap.length === 0) return '';

    const sorted = [...this.boardMap].sort((a, b) => a.tile - b.tile);
    const points = sorted
      .map((t) => {
        const { xPercent, yPercent } = this.getTilePercentCoordinates(t.x, t.y);
        return `${xPercent.toFixed(2)},${yPercent.toFixed(2)}`;
      })
      .join(' ');

    return `
      <svg 
        class="board-debug-svg-path" 
        viewBox="0 0 100 100" 
        preserveAspectRatio="none"
        style="
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 12;
        "
      >
        <polyline 
          points="${points}" 
          fill="none" 
          stroke="#38bdf8" 
          stroke-width="0.8" 
          stroke-dasharray="1.2, 0.6" 
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    `;
  }

  /**
   * เรนเดอร์จุด Overlay ของช่องทุกช่องบนกระดาน (อ่านจาก boardMap.json)
   * ในโหมดปกติจะไม่แสดงจุดมาร์กเกอร์ใดๆ ซ้อนทับกระดาน เนื่องจากรูปภาพกระดานมีสีและตัวเลขแสดงสวยงามแล้ว
   * จะแสดงจุด Overlay/หมายเลขช่อง/พิกัดเฉพาะเมื่อเปิดใช้งาน Debug Mode เท่านั้น
   * @returns {string} HTML String
   */
  renderTileOverlays() {
    if (this.boardMap.length === 0 || !this.isDebugMode) return '';

    return this.boardMap
      .map((t) => {
        const { xPercent, yPercent } = this.getTilePercentCoordinates(t.x, t.y);
        const theme = this.getTileTypeTheme(t.type);

        // โหมด Debug Mode: แสดงหมายเลขช่อง, พิกัด X, Y (px และ %), ชนิดช่องด้วยสี
        return `
          <div 
            class="board-debug-tile-marker"
            id="debug-tile-marker-${t.tile}"
            data-tile="${t.tile}"
            data-x="${t.x}"
            data-y="${t.y}"
            data-xp="${xPercent.toFixed(2)}"
            data-yp="${yPercent.toFixed(2)}"
            style="
              position: absolute;
              left: ${xPercent}%;
              top: ${yPercent}%;
              transform: translate(-50%, -50%);
              background: ${theme.bg};
              border: 2px solid ${theme.border};
              border-radius: 8px;
              padding: 3px 8px;
              box-shadow: 0 0 12px rgba(0,0,0,0.8), 0 0 8px ${theme.bg};
              color: ${theme.text};
              font-family: 'Fira Code', 'Courier New', monospace;
              font-size: 0.68rem;
              font-weight: bold;
              text-align: center;
              cursor: pointer;
              z-index: 15;
              white-space: nowrap;
              line-height: 1.25;
              transition: transform 0.2s ease, box-shadow 0.2s ease;
            "
            title="ช่องที่ ${t.tile} (${theme.name}: ${t.title})&#10;พิกัดภาพ: X=${t.x}px, Y=${t.y}px&#10;เปอร์เซ็นต์: X=${xPercent.toFixed(1)}%, Y=${yPercent.toFixed(1)}%"
          >
            <div style="font-size:0.75rem; font-weight:900;">#${t.tile} <span style="font-size:0.6rem; opacity:0.9;">[${theme.name}]</span></div>
            <div style="font-size:0.6rem; opacity:0.95; color:#fef08a;">${t.label || t.title}</div>
            <div style="font-size:0.58rem; opacity:0.9; margin-top:2px;">Px: (${t.x}, ${t.y})</div>
            <div style="font-size:0.55rem; opacity:0.85; color:#a5f3fc;">%: (${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%)</div>
          </div>
        `;
      })
      .join('');
  }

  /**
   * เรนเดอร์โครงสร้างกระดานเกมทั้งหมดพร้อมเลเยอร์ Debug และ Tile
   * @param {string} boardImageUrl - URL รูปภาพกระดานเกม
   * @param {string} [tokensHtml=''] - HTML ตัวหมากผู้เล่น
   * @returns {string} HTML String
   */
  renderBoardContainerHTML(boardImageUrl, tokensHtml = '') {
    // หากตรวจสอบพบว่ามีช่องไม่ชัดเจน หรือข้อมูลผิดพลาด ให้รายงานข้อผิดพลาด
    if (!this.validationResult.isValid) {
      return `
        <div class="board-error-container" style="padding: 2rem; background: #1e1e2d; color: #ef4444; border-radius: 12px; border: 1px solid #ef4444; margin: 1rem;">
          <h3 style="font-size: 1.2rem; font-weight: bold; margin-bottom: 0.5rem;">⚠️ รายงานความผิดพลาดการวิเคราะห์บอร์ดเกม</h3>
          <p style="margin-bottom: 1rem;">ไม่สามารถระบุตำแหน่งช่องได้อย่างชัดเจนจากรูปภาพต้นฉบับ:</p>
          <ul style="list-style-type: disc; padding-left: 1.5rem; line-height: 1.6;">
            ${this.validationResult.errors.map((err) => `<li>${err}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    const svgLines = this.renderConnectingLinesSVG();
    const tileOverlays = this.renderTileOverlays();

    return `
      <div class="board-image-wrapper ${this.isDebugMode ? 'debug-active-board' : ''}" id="board-image-wrapper" style="position: relative; width: 100%; user-select: none;">
        <img 
          src="${boardImageUrl}" 
          alt="กระดานเกมการเงิน" 
          class="board-image" 
          id="board-image"
          style="width: 100%; height: auto; display: block;"
        />

        <!-- เลเยอร์เส้นเชื่อมการเดินใน Debug Mode -->
        ${svgLines}

        <!-- เลเยอร์ตำแหน่งช่องบนกระดาน (อ่านจาก boardMap.json) -->
        <div class="board-tiles-overlay-layer" id="board-tiles-overlay-layer">
          ${tileOverlays}
        </div>

        <!-- เลเยอร์แสดงตัวหมากของผู้เล่นบนกระดาน -->
        <div class="board-tokens-layer" id="board-tokens-layer">
          ${tokensHtml}
        </div>

        <!-- HUD Tag ตามพิกัดเมาส์ใน Debug Mode -->
        ${
          this.isDebugMode
            ? `<div id="debug-mouse-hud" style="
                position: absolute;
                display: none;
                pointer-events: none;
                z-index: 30;
                background: rgba(15, 23, 42, 0.92);
                border: 1px solid #38bdf8;
                border-radius: 6px;
                padding: 4px 8px;
                color: #38bdf8;
                font-family: monospace;
                font-size: 0.7rem;
                box-shadow: 0 4px 12px rgba(0,0,0,0.6);
                transform: translate(12px, 12px);
                white-space: nowrap;
              ">📍 X: - px (-%), Y: - px (-%)</div>
              
              <div id="debug-click-pin" style="
                position: absolute;
                display: none;
                pointer-events: none;
                z-index: 25;
                width: 16px;
                height: 16px;
                background: #f43f5e;
                border: 2px solid #ffffff;
                border-radius: 50%;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 12px #f43f5e;
              "></div>`
            : ''
        }
      </div>
    `;
  }
}
