/**
 * @file src/Board/index.js
 * @description มอดูลจัดการตารางและช่องบนกระดาน (Board & Tile Manager)
 */

export { TileManager } from './TileManager.js';
export { BoardRenderer } from './BoardRenderer.js';
import boardMapData from './boardMap.json';
export { boardMapData };

export const BoardModule = {
  name: 'BoardModule',
};

