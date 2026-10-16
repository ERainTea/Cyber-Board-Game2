/**
 * @file src/Board/TileManager.js
 * @description ระบบจัดการประเภทช่องบนกระดาน (Tile Manager)
 * ตรวจสอบและจัดการ Event เมื่อผู้เล่นหยุดบนช่องประเภทต่างๆ
 */

import boardMapData from './boardMap.json';

export class TileManager {
  /**
   * @param {number} totalTiles - จำนวนช่องทั้งหมดบนกระดาน (39 ช่อง)
   * @param {Object} options - Callback Listeners สำหรับ Event ประเภทช่อง
   */
  constructor(totalTiles = 39, options = {}) {
    this.totalTiles = totalTiles;
    this.tiles = this.generateTiles(totalTiles);

    this.onGreenTileCallback = options.onGreenTile || null;
    this.onRedTileCallback = options.onRedTile || null;
    this.onNormalTileCallback = options.onNormalTile || null;
  }

  /**
   * สร้างโครงสร้างข้อมูลช่องบนกระดานจาก boardMap.json
   * @param {number} total - จำนวนช่องทั้งหมด
   * @returns {Array<Object>} รายการช่องทั้งหมด
   */
  generateTiles(total) {
    if (boardMapData && boardMapData.length > 0) {
      return boardMapData.map((item, idx) => {
        const rawType = (item.type || 'normal').toUpperCase();
        let typeName = 'ช่องปกติ';
        let colorHex = '#94a3b8';
        let icon = '⚪';

        if (rawType === 'GREEN') {
          typeName = 'ช่องสีเขียว';
          colorHex = '#10b981';
          icon = '🟢';
        } else if (rawType === 'RED') {
          typeName = 'ช่องสีแดง';
          colorHex = '#ef4444';
          icon = '🔴';
        } else if (rawType === 'START') {
          typeName = 'จุดเริ่มต้น';
          colorHex = '#3b82f6';
          icon = '🏁';
        } else if (rawType === 'FINISH') {
          typeName = 'เส้นชัย';
          colorHex = '#eab308';
          icon = '🏆';
        }

        return {
          id: idx,
          tile: item.tile,
          label: item.label,
          name: item.title || (item.type === 'start' ? 'จุดเริ่มต้น' : item.type === 'finish' ? 'เส้นชัย' : `ช่องที่ ${item.label}`),
          type: rawType,
          typeName: typeName,
          colorHex: colorHex,
          icon: icon,
          description: item.description || (rawType === 'GREEN' ? 'ช่องสถานะดี / โบนัสปลอดภัย' : rawType === 'RED' ? 'ช่องอุปสรรค / จุดเสี่ยง' : 'ช่องทางเดินบนกระดาน'),
          actionText: item.actionText || '',
          effect: item.effect || null,
        };
      });
    }

    const tiles = [];
    for (let i = 0; i < total; i++) {
      tiles.push({
        id: i,
        tile: i + 1,
        label: String(i),
        name: `ช่องที่ ${i}`,
        type: 'NORMAL',
        typeName: 'ช่องปกติ',
        colorHex: '#94a3b8',
        icon: '⚪',
        description: 'ช่องทางเดินปกติบนกระดาน',
      });
    }
    return tiles;
  }

  /**
   * ดึงข้อมูลช่องตาม index แบบปลอดภัย
   * @param {number} index - เลขช่อง
   * @returns {Object} ข้อมูลช่อง
   */
  getTile(index) {
    if (!this.tiles || this.tiles.length === 0) {
      return {
        id: 0,
        tile: 1,
        label: '1',
        name: 'ช่องกระดาน',
        type: 'NORMAL',
        typeName: 'ช่องปกติ',
        colorHex: '#94a3b8',
        icon: '⚪',
        description: 'ช่องทางเดินปกติบนกระดาน',
      };
    }
    const normalizedIndex = ((index % this.tiles.length) + this.tiles.length) % this.tiles.length;
    return this.tiles[normalizedIndex] || this.tiles[0];
  }

  /**
   * ลงทะเบียน Event Handlers
   * @param {Object} callbacks 
   */
  setEventListeners(callbacks = {}) {
    if (callbacks.onGreenTile) this.onGreenTileCallback = callbacks.onGreenTile;
    if (callbacks.onRedTile) this.onRedTileCallback = callbacks.onRedTile;
    if (callbacks.onNormalTile) this.onNormalTileCallback = callbacks.onNormalTile;
  }

  /**
   * ตรวจสอบช่องที่ผู้เล่นหยุดเดิน และส่ง Event ตามประเภทช่อง
   * @param {Object} player - ผู้เล่นที่หยุดบนช่อง
   * @param {number} tileIndex - เลขช่องที่หยุด
   * @returns {Object} ข้อมูลช่องที่หยุด
   */
  checkTileAndTriggerEvent(player, tileIndex) {
    const tile = this.getTile(tileIndex);

    switch (tile.type) {
      case 'GREEN':
        if (typeof this.onGreenTileCallback === 'function') {
          this.onGreenTileCallback(player, tile);
        }
        break;

      case 'RED':
        if (typeof this.onRedTileCallback === 'function') {
          this.onRedTileCallback(player, tile);
        }
        break;

      case 'NORMAL':
      default:
        if (typeof this.onNormalTileCallback === 'function') {
          this.onNormalTileCallback(player, tile);
        }
        break;
    }

    return tile;
  }
}
