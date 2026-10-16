/**
 * @file src/UI/GameBoardScreen.js
 * @description หน้าจอกระดานเกมหลัก (Game Scene) สำหรับ Phase 6
 * แสดงบอร์ดเกม, ตัวหมากผู้เล่นที่ช่องเริ่มต้น, ข้อมูลผู้เล่นด้านข้าง,
 * พื้นที่ลูกเต๋า, การ์ดสถานการณ์, และประวัติการเล่น
 * (โดยยังไม่มีระบบการเล่นตามข้อกำหนด Phase 6)
 */

import { gameStateStore } from '../GameState.js';
import { CONFIG } from '../Config.js';
import { ASSET_MANIFEST, assetManager } from '../Assets/AssetManager.js';
import { TOKEN_COLORS } from './PieceSelectScreen.js';
import { Dice } from '../Engine/Dice.js';
import { TileManager, BoardRenderer, boardMapData } from '../Board/index.js';
import { finishManager } from '../Engine/FinishManager.js';
import { GameGuideModal } from './GameGuideModal.js';
import { soundManager } from '../Audio/SoundManager.js';
import { networkManager, NETWORK_MODES } from '../Network/NetworkManager.js';
import { PacketManager, PACKET_TYPES } from '../Network/PacketManager.js';

export class GameBoardScreen {
  /**
   * @param {HTMLElement} container - DOM Container สำหรับวาง UI กระดานเกม
   * @param {Function} onBack - Callback เมื่อกลับสู่เมนูหลัก
   */
  constructor(container, onBack) {
    this.container = container;
    this.onBack = onBack;
    this.currentManualIndex = 0;
    this.manualPages = this.buildManualPagesList();

    // ระบบเรนเดอร์กระดานเกมจาก boardMap.json (Phase 5.5 BoardRenderer)
    this.boardRenderer = new BoardRenderer(boardMapData, {
      imageWidth: 4962,
      imageHeight: 3509,
      isDebugMode: false,
    });

    // สถานะระบบลูกเต๋าสำหรับ Phase 7 & 8
    this.diceResult = null;
    this.diceEngine = new Dice({
      diceCount: 1,
      onRollStart: () => this.handleRollStart(),
      onDiceRoll: (result) => this.handleDiceRollResult(result),
    });

    // ระบบจัดการประเภทช่องบนกระดาน (Tile Manager - Phase 10)
    this.tileManager = new TileManager(CONFIG.BOARD_TILES_COUNT || 39, {
      onGreenTile: (player, tile) => this.handleGreenTileEvent(player, tile),
      onRedTile: (player, tile) => this.handleRedTileEvent(player, tile),
      onNormalTile: (player, tile) => this.handleNormalTileEvent(player, tile),
    });

    // สถานะขั้นตอนการเล่นสำหรับ Phase 8, 9 & 10
    this.phase = 'DETERMINE_ORDER'; // 'DETERMINE_ORDER' | 'PLAYING'
    this.currentRollPlayerIndex = 0; // ลำดับผู้เล่นที่กำลังทอยเต๋าหาลำดับ (0 ถึง N-1)
    this.activePlayerIndex = 0;      // ผู้เล่นที่มีสิทธิ์เล่นในเทิร์นปัจจุบัน (เมื่อเริ่มเกม)
    this.isMoving = false;           // สถานะขณะตัวหมากกำลังเดินทีละช่อง (ห้ามกดทอยซ้ำ)
    this.isStartOfTurnCardDraw = false; // สถานะกำลังสุ่มการ์ดเมื่อเริ่มตา ก่อนทอยลูกเต๋า

    // ดึงข้อมูลผู้เล่นจาก GameState
    const currentState = gameStateStore.getState();
    const playersList = currentState.players || [];

    // ดึงและแคช myPlayerId เพื่อให้เข้าถึงได้ตลอดการประมวลผลเกม
    this.myPlayerId =
      networkManager.myPlayerId ||
      (networkManager.roomManager?.myPlayer ? networkManager.roomManager.myPlayer.id : null) ||
      currentState.myPlayerId ||
      null;

    if (networkManager.getMode() === NETWORK_MODES.ONLINE && networkManager.roomManager.currentRoom) {
      const room = networkManager.roomManager.currentRoom;
      this.orderMode = room.orderMode || currentState.orderMode || 'RANDOM';
      this.finishMode = room.finishMode || currentState.finishMode || 'FIRST_REACH';

      this.players = room.players.map((p, idx) => {
        const colorObj = TOKEN_COLORS.find((c) => c.hex === p.color || c.id === p.colorId) || TOKEN_COLORS[idx % TOKEN_COLORS.length];
        return {
          id: p.id,
          name: p.name,
          colorId: colorObj.id,
          color: p.color || colorObj.hex,
          colorName: colorObj.name,
          colorGradient: colorObj.gradient,
          position: p.position || 0,
          status: p.isOnline ? 'ปกติ' : 'ขาดการเชื่อมต่อ',
          skipTurns: p.skipTurnCount || 0,
          pauseTurns: p.skipTurnCount || 0,
          skipTurnCount: p.skipTurnCount || 0,
          turnOrder: p.turnOrder || `ลำดับที่ ${idx + 1}`,
          orderRollScore: p.orderRollScore !== undefined ? p.orderRollScore : null,
          rollSequenceIndex: idx,
          turnOrderRank: p.turnOrderRank || (idx + 1),
          pendingCardDraw: false,
          isOnline: p.isOnline
        };
      });
      this.phase = room.phase || 'DETERMINE_ORDER';
      this.currentRollPlayerIndex = room.currentRollPlayerIndex || 0;
      this.activePlayerIndex = room.activePlayerIndex || 0;

      // หากเป็นโหมดสุ่มลำดับออโต้ ให้แสดง Modal แจ้งสรุปลำดับการเริ่มเดินให้ทุกคนทราบ
      if (this.orderMode === 'RANDOM' && (this.phase === 'PLAYING' || room.isGameStarted)) {
        this.shouldShowRandomOrderSummary = true;
      }
    } else if (playersList.length === 0) {
      const defaultColors = ['gold', 'cyan', 'green', 'red'];
      this.players = Array.from({ length: 4 }, (_, idx) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === defaultColors[idx]);
        return {
          id: idx + 1,
          name: `ผู้เล่นที่ ${idx + 1}`,
          colorId: defaultColors[idx],
          color: colorObj ? colorObj.hex : '#f59e0b',
          colorName: colorObj ? colorObj.name : 'สีทอง',
          colorGradient: colorObj ? colorObj.gradient : '',
          position: 0,
          status: 'ปกติ',
          pauseTurns: 0,
          turnOrder: 'รอทอยเต๋า',
          orderRollScore: null,
          rollSequenceIndex: null,
          turnOrderRank: null,
          pendingCardDraw: false,
        };
      });
    } else {
      this.players = playersList.map((p, idx) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId) || TOKEN_COLORS[idx % TOKEN_COLORS.length];
        return {
          ...p,
          id: p.id || idx + 1,
          name: p.name || `ผู้เล่นที่ ${idx + 1}`,
          colorId: p.colorId || colorObj.id,
          color: p.color || colorObj.hex,
          colorName: p.colorName || colorObj.name,
          colorGradient: p.colorGradient || colorObj.gradient,
          position: p.position || 0,
          status: p.status || 'ปกติ',
          pauseTurns: p.pauseTurns || 0,
          turnOrder: p.turnOrder || 'รอทอยเต๋า',
          orderRollScore: p.orderRollScore !== undefined ? p.orderRollScore : null,
          rollSequenceIndex: p.rollSequenceIndex !== undefined ? p.rollSequenceIndex : null,
          turnOrderRank: p.turnOrderRank || null,
          pendingCardDraw: p.pendingCardDraw || false,
        };
      });
    }

    // สแนปชอตข้อมูลกระดานและกติกาเกม
    this.playerCount = this.players.length;
    this.orderMode = currentState.orderMode || 'RANDOM';
    this.finishMode = currentState.finishMode || 'FIRST_REACH';

    // หากเลือกโหมดสุ่มลำดับออโต้ ให้สุ่มลำดับผู้เล่นทันที
    this.checkAndApplyRandomOrder();

    // ระบบเชื่อมต่อ Network สำหรับโหมดเล่นออนไลน์
    this.initNetworkEvents();
  }

  /**
   * สุ่มลำดับผู้เล่นให้อัตโนมัติเมื่อเลือก orderMode === 'RANDOM'
   */
  checkAndApplyRandomOrder() {
    if (networkManager.getMode() !== NETWORK_MODES.ONLINE && this.orderMode === 'RANDOM' && this.phase === 'DETERMINE_ORDER') {
      // สุ่มสลับตำแหน่งอาร์เรย์ผู้เล่น (Fisher-Yates Shuffle)
      for (let i = this.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
      }

      this.players.forEach((p, rankIdx) => {
        p.turnOrderRank = rankIdx + 1;
        p.turnOrder = `ลำดับที่ ${rankIdx + 1}`;
        p.orderRollScore = Math.floor(Math.random() * 6) + 1;
      });

      this.phase = 'PLAYING';
      this.activePlayerIndex = 0;

      gameStateStore.setState({
        players: this.players,
        activePlayerIndex: 0,
        phase: 'PLAYING',
      });

      this.shouldShowRandomOrderSummary = true;
    }
  }

  /**
   * ดึงรายการรูปภาพคู่มือการเล่นตามลำดับที่ถูกต้อง
   * @returns {Array<string>} รายการ URL รูปคู่มือ
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
        pages.push(manualObj[key]);
      }
    }
    return pages.length > 0 ? pages : Object.values(manualObj);
  }

  /**
   * คำนวณพิกัดเปอร์เซ็นต์ (x%, y%) บนกระดานสำหรับช่องที่ระบุ (อ่านจาก boardMap.json ผ่าน BoardRenderer)
   * @param {number} tileIndex - เลขช่องบนกระดาน (0 ถึง BOARD_TILES_COUNT - 1)
   * @returns {{x: number, y: number}} พิกัด (x%, y%)
   */
  getTileCoordinates(tileIndex) {
    const total = CONFIG.BOARD_TILES_COUNT || 39;
    const normalizedTile = ((tileIndex % total) + total) % total;
    const tileNumber = normalizedTile + 1; // 1-based tile number in boardMap.json

    const tileData = this.boardRenderer.getTileData(tileNumber);
    if (tileData && typeof tileData.x === 'number' && typeof tileData.y === 'number') {
      const { xPercent, yPercent } = this.boardRenderer.getTilePercentCoordinates(tileData.x, tileData.y);
      return { x: xPercent, y: yPercent };
    }

    // กรณีสำรอง fallback
    return { x: 50, y: 50 };
  }

  /**
   * คำนวณ Offset ตำแหน่งตัวหมากเมื่ออยู่ช่องเดียวกัน ให้จัดวางตรงกลางช่องสวยงาม
   */
  getTokenTileOffset(sameTilePlayers, player) {
    if (!sameTilePlayers || sameTilePlayers.length <= 1) {
      return { offsetX: 0, offsetY: 0 };
    }
    const subIdx = sameTilePlayers.findIndex((other) => other.id === player.id);
    if (subIdx < 0) return { offsetX: 0, offsetY: 0 };

    if (sameTilePlayers.length === 2) {
      return {
        offsetX: (subIdx - 0.5) * 16,
        offsetY: (subIdx - 0.5) * 8,
      };
    }

    const totalOnTile = sameTilePlayers.length;
    const angle = (subIdx / totalOnTile) * 2 * Math.PI;
    const radius = 14;
    return {
      offsetX: Math.cos(angle) * radius,
      offsetY: Math.sin(angle) * radius,
    };
  }

  /**
   * เรนเดอร์ตัวหมากของผู้เล่นทุกคนที่อยู่บนกระดาน และมาร์กเกอร์ประเภทช่อง
   * @returns {string} HTML String
   */
  renderBoardTokens() {
    const tokensHtml = this.players
      .map((p, pIdx) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId);
        const colorHex = p.color || colorObj?.hex || '#f59e0b';
        const colorGrad = p.colorGradient || colorObj?.gradient || colorHex;
        const icon = colorObj?.icon || '♟️';

        const coord = this.getTileCoordinates(p.position || 0);

        // คำนวณ Offset ในกรณีผู้เล่นอยู่ช่องเดียวกัน ให้จัดวางตรงกลางช่องพอดี
        const sameTilePlayers = this.players.filter((other) => (other.position || 0) === (p.position || 0));
        const { offsetX, offsetY } = this.getTokenTileOffset(sameTilePlayers, p);

        const isCurrentTurn = this.phase === 'PLAYING' && pIdx === this.activePlayerIndex;

        return `
          <div 
            id="player-token-node-${p.id}"
            class="board-moving-token ${isCurrentTurn ? 'active-turn-token' : ''}" 
            style="
              left: calc(${coord.x}% + ${offsetX}px); 
              top: calc(${coord.y}% + ${offsetY}px); 
              background: ${colorGrad}; 
              border-color: ${colorHex}; 
              box-shadow: 0 0 14px ${colorHex};
            "
            title="${p.name} (${p.colorName || 'ตัวหมาก'}) - ตำแหน่ง: ช่องที่ ${p.position || 0}"
          >
            <span class="token-icon">${icon}</span>
            <span class="token-p-badge">${p.name}</span>
          </div>
        `;
      })
      .join('');

    return tokensHtml;
  }

  /**
   * เรนเดอร์มาร์กเกอร์แสดงประเภทช่องสีเขียวและช่องสีแดงบนกระดาน (แสดงเฉพาะเมื่อเปิด Debug Mode เท่านั้น)
   * @returns {string} HTML String
   */
  renderTileIndicators() {
    return '';
  }

  /**
   * แสดงแอนิเมชันเอฟเฟกต์แสง Glow เมื่อตัวหมากตกลงบนช่อง (Phase 15)
   */
  applyTileGlowEffect(tileIndex, tileType) {
    if (tileIndex === undefined || tileIndex === null) return;
    const tileEl = this.container.querySelector(`.board-tile[data-tile-id="${tileIndex}"]`);
    if (!tileEl) return;

    const glowClass = tileType === 'GREEN' ? 'tile-landed-green' : tileType === 'RED' ? 'tile-landed-red' : 'tile-landed-normal';
    tileEl.classList.remove('tile-landed-green', 'tile-landed-red', 'tile-landed-normal');
    void tileEl.offsetWidth; // force reflow
    tileEl.classList.add(glowClass);
    setTimeout(() => {
      if (tileEl) tileEl.classList.remove(glowClass);
    }, 2000);
  }

  /**
   * แสดงป้าย Banner แจ้งเปลี่ยนเทิร์นผู้เล่น (Phase 15)
   */
  showTurnBannerAnimation(player) {
    if (!player) return;
    const oldBanner = this.container.querySelector('.turn-banner-overlay');
    if (oldBanner) oldBanner.remove();

    const banner = document.createElement('div');
    banner.className = 'turn-banner-overlay';
    const colorHex = player.color || player.colorHex || '#f59e0b';
    const colorName = player.colorName || 'ทอง';
    banner.innerHTML = `
      <div class="turn-banner-badge" style="background-color: ${colorHex}; box-shadow: 0 0 10px ${colorHex};"></div>
      <div class="turn-banner-text">👑 ถึงตาของผู้เล่น: [${player.name}] (สี${colorName})</div>
    `;
    const mainBoardArea = this.container.querySelector('.game-board-container') || this.container;
    mainBoardArea.appendChild(banner);

    if (window.soundManager) window.soundManager.play('notify');

    setTimeout(() => {
      if (banner && banner.parentNode) banner.remove();
    }, 1800);
  }

  /**
   * แสดงป็อบอัพแจ้งเตือนข้อความ รายละเอียด รางวัล/บทลงโทษ เมื่อตกช่องสีเขียว หรือ สีแดง
   */
  showTileEventModal(player, tile, onDismiss, options = {}) {
    if (window.soundManager) {
      window.soundManager.play(tile.type === 'GREEN' ? 'card_draw' : 'penalty');
    }

    const existing = document.getElementById('tile-event-modal');
    if (existing) existing.remove();

    const isGreen = tile.type === 'GREEN';
    const headerTitle = isGreen ? '🟢 ช่องสีเขียว — รางวัลโบนัส' : '🔴 ช่องสีแดง — บทลงโทษ';
    const headerBg = isGreen
      ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
      : 'linear-gradient(135deg, #dc2626 0%, #f87171 100%)';
    const rewardTitle = isGreen ? 'รางวัล:' : 'บทลงโทษ:';
    const colorNameStr = player.colorName ? ` (${player.colorName})` : '';
    const isOwner = options && options.isOwner !== undefined ? options.isOwner : true;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'tile-event-modal';
    modalOverlay.className = 'tile-event-modal-overlay';

    modalOverlay.innerHTML = `
      <div class="tile-event-modal-card ${isGreen ? 'green-card' : 'red-card'}">
        <div class="tile-event-modal-header" style="background: ${headerBg};">
          <div class="tile-event-header-icon">${isGreen ? '🎁' : '⚠️'}</div>
          <div class="tile-event-header-text">${headerTitle}</div>
        </div>

        <div class="tile-event-modal-body">
          <div class="tile-event-player-badge">
            <span class="player-dot" style="background: ${player.color || '#f59e0b'}"></span>
            <span>ผู้เล่น: <strong>${player.name}${colorNameStr}</strong></span>
            <span class="tile-number-tag">ช่องที่ ${tile.label || tile.tile}</span>
          </div>

          <h3 class="tile-event-title">${tile.title || tile.name || ''}</h3>

          <p class="tile-event-desc">${tile.description || ''}</p>

          <div class="tile-event-action-box ${isGreen ? 'green-action' : 'red-action'}">
            <span class="action-icon">${isGreen ? '🌟' : '⚡'}</span>
            <div class="action-text-group">
              <span class="action-label">${rewardTitle}</span>
              <span class="action-value">${tile.actionText || 'ดำเนินคำสั่งตามช่อง'}</span>
            </div>
          </div>

          ${
            isOwner
              ? `<button id="btn-close-tile-event" class="tile-event-confirm-btn ${isGreen ? 'green-btn' : 'red-btn'}">
                  รับทราบ (ตกลง)
                </button>`
              : `<button id="btn-close-tile-event" class="tile-event-confirm-btn ${isGreen ? 'green-btn' : 'red-btn'}" disabled style="opacity: 0.88; cursor: default; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; font-size: 0.92rem; justify-content: center; display: flex; align-items: center; gap: 0.5rem; box-shadow: none;">
                  <span>⏳</span> รอ [${player.name}] กดยืนยันรับทราบ...
                </button>`
          }
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    const closeBtn = modalOverlay.querySelector('#btn-close-tile-event');
    let handled = false;
    const cleanup = () => {
      if (handled) return;
      handled = true;
      modalOverlay.classList.add('closing');
      setTimeout(() => {
        if (modalOverlay.parentNode) modalOverlay.remove();
        if (typeof onDismiss === 'function') onDismiss();
      }, 200);
    };

    if (closeBtn && isOwner) {
      closeBtn.addEventListener('click', cleanup);
    }
  }

  /**
   * สั่งปิด Tile Event Modal จากภายนอก
   */
  closeTileEventModal() {
    const modalOverlay = document.getElementById('tile-event-modal');
    if (modalOverlay) {
      modalOverlay.classList.add('closing');
      setTimeout(() => {
        if (modalOverlay.parentNode) modalOverlay.remove();
      }, 200);
    }
  }

  /**
   * Event เมื่อผู้เล่นหยุดตกช่องสีเขียว
   * @param {Object} player - ข้อมูลผู้เล่น
   * @param {Object} tile - ข้อมูลช่อง
   */
  handleGreenTileEvent(player, tile) {
    if (!player || !tile) return;
    this.applyTileGlowEffect(tile?.id, tile?.type);

    const colorNameStr = player?.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🟢 [${player?.name || 'ผู้เล่น'} (${colorNameStr})] ตกช่องสีเขียว (${tile?.name || ''}) — ${tile?.actionText || ''}`, 'success');

    const statusText = this.container.querySelector('#dice-status-text');
    if (statusText) {
      statusText.textContent = `🟢 [${player?.name || 'ผู้เล่น'}] ตกช่องสีเขียว (${tile?.name || ''})`;
    }

    this.showTileEventModal(player, tile, async () => {
      // ดำเนินการผลรางวัลเมื่อปิดป็อบอัพ
      if (tile.effect) {
        if (tile.effect.type === 'MOVE_FORWARD' && tile.effect.steps > 0) {
          await this.movePlayerForwardByEffect(player, tile.effect.steps);
          return;
        } else if (tile.effect.type === 'EXTRA_TURN') {
          this.addLogEntry(`✨ [${player.name}] ได้รับสิทธิ์เล่นอีก 1 รอบ!`, 'success');
          this.isMoving = false;
          if (statusText) {
            statusText.textContent = `✨ [${player.name}] ได้รับสิทธิ์ทอยลูกเต๋าอีกครั้ง!`;
          }
          this.updateDiceAreaUI();
          return;
        }
      }

      this.finishTurnAndPassToNext();
    });
  }

  /**
   * Event เมื่อผู้เล่นหยุดตกช่องสีแดง
   * @param {Object} player - ข้อมูลผู้เล่น
   * @param {Object} tile - ข้อมูลช่อง
   */
  handleRedTileEvent(player, tile) {
    if (!player || !tile) return;
    this.applyTileGlowEffect(tile?.id, tile?.type);

    const colorNameStr = player?.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🔴 [${player?.name || 'ผู้เล่น'} (${colorNameStr})] ตกช่องสีแดง (${tile?.name || ''}) — ${tile?.actionText || ''}`, 'warn');

    const statusText = this.container.querySelector('#dice-status-text');
    if (statusText) {
      statusText.textContent = `🔴 [${player?.name || 'ผู้เล่น'}] ตกช่องสีแดง (${tile?.name || ''})`;
    }

    this.showTileEventModal(player, tile, async () => {
      // ดำเนินการบทลงโทษเมื่อปิดป็อบอัพ
      if (tile.effect) {
        if (tile.effect.type === 'MOVE_BACKWARD' && tile.effect.steps > 0) {
          await this.movePlayerBackwardByEffect(player, tile.effect.steps);
          return;
        } else if (tile.effect.type === 'GOTO_START') {
          await this.movePlayerToStartByEffect(player);
          return;
        } else if (tile.effect.type === 'SKIP_TURN') {
          player.skipTurns = (player.skipTurns || 0) + (tile.effect.turns || 1);
          this.addLogEntry(`⛔ [${player.name}] ถูกลงโทษหยุดเล่น ${tile.effect.turns || 1} รอบ`, 'warn');
        }
      }

      this.finishTurnAndPassToNext();
    });
  }

  /**
   * Event เมื่อผู้เล่นหยุดตกช่องปกติ (Phase 10 & 12: onNormalTile)
   * @param {Object} player - ข้อมูลผู้เล่น
   * @param {Object} tile - ข้อมูลช่อง
   */
  handleNormalTileEvent(player, tile) {
    if (!player || !tile) return;
    this.applyTileGlowEffect(tile?.id, tile?.type);

    const colorNameStr = player?.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`⚪ [${player?.name || 'ผู้เล่น'} (${colorNameStr})] ตกช่องปกติ: ${tile?.name || ''}`, 'info');

    const statusText = this.container.querySelector('#dice-status-text');

    if (this.isStartOfTurnCardDraw) {
      // สุ่มการ์ดต้นเทิร์นเรียบร้อยแล้ว -> เข้าสู่ช่วงทอยลูกเต๋าของเทิร์นนี้
      this.isStartOfTurnCardDraw = false;
      this.isMoving = false;

      if (statusText) {
        statusText.textContent = `🎲 [${player?.name || 'ผู้เล่น'}] สุ่มการ์ดเรียบร้อยแล้ว — พร้อมทอยลูกเต๋า!`;
      }

      this.addLogEntry(`🎲 [${player?.name || 'ผู้เล่น'}] สุ่มการ์ดต้นเทิร์นเรียบร้อยแล้ว -> พร้อมทอยลูกเต๋า`, 'system');
      this.updateDiceAreaUI();
    } else {
      if (statusText) {
        statusText.textContent = `⚪ [${player?.name || 'ผู้เล่น'}] ตกช่องปกติ (${tile?.name || ''})`;
      }

      // สลับเทิร์นไปยังผู้เล่นคนถัดไป
      this.finishTurnAndPassToNext();
    }
  }

  /**
   * เรนเดอร์ส่วนรายการข้อมูลผู้เล่นใน Sidebar
   * @returns {string} HTML String
   */
  renderPlayersInfoList() {
    return this.players
      .map((p, idx) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId);
        const colorHex = p.color || colorObj?.hex || '#f59e0b';
        const colorName = p.colorName || colorObj?.name || 'สีทอง';

        let rowHighlightClass = '';
        let statusBadgeText = '';

        if (this.phase === 'DETERMINE_ORDER') {
          if (idx === this.currentRollPlayerIndex) {
            rowHighlightClass = 'active-rolling-highlight';
            statusBadgeText = '🎯 ถึงคิวทอยเต๋า';
          } else if (p.orderRollScore !== null) {
            statusBadgeText = `🎲 ได้ ${p.orderRollScore} แต้ม`;
          } else {
            statusBadgeText = 'รอทอยเต๋า';
          }
        } else if (this.phase === 'PLAYING') {
          if (idx === this.activePlayerIndex) {
            rowHighlightClass = 'active-turn-highlight';
            statusBadgeText = '👑 ถึงเทิร์นนี้';
          } else {
            statusBadgeText = p.turnOrder || `ลำดับที่ ${idx + 1}`;
          }
        }

        return `
        <div class="player-status-row ${rowHighlightClass}">
          <div class="player-row-top">
            <div class="player-identity">
              <span class="player-color-dot" style="background: ${colorHex}; box-shadow: 0 0 8px ${colorHex};"></span>
              <span class="player-row-name">${p.name}</span>
            </div>
            <span class="player-token-badge" style="background: rgba(255, 255, 255, 0.05); color: ${colorHex}; border: 1px solid ${colorHex}66; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700;">
              ${statusBadgeText}
            </span>
          </div>

          <div class="player-details-grid">
            <div class="detail-item">
              <span class="detail-label">สีตัวหมาก:</span>
              <span class="detail-val" style="color: ${colorHex}; font-weight: 700;">${colorName}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">ลำดับการเล่น:</span>
              <span class="detail-val ${p.turnOrderRank ? 'text-gold' : 'text-muted'}">${p.turnOrder || 'รอทอยเต๋า'}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">สถานะ:</span>
              <span class="detail-val text-success">🟢 ${p.status}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">หยุดเดิน:</span>
              <span class="detail-val">${p.pauseTurns || p.skipTurns || p.skipTurnCount || 0} ตา</span>
            </div>

            <div class="detail-item detail-full-width">
              <span class="detail-label">ตำแหน่งปัจจุบัน:</span>
              <span class="detail-val text-gold">📍 ช่องที่ ${p.position || 0}${p.position === 0 ? ' (จุดเริ่มต้น)' : ''}</span>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  /**
   * เรนเดอร์หน้าจอกระดานเกมหลัก
   */
  render() {
    const boardUrl = assetManager.getUrl('board') || ASSET_MANIFEST.board;
    const goodCoverUrl = ASSET_MANIFEST.goodCards?.cover || '';
    const badCoverUrl = ASSET_MANIFEST.badCards?.cover || '';
    const logoUrl = ASSET_MANIFEST.logo || '';

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const currentRollingPlayer = this.players[this.currentRollPlayerIndex] || this.players[0] || { name: 'ผู้เล่น' };

    this.container.innerHTML = `
      <div class="game-board-layout">
        <!-- แถบด้านบนของหน้าจอ (Top Header Bar) -->
        <header class="game-header-bar">
          <div class="header-left">
            <div class="header-brand">
              <div class="header-logos-group" style="display: flex; align-items: center; gap: 0.6rem;">
                ${(ASSET_MANIFEST.logos || []).map((url, idx, arr) => `
                  <img src="${url}" alt="Logo" class="header-logo-img logo-img-${idx + 1}" />
                  ${idx < arr.length - 1 ? '<span class="header-logo-x">✕</span>' : ''}
                `).join('')}
              </div>
              <div class="header-title-box">
                <h1 class="header-game-title">${CONFIG.GAME_TITLE || 'Cyber Board Game'}</h1>
                <span class="header-status-tag" id="header-status-tag">
                  ${this.phase === 'DETERMINE_ORDER' ? `🎲 กำหนดลำดับการเล่น (${this.currentRollPlayerIndex + 1}/${this.players.length})` : '🎮 กำลังแข่งขัน'}
                </span>
              </div>
            </div>
          </div>

          <div class="header-right-actions">
            <button class="header-btn btn-header-manual" id="btn-top-manual">
              <span class="btn-icon">📖</span>
              <span>คู่มือการเล่น</span>
            </button>

            <button class="header-btn btn-header-settings" id="btn-top-settings">
              <span class="btn-icon">⚙️</span>
              <span>ตั้งค่า</span>
            </button>

            <button class="header-btn btn-header-menu" id="btn-top-menu">
              <span class="btn-icon">⬅</span>
              <span>กลับหน้าเมนู</span>
            </button>
          </div>
        </header>

        <!-- พื้นที่หลัก (Main Container Grid) -->
        <main class="game-main-content">
          <!-- ฝั่งซ้าย: พื้นที่กระดานเกม (Board Area) -->
          <section class="board-viewport-section">
            <div class="board-container-card">
              ${this.boardRenderer.renderBoardContainerHTML(boardUrl, this.renderBoardTokens())}

              <!-- คำชี้แจงสถานะระบบ -->
              <div class="board-footer-notice" id="board-footer-notice">
                <span>ℹ️ ขณะนี้อยู่ในขั้นตอนกำหนดลำดับการเล่น — ผู้เล่นทุกคนต้องทอยเต๋าคนละ 1 ครั้ง</span>
              </div>
            </div>
          </section>

          <!-- ฝั่งขวา: แผงควบคุมและข้อมูลเกม (Side Panel) -->
          <aside class="game-sidebar-section">
            <!-- 1. รายชื่อผู้เล่นทั้งหมด และสถานะ -->
            <div class="sidebar-card players-status-card">
              <div class="card-header-bar">
                <h3 class="card-title">👥 ข้อมูลผู้เล่นทั้งหมด (${this.players.length} คน)</h3>
              </div>

              <div class="players-info-list" id="players-info-list">
                ${this.renderPlayersInfoList()}
              </div>
            </div>

            <!-- 2. พื้นที่สำหรับลูกเต๋า และ การ์ดสถานการณ์ -->
            <div class="sidebar-grid-two-cols">
              <!-- พื้นที่ลูกเต๋า -->
              <div class="sidebar-card dice-area-card">
                <div class="card-header-bar">
                  <h3 class="card-title">🎲 พื้นที่ทอยเต๋า</h3>
                </div>

                <div class="dice-preview-box">
                  <!-- ลูกเต๋า 3D Cube -->
                  <div class="dice-3d-scene" id="dice-3d-scene">
                    <div class="dice-3d-cube" id="dice-cube" data-side="1">
                      <div class="cube-face face-1"><span class="dot center"></span></div>
                      <div class="cube-face face-2"><span class="dot top-right"></span><span class="dot bottom-left"></span></div>
                      <div class="cube-face face-3"><span class="dot top-right"></span><span class="dot center"></span><span class="dot bottom-left"></span></div>
                      <div class="cube-face face-4"><span class="dot top-left"></span><span class="dot top-right"></span><span class="dot bottom-left"></span><span class="dot bottom-right"></span></div>
                      <div class="cube-face face-5"><span class="dot top-left"></span><span class="dot top-right"></span><span class="dot center"></span><span class="dot bottom-left"></span><span class="dot bottom-right"></span></div>
                      <div class="cube-face face-6"><span class="dot top-left"></span><span class="dot top-right"></span><span class="dot mid-left"></span><span class="dot mid-right"></span><span class="dot bottom-left"></span><span class="dot bottom-right"></span></div>
                    </div>
                  </div>

                  <div class="dice-status-badge" id="dice-status-text">
                    ${this.phase === 'DETERMINE_ORDER' ? `🎯 คิวกดทอยเต๋า: ${currentRollingPlayer.name}` : '👑 ถึงเทิร์นทอยเต๋า'}
                  </div>

                  <button class="btn-action btn-roll-dice-active" id="btn-roll-dice">
                    <span class="btn-icon">🎲</span>
                    <span id="btn-roll-text">${this.phase === 'DETERMINE_ORDER' ? `${currentRollingPlayer.name} ทอยเต๋า` : 'ทอยลูกเต๋า'}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 3. ประวัติการเล่น (Game Log) -->
            <div class="sidebar-card game-log-card">
              <div class="card-header-bar">
                <h3 class="card-title">📜 ประวัติการเล่น (Game Log)</h3>
              </div>

              <div class="log-messages-container">
                <div class="log-entry log-system">
                  <span class="log-time">[${timeStr}]</span>
                  <span class="log-text">🎮 สร้างกระดานเกม Cyber Board Game สำเร็จ</span>
                </div>
                <div class="log-entry log-info">
                  <span class="log-time">[${timeStr}]</span>
                  <span class="log-text">👥 ผู้เล่นเข้าร่วมกระดานเกมเรียบร้อยแล้ว (${this.players.length} คน)</span>
                </div>
                <div class="log-entry log-info">
                  <span class="log-time">[${timeStr}]</span>
                  <span class="log-text">📍 ตัวหมากของผู้เล่นทุกคนถูกตั้งค่าไว้ที่ช่องเริ่มต้น (ช่องที่ 0)</span>
                </div>
                <div class="log-entry log-warn">
                  <span class="log-time">[${timeStr}]</span>
                  <span class="log-text">🎲 เริ่มขั้นตอนกำหนดลำดับการเล่น: ให้ทุกคนทอยลูกเต๋าคนละ 1 ครั้ง</span>
                </div>
                <div class="log-entry log-info">
                  <span class="log-time">[${timeStr}]</span>
                  <span class="log-text">🎯 [${currentRollingPlayer.name}] กรุณาทอยลูกเต๋ากำหนดลำดับคนแรก</span>
                </div>
              </div>
            </div>
          </aside>
        </main>

        <!-- Modal Container สำหรับปุ่มเปิดคู่มือ / ตั้งค่า / ยืนยันออก -->
        <div class="modal-overlay hidden" id="game-modal-overlay">
          <div class="modal-container" id="game-modal-container"></div>
        </div>
      </div>
    `;

    this.bindEvents();

    if (this.shouldShowRandomOrderSummary) {
      this.shouldShowRandomOrderSummary = false;
      setTimeout(() => {
        this.showRandomOrderSummaryModal();
      }, 150);
    }
  }

  /**
   * ผูกการทำงานปุ่ม Header และ Modal
   */
  bindEvents() {
    // ปุ่มเปิดคู่มือการเล่น
    const btnManual = this.container.querySelector('#btn-top-manual');
    if (btnManual) {
      btnManual.onclick = () => this.openManualModal();
    }

    // ปุ่มตั้งค่า
    const btnSettings = this.container.querySelector('#btn-top-settings');
    if (btnSettings) {
      btnSettings.onclick = () => this.openSettingsModal();
    }

    // ปุ่มกลับหน้าเมนู
    const btnMenu = this.container.querySelector('#btn-top-menu');
    if (btnMenu) {
      btnMenu.onclick = () => this.confirmBackToMenu();
    }

    // ปุ่มทอยลูกเต๋า Phase 7 & 9 & 19 (Support Network Online)
    const btnRoll = this.container.querySelector('#btn-roll-dice');
    if (btnRoll) {
      btnRoll.onclick = () => {
        if (this.isMoving || this.isDiceRolling) return;
        if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
          const roomCode = networkManager.roomManager.currentRoom?.roomCode;
          const myPlayerId = this.getMyPlayerId();
          if (!roomCode || !myPlayerId) return;

          this.isDiceRolling = true;
          this.updateDiceAreaUI();

          const packet = PacketManager.createPacket(
            PACKET_TYPES.REQUEST_ROLL_DICE,
            { roomCode, playerId: myPlayerId },
            myPlayerId
          );
          networkManager.sendPacket(packet);
        } else if (!this.diceEngine.getIsRolling() && !this.isMoving) {
          this.diceEngine.roll();
        }
      };
    }
  }

  /**
   * อัปเดตตำแหน่ง DOM ของตัวหมากผู้เล่นคนเดียวในขณะเดินทีละช่อง
   * @param {Object} player - ข้อมูลผู้เล่น
   */
  updateSingleTokenDOMPosition(player) {
    const tokenNode = this.container.querySelector(`#player-token-node-${player.id}`);
    if (!tokenNode) {
      const tokensLayer = this.container.querySelector('#board-tokens-layer');
      if (tokensLayer) {
        tokensLayer.innerHTML = this.renderBoardTokens();
      }
      return;
    }

    const coord = this.getTileCoordinates(player.position || 0);

    const sameTilePlayers = this.players.filter((other) => (other.position || 0) === (player.position || 0));
    const { offsetX, offsetY } = this.getTokenTileOffset(sameTilePlayers, player);

    tokenNode.style.left = `calc(${coord.x}% + ${offsetX}px)`;
    tokenNode.style.top = `calc(${coord.y}% + ${offsetY}px)`;
    tokenNode.title = `${player.name} (${player.colorName || 'ตัวหมาก'}) - ตำแหน่ง: ช่องที่ ${player.position || 0}`;

    // เพิ่มแอนิเมชันก้าวเดินกระโดด
    tokenNode.classList.add('token-stepping');
    setTimeout(() => {
      tokenNode.classList.remove('token-stepping');
    }, 250);
  }

  /**
   * ระบบเดินตัวหมากทีละช่อง มีแอนิเมชัน ไม่วาร์ป พร้อมระบบเด้งกลับเมื่อแต้มเกิน (Phase 9 & 13)
   * @param {Object} player - ผู้เล่นที่กำลังเดิน
   * @param {number} stepsCount - จำนวนช่องที่ต้องเดินตามผลลูกเต๋า
   * @param {Object} [options={}] - ออปชันเพิ่มเติม (skipTileEvent, keepMovingFlag)
   */
  async movePlayerSteps(player, stepsCount, options = {}) {
    this.isMoving = true;

    // ปิดปุ่มทอยเต๋าขณะกำลังเดิน
    const btnRoll = this.container.querySelector('#btn-roll-dice');
    if (btnRoll) {
      btnRoll.disabled = true;
      btnRoll.classList.add('rolling-disabled');
    }

    const statusText = this.container.querySelector('#dice-status-text');
    if (statusText) {
      statusText.textContent = `🚶 [${player.name}] กำลังเดิน ${stepsCount} ช่อง...`;
    }

    const colorNameStr = player.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🚶 ผู้เล่น${colorNameStr} (${player.name}) เริ่มก้าวเดิน ${stepsCount} ช่อง...`, 'info');

    // คำนวณเส้นทางการก้าวเดินทีละช่อง (พร้อมระบบเด้งกลับหากทอยเกินเส้นชัย และกติกาที่เลือก)
    const movementInfo = finishManager.calculateMovementPath(player.position, stepsCount, this.finishMode);
    const path = movementInfo.path;

    for (let i = 0; i < path.length; i++) {
      const nextPos = path[i];

      // หากจุดนี้คือสเต็ปแรกของการเด้งถอยหลัง
      if (movementInfo.didBounce && i === movementInfo.bounceAtStepIndex + 1) {
        this.addLogEntry(`💥 [${player.name}] แต้มทอยเกินเส้นชัย! เด้งถอยหลัง...`, 'warn');
        if (window.soundManager) window.soundManager.play('bounce');
      }

      player.position = nextPos;
      this.updateSingleTokenDOMPosition(player);

      if (window.soundManager) {
        const isBouncingNow = movementInfo.didBounce && i > movementInfo.bounceAtStepIndex;
        window.soundManager.play(isBouncingNow ? 'bounce' : 'move');
      }

      // หน่วงเวลาให้เห็นแอนิเมชันการเดินแต่ละช่อง
      await new Promise((resolve) => setTimeout(resolve, 320));
    }

    // เมื่อเดินครบเรียบร้อย
    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.updatePlayersListUI();

    // ตรวจสอบการเข้าเส้นชัย (Winner Check)
    if (finishManager.isWinner(player)) {
      this.addLogEntry(`🏆🎉 [${player.name}] เดินเข้าเส้นชัยสำเร็จที่ช่องที่ ${player.position}! เป็นผู้ชนะการแข่งขัน!`, 'success');
      finishManager.showVictoryModal(player, this.players, this);
      this.isMoving = false;
      return;
    }

    this.addLogEntry(`📍 ผู้เล่น${colorNameStr} (${player.name}) เดิน ${stepsCount} ช่อง (ย้ายมาที่ช่องที่ ${player.position})`, 'success');

    // Phase 10-12: ตรวจสอบประเภทช่องด้วย TileManager และประมวลผล Event (ถ้าตกช่องการ์ดจะสุ่มการ์ดต่อ)
    if (!options.skipTileEvent && networkManager.getMode() !== NETWORK_MODES.ONLINE) {
      this.tileManager.checkTileAndTriggerEvent(player, player.position);
    }
    if (!options.keepMovingFlag) {
      this.isMoving = false;
    }
  }

  /**
   * อัปเดต UI รายชื่อผู้เล่นใน Sidebar
   */
  updatePlayersListUI() {
    const listContainer = this.container.querySelector('#players-info-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderPlayersInfoList();
    }
  }

  /**
   * อัปเดต UI ข้อความสเตตัสใน Header และคำชี้แจงด้านล่างกระดาน
   */
  updateHeaderStatusUI() {
    const tag = this.container.querySelector('#header-status-tag');
    const notice = this.container.querySelector('#board-footer-notice');
    const orderBadge = this.orderMode === 'RANDOM' ? '🔀 สุ่มลำดับออโต้' : '🎲 ทอยเต๋ากำหนดลำดับ';
    const finishBadge = this.finishMode === 'EXACT_ROLL' ? '🎯 แต้มพอดี' : '🏁 ถึงก่อนชนะ';

    if (tag) {
      if (this.phase === 'DETERMINE_ORDER') {
        tag.textContent = `🎲 กำหนดลำดับการเล่น (${this.currentRollPlayerIndex + 1}/${this.players.length}) [${orderBadge}]`;
      } else {
        const activeP = this.players[this.activePlayerIndex];
        tag.textContent = `🎮 กำลังแข่งขัน (เทิร์นของ ${activeP ? activeP.name : ''}) [${orderBadge} | ${finishBadge}]`;
      }
    }

    if (notice) {
      if (this.phase === 'DETERMINE_ORDER') {
        notice.innerHTML = `<span>ℹ️ ขณะนี้อยู่ในขั้นตอนกำหนดลำดับการเล่น — ผู้เล่นทุกคนทอยเต๋าคนละ 1 ครั้ง (${orderBadge})</span>`;
      } else {
        const activeP = this.players[this.activePlayerIndex];
        notice.innerHTML = `<span>🎮 เริ่มเทิร์นการเล่น — คิวของ <b>${activeP ? activeP.name : ''}</b> (${orderBadge} | ${finishBadge})</span>`;
      }
    }
  }

  /**
   * ระบบตรวจสอบและทอยเต๋าให้อัตโนมัติเมื่ออยู่ในโหมดสุ่มคนเดินออโต้ (AUTO)
   */
  checkAutoRoll() {
    if (this.rollMode !== 'AUTO') return;
    if (this.isMoving || this.isDiceRolling || (this.diceEngine && this.diceEngine.getIsRolling())) return;

    const modalOverlay = this.container.querySelector('#game-modal-overlay:not(.hidden)');
    if (modalOverlay) return;

    if (this.autoRollTimer) {
      clearTimeout(this.autoRollTimer);
    }

    this.autoRollTimer = setTimeout(() => {
      if (this.rollMode !== 'AUTO') return;
      if (this.isMoving || this.isDiceRolling || (this.diceEngine && this.diceEngine.getIsRolling())) return;
      const modalOverlay = this.container.querySelector('#game-modal-overlay:not(.hidden)');
      if (modalOverlay) return;

      if (this.phase === 'DETERMINE_ORDER') {
        const currP = this.players[this.currentRollPlayerIndex];
        if (currP && currP.orderRollScore === null) {
          if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
            const btnRoll = this.container.querySelector('#btn-roll-dice');
            if (btnRoll && !btnRoll.disabled) btnRoll.click();
          } else if (!this.diceEngine.getIsRolling()) {
            this.addLogEntry(`🤖 [AUTO] สุ่มทอยลูกเต๋ากำหนดลำดับให้ [${currP.name}]...`, 'info');
            this.diceEngine.roll();
          }
        }
      } else if (this.phase === 'PLAYING') {
        const activeP = this.players[this.activePlayerIndex];
        if (activeP && !activeP.pendingCardDraw && (activeP.skipTurnCount || 0) <= 0) {
          if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
            const btnRoll = this.container.querySelector('#btn-roll-dice');
            if (btnRoll && !btnRoll.disabled) btnRoll.click();
          } else if (!this.diceEngine.getIsRolling()) {
            this.addLogEntry(`🤖 [AUTO] ถึงตา [${activeP.name}] — ระบบสุ่มทอยเต๋าให้อัตโนมัติ!`, 'info');
            this.diceEngine.roll();
          }
        }
      }
    }, 900);
  }

  /**
   * อัปเดต UI พื้นที่ทอยเต๋า (ปุ่มและข้อความสเตตัส)
   */
  updateDiceAreaUI() {
    const statusText = this.container.querySelector('#dice-status-text');
    const btnRoll = this.container.querySelector('#btn-roll-dice');
    const btnRollText = this.container.querySelector('#btn-roll-text');

    if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
      const myPlayerId = this.getMyPlayerId();

      if (this.phase === 'DETERMINE_ORDER') {
        const currentRollIdx = this.currentRollPlayerIndex;
        const currP = this.players[currentRollIdx];
        const isMyRollTurn = Boolean(
          currP && myPlayerId && String(currP.id) === String(myPlayerId)
        );

        if (btnRoll) {
          if (isMyRollTurn && !this.isDiceRolling && !this.isMoving) {
            btnRoll.disabled = false;
            btnRoll.classList.remove('rolling-disabled');
            if (btnRollText) btnRollText.textContent = `🎲 ${currP ? currP.name : ''} ทอยเต๋ากำหนดลำดับ (ตาของคุณ!)`;
            if (statusText) statusText.textContent = `🎯 ถึงตาคุณทอยเต๋าสุ่มลำดับการเล่น!`;
          } else {
            btnRoll.disabled = true;
            btnRoll.classList.add('rolling-disabled');
            if (btnRollText) btnRollText.textContent = `⏳ รอ [${currP ? currP.name : ''}] ทอยเต๋าสุ่มลำดับ`;
            if (statusText) statusText.textContent = `⏳ กำลังรอผู้เล่น ${currP ? currP.name : ''} ทอยลูกเต๋ากำหนดลำดับ...`;
          }
        }
        this.checkAutoRoll();
        return;
      }

      // PLAYING phase
      const currentActiveIdx = this.activePlayerIndex;
      const activePlayer = this.players[currentActiveIdx];

      const isMyTurn = Boolean(
        myPlayerId && activePlayer && String(activePlayer.id) === String(myPlayerId)
      );

      if (btnRoll) {
        if (isMyTurn && !this.isMoving && !this.isDiceRolling) {
          if (activePlayer && (activePlayer.skipTurns > 0 || activePlayer.skipTurnCount > 0)) {
            btnRoll.disabled = true;
            btnRoll.classList.add('rolling-disabled');
            const skipCnt = activePlayer.skipTurnCount || activePlayer.skipTurns;
            if (btnRollText) btnRollText.textContent = `⛔ ติดโทษหยุดเดิน ${skipCnt} ตา`;
            if (statusText) statusText.textContent = `⛔ [${activePlayer.name}] ติดโทษหยุดเดิน ${skipCnt} ตา — กำลังข้ามเทิร์น...`;
          } else {
            btnRoll.disabled = false;
            btnRoll.classList.remove('rolling-disabled');
            if (btnRollText) btnRollText.textContent = `🎲 ทอยลูกเต๋า (ตาของคุณ!)`;
            if (statusText) statusText.textContent = `👑 ถึงตาการเล่นของคุณแล้ว! กดปุ่มทอยเต๋าได้เลย`;
          }
        } else {
          btnRoll.disabled = true;
          btnRoll.classList.add('rolling-disabled');
          if (isMyTurn) {
            if (btnRollText) btnRollText.textContent = `🎲 กำลังรอดำเนินการ...`;
            if (statusText) statusText.textContent = `🚶 กำลังเคลื่อนที่ หรือประมวลผลการเล่น...`;
          } else {
            if (btnRollText) btnRollText.textContent = `⏳ รอเทิร์นผู้เล่น [${activePlayer ? activePlayer.name : ''}]`;
            if (statusText) statusText.textContent = `⏳ กำลังรอผู้เล่น ${activePlayer ? activePlayer.name : ''} ทอยลูกเต๋า...`;
          }
        }
      }
      this.checkAutoRoll();
      return;
    }

    if (this.phase === 'DETERMINE_ORDER') {
      const currP = this.players[this.currentRollPlayerIndex];
      if (currP) {
        if (statusText) statusText.textContent = this.rollMode === 'AUTO' ? `🤖 คิวกดทอยเต๋าออโต้: ${currP.name}` : `🎯 คิวกดทอยเต๋า: ${currP.name}`;
        if (btnRollText) btnRollText.textContent = `${currP.name} ทอยเต๋า`;
      }
    } else if (this.phase === 'PLAYING') {
      const activeP = this.players[this.activePlayerIndex];
      if (activeP) {
        if (statusText) statusText.textContent = this.rollMode === 'AUTO' ? `🤖 ถึงเทิร์นออโต้ของ: ${activeP.name}` : `👑 ถึงเทิร์นของ: ${activeP.name}`;
        if (btnRollText) btnRollText.textContent = `ทอยลูกเต๋า (${activeP.name})`;
      }
    }

    if (btnRoll) {
      btnRoll.disabled = false;
      btnRoll.classList.remove('rolling-disabled');
    }

    this.checkAutoRoll();
  }

  /**
   * Callback เมื่อเริ่มทอยลูกเต๋า
   */
  handleRollStart() {
    soundManager.play('dice');

    const btnRoll = this.container.querySelector('#btn-roll-dice');
    const btnRollText = this.container.querySelector('#btn-roll-text');
    const statusText = this.container.querySelector('#dice-status-text');
    const diceCube = this.container.querySelector('#dice-cube');

    if (btnRoll) {
      btnRoll.disabled = true;
      btnRoll.classList.add('rolling-disabled');
    }
    if (btnRollText) {
      btnRollText.textContent = 'กำลังทอยลูกเต๋า...';
    }
    if (statusText) {
      statusText.textContent = '⏳ กำลังทอยลูกเต๋า...';
      statusText.classList.add('rolling-active');
    }
    if (diceCube) {
      diceCube.classList.add('rolling-3d');
    }
  }

  /**
   * Callback เมื่อผลการทอยลูกเต๋าเสร็จสิ้น
   * @param {Object} result - ผลลัพธ์จากการทอย { values, total }
   */
  handleDiceRollResult(result) {
    this.diceResult = result;
    const val = result.total;

    const diceCube = this.container.querySelector('#dice-cube');
    if (diceCube) {
      diceCube.classList.remove('rolling-3d');
      diceCube.setAttribute('data-side', val);
    }

    if (this.phase === 'DETERMINE_ORDER') {
      const currP = this.players[this.currentRollPlayerIndex];
      if (!currP) return;

      currP.orderRollScore = val;
      currP.rollSequenceIndex = this.currentRollPlayerIndex;

      this.addLogEntry(`🎲 [${currP.name}] ทอยลูกเต๋ากำหนดลำดับได้ ${val} แต้ม`, 'info');

      this.currentRollPlayerIndex++;

      if (this.currentRollPlayerIndex < this.players.length) {
        const nextP = this.players[this.currentRollPlayerIndex];
        this.addLogEntry(`🎯 [${nextP.name}] กรุณาทอยลูกเต๋ากำหนดลำดับ...`, 'warn');
        this.updatePlayersListUI();
        this.updateHeaderStatusUI();
        this.updateDiceAreaUI();
      } else {
        // ครบทุกคนแล้ว -> จัดเรียงลำดับผู้เล่นตามกติกา Phase 8
        // กติกา: แต้มมากสุดได้เล่นก่อน หากแต้มเท่ากัน คนที่ทอยก่อนได้ลำดับก่อน (Stable Sort)
        this.players.sort((a, b) => {
          if (b.orderRollScore !== a.orderRollScore) {
            return b.orderRollScore - a.orderRollScore;
          }
          return a.rollSequenceIndex - b.rollSequenceIndex;
        });

        // กำหนด turnOrder และ turnOrderRank ให้แต่ละคน
        this.players.forEach((p, rankIdx) => {
          p.turnOrderRank = rankIdx + 1;
          p.turnOrder = `ลำดับที่ ${rankIdx + 1}`;
        });

        this.phase = 'PLAYING';
        this.activePlayerIndex = 0; // ผู้เล่นที่ได้ลำดับที่ 1 เริ่มคนแรก

        // บันทึกลง GameStateStore
        gameStateStore.setState({
          players: this.players,
          activePlayerIndex: 0,
          phase: 'PLAYING',
        });

        this.addLogEntry(`🏆 สรุปลำดับการเล่นเรียบร้อยแล้ว!`, 'success');
        this.players.forEach((p) => {
          this.addLogEntry(`  ${p.turnOrder}: ${p.name} (${p.orderRollScore} แต้ม)`, 'info');
        });
        this.addLogEntry(`🎮 เริ่มเทิร์นของผู้เล่นคนแรก: [${this.players[0].name}]`, 'system');

        this.updatePlayersListUI();
        this.updateHeaderStatusUI();
        this.updateDiceAreaUI();

        // แสดง Modal สรุปลำดับทั้งหมดให้ผู้เล่นเห็นชัดเจน
        this.showOrderSummaryModal();
      }
    } else {
      // เทิร์นปกติในการเล่น (Phase 9: ระบบเดินตัวหมากทีละช่อง)
      const activeP = this.players[this.activePlayerIndex];
      this.addLogEntry(`🎲 [${activeP ? activeP.name : 'ผู้เล่น'}] ทอยลูกเต๋าได้ ${val} แต้ม`);
      const statusText = this.container.querySelector('#dice-status-text');
      if (statusText) {
        statusText.textContent = `🎉 ได้แต้ม ${val} — เริ่มก้าวเดินตัวหมาก...`;
      }

      if (activeP) {
        this.movePlayerSteps(activeP, val);
      }
    }
  }

  /**
   * แสดง Modal สรุปลำดับผู้เล่นทุกคนหลังจากทอยครบ
   */
  showOrderSummaryModal() {
    const playersListHtml = this.players
      .map((p) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId);
        const colorHex = p.color || colorObj?.hex || '#f59e0b';
        const colorName = p.colorName || colorObj?.name || 'สีทอง';

        return `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.6); border: 1px solid ${colorHex}44; border-radius: 0.75rem; padding: 0.75rem 1rem; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.1rem; font-weight: 800; color: #fbbf24; min-width: 75px;">${p.turnOrder}</span>
            <span style="width: 14px; height: 14px; border-radius: 50%; background: ${colorHex}; box-shadow: 0 0 8px ${colorHex}; display: inline-block;"></span>
            <span style="font-weight: 700; font-size: 0.95rem; color: white;">${p.name} (${colorName})</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.25rem 0.6rem; border-radius: 0.5rem; font-weight: 700; font-size: 0.85rem;">
              🎲 ${p.orderRollScore} แต้ม
            </span>
            ${p.turnOrderRank === 1 ? '<span style="background: #10b981; color: white; padding: 0.25rem 0.6rem; border-radius: 0.5rem; font-weight: 800; font-size: 0.75rem;">👑 เริ่มคนแรก</span>' : ''}
          </div>
        </div>
      `;
      })
      .join('');

    const firstPlayer = this.players[0];

    this.openModal(`
      <div class="modal-content" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">🏆 ผลสรุปลำดับการเล่น</h3>
          <button class="btn-close-modal" id="btn-close-order-summary">✕</button>
        </div>
        <div class="modal-body" style="padding: 1.25rem;">
          <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.5; text-align: center;">
            ทุกคนทอยเต๋าเรียบร้อยแล้ว! จัดลำดับตามแต้มมากสุด (หากแต้มเท่ากัน คนทอยก่อนได้ก่อน)
          </p>
          <div style="margin-bottom: 1.25rem;">
            ${playersListHtml}
          </div>
          <button class="btn-action btn-roll-dice-active" id="btn-start-first-turn" style="width: 100%; justify-content: center; font-size: 1rem; padding: 0.8rem;">
            🎮 เริ่มเทิร์นของผู้เล่นคนแรก (${firstPlayer.name})
          </button>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-order-summary');
    const startBtn = document.getElementById('btn-start-first-turn');

    if (closeBtn) closeBtn.onclick = () => {
      this.closeModal();
      this.updateDiceAreaUI();
    };
    if (startBtn) {
      startBtn.onclick = () => {
        this.closeModal();
        this.updateDiceAreaUI();
      };
    }
  }

  /**
   * แสดง Modal สรุปลำดับผู้เล่นจากการสุ่มลำดับอัตโนมัติ (orderMode === 'RANDOM')
   */
  showRandomOrderSummaryModal() {
    this.addLogEntry(`🔀 ระบบสุ่มสลับลำดับการเล่นเรียบร้อยแล้ว!`, 'success');
    this.players.forEach((p) => {
      this.addLogEntry(`  ${p.turnOrder}: ${p.name}`, 'info');
    });
    this.addLogEntry(`🎮 เริ่มเทิร์นของผู้เล่นคนแรก: [${this.players[0].name}]`, 'system');

    const playersListHtml = this.players
      .map((p) => {
        const colorObj = TOKEN_COLORS.find((c) => c.id === p.colorId);
        const colorHex = p.color || colorObj?.hex || '#f59e0b';
        const colorName = p.colorName || colorObj?.name || 'สีทอง';

        return `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.8); border: 1.5px solid ${colorHex}55; border-radius: 0.85rem; padding: 0.85rem 1.1rem; margin-bottom: 0.6rem; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <span style="font-size: 1.15rem; font-weight: 800; color: #fbbf24; min-width: 80px;">${p.turnOrder}</span>
            <span style="width: 16px; height: 16px; border-radius: 50%; background: ${colorHex}; box-shadow: 0 0 10px ${colorHex}; display: inline-block;"></span>
            <span style="font-weight: 800; font-size: 1rem; color: white;">${p.name} <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">(${colorName})</span></span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${
              p.turnOrderRank === 1
                ? '<span style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 0.3rem 0.75rem; border-radius: 0.5rem; font-weight: 800; font-size: 0.8rem; box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);">👑 เริ่มคนแรก</span>'
                : `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.3rem 0.75rem; border-radius: 0.5rem; font-weight: 700; font-size: 0.8rem;">🔀 ลำดับที่ ${p.turnOrderRank}</span>`
            }
          </div>
        </div>
      `;
      })
      .join('');

    const firstPlayer = this.players[0];

    this.openModal(`
      <div class="modal-content" style="max-width: 540px; background: #0f172a; border: 2px solid rgba(56, 189, 248, 0.5); border-radius: 1.25rem; box-shadow: 0 0 30px rgba(56, 189, 248, 0.25);">
        <div class="modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.1); padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between;">
          <h3 class="modal-title" style="color: #38bdf8; font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
            🔀 ผลสรุปลำดับการเล่น (สุ่มลำดับอัตโนมัติ)
          </h3>
          <button class="btn-close-modal" id="btn-close-random-order-summary" style="color: #94a3b8; font-size: 1.2rem; background: none; border: none; cursor: pointer;">✕</button>
        </div>
        <div class="modal-body" style="padding: 1.25rem 1.5rem;">
          <p style="color: #e2e8f0; font-size: 0.92rem; margin-bottom: 1.25rem; line-height: 1.5; text-align: center; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 0.65rem 1rem; border-radius: 0.75rem;">
            ⚡ ระบบสุ่มสลับลำดับการเดินให้ผู้เล่นทุกคนเรียบร้อยแล้ว
          </p>
          <div style="margin-bottom: 1.5rem;">
            ${playersListHtml}
          </div>
          <button class="btn-action btn-roll-dice-active" id="btn-start-random-first-turn" style="width: 100%; justify-content: center; font-size: 1.05rem; padding: 0.85rem; font-weight: 800; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #0f172a; border-radius: 0.75rem; cursor: pointer; border: none; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4); display: flex; align-items: center; gap: 0.5rem;">
            🎮 เริ่มเทิร์นของผู้เล่นคนแรก (${firstPlayer.name})
          </button>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-random-order-summary');
    const startBtn = document.getElementById('btn-start-random-first-turn');

    if (closeBtn) {
      closeBtn.onclick = () => {
        this.closeModal();
        this.updateDiceAreaUI();
      };
    }
    if (startBtn) {
      startBtn.onclick = () => {
        this.closeModal();
        this.updateDiceAreaUI();
      };
    }
  }

  /**
   * เพิ่มข้อความบันทึกลงใน Game Log
   * @param {string} text - ข้อความประวัติการเล่น
   * @param {string} type - ประเภทของ Log ('info', 'system', 'warn', 'success')
   */
  addLogEntry(text, type = 'info') {
    const logContainer = this.container.querySelector('.log-messages-container');
    if (!logContainer) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const entryDiv = document.createElement('div');
    entryDiv.className = `log-entry log-${type}`;
    entryDiv.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-text">${text}</span>
    `;

    logContainer.appendChild(entryDiv);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  /**
   * เปิด Modal คู่มือการเล่นและสารานุกรมการ์ด (Phase 14)
   * หยุดเกมชั่วคราวและกลับมาเล่นต่อเมื่อปิด
   */
  openManualModal() {
    this.addLogEntry('⏸️ เปิดคู่มือการเล่น (หยุดเกมชั่วคราว)', 'warn');
    GameGuideModal.show({
      isGameActive: true,
      onClose: () => {
        this.addLogEntry('▶️ ปิดคู่มือการเล่น (กลับเข้าสู่การแข่งขัน)', 'success');
      },
    });
  }

  /**
   * เรนเดอร์เนื้อหาหน้าคู่มือการเล่นใน Modal
   */
  renderManualContent() {
    const totalPages = this.manualPages.length;
    const currentUrl = this.manualPages[this.currentManualIndex] || '';

    this.openModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">📖 คู่มือการเล่นเกม Cyber Board Game</h3>
          <button class="btn-close-modal" id="btn-close-game-manual">✕</button>
        </div>
        <div class="modal-body manual-viewer-body">
          <div class="manual-image-container">
            <img 
              src="${currentUrl}" 
              alt="คู่มือการเล่น หน้าที่ ${this.currentManualIndex + 1}" 
              class="manual-image"
              id="game-manual-current-img"
            />
          </div>

          <div class="manual-controls">
            <button class="btn-manual-nav" id="btn-game-prev-page" ${this.currentManualIndex === 0 ? 'disabled' : ''}>
              ◀ หน้าก่อนหน้า
            </button>

            <span class="manual-page-counter">
              หน้าที่ ${this.currentManualIndex + 1} / ${totalPages}
            </span>

            <button class="btn-manual-nav" id="btn-game-next-page" ${this.currentManualIndex === totalPages - 1 ? 'disabled' : ''}>
              หน้าถัดไป ▶
            </button>
          </div>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-game-manual');
    const prevBtn = document.getElementById('btn-game-prev-page');
    const nextBtn = document.getElementById('btn-game-next-page');

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
   * เปิด Modal ตั้งค่าเสียงและการแสดงผล
   */
  openSettingsModal() {
    const bgmVal = Math.round((soundManager.bgmVolume || 0.6) * 100);
    const sfxVal = Math.round((soundManager.sfxVolume || 0.8) * 100);
    const isBgmMuted = soundManager.bgmMuted;
    const isSfxMuted = soundManager.sfxMuted;

    this.openModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">⚙️ ตั้งค่าระบบ (Audio & Animation Settings)</h3>
          <button class="btn-close-modal" id="btn-close-game-settings">✕</button>
        </div>
        <div class="modal-body">
          <div class="setting-item">
            <div class="setting-label">
              <span>🎵 เสียงเพลงประกอบ (BGM) <span id="game-bgm-vol-text">${bgmVal}%</span></span>
              <span class="setting-desc">ปรับระดับเสียงเพลงพื้นหลัง</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; margin-top: 0.3rem;">
              <input type="range" min="0" max="100" value="${bgmVal}" class="slider-control" id="game-slider-bgm" style="flex: 1;" />
              <label style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" id="game-chk-bgm-mute" ${isBgmMuted ? 'checked' : ''} /> ปิดเสียง
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🔔 เสียงเอฟเฟกต์ (SFX) <span id="game-sfx-vol-text">${sfxVal}%</span></span>
              <span class="setting-desc">ปรับระดับเสียงการทอดลูกเต๋าและการเดิน</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; width: 100%; margin-top: 0.3rem;">
              <input type="range" min="0" max="100" value="${sfxVal}" class="slider-control" id="game-slider-sfx" style="flex: 1;" />
              <label style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.25rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" id="game-chk-sfx-mute" ${isSfxMuted ? 'checked' : ''} /> ปิดเสียง
              </label>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🎲 การจัดลำดับคนเดิน (ใครเดินก่อน)</span>
              <span class="setting-desc">สลับระหว่างสุ่มสลับลำดับคนเดินให้ออโต้ หรือให้ทอยลูกเต๋าวัดแต้มกำหนดลำดับ</span>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.35rem; width: 100%;">
              <button class="btn-manual-nav ${this.orderMode === 'RANDOM' ? 'active-mode-btn' : ''}" id="btn-toggle-order-random" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.82rem; ${this.orderMode === 'RANDOM' ? 'background: #f59e0b; color: #0f172a; font-weight: 800;' : ''}">
                🔀 สุ่มลำดับออโต้
              </button>
              <button class="btn-manual-nav ${this.orderMode === 'DICE' ? 'active-mode-btn' : ''}" id="btn-toggle-order-dice" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.82rem; ${this.orderMode === 'DICE' ? 'background: #f59e0b; color: #0f172a; font-weight: 800;' : ''}">
                🎲 ทอยเต๋ากำหนดลำดับ
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🏆 กติกาการเข้าเส้นชัย</span>
              <span class="setting-desc">สลับระหว่างใครถึงก่อนชนะ หรือต้องทอยแต้มให้พอดี</span>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.35rem; width: 100%;">
              <button class="btn-manual-nav ${this.finishMode === 'FIRST_REACH' ? 'active-mode-btn' : ''}" id="btn-toggle-finish-first" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.82rem; ${this.finishMode === 'FIRST_REACH' ? 'background: #10b981; color: #ffffff; font-weight: 800;' : ''}">
                🏁 ใครถึงก่อนชนะ
              </button>
              <button class="btn-manual-nav ${this.finishMode === 'EXACT_ROLL' ? 'active-mode-btn' : ''}" id="btn-toggle-finish-exact" style="flex: 1; padding: 0.4rem 0.8rem; font-size: 0.82rem; ${this.finishMode === 'EXACT_ROLL' ? 'background: #10b981; color: #ffffff; font-weight: 800;' : ''}">
                🎯 ต้องทอยแต้มพอดี
              </button>
            </div>
          </div>

          <div class="setting-item">
            <div class="setting-label">
              <span>🖥️ โหมดแสดงผลเต็มหน้าจอ</span>
              <span class="setting-desc">สลับเข้าสู่โหมด Fullscreen</span>
            </div>
            <button class="btn-manual-nav" id="btn-game-toggle-fullscreen" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
              เต็มหน้าจอ
            </button>
          </div>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-game-settings');
    if (closeBtn) closeBtn.onclick = () => this.closeModal();

    const btnOrderRandom = document.getElementById('btn-toggle-order-random');
    const btnOrderDice = document.getElementById('btn-toggle-order-dice');
    const btnFinishFirst = document.getElementById('btn-toggle-finish-first');
    const btnFinishExact = document.getElementById('btn-toggle-finish-exact');

    if (btnOrderRandom) {
      btnOrderRandom.onclick = () => {
        this.orderMode = 'RANDOM';
        gameStateStore.setState({ orderMode: 'RANDOM' });
        this.addLogEntry('⚙️ สลับรูปแบบการจัดลำดับเป็น: [🔀 สุ่มลำดับออโต้]', 'info');
        if (this.phase === 'DETERMINE_ORDER') {
          this.checkAndApplyRandomOrder();
        }
        this.updateHeaderStatusUI();
        this.updateDiceAreaUI();
        this.openSettingsModal();
      };
    }

    if (btnOrderDice) {
      btnOrderDice.onclick = () => {
        this.orderMode = 'DICE';
        gameStateStore.setState({ orderMode: 'DICE' });
        this.addLogEntry('⚙️ สลับรูปแบบการจัดลำดับเป็น: [🎲 ทอยเต๋ากำหนดลำดับ]', 'info');
        this.updateHeaderStatusUI();
        this.updateDiceAreaUI();
        this.openSettingsModal();
      };
    }

    if (btnFinishFirst) {
      btnFinishFirst.onclick = () => {
        this.finishMode = 'FIRST_REACH';
        gameStateStore.setState({ finishMode: 'FIRST_REACH' });
        this.addLogEntry('⚙️ สลับกติกาเข้าเส้นชัยเป็น: [🏁 ใครเข้าเส้นชัยก่อนชนะ]', 'info');
        this.updateHeaderStatusUI();
        this.openSettingsModal();
      };
    }

    if (btnFinishExact) {
      btnFinishExact.onclick = () => {
        this.finishMode = 'EXACT_ROLL';
        gameStateStore.setState({ finishMode: 'EXACT_ROLL' });
        this.addLogEntry('⚙️ สลับกติกาเข้าเส้นชัยเป็น: [🎯 ต้องทอยแต้มพอดีเส้นชัย]', 'info');
        this.updateHeaderStatusUI();
        this.openSettingsModal();
      };
    }

    const sliderBgm = document.getElementById('game-slider-bgm');
    const chkBgmMute = document.getElementById('game-chk-bgm-mute');
    const bgmVolText = document.getElementById('game-bgm-vol-text');

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

    const sliderSfx = document.getElementById('game-slider-sfx');
    const chkSfxMute = document.getElementById('game-chk-sfx-mute');
    const sfxVolText = document.getElementById('game-sfx-vol-text');

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

    const fsBtn = document.getElementById('btn-game-toggle-fullscreen');
    if (fsBtn) {
      fsBtn.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        }
      };
    }
  }

  /**
   * ยืนยันการกลับสู่เมนูหลัก
   */
  confirmBackToMenu() {
    this.openModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">🚪 ออกจากกระดานเกม</h3>
          <button class="btn-close-modal" id="btn-close-back-confirm">✕</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 1.5rem;">
          <p style="color: #cbd5e1; font-size: 1rem; margin-bottom: 1.5rem; line-height: 1.6;">
            คุณต้องการย้อนกลับไปยังหน้าเมนูหลักหรือไม่?
          </p>
          <div style="display: flex; gap: 1rem; justify-content: center;">
            <button class="btn-action btn-back-menu" id="btn-confirm-exit" style="background: #ef4444; color: white;">
              ยืนยันกลับเมนูหลัก
            </button>
            <button class="btn-action btn-back-menu" id="btn-cancel-exit">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    `);

    const closeBtn = document.getElementById('btn-close-back-confirm');
    const cancelBtn = document.getElementById('btn-cancel-exit');
    const confirmBtn = document.getElementById('btn-confirm-exit');

    if (closeBtn) closeBtn.onclick = () => this.closeModal();
    if (cancelBtn) cancelBtn.onclick = () => this.closeModal();
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        this.closeModal();
        if (networkManager.getMode() === NETWORK_MODES.ONLINE && networkManager.roomManager.currentRoom) {
          const roomCode = networkManager.roomManager.currentRoom.roomCode;
          const myPlayerId = this.getMyPlayerId();
          const packet = PacketManager.createPacket(
            PACKET_TYPES.LEAVE_ROOM,
            { roomCode, playerId: myPlayerId },
            myPlayerId
          );
          networkManager.sendPacket(packet);
          networkManager.roomManager.currentRoom = null;
        }

        if (typeof this.onBack === 'function') {
          this.onBack();
        } else {
          gameStateStore.setState({ phase: 'MAIN_MENU', isGameStarted: false });
        }
      };
    }
  }

  /**
   * เปิด Modal พร้อมใส่ Content
   * @param {string} htmlContent - HTML ของ Modal Body & Header
   */
  openModal(htmlContent) {
    const overlay = this.container.querySelector('#game-modal-overlay');
    const modalContainer = this.container.querySelector('#game-modal-container');

    if (overlay && modalContainer) {
      modalContainer.innerHTML = htmlContent;
      overlay.classList.remove('hidden');
    }
  }

  /**
   * ปิด Modal
   */
  closeModal() {
    const overlay = this.container.querySelector('#game-modal-overlay');
    const modalContainer = this.container.querySelector('#game-modal-container');

    if (overlay) {
      overlay.classList.add('hidden');
    }
    if (modalContainer) {
      modalContainer.innerHTML = '';
    }

    this.checkAutoRoll();
  }

  /**
   * สลับเทิร์นไปยังผู้เล่นคนถัดไป และตรวจสอบโทษหยุดเดิน (Phase 12)
   */
  finishTurnAndPassToNext() {
    this.isStartOfTurnCardDraw = false;
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.isMoving = false;

    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.checkAndStartTurn();
  }

  /**
   * เริ่มต้นเทิร์นใหม่สำหรับ activePlayer ปัจจุบัน (พร้อมตรวจเช็กโทษหยุดเดิน 1 ตา และการสุ่มการ์ดต้นเทิร์น)
   */
  checkAndStartTurn() {
    const activePlayer = this.players[this.activePlayerIndex];
    if (!activePlayer) return;

    this.updatePlayersListUI();
    this.updateHeaderStatusUI();

    const tokensLayer = this.container.querySelector('#board-tokens-layer');
    if (tokensLayer) {
      tokensLayer.innerHTML = this.renderBoardTokens();
    }

    // ตรวจสอบโทษหยุดเดิน 1 ตา (SKIP_TURN)
    const activeSkipCount = activePlayer.skipTurnCount || activePlayer.skipTurns || 0;
    if (activeSkipCount > 0) {
      activePlayer.skipTurns = activeSkipCount;
      activePlayer.pauseTurns = activeSkipCount;
      activePlayer.skipTurnCount = activeSkipCount;

      this.addLogEntry(`⛔ [${activePlayer.name}] ติดโทษหยุดเดิน ${activeSkipCount} ตา -> กำลังข้ามเทิร์นนี้อัตโนมัติ`, 'warn');

      this.updatePlayersListUI();

      const statusText = this.container.querySelector('#dice-status-text');
      if (statusText) {
        statusText.textContent = `⛔ [${activePlayer.name}] ติดโทษหยุดเดิน ${activeSkipCount} ตา — กำลังข้ามเทิร์น...`;
      }

      const btnRoll = this.container.querySelector('#btn-roll-dice');
      if (btnRoll) {
        btnRoll.disabled = true;
        btnRoll.classList.add('rolling-disabled');
      }

      // รอ 1.8 วินาทีให้ผู้เล่นเห็นแจ้งเตือนแล้วสลับคนถัดไป
      setTimeout(() => {
        if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
          const myPlayerId = this.getMyPlayerId();
          if (myPlayerId && String(activePlayer.id) === String(myPlayerId)) {
            const roomCode = networkManager.roomManager.currentRoom?.roomCode;
            const packet = PacketManager.createPacket(
              'REQUEST_SKIP_TURN',
              { roomCode, playerId: myPlayerId },
              myPlayerId
            );
            networkManager.sendPacket(packet);
          }
        } else {
          activePlayer.skipTurns = Math.max(0, activePlayer.skipTurns - 1);
          activePlayer.pauseTurns = activePlayer.skipTurns;
          activePlayer.skipTurnCount = activePlayer.skipTurns;
          this.finishTurnAndPassToNext();
        }
      }, 1800);
      return;
    }

    // ตรวจสอบกรณีถอยหลังมาตกช่องสุ่มการ์ด (GREEN / RED) จากผลของการ์ดถอยหลังทุกคน (ALL_BACKWARD)
    const currentTile = this.tileManager.getTile(activePlayer.position);
    const isCardTile = currentTile.type === 'GREEN' || currentTile.type === 'RED';

    if (activePlayer.pendingCardDraw) {
      this.addLogEntry(`🃏 [${activePlayer.name}] ถอยหลังมาตก${currentTile?.typeName || 'ช่องการ์ด'} (${currentTile?.name || ''}) -> ต้องสุ่มการ์ดทันทีเมื่อเริ่มตา ก่อนจะทอยลูกเต๋า!`, 'warn');

      if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
        this.updateDiceAreaUI();
        const statusText = this.container.querySelector('#dice-status-text');
        if (statusText) {
          statusText.textContent = `🃏 [${activePlayer.name}] คุณมีสิทธิ์สุ่มการ์ดค้างอยู่! กดปุ่มเพื่อสุ่มการ์ด`;
        }
      } else {
        activePlayer.pendingCardDraw = false;
        const statusText = this.container.querySelector('#dice-status-text');
        if (statusText) {
          statusText.textContent = `🃏 [${activePlayer.name}] ตกช่องสุ่ม -> กำลังสุ่มการ์ดก่อนทอยลูกเต๋า...`;
        }
        const btnRoll = this.container.querySelector('#btn-roll-dice');
        if (btnRoll) {
          btnRoll.disabled = true;
          btnRoll.classList.add('rolling-disabled');
        }
        this.isStartOfTurnCardDraw = true;

        setTimeout(() => {
          this.tileManager.checkTileAndTriggerEvent(activePlayer, activePlayer.position);
        }, 600);
      }
      return;
    }

    // เทิร์นปกติ
    this.isStartOfTurnCardDraw = false;
    this.isMoving = false;
    this.updateDiceAreaUI();

    this.showTurnBannerAnimation(activePlayer);

    this.addLogEntry(`➡️ ถึงคิวการเล่นของ: [${activePlayer.name}]`, 'system');
  }

  /**
   * ระบบเดินหน้าจาก Effect การ์ด (Phase 12 & 13)
   */
  async movePlayerForwardByEffect(player, stepsCount, options = {}) {
    this.isMoving = true;
    const colorNameStr = player.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🏃 [${player.name} (${colorNameStr})] กำลังก้าวเดินหน้า ${stepsCount} ช่อง จาก Effect การ์ด...`, 'info');

    const movementInfo = finishManager.calculateMovementPath(player.position, stepsCount, this.finishMode);
    const path = movementInfo.path;

    for (let i = 0; i < path.length; i++) {
      const nextPos = path[i];

      if (movementInfo.didBounce && i === movementInfo.bounceAtStepIndex + 1) {
        this.addLogEntry(`💥 [${player.name}] แต้มเกินเส้นชัย! เด้งถอยหลัง...`, 'warn');
        if (window.soundManager) window.soundManager.play('bounce');
      }

      player.position = nextPos;
      this.updateSingleTokenDOMPosition(player);

      if (window.soundManager) {
        const isBouncingNow = movementInfo.didBounce && i > movementInfo.bounceAtStepIndex;
        window.soundManager.play(isBouncingNow ? 'bounce' : 'move');
      }

      await new Promise((resolve) => setTimeout(resolve, 320));
    }

    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.updatePlayersListUI();

    // ตรวจสอบการเข้าเส้นชัย (Winner Check)
    if (finishManager.isWinner(player)) {
      this.addLogEntry(`🏆🎉 [${player.name}] เดินเข้าเส้นชัยสำเร็จที่ช่องที่ ${player.position}! เป็นผู้ชนะการแข่งขัน!`, 'success');
      finishManager.showVictoryModal(player, this.players, this);
      this.isMoving = false;
      return;
    }

    this.addLogEntry(`📍 [${player.name}] เดินหน้ามาหยุดที่ช่องที่ ${player.position}`, 'success');

    // ตรวจสอบประเภทช่องที่หยุดจากการ์ด
    if (!options.skipTileEvent) {
      const currentLandedTile = this.tileManager.getTile(player.position);
      if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
        if (currentLandedTile && (currentLandedTile.type === 'GREEN' || currentLandedTile.type === 'RED')) {
          this.tileManager.checkTileAndTriggerEvent(player, player.position);
        }
      } else {
        this.tileManager.checkTileAndTriggerEvent(player, player.position);
      }
    }
    this.isMoving = false;
  }

  /**
   * ระบบถอยหลังจาก Effect การ์ด (Phase 12 & 13)
   */
  async movePlayerBackwardByEffect(player, stepsCount, options = {}) {
    this.isMoving = true;
    const colorNameStr = player.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🔙 [${player.name} (${colorNameStr})] กำลังก้าวถอยหลัง ${stepsCount} ช่อง จาก Effect การ์ด...`, 'warn');

    for (let step = 1; step <= stepsCount; step++) {
      player.position = Math.max(0, player.position - 1);
      this.updateSingleTokenDOMPosition(player);
      if (window.soundManager) window.soundManager.play('move');
      await new Promise((resolve) => setTimeout(resolve, 320));
    }

    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.updatePlayersListUI();
    this.addLogEntry(`📍 [${player.name}] ถอยหลังมาหยุดที่ช่องที่ ${player.position}`, 'warn');

    // ตรวจสอบประเภทช่องที่หยุดจากการ์ด
    if (!options.skipTileEvent) {
      const landedBackwardTile = this.tileManager.getTile(player.position);
      if (networkManager.getMode() === NETWORK_MODES.ONLINE) {
        if (landedBackwardTile && (landedBackwardTile.type === 'GREEN' || landedBackwardTile.type === 'RED')) {
          this.tileManager.checkTileAndTriggerEvent(player, player.position);
        }
      } else {
        this.tileManager.checkTileAndTriggerEvent(player, player.position);
      }
    }
    this.isMoving = false;
  }

  /**
   * ระบบส่งถอยหลังกลับจุดเริ่มต้น (ช่องที่ 0) จาก Effect การ์ด (Phase 12)
   */
  async movePlayerToStartByEffect(player, options = {}) {
    this.isMoving = true;
    const colorNameStr = player.colorName ? `สี${player.colorName}` : '';
    this.addLogEntry(`🏁 [${player.name} (${colorNameStr})] กำลังถอยหลังกลับไปยังจุดเริ่มต้น (ช่องที่ 0)...`, 'warn');

    while (player.position !== 0) {
      player.position = Math.max(0, player.position - 1);
      this.updateSingleTokenDOMPosition(player);
      if (window.soundManager) window.soundManager.play('move');
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.updatePlayersListUI();
    this.addLogEntry(`🏁 [${player.name}] ถอยกลับมาถึงจุดเริ่มต้น (ช่องที่ 0) เรียบร้อยแล้ว`, 'warn');

    // ตรวจสอบประเภทช่องที่หยุดจากการ์ด (ช่องที่ 0 คือจุดเริ่มต้น / ช่องปกติ)
    if (!options.skipTileEvent && !options.isOnline) {
      this.tileManager.checkTileAndTriggerEvent(player, player.position);
    }
    this.isMoving = false;
  }

  /**
   * ระบบให้ผู้เล่นทุกคนถอยหลัง (รวมผู้เล่นที่เปิดได้การ์ด) (Phase 12 & 13)
   */
  async moveAllPlayersBackward(stepsCount, options = {}) {
    this.isMoving = true;
    this.addLogEntry(`💥 ผู้เล่นทุกคนต้องถอยหลัง ${stepsCount} ช่อง!`, 'warn');

    const activePlayer = this.players[this.activePlayerIndex];

    for (const player of this.players) {
      const pColorStr = player.colorName ? `สี${player.colorName}` : '';
      this.addLogEntry(`🔙 [${player.name} (${pColorStr})] ถอยหลัง ${stepsCount} ช่อง...`, 'warn');

      for (let step = 1; step <= stepsCount; step++) {
        player.position = Math.max(0, player.position - 1);
        this.updateSingleTokenDOMPosition(player);
        if (window.soundManager) window.soundManager.play('move');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      // ตรวจสอบว่าถอยมาตกช่องสุ่มการ์ด (GREEN / RED) หรือไม่
      const tile = this.tileManager.getTile(player.position);
      if (tile.type === 'GREEN' || tile.type === 'RED') {
        if (player.id !== activePlayer?.id) {
          player.pendingCardDraw = true;
          this.addLogEntry(`⚠️ [${player.name}] ถอยหลังมาตก${tile.typeName} (${tile.name}) -> จะต้องสุ่มการ์ดเมื่อถึงตา!`, 'warn');
        }
      }
    }

    gameStateStore.setState({
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
    });

    this.updatePlayersListUI();
    this.addLogEntry(`✅ ผู้เล่นทุกคนถอยหลังครบเรียบร้อยแล้ว`, 'success');
    this.isMoving = false;
  }

  /**
   * คืนค่า Player ID ของเครื่องปัจจุบันอย่างปลอดภัย
   */
  getMyPlayerId() {
    return (
      this.myPlayerId ||
      networkManager.myPlayerId ||
      (networkManager.roomManager?.myPlayer ? networkManager.roomManager.myPlayer.id : null) ||
      gameStateStore.getState()?.myPlayerId ||
      null
    );
  }

  /**
   * ลงทะเบียนรับฟัง Event เครือข่ายออนไลน์สำหรับ GameBoardScreen
   */
  initNetworkEvents() {
    this.networkUnsubscribers = [];

    // 1. รับฟังผลการทอยเต๋ารีลไทม์จากเซิร์ฟเวอร์
    const unsubDice = eventBus.on('DICE_ROLLED', async (payload) => {
      if (!payload) return;

      const myPlayerId = this.getMyPlayerId();
      const { isDetermineOrder, playerId, playerName, dice, oldPosition, newPosition, steps, cardDrawn, nextActivePlayerIndex, phase } = payload;

      // ค้นหาผู้เล่นฝั่ง Client
      const targetPlayer = this.players.find(p => String(p.id) === String(playerId) || p.name === playerName) || this.players[this.activePlayerIndex];

      if (!targetPlayer) return;

      // ล็อคสเตทการเดินและการทอยเพื่อไม่ให้ State Sync มาแทรกกลางคัน
      this.isMoving = true;
      this.isDiceRolling = true;

      // --- กรณี A) DETERMINE_ORDER Phase (ทอยเต๋าสุ่มลำดับ) ---
      if (isDetermineOrder || this.phase === 'DETERMINE_ORDER') {
        this.handleRollStart();
        await new Promise(r => setTimeout(r, 1200));

        const diceCube = this.container.querySelector('#dice-cube');
        if (diceCube) {
          diceCube.classList.remove('rolling-3d');
          diceCube.setAttribute('data-side', dice.total || 1);
        }

        if (window.soundManager) window.soundManager.play('dice');

        targetPlayer.orderRollScore = dice.total;
        this.addLogEntry(`🎲 [${targetPlayer.name}] ทอยลูกเต๋ากำหนดลำดับได้ ${dice.total} แต้ม`, 'info');

        this.currentRollPlayerIndex++;
        this.isDiceRolling = false;
        this.isMoving = false;

        if (this.currentRollPlayerIndex < this.players.length) {
          this.updatePlayersListUI();
          this.updateHeaderStatusUI();
          this.updateDiceAreaUI();
        } else {
          // ครบทุกคน -> เรียงลำดับผู้เล่นตามคะแนน
          const originalOrder = this.players.map(p => p.id);
          this.players.sort((a, b) => {
            const scoreDiff = (b.orderRollScore || 0) - (a.orderRollScore || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id);
          });
          this.players.forEach((p, idx) => {
            p.turnOrderRank = idx + 1;
            p.turnOrder = `ลำดับที่ ${idx + 1}`;
          });
          this.phase = 'PLAYING';
          this.activePlayerIndex = 0;
          this.updatePlayersListUI();
          this.updateHeaderStatusUI();
          this.updateDiceAreaUI();
          this.showOrderSummaryModal();
        }
        return;
      }

      // --- กรณี B) PLAYING Phase (การเล่นตามเทิร์น) ---
      let landedTile = null;
      try {
        if (payload.isStartOfTurnCardDraw || steps === 0) {
          this.addLogEntry(`🃏 [${targetPlayer.name}] สุ่มการ์ดค้างต้นเทิร์นก่อนทอยเต๋า...`, 'info');
        } else {
          this.handleRollStart();
          await new Promise(r => setTimeout(r, 1200));

          const diceCube = this.container.querySelector('#dice-cube');
          if (diceCube) {
            diceCube.classList.remove('rolling-3d');
            diceCube.setAttribute('data-side', dice.total || 1);
          }

          if (window.soundManager) window.soundManager.play('dice');

          this.addLogEntry(`🎲 [${targetPlayer.name}] ทอยเต๋าได้ ${dice.total} แต้ม`, 'info');
          this.isDiceRolling = false;

          // กำหนดตำแหน่งเริ่มต้นให้ถูกต้องก่อนเริ่มก้าวเดิน
          if (oldPosition !== undefined) {
            targetPlayer.position = oldPosition;
            this.updateSingleTokenDOMPosition(targetPlayer);
          }

          // เรียกแอนิเมชันก้าวเดินทีละช่อง (ล็อคสเตท isMoving ไว้จนกว่าจะประมวลผลการ์ดเสร็จ)
          await this.movePlayerSteps(targetPlayer, steps || dice.total, { skipTileEvent: true, keepMovingFlag: true });

          // เอฟเฟกต์แสง Glow ประจำช่องที่หยุดเดิน
          landedTile = this.tileManager.getTile(targetPlayer.position);
          if (landedTile) {
            this.applyTileGlowEffect(landedTile.id, landedTile.type);
          }
        }

        // ถ้าเป็นการ์ดสถานการณ์ ให้แสดง Modal การ์ด และเมื่อกดยืนยันให้ทำงาน Effect การ์ด
        if (cardDrawn) {
          const isGood = cardDrawn.category === 'GOOD' || cardDrawn.type === 'good' || (cardDrawn.effect && cardDrawn.effect.steps > 0);
          this.addLogEntry(`${isGood ? '🟢' : '🔴'} [${targetPlayer.name}] เปิดได้การ์ด: "${cardDrawn.title}" (${cardDrawn.description || ''})`, isGood ? 'success' : 'warn');

          const isOwner = Boolean(myPlayerId && String(targetPlayer.id) === String(myPlayerId));

          await new Promise((resolve) => {
            let resolved = false;

            const executeCardConfirm = async () => {
              if (resolved) return;
              resolved = true;
              if (unsubConfirm) unsubConfirm();
              if (unsubFlip) unsubFlip();
              CardModal.close();
              try {
                await effectSystem.applyCardEffect({
                  card: cardDrawn,
                  player: targetPlayer,
                  screen: this,
                  isOnline: networkManager.getMode() === NETWORK_MODES.ONLINE,
                });
              } catch (err) {
                console.error('[GameBoardScreen] Error applying card effect:', err);
              }
              resolve();
            };

            let unsubConfirm = null;
            let unsubFlip = null;

            if (!isOwner) {
              unsubConfirm = eventBus.on('CARD_CONFIRMED', (pktPayload) => {
                if (pktPayload && String(pktPayload.playerId) === String(targetPlayer.id)) {
                  executeCardConfirm();
                }
              });

              unsubFlip = eventBus.on('CARD_FLIPPED', (pktPayload) => {
                if (pktPayload && String(pktPayload.playerId) === String(targetPlayer.id)) {
                  CardModal.flipCard();
                }
              });
            }

            CardModal.show({
              card: cardDrawn,
              player: targetPlayer,
              isOwner,
              onFlip: () => {
                if (isOwner && networkManager.getMode() === NETWORK_MODES.ONLINE) {
                  const roomCode = networkManager.roomManager.currentRoom?.roomCode;
                  const packet = PacketManager.createPacket(
                    PACKET_TYPES.REQUEST_FLIP_CARD,
                    { roomCode, playerId: myPlayerId, card: cardDrawn },
                    myPlayerId
                  );
                  networkManager.sendPacket(packet);
                }
              },
              onConfirm: async () => {
                if (isOwner && networkManager.getMode() === NETWORK_MODES.ONLINE) {
                  const roomCode = networkManager.roomManager.currentRoom?.roomCode;
                  const packet = PacketManager.createPacket(
                    PACKET_TYPES.REQUEST_CONFIRM_CARD,
                    { roomCode, playerId: myPlayerId, card: cardDrawn },
                    myPlayerId
                  );
                  networkManager.sendPacket(packet);
                }
                executeCardConfirm();
              }
            });
          });
        } else if (landedTile && (landedTile.type === 'GREEN' || landedTile.type === 'RED')) {
          // หากตกช่องสีเขียว หรือ สีแดง ให้แสดงหน้าต่างรางวัล/บทลงโทษ
          const isOnline = networkManager.getMode() === NETWORK_MODES.ONLINE;
          if (isOnline) {
            // ในโหมด Online: ให้เฉพาะผู้เล่นที่ได้รับผลรางวัล/บทลงโทษเป็นคนกดยืนยันปิดป็อปอัพ
            // และส่งสัญญาณให้ป็อปอัพของผู้เล่นคนอื่นในห้องปิดอัตโนมัติพร้อมกันทันที
            const isOwner = Boolean(myPlayerId && targetPlayer && String(targetPlayer.id) === String(myPlayerId));

            await new Promise((resolve) => {
              let resolved = false;
              let unsubTileConfirm = null;

              const executeTileDismiss = () => {
                if (resolved) return;
                resolved = true;
                if (unsubTileConfirm) unsubTileConfirm();
                this.closeTileEventModal();
                resolve();
              };

              if (!isOwner) {
                unsubTileConfirm = eventBus.on('NET_TILE_EVENT_CONFIRMED', (pktPayload) => {
                  if (pktPayload && String(pktPayload.playerId) === String(targetPlayer.id)) {
                    executeTileDismiss();
                  }
                });

                // Safety timeout ป้องกันกรณีผู้เล่นที่ได้รับผลรางวัล/บทลงโทษกดช้ามากหรือหลุดการเชื่อมต่อ
                setTimeout(() => {
                  if (!resolved) executeTileDismiss();
                }, 15000);
              }

              this.showTileEventModal(targetPlayer, landedTile, () => {
                if (isOwner) {
                  const roomCode = networkManager.roomManager.currentRoom?.roomCode;
                  const packet = PacketManager.createPacket(
                    PACKET_TYPES.REQUEST_CONFIRM_TILE_EVENT,
                    { roomCode, playerId: myPlayerId, tileId: landedTile.id || landedTile.tile },
                    myPlayerId
                  );
                  networkManager.sendPacket(packet);
                }
                executeTileDismiss();
              }, { isOwner });
            });

            // ตรวจสอบการเคลื่อนที่ต่อเนื่องจากผลของ Effect เช่น MOVE_FORWARD, MOVE_BACKWARD, GOTO_START
            if (landedTile.effect) {
              const effect = landedTile.effect;
              if (effect.type === 'MOVE_FORWARD' && effect.steps > 0) {
                await this.movePlayerForwardByEffect(targetPlayer, effect.steps, { skipTileEvent: true });
              } else if (effect.type === 'MOVE_BACKWARD' && effect.steps > 0) {
                await this.movePlayerBackwardByEffect(targetPlayer, effect.steps, { skipTileEvent: true });
              } else if (effect.type === 'GOTO_START') {
                await this.movePlayerToStartByEffect(targetPlayer, { skipTileEvent: true });
              } else if (effect.type === 'SKIP_TURN') {
                targetPlayer.skipTurnCount = (targetPlayer.skipTurnCount || 0) + (effect.turns || 1);
                targetPlayer.skipTurns = targetPlayer.skipTurnCount;
                targetPlayer.pauseTurns = targetPlayer.skipTurnCount;
              }
            }
          } else {
            this.tileManager.checkTileAndTriggerEvent(targetPlayer, targetPlayer.position);
          }
        }
      } catch (err) {
        console.error('[GameBoardScreen] Exception during DICE_ROLLED handling:', err);
      } finally {
        // อัปเดต Active Player ถัดไป
        if (nextActivePlayerIndex !== undefined) {
          this.activePlayerIndex = nextActivePlayerIndex;
        }
        if (phase) {
          this.phase = phase;
        }

        this.isMoving = false;
        this.isDiceRolling = false;
        this.updatePlayersListUI();
        this.updateHeaderStatusUI();
        this.updateDiceAreaUI();

        // ตรวจสอบคิวเทิร์นถัดไป
        const nextActivePlayer = this.players[this.activePlayerIndex];
        if (nextActivePlayer && this.phase === 'PLAYING') {
          this.checkAndStartTurn();
        }
      }
    });

    // 2. รับฟังการ Sync State จากเซิร์ฟเวอร์
    const unsubState = eventBus.on('NET_STATE_SYNCED', (netState) => {
      if (!netState || !netState.players) return;

      // ป้องกัน State Sync แทรกระหว่างกำลังเล่นแอนิเมชันทอยเต๋า/ก้าวเดิน/เปิดการ์ด
      if (this.isMoving || this.isDiceRolling) return;

      if (netState.phase === 'REMATCH_READY_CHECK') {
        this.phase = 'REMATCH_READY_CHECK';
        this.showRematchReadyModal();
        return;
      }

      // หากก่อนหน้านี้เปิด Rematch Modal ค้างอยู่แล้วเกมเริ่ม ให้ปิด Modal
      const modalOverlay = this.container.querySelector('#game-modal-overlay');
      if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
        const rematchModal = this.container.querySelector('.rematch-ready-modal');
        if (rematchModal && (netState.phase === 'PLAYING' || netState.phase === 'DETERMINE_ORDER')) {
          this.closeModal();
        }
      }

      if (netState.phase) {
        this.phase = netState.phase;
      }
      if (netState.currentRollPlayerIndex !== undefined) {
        this.currentRollPlayerIndex = netState.currentRollPlayerIndex;
      }

      // ปรับลำดับผู้เล่นใน Client ให้ตรงกับ Server Room State เสมอ
      const updatedPlayersList = netState.players.map((netP) => {
        let localP = this.players.find(p => String(p.id) === String(netP.id) || p.name === netP.name);
        if (localP) {
          localP.id = netP.id;
          localP.position = netP.position;
          this.updateSingleTokenDOMPosition(localP);
          localP.isOnline = netP.isOnline;
          localP.status = netP.isOnline ? 'ปกติ' : 'ขาดการเชื่อมต่อ';
          if (netP.pendingCardDraw !== undefined) localP.pendingCardDraw = netP.pendingCardDraw;
          if (netP.orderRollScore !== undefined) localP.orderRollScore = netP.orderRollScore;
          if (netP.turnOrderRank !== undefined) localP.turnOrderRank = netP.turnOrderRank;
          if (netP.turnOrder !== undefined) localP.turnOrder = netP.turnOrder;
          if (netP.skipTurnCount !== undefined) {
            localP.skipTurnCount = netP.skipTurnCount;
            localP.skipTurns = netP.skipTurnCount;
            localP.pauseTurns = netP.skipTurnCount;
          }
          return localP;
        }
        return netP;
      });
      this.players = updatedPlayersList;

      const prevActiveIndex = this.activePlayerIndex;
      if (netState.activePlayerIndex !== undefined) {
        this.activePlayerIndex = netState.activePlayerIndex;
      }

      this.updatePlayersListUI();
      this.updateHeaderStatusUI();
      this.updateDiceAreaUI();

      if (prevActiveIndex !== this.activePlayerIndex && this.phase === 'PLAYING') {
        this.checkAndStartTurn();
      }
    });

    // 3. รับฟัง Error ป้องกันเด้งกลับหน้าเดิม พร้อมแจ้งเตือนผู้เล่น
    const unsubError = eventBus.on('NET_ERROR', (msg) => {
      this.isDiceRolling = false;
      this.isMoving = false;
      this.updateDiceAreaUI();

      const st = gameStateStore.getState();
      const inGame = st.isGameStarted || ['IN_GAME', 'READY_TO_ROLL', 'ROLLING', 'MOVE', 'DRAW_CARD', 'DETERMINE_ORDER', 'PLAYING', 'END_TURN', 'BUY_ASSET', 'PAY_RENT', 'BANKRUPT', 'GAME_OVER', 'REMATCH_READY_CHECK'].includes(st.phase);
      if (!inGame) return;

      const statusText = this.container.querySelector('#dice-status-text');
      if (statusText) {
        statusText.textContent = `⚠️ ${msg}`;
        statusText.style.color = '#f87171';
        setTimeout(() => {
          if (statusText) statusText.style.color = '';
        }, 3000);
      }

      this.addLogEntry(`⚠️ ข้อผิดพลาดออนไลน์: ${msg}`, 'warn');
    });

    // 4. รับฟังเมื่อผู้สร้างห้องปิดห้องหรือออกจากห้อง
    const unsubRoomClosed = eventBus.on('NET_ROOM_CLOSED', (payload) => {
      console.log('[GameBoardScreen] 🚪 ผู้สร้างห้องปิดห้องแล้ว:', payload);
      this.closeModal();
      this.showHostClosedRoomModal(payload?.message || 'ผู้สร้างห้องปิดห้องแล้ว');
    });

    // 5. รับฟังเมื่อมีผู้เล่นขอ Rematch เล่นใหม่อีกครั้ง
    const unsubRematch = eventBus.on('NET_REMATCH_REQUESTED', (payload) => {
      console.log('[GameBoardScreen] 🔄 ได้รับคำขอเล่นใหม่อีกครั้ง:', payload);
      this.phase = 'REMATCH_READY_CHECK';
      if (payload?.room?.players) {
        this.players = payload.room.players;
      }
      this.showRematchReadyModal();
    });

    // 6. รับฟังการอัปเดตห้องในโหมด Rematch
    const unsubRoomUpdate = eventBus.on('NET_ROOM_UPDATED', (room) => {
      if (room && room.phase === 'REMATCH_READY_CHECK') {
        this.phase = 'REMATCH_READY_CHECK';
        if (room.players) {
          this.players = room.players;
        }
        this.showRematchReadyModal();
      } else if (room && room.isGameStarted && room.phase !== 'REMATCH_READY_CHECK' && room.phase !== 'GAME_OVER') {
        const rematchModal = this.container.querySelector('.rematch-ready-modal');
        if (rematchModal) {
          this.closeModal();
          this.players.forEach(p => {
            p.position = 0;
            this.updateSingleTokenDOMPosition(p);
          });
          this.addLogEntry('🎮 การแข่งขันรอบใหม่เริ่มต้นขึ้นแล้ว!', 'success');
          this.updatePlayersListUI();
          this.updateHeaderStatusUI();
          this.updateDiceAreaUI();
          if (this.orderMode === 'RANDOM' && this.shouldShowRandomOrderSummary) {
            this.showOrderSummaryModal();
          }
        }
      }
    });

    this.networkUnsubscribers = [unsubDice, unsubState, unsubError, unsubRoomClosed, unsubRematch, unsubRoomUpdate];
  }

  /**
   * แสดง Modal ยืนยันความพร้อมของผู้เล่นทุกคนก่อนเริ่มเกมใหม่อีกครั้ง (Rematch Readiness Check)
   */
  showRematchReadyModal() {
    const currentRoom = networkManager.roomManager.currentRoom;
    const roomPlayers = currentRoom?.players || this.players;
    const currentMyPlayerId = this.getMyPlayerId();
    const myPlayer = roomPlayers.find(p => String(p.id) === String(currentMyPlayerId)) || roomPlayers[0];
    const isHost = Boolean(currentRoom?.hostId === currentMyPlayerId || myPlayer?.isHost);

    const allOthersReady = roomPlayers.filter(p => !p.isHost).every(p => p.isReady);
    const canStartGame = isHost && roomPlayers.length >= 2 && allOthersReady;

    const playersListHtml = roomPlayers.map((p) => {
      const isPlayerHost = Boolean(p.isHost || p.id === currentRoom?.hostId);
      const isMe = String(p.id) === String(currentMyPlayerId);
      const colorObj = TOKEN_COLORS.find(c => c.id === p.colorId) || {};
      const colorHex = p.color || colorObj.hex || '#3b82f6';
      const isPlayerReady = Boolean(p.isReady || isPlayerHost);

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: rgba(30, 41, 59, 0.7); border: 1px solid ${isPlayerReady ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.3)'}; border-radius: 12px; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${colorHex}; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 0 10px ${colorHex}88; color: white;">
              ${colorObj.icon || '♟️'}
            </div>
            <div style="text-align: left;">
              <div style="font-weight: 700; color: #f8fafc; font-size: 0.95rem; display: flex; align-items: center; gap: 0.35rem;">
                ${p.name}
                ${isMe ? '<span style="font-size: 0.72rem; background: rgba(59,130,246,0.3); color: #60a5fa; border: 1px solid rgba(59,130,246,0.5); padding: 1px 6px; border-radius: 999px;">คุณ</span>' : ''}
                ${isPlayerHost ? '<span style="font-size: 0.72rem; background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.5); padding: 1px 6px; border-radius: 999px;">👑 เจ้าของห้อง</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: #94a3b8;">
                สี${p.colorName || colorObj.name || 'ตัวหมาก'}
              </div>
            </div>
          </div>
          <div>
            ${isPlayerReady 
              ? '<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #059669; color: white; padding: 4px 12px; border-radius: 999px; font-weight: bold; font-size: 0.82rem; box-shadow: 0 0 8px rgba(16,185,129,0.5);">🟢 พร้อมแล้ว</span>'
              : '<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4); padding: 4px 12px; border-radius: 999px; font-weight: bold; font-size: 0.82rem;">⏳ ยังไม่พร้อม</span>'
            }
          </div>
        </div>
      `;
    }).join('');

    const modalHtml = `
      <div class="modal-content rematch-ready-modal" style="max-width: 520px; width: 95%; background: #0f172a; border: 2px solid #3b82f6; box-shadow: 0 0 30px rgba(59, 130, 246, 0.35); border-radius: 16px; overflow: hidden; color: #f8fafc;">
        <div class="modal-header" style="background: linear-gradient(135deg, #1e293b, #0f172a); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.5rem;">🔄</span>
            <div>
              <h3 class="modal-title" style="color: #60a5fa; font-size: 1.2rem; font-weight: 800; margin: 0;">
                ความพร้อมก่อนเริ่มเกมรอบใหม่
              </h3>
              <p style="color: #94a3b8; font-size: 0.82rem; margin: 0.2rem 0 0 0;">
                รหัสห้อง: <strong style="color: #fbbf24; letter-spacing: 1px;">${currentRoom?.roomCode || 'N/A'}</strong> | ยืนยันความพร้อมก่อนเริ่มเกม
              </p>
            </div>
          </div>
        </div>

        <div class="modal-body" style="padding: 1.25rem; max-height: 55vh; overflow-y: auto;">
          <div style="margin-bottom: 1rem;">
            <div style="font-size: 0.85rem; font-weight: 600; color: #cbd5e1; margin-bottom: 0.5rem;">
              รายชื่อผู้เล่นในห้อง (${roomPlayers.length}/6 คน)
            </div>
            ${playersListHtml}
          </div>

          ${!allOthersReady ? `
            <div style="padding: 0.65rem 0.85rem; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; color: #fef08a; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
              <span>⏳</span>
              <span>กำลังรอให้ผู้เล่นทุกคนในห้องกดยืนยันความพร้อม...</span>
            </div>
          ` : `
            <div style="padding: 0.65rem 0.85rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; color: #a7f3d0; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
              <span>✅</span>
              <span>ผู้เล่นทุกคนพร้อมแล้ว! ${isHost ? 'คุณสามารถกดเริ่มเกมได้ทันที' : 'รอเจ้าของห้องกดเริ่มเกม'}</span>
            </div>
          `}

          <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-top: 0.5rem;">
            ${!isHost ? `
              <button 
                id="btn-rematch-toggle-ready" 
                class="btn-action" 
                style="padding: 0.75rem 1.25rem; font-size: 0.95rem; font-weight: 700; background: ${myPlayer?.isReady ? 'rgba(239, 68, 68, 0.8)' : 'linear-gradient(135deg, #10b981, #059669)'}; color: white; border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 14px ${myPlayer?.isReady ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.4)'};"
              >
                ${myPlayer?.isReady ? '⏳ ยกเลิกความพร้อม' : '✅ ฉันพร้อมเล่นแล้ว'}
              </button>
            ` : `
              <button 
                id="btn-rematch-start-game" 
                class="btn-action" 
                ${!canStartGame ? 'disabled' : ''}
                style="padding: 0.75rem 1.25rem; font-size: 0.95rem; font-weight: 700; background: ${canStartGame ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'rgba(100, 116, 139, 0.4)'}; color: ${canStartGame ? 'white' : '#94a3b8'}; border: none; border-radius: 10px; cursor: ${canStartGame ? 'pointer' : 'not-allowed'}; box-shadow: ${canStartGame ? '0 4px 14px rgba(59,130,246,0.4)' : 'none'}; opacity: ${canStartGame ? '1' : '0.6'};"
              >
                ${canStartGame ? '🚀 เริ่มเกมใหม่อีกครั้ง' : '⏳ รอผู้เล่นทุกคนพร้อม...'}
              </button>
            `}

            <button 
              id="btn-rematch-leave-room" 
              class="btn-action" 
              style="padding: 0.65rem 1rem; font-size: 0.88rem; background: rgba(30, 41, 59, 0.8); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; cursor: pointer;"
            >
              🚪 ${isHost ? 'ปิดห้องและกลับสู่เมนูหลัก' : 'ออกจากห้องกลับสู่เมนูหลัก'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.openModal(modalHtml);

    // Event binding for Rematch Ready Modal
    const btnToggleReady = document.getElementById('btn-rematch-toggle-ready');
    if (btnToggleReady) {
      btnToggleReady.onclick = () => {
        const room = networkManager.roomManager.currentRoom;
        if (!room) return;
        const packet = PacketManager.createPacket(PACKET_TYPES.READY, {
          roomCode: room.roomCode,
          playerId: currentMyPlayerId,
          isReady: !myPlayer?.isReady
        });
        networkManager.sendPacket(packet);
      };
    }

    const btnStartGame = document.getElementById('btn-rematch-start-game');
    if (btnStartGame && canStartGame) {
      btnStartGame.onclick = () => {
        btnStartGame.disabled = true;
        btnStartGame.textContent = '⏳ กำลังเริ่มเกม...';
        const room = networkManager.roomManager.currentRoom;
        if (!room) return;
        const packet = PacketManager.createPacket(PACKET_TYPES.START_GAME, {
          roomCode: room.roomCode,
          playerId: currentMyPlayerId
        });
        networkManager.sendPacket(packet);
      };
    }

    const btnLeaveRoom = document.getElementById('btn-rematch-leave-room');
    if (btnLeaveRoom) {
      btnLeaveRoom.onclick = () => {
        const room = networkManager.roomManager.currentRoom;
        if (room) {
          const packet = PacketManager.createPacket(PACKET_TYPES.LEAVE_ROOM, {
            roomCode: room.roomCode,
            playerId: currentMyPlayerId
          });
          networkManager.sendPacket(packet);
        }
        networkManager.roomManager.currentRoom = null;
        this.closeModal();
        if (typeof this.onBack === 'function') {
          this.onBack();
        } else {
          gameStateStore.setState({ phase: 'MAIN_MENU', isGameStarted: false });
        }
      };
    }
  }

  /**
   * แสดง Modal แจ้งเตือนเมื่อผู้สร้างห้องปิดห้องหรือออกจากห้อง
   * @param {string} message 
   */
  showHostClosedRoomModal(message = 'ผู้สร้างห้องปิดห้องแล้ว') {
    this.openModal(`
      <div class="modal-content host-closed-modal" style="max-width: 440px; width: 95%; background: #0f172a; border: 2px solid #ef4444; box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); border-radius: 16px; overflow: hidden; text-align: center; color: #f8fafc;">
        <div class="modal-body" style="padding: 2rem 1.5rem;">
          <div style="font-size: 3.5rem; margin-bottom: 0.75rem; filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.6));">
            ⚠️
          </div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: #f87171; margin: 0 0 0.5rem 0;">
            ${message}
          </h3>
          <p style="color: #cbd5e1; font-size: 0.9rem; line-height: 1.6; margin: 0 0 1.5rem 0;">
            ผู้สร้างห้องได้ออกจากห้องแล้ว ระบบได้ทำการปิดห้องและนำคุณกลับสู่หน้าเมนูหลัก
          </p>
          <button 
            id="btn-host-closed-ok" 
            class="btn-action" 
            style="width: 100%; padding: 0.75rem 1.5rem; font-size: 1rem; font-weight: 700; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 10px; cursor: pointer; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);"
          >
            ตกลงกลับสู่หน้าหลัก
          </button>
        </div>
      </div>
    `);

    const okBtn = document.getElementById('btn-host-closed-ok');
    if (okBtn) {
      okBtn.onclick = () => {
        this.closeModal();
        if (typeof this.onBack === 'function') {
          this.onBack();
        } else {
          gameStateStore.setState({ phase: 'MAIN_MENU', isGameStarted: false });
        }
      };
    }
  }

  /**
   * ยกเลิก Listeners เมื่อปิดหน้าจอกระดาน
   */
  destroy() {
    if (this.networkUnsubscribers) {
      this.networkUnsubscribers.forEach((fn) => fn && fn());
      this.networkUnsubscribers = [];
    }
  }
}
