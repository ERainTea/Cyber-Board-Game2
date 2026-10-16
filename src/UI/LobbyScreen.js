/**
 * @file src/UI/LobbyScreen.js
 * @description หน้าจอห้องรอเล่นออนไลน์ (Multiplayer Lobby UI) ภาษาไทย
 * รองรับการสร้างห้อง, กำหนดชื่อห้อง (ไม่ซ้ำกับรหัส 6 หลัก), ตั้งรหัสผ่านห้อง, 
 * เลือกโหมดจัดลำดับคนเดิน (ทอยเต๋าวัดแต้ม / สุ่มอัตโนมัติ / เรียงตามลำดับเข้าห้อง),
 * และเลือกกติกาเข้าเส้นชัย (ทอยลงพอดี / ถึงก่อนชนะ) โดย Host
 */

import { gameStateStore } from '../GameState.js';
import { networkManager, NETWORK_MODES } from '../Network/NetworkManager.js';
import { CONNECTION_STATUS } from '../Network/ConnectionManager.js';
import { PacketManager, PACKET_TYPES } from '../Network/PacketManager.js';
import { eventBus } from '../Engine/EventBus.js';
import { TOKEN_COLORS } from './PieceSelectScreen.js';

export class LobbyScreen {
  /**
   * @param {HTMLElement} container 
   * @param {Function} onBackToMenu 
   */
  constructor(container, onBackToMenu) {
    this.container = container;
    this.onBackToMenu = onBackToMenu;

    this.playerName = localStorage.getItem('multiplayer_player_name') || `ผู้เล่น_${Math.floor(1000 + Math.random() * 9000)}`;
    this.playerColor = '#3b82f6';
    
    // Create Room Form State
    this.createRoomName = '';
    this.createHasPassword = false;
    this.createPassword = '';
    this.createOrderMode = 'DICE'; // 'DICE' | 'RANDOM' | 'JOIN'
    this.createFinishMode = 'EXACT_ROLL'; // 'EXACT_ROLL' | 'FIRST_REACH'

    // Join Room State
    this.inputRoomCode = '';
    this.inputJoinPassword = '';
    this.errorMessage = '';
    this.publicRooms = [];
    this.isLoadingRooms = false;
    this.roomsPollTimer = null;

    // Password Modal Prompt State
    this.passwordModalRoom = null; // { roomCode, roomName }

    this.unsubscribers = [];
  }

