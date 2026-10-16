/**
 * @file src/Network/ConnectionManager.js
 * @description มอดูลจัดการสถานะการเชื่อมต่อ Network Connection (Phase 18)
 * ควบคุมสถานะ Connect, Disconnect, Reconnect และ Heartbeat
 */

import { LatencyManager } from './LatencyManager.js';
import { PacketManager, PACKET_TYPES } from './PacketManager.js';

export const CONNECTION_STATUS = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
};

export class ConnectionManager {
  constructor() {
    this.status = CONNECTION_STATUS.DISCONNECTED;
    this.latencyManager = new LatencyManager();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = new Set();
    this.messageListeners = new Set();
    this.socket = null;
    this.serverUrl = null;
  }

  /**
   * ลงทะเบียนรับการเปลี่ยนแปลงสถานะ Connection
   * @param {Function} listener 
   */
  onStatusChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * ลงทะเบียนรับข้อความ Packet จาก Server
   * @param {Function} listener 
   */
  onMessage(listener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * ปรับเปลี่ยนสถานะ Connection
   * @param {string} newStatus 
   */
  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.listeners.forEach((fn) => fn(this.status));
    }
  }

  /**
   * เปิดการเชื่อมต่อ WebSocket มายัง Server
   * @param {string} [serverUrl] 
   */
  connect(serverUrl) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!serverUrl) {
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        serverUrl = `${protocol}//${window.location.host}`;
      } else {
        serverUrl = 'ws://localhost:3000';
      }
    }

    this.serverUrl = serverUrl;
    this.setStatus(CONNECTION_STATUS.CONNECTING);

    try {
      this.socket = new WebSocket(serverUrl);

      this.socket.onopen = () => {
        console.log('[ConnectionManager] Connected to WebSocket server:', serverUrl);
        this.setStatus(CONNECTION_STATUS.CONNECTED);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        const packet = PacketManager.deserialize(event.data);
        if (packet) {
          if (packet.header?.type === PACKET_TYPES.PONG) {
            this.latencyManager.receivePong();
          } else {
            this.messageListeners.forEach((fn) => fn(packet));
          }
        }
      };

      this.socket.onclose = () => {
        console.warn('[ConnectionManager] WebSocket connection closed.');
        this.stopHeartbeat();
        if (this.status === CONNECTION_STATUS.CONNECTED || this.status === CONNECTION_STATUS.CONNECTING) {
          this.reconnect();
        } else {
          this.setStatus(CONNECTION_STATUS.DISCONNECTED);
        }
      };

      this.socket.onerror = (err) => {
        console.error('[ConnectionManager] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[ConnectionManager] Failed to create WebSocket:', err);
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
    }
  }

  /**
   * ส่งข้อมูล Packet ออกไปยัง Server ผ่าน WebSocket
   * @param {Object} packet 
   */
  send(packet) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const data = PacketManager.serialize(packet);
      if (data) {
        this.socket.send(data);
        return true;
      }
    }
    return false;
  }

  /**
   * ตัดการเชื่อมต่อ
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus(CONNECTION_STATUS.DISCONNECTED);
  }

  /**
   * ทำการ Reconnect อัตโนมัติ
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ConnectionManager] Exceeded maximum reconnect attempts.');
      this.setStatus(CONNECTION_STATUS.DISCONNECTED);
      return;
    }

    this.reconnectAttempts++;
    this.setStatus(CONNECTION_STATUS.RECONNECTING);
    console.log(`[ConnectionManager] Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

    setTimeout(() => {
      this.connect(this.serverUrl);
    }, 1500 * this.reconnectAttempts);
  }

  /**
   * เริ่มตรวจสอบ Heartbeat Ping/Pong
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.status === CONNECTION_STATUS.CONNECTED) {
        this.latencyManager.startPing();
        const pingPacket = PacketManager.createPacket(PACKET_TYPES.PING, { timestamp: Date.now() });
        this.send(pingPacket);
      }
    }, 5000);
  }

  /**
   * หยุด Heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