  /**
   * ดึงรายการห้องที่เปิดอยู่จากเซิร์ฟเวอร์
   */
  async fetchPublicRooms() {
    this.isLoadingRooms = true;
    try {
      const res = await fetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        this.publicRooms = data.rooms || [];
      }
    } catch (err) {
      console.warn('[LobbyScreen] ไม่สามารถดึงรายการห้องได้:', err);
    } finally {
      this.isLoadingRooms = false;
      const currentRoom = networkManager.roomManager.currentRoom;
      if (!currentRoom && gameStateStore.getState().phase === 'MULTIPLAYER_LOBBY') {
        const listContainer = this.container.querySelector('#public-rooms-list-container');
        if (listContainer) {
          listContainer.innerHTML = this.renderPublicRoomsList();
          this.bindRoomListEvents();
        }
      }
    }
  }

  /**
   * เริ่มต้นการเชื่อมต่อ Network และ Event Listeners
   */
  initNetwork() {
    networkManager.setMode(NETWORK_MODES.ONLINE);
    networkManager.connectionManager.connect();

    this.fetchPublicRooms();
    this.roomsPollTimer = setInterval(() => {
      if (!networkManager.roomManager.currentRoom && gameStateStore.getState().phase === 'MULTIPLAYER_LOBBY') {
        this.fetchPublicRooms();
      }
    }, 4000);

    // ดักฟัง Event จาก Network Layer
    const unsubRoomJoined = eventBus.on('NET_ROOM_JOINED', () => {
      if (gameStateStore.getState().phase !== 'MULTIPLAYER_LOBBY') return;
      this.errorMessage = '';
      this.passwordModalRoom = null;
      this.render();
    });

    const unsubRoomUpdated = eventBus.on('NET_ROOM_UPDATED', (updatedRoom) => {
      console.log('[LobbyScreen] 📩 ได้รับ Event NET_ROOM_UPDATED:', updatedRoom?.isGameStarted ? '🎮 เกมเริ่มแล้ว' : 'ยังไม่เริ่ม');
      if (updatedRoom && updatedRoom.isGameStarted) {
        console.log('[LobbyScreen] 🚀 สับเปลี่ยนหน้าจอเข้าสู่เกม (phase -> IN_GAME)');
        this.destroy();
        gameStateStore.setState({ phase: 'IN_GAME', isGameStarted: true });
        return;
      }
      if (gameStateStore.getState().phase !== 'MULTIPLAYER_LOBBY') return;
      this.render();
    });

    const unsubStateSynced = eventBus.on('NET_STATE_SYNCED', (state) => {
      console.log('[LobbyScreen] 📩 ได้รับ Event NET_STATE_SYNCED:', state?.isGameStarted ? '🎮 เกมเริ่มแล้ว' : 'ยังไม่เริ่ม');
      if (state && state.isGameStarted) {
        console.log('[LobbyScreen] 🚀 สับเปลี่ยนหน้าจอเข้าสู่เกม (phase -> IN_GAME)');
        this.destroy();
        gameStateStore.setState({ phase: 'IN_GAME', isGameStarted: true });
      } else {
        if (gameStateStore.getState().phase === 'MULTIPLAYER_LOBBY') {
          this.render();
        }
      }
    });

    const unsubError = eventBus.on('NET_ERROR', (msg, payload) => {
      if (gameStateStore.getState().phase !== 'MULTIPLAYER_LOBBY') return;
      this.errorMessage = typeof msg === 'string' ? msg : (msg?.message || 'เกิดข้อผิดพลาด');
      
      // กรณีห้องต้องการรหัสผ่าน
      if (payload?.requiresPassword || (typeof msg === 'object' && msg?.requiresPassword)) {
        const targetCode = payload?.roomCode || msg?.roomCode || this.inputRoomCode;
        const targetName = payload?.roomName || msg?.roomName || `ห้อง ${targetCode}`;
        this.passwordModalRoom = { roomCode: targetCode, roomName: targetName };
      }
      
      this.render();
    });

    const unsubStatus = networkManager.connectionManager.onStatusChange(() => {
      if (gameStateStore.getState().phase !== 'MULTIPLAYER_LOBBY') return;
      this.render();
    });

    const unsubRoomClosed = eventBus.on('NET_ROOM_CLOSED', (payload) => {
      if (gameStateStore.getState().phase !== 'MULTIPLAYER_LOBBY') return;
      this.errorMessage = payload?.message || 'ผู้สร้างห้องปิดห้องแล้ว';
      this.render();
      this.showHostClosedNotification(payload?.message || 'ผู้สร้างห้องปิดห้องแล้ว');
    });

    this.unsubscribers = [unsubRoomJoined, unsubRoomUpdated, unsubStateSynced, unsubError, unsubStatus, unsubRoomClosed];
  }

  /**
   * แสดง Popup แจ้งเตือนเมื่อผู้สร้างห้องปิดห้อง
   */
  showHostClosedNotification(message = 'ผู้สร้างห้องปิดห้องแล้ว') {
    const existing = document.getElementById('lobby-host-closed-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'lobby-host-closed-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(4px);';
    modal.innerHTML = `
      <div style="background: #0f172a; border: 2px solid #ef4444; box-shadow: 0 0 30px rgba(239,68,68,0.4); border-radius: 16px; max-width: 420px; width: 90%; padding: 1.75rem; text-align: center; color: white;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">⚠️</div>
        <h3 style="font-size: 1.3rem; font-weight: 800; color: #f87171; margin-bottom: 0.5rem;">${message}</h3>
        <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5;">ผู้สร้างห้องได้ปิดห้องหรือออกจากห้องแล้ว ระบบนำคุณกลับสู่หน้ารายการห้อง</p>
        <button id="btn-close-host-closed-notice" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 10px; font-weight: bold; cursor: pointer;">รับทราบ</button>
      </div>
    `;
    document.body.appendChild(modal);

    const btn = document.getElementById('btn-close-host-closed-notice');
    if (btn) {
      btn.onclick = () => {
        modal.remove();
        this.fetchPublicRooms();
      };
    }
  }

  /**
   * ทำลายและยกเลิก Listeners เมื่อปิดหน้าจอ
   */
  destroy() {
    if (this.roomsPollTimer) {
      clearInterval(this.roomsPollTimer);
      this.roomsPollTimer = null;
    }
    this.unsubscribers.forEach((fn) => fn && fn());
    this.unsubscribers = [];
  }

  /**
   * เรนเดอร์หน้าจอ Lobby
   */
  render() {
    const connStatus = networkManager.connectionManager.status;
    const rtt = networkManager.connectionManager.latencyManager.getRTT();
    const currentRoom = networkManager.roomManager.currentRoom;
    const myPlayerId = networkManager.myPlayerId;

    if (currentRoom && currentRoom.isGameStarted) {
      console.log('[LobbyScreen] พบสถานะเกมเริ่มแล้ว กำลังเปลี่ยนเข้าสู่ IN_GAME');
      this.destroy();
      gameStateStore.setState({ phase: 'IN_GAME' });
      return;
    }

    let statusBg = '#ef4444';
    let statusText = 'ขาดการเชื่อมต่อ';

    if (connStatus === CONNECTION_STATUS.CONNECTED) {
      statusBg = '#10b981';
      statusText = 'เชื่อมต่อสำเร็จ';
    } else if (connStatus === CONNECTION_STATUS.CONNECTING) {
      statusBg = '#f59e0b';
      statusText = 'กำลังเชื่อมต่อ...';
    } else if (connStatus === CONNECTION_STATUS.RECONNECTING) {
      statusBg = '#f59e0b';
      statusText = 'กำลังต่อสายใหม่...';
    }

    this.container.innerHTML = `
      <div class="lobby-container" style="min-height: 100vh; background: radial-gradient(circle at top, #1e293b 0%, #0f172a 100%); color: white; padding: 1.5rem; display: flex; flex-direction: column; align-items: center; font-family: sans-serif;">
        <!-- Network HUD Status Header -->
        <div style="width: 100%; max-width: 900px; display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.85); padding: 0.75rem 1.25rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); margin-bottom: 1.5rem; backdrop-filter: blur(12px); box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: ${statusBg}; box-shadow: 0 0 10px ${statusBg};"></div>
            <span style="font-weight: bold; font-size: 0.95rem; color: #f8fafc;">${statusText}</span>
            <span style="font-size: 0.85rem; color: #38bdf8; font-family: monospace;">(Ping: ${rtt} ms)</span>
          </div>

          <button id="btn-back-main" style="background: rgba(51, 65, 85, 0.8); color: #f8fafc; border: 1px solid #475569; padding: 0.55rem 1.1rem; border-radius: 10px; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: all 0.2s ease;">
            ⬅ กลับเมนูหลัก
          </button>
        </div>

        <!-- Alert Error Message -->
        ${this.errorMessage ? `
          <div style="width: 100%; max-width: 900px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 0.85rem 1.25rem; border-radius: 12px; margin-bottom: 1.25rem; font-size: 0.95rem; text-align: center; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <span>⚠️</span> <span>${this.errorMessage}</span>
          </div>
        ` : ''}

        <div style="width: 100%; max-width: 900px; background: rgba(30, 41, 59, 0.9); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 2rem; box-shadow: 0 25px 35px -5px rgba(0,0,0,0.6); backdrop-filter: blur(16px);">
          ${!currentRoom ? this.renderLobbySetup() : this.renderRoomView(currentRoom, myPlayerId)}
        </div>

        <!-- Password Prompt Modal -->
        ${this.passwordModalRoom ? this.renderPasswordModal() : ''}
      </div>
    `;

    this.bindEvents(currentRoom, myPlayerId);
  }

  /**
   * เรนเดอร์ฟอร์มตั้งชื่อ และสร้าง/เข้าห้อง
   */
  renderLobbySetup() {
    return `
      <div style="text-align: center; margin-bottom: 1.75rem;">
        <h2 style="font-size: 2rem; font-weight: 900; color: #fbbf24; margin-bottom: 0.4rem; letter-spacing: 0.5px; text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);">
          🌐 โหมดเล่นออนไลน์ (Multiplayer Online)
        </h2>
        <p style="color: #cbd5e1; font-size: 0.95rem;">เล่นแบบเรียลไทม์กับเพื่อน สร้างห้องพร้อมตั้งค่ากติกา หรือเข้าร่วมห้องเปิดอยู่</p>
      </div>

      <!-- User Profile Input -->
      <div style="background: rgba(15, 23, 42, 0.8); padding: 1.25rem 1.5rem; border-radius: 14px; border: 1px solid #334155; margin-bottom: 1.5rem;">
        <label style="display: block; font-size: 0.9rem; font-weight: bold; color: #f8fafc; margin-bottom: 0.6rem;">
          👤 ชื่อผู้เล่นของคุณ (Player Name):
        </label>
        <div style="display: flex; gap: 0.75rem;">
          <input 
            type="text" 
            id="input-player-name" 
            value="${this.playerName}" 
            placeholder="ป้อนชื่อผู้เล่นของคุณ..." 
            style="flex: 1; padding: 0.85rem 1rem; background: #1e293b; border: 1px solid #475569; border-radius: 10px; color: white; font-size: 1.05rem; font-weight: 600; outline: none; box-sizing: border-box;"
          />
          <button id="btn-random-name" style="background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 0.85rem 1.2rem; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 0.9rem; white-space: nowrap;">
            🎲 สุ่มชื่อ
          </button>
        </div>
      </div>

      <!-- Action Boxes Grid -->
      <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.25rem; margin-bottom: 1.75rem;">
        <!-- Create Room Box (With Full Settings & Password) -->
        <div style="background: linear-gradient(145deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <span style="font-size: 1.6rem;">👑</span>
              <h3 style="color: #34d399; font-size: 1.2rem; font-weight: 800; margin: 0;">สร้างห้องใหม่ (Host Settings)</h3>
            </div>
            <p style="color: #cbd5e1; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.4;">
              กำหนดชื่อห้อง รหัสผ่าน และกติกาการแข่งขันสำหรับผู้เล่นทุกคนในห้อง
            </p>

            <!-- 1. Room Name Input -->
            <div style="margin-bottom: 0.85rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.3rem;">
                🏷️ ชื่อห้อง (ต้องไม่เป็นรหัส 6 หลัก):
              </label>
              <input 
                type="text" 
                id="input-create-room-name" 
                placeholder="เช่น ห้องประลอง Cyber, ศึกชิงแชมป์..." 
                value="${this.createRoomName}"
                style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: white; font-size: 0.9rem; outline: none; box-sizing: border-box;"
              />
            </div>

            <!-- 2. Password Toggle & Input -->
            <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 10px; border: 1px solid #334155; margin-bottom: 0.85rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 700; color: #fbbf24; cursor: pointer;">
                <input type="checkbox" id="check-create-password" ${this.createHasPassword ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;" />
                <span>🔒 ตั้งรหัสผ่านห้อง (Private Room)</span>
              </label>

              ${this.createHasPassword ? `
                <div style="margin-top: 0.5rem;">
                  <input 
                    type="password" 
                    id="input-create-password" 
                    placeholder="ป้อนรหัสผ่านห้อง..." 
                    value="${this.createPassword}"
                    style="width: 100%; padding: 0.55rem 0.75rem; background: #1e293b; border: 1px solid #f59e0b; border-radius: 6px; color: white; font-size: 0.85rem; outline: none; box-sizing: border-box;"
                  />
                </div>
              ` : ''}
            </div>

            <!-- 3. Turn Order Mode -->
            <div style="margin-bottom: 0.85rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.4rem;">
                🎲 การจัดลำดับคนเดิน:
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4rem;">
                <button type="button" class="btn-select-order ${this.createOrderMode === 'DICE' ? 'active' : ''}" data-order="DICE" style="background: ${this.createOrderMode === 'DICE' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${this.createOrderMode === 'DICE' ? '#34d399' : '#334155'}; padding: 0.45rem 0.3rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center;">
                  🎲 ทอยเต๋าวัดแต้ม
                </button>
                <button type="button" class="btn-select-order ${this.createOrderMode === 'RANDOM' ? 'active' : ''}" data-order="RANDOM" style="background: ${this.createOrderMode === 'RANDOM' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${this.createOrderMode === 'RANDOM' ? '#34d399' : '#334155'}; padding: 0.45rem 0.3rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center;">
                  🔀 สุ่มอัตโนมัติ
                </button>
                <button type="button" class="btn-select-order ${this.createOrderMode === 'JOIN' ? 'active' : ''}" data-order="JOIN" style="background: ${this.createOrderMode === 'JOIN' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${this.createOrderMode === 'JOIN' ? '#34d399' : '#334155'}; padding: 0.45rem 0.3rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center;">
                  📋 ตามลำดับเข้า
                </button>
              </div>
            </div>

            <!-- 4. Finish Mode -->
            <div style="margin-bottom: 1.25rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.4rem;">
                🏆 กติกาการเข้าเส้นชัย:
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
                <button type="button" class="btn-select-finish ${this.createFinishMode === 'EXACT_ROLL' ? 'active' : ''}" data-finish="EXACT_ROLL" style="background: ${this.createFinishMode === 'EXACT_ROLL' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${this.createFinishMode === 'EXACT_ROLL' ? '#34d399' : '#334155'}; padding: 0.45rem 0.3rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center;">
                  🎯 ทอยแต้มลงพอดี
                </button>
                <button type="button" class="btn-select-finish ${this.createFinishMode === 'FIRST_REACH' ? 'active' : ''}" data-finish="FIRST_REACH" style="background: ${this.createFinishMode === 'FIRST_REACH' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${this.createFinishMode === 'FIRST_REACH' ? '#34d399' : '#334155'}; padding: 0.45rem 0.3rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; text-align: center;">
                  🏁 ใครถึงก่อนชนะ
                </button>
              </div>
            </div>
          </div>

          <button id="btn-create-room" style="width: 100%; padding: 0.95rem; background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; font-size: 1rem; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); transition: all 0.2s ease;">
            ➕ สร้างห้องและเปิดรอผู้เล่น
          </button>
        </div>

        <!-- Join Room Box -->
        <div style="background: linear-gradient(145deg, rgba(59, 130, 246, 0.12), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 16px; padding: 1.5rem; text-align: center; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-size: 2.25rem; margin-bottom: 0.5rem;">🔑</div>
            <h3 style="color: #60a5fa; font-size: 1.25rem; font-weight: 800; margin-top: 0; margin-bottom: 0.4rem;">เข้าร่วมห้องด้วยรหัส</h3>
            <p style="color: #cbd5e1; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.4;">ป้อนรหัสห้อง 6 หลักเพื่อเข้าเล่นกับเพื่อน</p>
            
            <div style="margin-bottom: 0.85rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.3rem; text-align: left;">
                รหัสห้อง 6 หลัก:
              </label>
              <input 
                type="text" 
                id="input-room-code" 
                placeholder="รหัสห้อง 6 หลัก..." 
                value="${this.inputRoomCode}"
                maxlength="6"
                style="width: 100%; padding: 0.75rem; text-align: center; font-size: 1.25rem; font-weight: 900; font-family: monospace; letter-spacing: 4px; text-transform: uppercase; background: #0f172a; border: 2px solid #3b82f6; border-radius: 10px; color: #fbbf24; box-sizing: border-box; outline: none;"
              />
            </div>

            <div style="margin-bottom: 1.25rem;">
              <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.3rem; text-align: left;">
                รหัสผ่านห้อง (ถ้ามี):
              </label>
              <input 
                type="password" 
                id="input-join-password" 
                placeholder="รหัสผ่านห้อง (ถ้ามี)..." 
                value="${this.inputJoinPassword}"
                style="width: 100%; padding: 0.65rem 0.85rem; text-align: center; font-size: 0.95rem; background: #0f172a; border: 1px solid #475569; border-radius: 8px; color: white; box-sizing: border-box; outline: none;"
              />
            </div>
          </div>

          <button id="btn-join-room" style="width: 100%; padding: 0.95rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; font-size: 1rem; box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3); transition: all 0.2s ease;">
            🚀 เข้าร่วมห้อง
          </button>
        </div>
      </div>

      <!-- Public Rooms Browser Section -->
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #334155; border-radius: 14px; padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h4 style="font-size: 1.05rem; font-weight: 800; color: #fbbf24; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <span>📋</span> <span>รายการห้องที่กำลังเปิดรับผู้เล่น (Open Rooms)</span>
          </h4>
          <button id="btn-refresh-rooms" style="background: #1e293b; color: #38bdf8; border: 1px solid #334155; padding: 0.45rem 0.9rem; border-radius: 8px; font-size: 0.85rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 0.3rem;">
            🔄 รีเฟรช
          </button>
        </div>

        <div id="public-rooms-list-container">
          ${this.renderPublicRoomsList()}
        </div>
      </div>
    `;
  }

  /**
   * เรนเดอร์รายการห้องเปิดอยู่
   */
  renderPublicRoomsList() {
    if (this.isLoadingRooms) {
      return `
        <div style="text-align: center; padding: 1.5rem; color: #94a3b8; font-size: 0.9rem;">
          ⏳ กำลังโหลดรายการห้อง...
        </div>
      `;
    }

    const openRooms = this.publicRooms.filter(r => !r.isGameStarted);

    if (openRooms.length === 0) {
      return `
        <div style="text-align: center; padding: 1.5rem; background: rgba(30, 41, 59, 0.4); border-radius: 10px; border: 1px dashed #475569; color: #cbd5e1; font-size: 0.9rem;">
          ขณะนี้ยังไม่มีห้องเปิดอยู่ กดปุ่ม <b>"สร้างห้องและเปิดรอผู้เล่น"</b> ด้านบนเพื่อเริ่มห้องแรกได้เลย!
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${openRooms.map(r => {
          const orderLabel = r.orderMode === 'RANDOM' ? '🔀 สุ่มลำดับ' : r.orderMode === 'JOIN' ? '📋 ตามลำดับเข้า' : '🎲 ทอยเต๋าวัดแต้ม';
          const finishLabel = r.finishMode === 'FIRST_REACH' ? '🏁 ถึงก่อนชนะ' : '🎯 ทอยลงพอดี';

          return `
            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 0.9rem 1.25rem; display: flex; justify-content: space-between; align-items: center; transition: all 0.15s ease;">
              <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span style="font-weight: 800; font-size: 1.05rem; color: #f8fafc;">
                    ${r.roomName || `ห้อง ${r.roomCode}`}
                  </span>
                  <span style="font-family: monospace; font-size: 0.95rem; font-weight: 900; color: #fbbf24; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.3); padding: 0.15rem 0.5rem; border-radius: 6px; letter-spacing: 1px;">
                    #${r.roomCode}
                  </span>
                  ${r.hasPassword ? `
                    <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 6px;">
                      🔒 มีรหัสผ่าน
                    </span>
                  ` : `
                    <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 6px;">
                      🌐 สาธารณะ
                    </span>
                  `}
                </div>

                <div style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; color: #94a3b8;">
                  <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 0.1rem 0.5rem; border-radius: 4px; font-weight: 600;">
                    👥 ${r.playersCount} / ${r.maxPlayers || 6} คน
                  </span>
                  <span>${orderLabel}</span>
                  <span>•</span>
                  <span>${finishLabel}</span>
                </div>
              </div>

              <button 
                class="btn-quick-join-room" 
                data-room-code="${r.roomCode}"
                data-room-name="${r.roomName || `ห้อง ${r.roomCode}`}"
                data-has-password="${r.hasPassword ? 'true' : 'false'}"
                style="background: #3b82f6; color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: all 0.15s ease;"
              >
                ${r.hasPassword ? '🔒 เข้าร่วม' : '🚀 เข้าร่วม'}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  /**
   * เรนเดอร์ Modal ป้อนรหัสผ่านเข้าห้อง
   */
  renderPasswordModal() {
    if (!this.passwordModalRoom) return '';
    return `
      <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem;">
        <div style="background: #1e293b; border: 2px solid #f59e0b; border-radius: 16px; padding: 1.75rem; width: 100%; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔒</div>
          <h3 style="color: #fbbf24; font-size: 1.35rem; font-weight: 800; margin: 0 0 0.4rem 0;">ห้องนี้ต้องใช้รหัสผ่าน</h3>
          <p style="color: #cbd5e1; font-size: 0.9rem; margin-bottom: 1.25rem;">
            กรุณาป้อนรหัสผ่านเพื่อเข้าร่วม <b>${this.passwordModalRoom.roomName}</b> (#${this.passwordModalRoom.roomCode})
          </p>

          <input 
            type="password" 
            id="modal-room-password" 
            placeholder="ป้อนรหัสผ่านห้อง..." 
            autofocus
            style="width: 100%; padding: 0.85rem; font-size: 1.1rem; text-align: center; background: #0f172a; border: 2px solid #f59e0b; border-radius: 10px; color: white; outline: none; margin-bottom: 1.25rem; box-sizing: border-box;"
          />

          <div style="display: flex; gap: 0.75rem;">
            <button id="modal-btn-cancel" style="flex: 1; padding: 0.8rem; background: #334155; color: #cbd5e1; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">
              ยกเลิก
            </button>
            <button id="modal-btn-confirm" style="flex: 1.5; padding: 0.8rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 8px; font-weight: 800; cursor: pointer;">
              🔓 ปลดล็อคเข้าห้อง
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * ผูก Event ให้กับปุ่มในรายการห้อง
   */
  bindRoomListEvents() {
    this.container.querySelectorAll('.btn-quick-join-room').forEach(btn => {
      btn.onclick = () => {
        const code = btn.getAttribute('data-room-code');
        const name = btn.getAttribute('data-room-name');
        const hasPassword = btn.getAttribute('data-has-password') === 'true';

        if (!code) return;

        if (hasPassword) {
          this.passwordModalRoom = { roomCode: code, roomName: name };
          this.render();
        } else {
          this.inputRoomCode = code;
          const packet = PacketManager.createPacket(PACKET_TYPES.JOIN_ROOM, {
            roomCode: code,
            user: { name: this.playerName }
          });
          networkManager.sendPacket(packet);
        }
      };
    });
  }

  /**
   * เรนเดอร์หน้าจอภายในห้องเล่น (Room Lobby View)
   */
  renderRoomView(room, myPlayerId) {
    const isHost = room.hostId === myPlayerId;
    const myPlayer = room.players.find(p => p.id === myPlayerId);
    const readyPlayersCount = room.players.filter(p => p.isReady || p.isHost).length;
    const allReady = room.players.every(p => p.isReady || p.isHost);
    const canStart = isHost && room.players.length >= 2 && allReady;

    const orderTitle = room.orderMode === 'RANDOM' ? '🔀 สุ่มลำดับอัตโนมัติ' : room.orderMode === 'JOIN' ? '📋 เรียงตามลำดับเข้าห้อง' : '🎲 ทอยเต๋าวัดแต้ม';
    const finishTitle = room.finishMode === 'FIRST_REACH' ? '🏁 ใครถึงก่อนชนะ' : '🎯 ทอยแต้มลงพอดี';

    return `
      <!-- Room Code & Name Header -->
      <div style="background: #0f172a; padding: 1.2rem 1.5rem; border-radius: 16px; border: 1px solid #334155; margin-bottom: 1.25rem; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div>
            <h3 style="font-size: 1.35rem; font-weight: 900; color: #f8fafc; margin: 0 0 0.2rem 0; display: flex; align-items: center; gap: 0.5rem;">
              <span>🏠</span> <span>${room.roomName || `ห้อง ${room.roomCode}`}</span>
              ${room.hasPassword ? '<span style="font-size:0.75rem; background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b; padding:0.1rem 0.4rem; border-radius:6px;">🔒 มีรหัสผ่าน</span>' : '<span style="font-size:0.75rem; background:rgba(16,185,129,0.2); color:#34d399; border:1px solid #10b981; padding:0.1rem 0.4rem; border-radius:6px;">🌐 สาธารณะ</span>'}
            </h3>
            <div style="font-size: 0.85rem; color: #94a3b8;">รหัสห้องสำหรับเชิญเพื่อนร่วมเล่น:</div>
          </div>
          <button id="btn-copy-code" style="background: #1e293b; color: #f8fafc; border: 1px solid #475569; padding: 0.6rem 1.1rem; border-radius: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem; transition: all 0.2s ease;">
            📋 คัดลอกรหัส
          </button>
        </div>
        <div style="font-size: 2.25rem; font-weight: 900; color: #fbbf24; font-family: monospace; letter-spacing: 4px; text-shadow: 0 0 15px rgba(251, 191, 36, 0.4);">${room.roomCode}</div>
      </div>

      <!-- Current Room Rules / Host Settings Panel -->
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 1rem 1.25rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
          <span style="font-size: 0.9rem; font-weight: 800; color: #fbbf24; display: flex; align-items: center; gap: 0.4rem;">
            <span>⚙️</span> <span>กติกาการแข่งขันของห้องนี้</span>
          </span>
          ${isHost ? '<span style="font-size: 0.75rem; color: #34d399; background: rgba(16,185,129,0.15); border: 1px solid #10b981; padding: 0.15rem 0.5rem; border-radius: 6px; font-weight: 700;">👑 คุณเป็นผู้ควบคุมกติกา</span>' : ''}
        </div>

        ${isHost ? `
          <!-- Host Interactive Settings Controls -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: rgba(30, 41, 59, 0.6); padding: 0.75rem; border-radius: 10px; border: 1px solid #334155;">
            <div>
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.3rem;">
                🎲 ปรับโหมดลำดับคนเดิน:
              </label>
              <div style="display: flex; gap: 0.3rem;">
                <button type="button" class="btn-host-set-order ${room.orderMode === 'DICE' ? 'active' : ''}" data-order="DICE" style="flex: 1; padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 700; background: ${room.orderMode === 'DICE' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${room.orderMode === 'DICE' ? '#34d399' : '#475569'}; border-radius: 6px; cursor: pointer;">
                  ทอยเต๋า
                </button>
                <button type="button" class="btn-host-set-order ${room.orderMode === 'RANDOM' ? 'active' : ''}" data-order="RANDOM" style="flex: 1; padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 700; background: ${room.orderMode === 'RANDOM' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${room.orderMode === 'RANDOM' ? '#34d399' : '#475569'}; border-radius: 6px; cursor: pointer;">
                  สุ่มออโต้
                </button>
                <button type="button" class="btn-host-set-order ${room.orderMode === 'JOIN' ? 'active' : ''}" data-order="JOIN" style="flex: 1; padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 700; background: ${room.orderMode === 'JOIN' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${room.orderMode === 'JOIN' ? '#34d399' : '#475569'}; border-radius: 6px; cursor: pointer;">
                  ตามลำดับ
                </button>
              </div>
            </div>

            <div>
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.3rem;">
                🏆 ปรับกติกาเข้าเส้นชัย:
              </label>
              <div style="display: flex; gap: 0.3rem;">
                <button type="button" class="btn-host-set-finish ${room.finishMode === 'EXACT_ROLL' ? 'active' : ''}" data-finish="EXACT_ROLL" style="flex: 1; padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 700; background: ${room.finishMode === 'EXACT_ROLL' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${room.finishMode === 'EXACT_ROLL' ? '#34d399' : '#475569'}; border-radius: 6px; cursor: pointer;">
                  ทอยลงพอดี
                </button>
                <button type="button" class="btn-host-set-finish ${room.finishMode === 'FIRST_REACH' ? 'active' : ''}" data-finish="FIRST_REACH" style="flex: 1; padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 700; background: ${room.finishMode === 'FIRST_REACH' ? '#10b981' : '#1e293b'}; color: white; border: 1px solid ${room.finishMode === 'FIRST_REACH' ? '#34d399' : '#475569'}; border-radius: 6px; cursor: pointer;">
                  ถึงก่อนชนะ
                </button>
              </div>
            </div>
          </div>
        ` : `
          <!-- Member Read-Only Settings View -->
          <div style="display: flex; gap: 1rem; color: #cbd5e1; font-size: 0.85rem;">
            <div style="background: rgba(30, 41, 59, 0.7); padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid #334155;">
              <span style="color: #94a3b8;">ลำดับคนเดิน:</span> <b style="color: #38bdf8;">${orderTitle}</b>
            </div>
            <div style="background: rgba(30, 41, 59, 0.7); padding: 0.5rem 0.8rem; border-radius: 8px; border: 1px solid #334155;">
              <span style="color: #94a3b8;">กติกาเข้าเส้นชัย:</span> <b style="color: #34d399;">${finishTitle}</b>
            </div>
          </div>
        `}
      </div>

      <!-- Color Selection Panel Inside Room -->
      <div style="background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem;">
        <label style="display: block; font-size: 0.95rem; font-weight: 800; color: #fbbf24; margin-bottom: 0.75rem;">
          🎨 เลือกสีหมากประจำตัวของคุณ (ล็อคไม่ให้ซ้ำกับผู้เล่นอื่นในห้อง):
        </label>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 0.75rem;">
          ${TOKEN_COLORS.map((c) => {
            const occupant = room.players.find(p => p.colorId === c.id || p.color === c.hex);
            const isMine = occupant && occupant.id === myPlayerId;
            const isTaken = occupant && !isMine;

            let borderStyle = '1px solid #334155';
            let bgStyle = 'rgba(30, 41, 59, 0.7)';
            let cursor = 'pointer';
            let opacity = '1';

            if (isMine) {
              borderStyle = '2px solid #fbbf24';
              bgStyle = 'rgba(245, 158, 11, 0.25)';
            } else if (isTaken) {
              borderStyle = '1px dashed #64748b';
              bgStyle = 'rgba(15, 23, 42, 0.85)';
              cursor = 'not-allowed';
              opacity = '0.55';
            }

            return `
              <button 
                class="room-color-btn"
                data-color-id="${c.id}"
                ${isTaken ? 'disabled' : ''}
                style="background: ${bgStyle}; border: ${borderStyle}; border-radius: 12px; padding: 0.6rem 0.4rem; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: ${cursor}; opacity: ${opacity}; transition: all 0.15s ease;"
              >
                <div style="width: 28px; height: 28px; border-radius: 50%; background: ${c.gradient || c.hex}; border: 2px solid white; box-shadow: 0 0 8px ${c.glow || 'rgba(0,0,0,0.3)'};"></div>
                <span style="font-weight: bold; font-size: 0.85rem; color: #f8fafc;">${c.name}</span>
                ${isMine ? '<span style="font-size: 0.72rem; color: #fbbf24; font-weight: 800;">(ของคุณ)</span>' : ''}
                ${isTaken ? `<span style="font-size: 0.7rem; color: #fca5a5; overflow: hidden; text-overflow: ellipsis; max-width: 90px; white-space: nowrap;">🔒 ${occupant.name}</span>` : ''}
                ${!isMine && !isTaken ? '<span style="font-size: 0.7rem; color: #34d399;">✨ เลือกได้</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Player Cards List -->
      <div style="margin-bottom: 1.5rem;">
        <h3 style="font-size: 1.05rem; font-weight: 800; color: #cbd5e1; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
          <span>👥 รายชื่อผู้เล่นในห้อง (${room.players.length} / ${room.maxPlayers} คน)</span>
          <span style="font-size: 0.85rem; color: #94a3b8; font-weight: normal;">(ต้องการอย่างน้อย 2 คนเพื่อเริ่มเกม)</span>
        </h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.85rem;">
          ${room.players.map(p => {
            const colorObj = TOKEN_COLORS.find(c => c.id === p.colorId || c.hex === p.color) || { gradient: p.color || '#3b82f6' };
            const isMe = p.id === myPlayerId;

            return `
              <div style="background: #0f172a; border: 1.5px solid ${isMe ? '#fbbf24' : '#334155'}; border-radius: 14px; padding: 0.9rem 1rem; display: flex; align-items: center; justify-content: space-between; box-shadow: ${isMe ? '0 0 15px rgba(251, 191, 36, 0.15)' : 'none'};">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 28px; height: 28px; border-radius: 50%; background: ${colorObj.gradient || p.color}; border: 2px solid white; box-shadow: 0 0 8px rgba(255,255,255,0.3);"></div>
                  <div>
                    <div style="font-weight: 800; font-size: 0.95rem; color: #f8fafc;">
                      ${p.name} ${isMe ? '<span style="font-size:0.75rem; color:#fbbf24;">(คุณ)</span>' : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8; display: flex; gap: 0.4rem; margin-top: 0.15rem;">
                      ${p.isHost ? '<span style="color:#f59e0b; background:rgba(245,158,11,0.2); padding:0.1rem 0.4rem; border-radius:4px; font-weight:700;">👑 เจ้าของห้อง</span>' : ''}
                      ${p.isOnline ? '<span style="color:#34d399;">🟢 ออนไลน์</span>' : '<span style="color:#f87171;">🔴 ขาดการเชื่อมต่อ</span>'}
                    </div>
                  </div>
                </div>

                <div>
                  ${p.isHost 
                    ? '<span style="background: rgba(245,158,11,0.2); color: #fbbf24; font-size: 0.8rem; font-weight: 800; padding: 0.3rem 0.6rem; border-radius: 8px; border: 1px solid #f59e0b;">👑 โฮสต์</span>'
                    : p.isReady 
                      ? '<span style="background: rgba(16,185,129,0.2); color: #34d399; font-size: 0.8rem; font-weight: 800; padding: 0.3rem 0.6rem; border-radius: 8px; border: 1px solid #10b981;">✅ พร้อม</span>' 
                      : '<span style="background: rgba(245,158,11,0.2); color: #fbbf24; font-size: 0.8rem; font-weight: 800; padding: 0.3rem 0.6rem; border-radius: 8px; border: 1px solid #f59e0b;">⏳ รอพร้อม</span>'
                  }
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Room Action Controls -->
      <div style="display: flex; gap: 1rem; justify-content: flex-end; align-items: center; padding-top: 0.5rem; border-top: 1px solid #334155;">
        <button id="btn-leave-room" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid #ef4444; padding: 0.9rem 1.4rem; border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 0.95rem; transition: all 0.2s ease;">
          🚪 ออกจากห้อง
        </button>

        ${!isHost ? `
          <button id="btn-toggle-ready" style="background: ${myPlayer?.isReady ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)'}; color: white; border: none; padding: 0.9rem 1.75rem; border-radius: 12px; cursor: pointer; font-weight: 800; font-size: 1.05rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);">
            ${myPlayer?.isReady ? '⏳ ยกเลิกพร้อม' : '✅ พร้อมเล่นเกม'}
          </button>
        ` : `
          <button id="btn-start-game" ${!canStart ? 'disabled' : ''} style="background: ${canStart ? 'linear-gradient(135deg, #10b981, #059669)' : '#475569'}; color: white; border: none; padding: 0.9rem 2rem; border-radius: 12px; cursor: ${canStart ? 'pointer' : 'not-allowed'}; font-weight: 900; font-size: 1.1rem; box-shadow: ${canStart ? '0 10px 20px -3px rgba(16, 185, 129, 0.4)' : 'none'}; transition: all 0.2s ease;">
            🎮 เริ่มเกม (${readyPlayersCount}/${room.players.length} คนพร้อม)
          </button>
        `}
      </div>
    `;
  }

  /**
   * ผูกเหตุการณ์ DOM Elements
   */
  bindEvents(currentRoom, myPlayerId) {
    const btnBackMain = document.getElementById('btn-back-main');
    if (btnBackMain) {
      btnBackMain.onclick = () => {
        this.destroy();
        networkManager.setMode(NETWORK_MODES.OFFLINE);
        if (this.onBackToMenu) this.onBackToMenu();
      };
    }

    // Modal Events (ถ้ามีแสดงอยู่)
    if (this.passwordModalRoom) {
      const modalInput = document.getElementById('modal-room-password');
      const btnConfirm = document.getElementById('modal-btn-confirm');
      const btnCancel = document.getElementById('modal-btn-cancel');

      const handleConfirm = () => {
        const pass = modalInput ? modalInput.value.trim() : '';
        const targetCode = this.passwordModalRoom?.roomCode;
        if (targetCode) {
          const packet = PacketManager.createPacket(PACKET_TYPES.JOIN_ROOM, {
            roomCode: targetCode,
            password: pass,
            user: { name: this.playerName }
          });
          networkManager.sendPacket(packet);
        }
      };

      if (btnConfirm) btnConfirm.onclick = handleConfirm;
      if (modalInput) {
        modalInput.onkeydown = (e) => {
          if (e.key === 'Enter') handleConfirm();
        };
      }
      if (btnCancel) {
        btnCancel.onclick = () => {
          this.passwordModalRoom = null;
          this.render();
        };
      }
    }

    if (!currentRoom) {
      // 1. Player Name Input
      const inputName = document.getElementById('input-player-name');
      if (inputName) {
        inputName.oninput = (e) => {
          this.playerName = e.target.value.trim() || 'ผู้เล่น';
          localStorage.setItem('multiplayer_player_name', this.playerName);
        };
      }

      const btnRandomName = document.getElementById('btn-random-name');
      if (btnRandomName) {
        btnRandomName.onclick = () => {
          const names = ['CyberRunner', 'MatrixHero', 'ZeroHack', 'NeonKnight', 'PixelPulse', 'GhostCode', 'QuantumX', 'ByteMaster'];
          const picked = `${names[Math.floor(Math.random() * names.length)]}_${Math.floor(100 + Math.random() * 900)}`;
          this.playerName = picked;
          localStorage.setItem('multiplayer_player_name', picked);
          if (inputName) inputName.value = picked;
        };
      }

      // 2. Create Room Inputs
      const inputCreateName = document.getElementById('input-create-room-name');
      if (inputCreateName) {
        inputCreateName.oninput = (e) => {
          this.createRoomName = e.target.value;
        };
      }

      const checkPassword = document.getElementById('check-create-password');
      if (checkPassword) {
        checkPassword.onchange = (e) => {
          this.createHasPassword = e.target.checked;
          this.render();
        };
      }

      const inputCreatePass = document.getElementById('input-create-password');
      if (inputCreatePass) {
        inputCreatePass.oninput = (e) => {
          this.createPassword = e.target.value;
        };
      }

      // Order Mode Select
      this.container.querySelectorAll('.btn-select-order').forEach(btn => {
        btn.onclick = () => {
          const order = btn.getAttribute('data-order');
          if (order) {
            this.createOrderMode = order;
            this.render();
          }
        };
      });

      // Finish Mode Select
      this.container.querySelectorAll('.btn-select-finish').forEach(btn => {
        btn.onclick = () => {
          const finish = btn.getAttribute('data-finish');
          if (finish) {
            this.createFinishMode = finish;
            this.render();
          }
        };
      });

      // 3. Create Room Submit
      const btnCreate = document.getElementById('btn-create-room');
      if (btnCreate) {
        btnCreate.onclick = () => {
          const trimmedName = this.createRoomName.trim();
          
          // ตรวจสอบชื่อห้อง: ต้องไม่ซ้ำกับรูปแบบรหัส 6 หลัก
          if (trimmedName && /^[A-Za-z0-9]{6}$/.test(trimmedName)) {
            this.errorMessage = 'ชื่อห้องต้องไม่เป็นรหัส 6 หลัก (กรุณาตั้งชื่อห้องอื่นที่ไม่ซ้ำกับรูปแบบรหัสห้อง)';
            this.render();
            return;
          }

          if (this.createHasPassword && !this.createPassword.trim()) {
            this.errorMessage = 'กรุณาป้อนรหัสผ่านห้อง หรือยกเลิกการตั้งรหัสผ่าน';
            this.render();
            return;
          }

          const packet = PacketManager.createPacket(PACKET_TYPES.CREATE_ROOM, {
            user: { name: this.playerName },
            roomName: trimmedName || undefined,
            password: this.createHasPassword ? this.createPassword.trim() : null,
            orderMode: this.createOrderMode,
            finishMode: this.createFinishMode
          });
          networkManager.sendPacket(packet);
        };
      }

      // 4. Join Room Inputs
      const inputCode = document.getElementById('input-room-code');
      if (inputCode) {
        inputCode.oninput = (e) => {
          this.inputRoomCode = e.target.value.toUpperCase();
        };
        inputCode.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const btnJoin = document.getElementById('btn-join-room');
            if (btnJoin) btnJoin.click();
          }
        };
      }

      const inputJoinPass = document.getElementById('input-join-password');
      if (inputJoinPass) {
        inputJoinPass.oninput = (e) => {
          this.inputJoinPassword = e.target.value;
        };
        inputJoinPass.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const btnJoin = document.getElementById('btn-join-room');
            if (btnJoin) btnJoin.click();
          }
        };
      }

      const btnJoin = document.getElementById('btn-join-room');
      if (btnJoin) {
        btnJoin.onclick = () => {
          if (!this.inputRoomCode) {
            this.errorMessage = 'กรุณาป้อนรหัสห้อง 6 หลัก';
            this.render();
            return;
          }
          const packet = PacketManager.createPacket(PACKET_TYPES.JOIN_ROOM, {
            roomCode: this.inputRoomCode,
            password: this.inputJoinPassword.trim() || undefined,
            user: { name: this.playerName }
          });
          networkManager.sendPacket(packet);
        };
      }

      const btnRefresh = document.getElementById('btn-refresh-rooms');
      if (btnRefresh) {
        btnRefresh.onclick = () => {
          this.fetchPublicRooms();
        };
      }

      this.bindRoomListEvents();
    } else {
      // --- Inside Room Events ---

      // Host Settings Change Buttons
      this.container.querySelectorAll('.btn-host-set-order').forEach(btn => {
        btn.onclick = () => {
          const order = btn.getAttribute('data-order');
          if (order) {
            const packet = PacketManager.createPacket(PACKET_TYPES.UPDATE_ROOM_SETTINGS, {
              roomCode: currentRoom?.roomCode,
              orderMode: order
            });
            networkManager.sendPacket(packet);
          }
        };
      });

      this.container.querySelectorAll('.btn-host-set-finish').forEach(btn => {
        btn.onclick = () => {
          const finish = btn.getAttribute('data-finish');
          if (finish) {
            const packet = PacketManager.createPacket(PACKET_TYPES.UPDATE_ROOM_SETTINGS, {
              roomCode: currentRoom?.roomCode,
              finishMode: finish
            });
            networkManager.sendPacket(packet);
          }
        };
      });

      // Color Selection
      document.querySelectorAll('.room-color-btn').forEach((btn) => {
        btn.onclick = () => {
          const colorId = btn.getAttribute('data-color-id');
          if (colorId) {
            const currentMyPlayerId = networkManager.myPlayerId || myPlayerId;
            const packet = PacketManager.createPacket(PACKET_TYPES.CHANGE_COLOR, {
              roomCode: currentRoom?.roomCode,
              playerId: currentMyPlayerId,
              colorId
            });
            networkManager.sendPacket(packet);
          }
        };
      });

      // Copy Code
      const btnCopy = document.getElementById('btn-copy-code');
      if (btnCopy) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(currentRoom.roomCode).then(() => {
            btnCopy.innerHTML = '✅ คัดลอกแล้ว!';
            setTimeout(() => {
              if (btnCopy) btnCopy.innerHTML = '📋 คัดลอกรหัส';
            }, 2000);
          });
        };
      }

      // Leave Room
      const btnLeave = document.getElementById('btn-leave-room');
      if (btnLeave) {
        btnLeave.onclick = () => {
          const currentMyPlayerId = networkManager.myPlayerId || myPlayerId;
          const packet = PacketManager.createPacket(PACKET_TYPES.LEAVE_ROOM, {
            roomCode: currentRoom?.roomCode,
            playerId: currentMyPlayerId
          });
          networkManager.sendPacket(packet);
          networkManager.roomManager.currentRoom = null;
          this.render();
        };
      }

      // Ready Toggle
      const btnReady = document.getElementById('btn-toggle-ready');
      if (btnReady) {
        btnReady.onclick = () => {
          const currentMyPlayerId = networkManager.myPlayerId || myPlayerId;
          const myPlayer = currentRoom.players.find(p => p.id === currentMyPlayerId);
          console.log(`[LobbyScreen] 👆 กดเปลี่ยนสถานะ Ready (ปัจจุบัน: ${myPlayer?.isReady})`);
          const packet = PacketManager.createPacket(PACKET_TYPES.READY, {
            roomCode: currentRoom?.roomCode,
            playerId: currentMyPlayerId,
            isReady: !myPlayer?.isReady
          });
          networkManager.sendPacket(packet);
        };
      }

      // Start Game (Host only)
      const btnStart = document.getElementById('btn-start-game');
      if (btnStart) {
        btnStart.onclick = () => {
          const room = networkManager.roomManager.currentRoom || currentRoom;
          const currentMyPlayerId = networkManager.myPlayerId || myPlayerId;
          if (!room) return;

          const isHost = room.hostId === currentMyPlayerId;
          const allReady = room.players.every(p => p.isReady || p.isHost);
          const canStart = isHost && room.players.length >= 2 && allReady;

          if (!canStart) {
            console.warn(`[LobbyScreen] ⚠️ ไม่สามารถเริ่มเกมได้ (isHost: ${isHost}, players: ${room.players.length}, allReady: ${allReady})`);
            return;
          }

          btnStart.disabled = true;
          btnStart.style.opacity = '0.7';
          btnStart.innerHTML = '⏳ กำลังเข้าสู่เกม...';
          console.log(`[LobbyScreen] 👑 Host (${currentMyPlayerId}) กดเริ่มเกมในห้อง ${room.roomCode}`);
          const packet = PacketManager.createPacket(PACKET_TYPES.START_GAME, {
            roomCode: room.roomCode,
            playerId: currentMyPlayerId
          });
          networkManager.sendPacket(packet);
        };
      }
    }
  }
}
