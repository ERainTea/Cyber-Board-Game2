/**
 * @file src/Audio/SoundManager.js
 * @description มอดูลจัดการระบบเสียงประกอบและเอฟเฟกต์ (Audio System) ภาษาไทย
 * รองรับ BGM (Menu, In-Game, Victory) พร้อมระบบสังเคราะห์เสียง Web Audio API
 * และรองรับการปรับระดับเสียง, Mute/Unmute, และการบันทึกค่าใน localStorage
 */

export class SoundManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    // การตั้งค่าเสียงหลัก
    this.bgmVolume = 0.6; // 0.0 ถึง 1.0
    this.sfxVolume = 0.8; // 0.0 ถึง 1.0
    this.bgmMuted = false;
    this.sfxMuted = false;

    // สถานะ BGM
    this.currentBgmTrack = null;
    this.bgmTimer = null;
    this.bgmGainNode = null;
    this.isBgmPaused = false;

    // โหลดการตั้งค่าจาก localStorage
    this.loadSettings();

    // ตัวแประรับฟังการคลิกปุ่มอัตโนมัติบนหน้าจอ
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', () => this.initContext(), { once: true });
    }
  }

  /**
   * โหลดการตั้งค่าจาก localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('cyber_survivor_audio_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.bgmVolume === 'number') this.bgmVolume = parsed.bgmVolume;
        if (typeof parsed.sfxVolume === 'number') this.sfxVolume = parsed.sfxVolume;
        if (typeof parsed.bgmMuted === 'boolean') this.bgmMuted = parsed.bgmMuted;
        if (typeof parsed.sfxMuted === 'boolean') this.sfxMuted = parsed.sfxMuted;
      }
    } catch (e) {
      console.warn('[SoundManager] ไม่สามารถอ่านค่าการตั้งค่าเสียงได้:', e);
    }
  }

  /**
   * บันทึกการตั้งค่าลง localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem(
        'cyber_survivor_audio_settings',
        JSON.stringify({
          bgmVolume: this.bgmVolume,
          sfxVolume: this.sfxVolume,
          bgmMuted: this.bgmMuted,
          sfxMuted: this.sfxMuted,
        })
      );
    } catch (e) {
      console.warn('[SoundManager] ไม่สามารถบันทึกการตั้งค่าเสียงได้:', e);
    }
  }

  /**
   * เริ่มต้น AudioContext (เปิดใช้งานเมื่อมี User Interaction)
   */
  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // =========================================================================
  // 1. ระบบจัดการเพลงพื้นหลัง (BGM Management)
  // =========================================================================

  /**
   * เล่น BGM ตามประเภท ('menu' | 'game' | 'win')
   * @param {string} trackName - ชื่อเพลงพื้นหลัง
   */
  playBGM(trackName) {
    this.initContext();
    if (this.currentBgmTrack === trackName && !this.isBgmPaused) return;

    this.stopBGM();
    this.currentBgmTrack = trackName;
    this.isBgmPaused = false;

    if (this.bgmMuted) return;

    if (!this.ctx) return;

    // สร้าง GainNode สำหรับ BGM
    this.bgmGainNode = this.ctx.createGain();
    this.bgmGainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    this.bgmGainNode.connect(this.ctx.destination);

    // Fade In BGM
    const targetGain = this.bgmVolume * 0.25;
    this.bgmGainNode.gain.linearRampToValueAtTime(targetGain, this.ctx.currentTime + 1.2);

    // เล่น Pattern สังเคราะห์ตามชนิด BGM
    this.startBgmPattern(trackName);
  }

  /**
   * สร้างเมโลดี้/คอร์ดสังเคราะห์ลูป BGM โดยใช้ Web Audio API
   * @param {string} trackName - ชื่อแทร็ก
   */
  startBgmPattern(trackName) {
    if (!this.ctx || !this.bgmGainNode) return;

    let step = 0;
    const isMenu = trackName === 'menu';
    const isWin = trackName === 'win';

    // โน้ตความถี่ดนตรี (Hz)
    const menuChords = [
      [261.63, 329.63, 392.00], // C major
      [220.00, 261.63, 329.63], // A minor
      [174.61, 220.00, 261.63], // F major
      [196.00, 246.94, 293.66], // G major
    ];

    const gameChords = [
      [130.81, 196.00, 261.63], // C low
      [110.00, 164.81, 220.00], // A low
      [87.31, 130.81, 174.61],  // F low
      [98.00, 146.83, 196.00],  // G low
    ];

    const winChords = [
      [523.25, 659.25, 783.99], // C high
      [587.33, 698.46, 880.00], // Dm high
      [659.25, 783.99, 987.77], // Em high
      [698.46, 880.00, 1046.50],// F high
    ];

    const chords = isWin ? winChords : isMenu ? menuChords : gameChords;
    const intervalTime = isWin ? 600 : isMenu ? 1200 : 800;

    const playStep = () => {
      if (!this.ctx || this.currentBgmTrack !== trackName || this.isBgmPaused) return;

      const currentChord = chords[step % chords.length];
      const now = this.ctx.currentTime;

      currentChord.forEach((freq, idx) => {
        try {
          const osc = this.ctx.createOscillator();
          const noteGain = this.ctx.createGain();

          osc.type = isMenu ? 'sine' : isWin ? 'triangle' : 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);

          noteGain.gain.setValueAtTime(0, now);
          noteGain.gain.linearRampToValueAtTime(0.08, now + 0.1);
          noteGain.gain.exponentialRampToValueAtTime(0.001, now + (intervalTime / 1000) * 0.9);

          osc.connect(noteGain);
          noteGain.connect(this.bgmGainNode);

          osc.start(now + idx * 0.08);
          osc.stop(now + (intervalTime / 1000));
        } catch (e) {
          // ละเว้นหากถูกยกเลิก
        }
      });

      step++;
    };

    playStep();
    this.bgmTimer = setInterval(playStep, intervalTime);
  }

  /**
   * หยุดเล่น BGM
   */
  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.bgmGainNode && this.ctx) {
      try {
        this.bgmGainNode.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
      } catch (e) {
        // ละเว้น
      }
      this.bgmGainNode = null;
    }
    this.currentBgmTrack = null;
  }

  /**
   * Pause BGM
   */
  pauseBGM() {
    this.isBgmPaused = true;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  /**
   * Resume BGM
   */
  resumeBGM() {
    if (this.currentBgmTrack && this.isBgmPaused) {
      this.isBgmPaused = false;
      this.startBgmPattern(this.currentBgmTrack);
    }
  }

  /**
   * ปรับระดับเสียง BGM (0.0 - 1.0)
   * @param {number} vol - ระดับเสียง 0.0 ถึง 1.0 (หรือ 0 ถึง 100)
   */
  setBGMVolume(vol) {
    const norm = vol > 1 ? vol / 100 : vol;
    this.bgmVolume = Math.max(0, Math.min(1, norm));
    if (this.bgmGainNode && this.ctx) {
      this.bgmGainNode.gain.setValueAtTime(this.bgmVolume * 0.25, this.ctx.currentTime);
    }
    this.saveSettings();
  }

  /**
   * ปรับระดับเสียง SFX (0.0 - 1.0)
   * @param {number} vol - ระดับเสียง 0.0 ถึง 1.0 (หรือ 0 ถึง 100)
   */
  setSFXVolume(vol) {
    const norm = vol > 1 ? vol / 100 : vol;
    this.sfxVolume = Math.max(0, Math.min(1, norm));
    this.saveSettings();
  }

  /**
   * สลับเปิด/ปิดเสียง BGM
   * @param {boolean} [mute]
   */
  toggleBGMMute(mute) {
    this.bgmMuted = typeof mute === 'boolean' ? mute : !this.bgmMuted;
    if (this.bgmMuted) {
      this.stopBGM();
    } else if (this.currentBgmTrack) {
      this.playBGM(this.currentBgmTrack);
    }
    this.saveSettings();
  }

  /**
   * สลับเปิด/ปิดเสียง SFX
   * @param {boolean} [mute]
   */
  toggleSFXMute(mute) {
    this.sfxMuted = typeof mute === 'boolean' ? mute : !this.sfxMuted;
    this.saveSettings();
  }

  // =========================================================================
  // 2. ระบบเล่นเอฟเฟกต์เสียง (Sound Effects - SFX)
  // =========================================================================

  /**
   * เล่นเอฟเฟกต์เสียงตามชื่อคีย์
   * @param {string} soundName - ชื่อเอฟเฟกต์เสียง
   */
  play(soundName) {
    if (this.sfxMuted || this.sfxVolume <= 0) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      switch (soundName) {
        case 'click':
        case 'button':
          this.playClickSound();
          break;
        case 'dice':
          this.playDiceSound();
          break;
        case 'move':
          this.playMoveSound();
          break;
        case 'card':
          this.playCardSound();
          break;
        case 'forward':
          this.playForwardSound();
          break;
        case 'backward':
          this.playBackwardSound();
          break;
        case 'back_to_start':
          this.playBackToStartSound();
          break;
        case 'skip_turn':
        case 'bounce':
          this.playSkipTurnSound();
          break;
        case 'all_backward':
          this.playAllBackwardSound();
          break;
        case 'reach_goal':
          this.playReachGoalSound();
          break;
        case 'victory':
        case 'fanfare':
          this.playVictorySound();
          break;
        case 'notify':
        case 'warn':
          this.playNotifySound();
          break;
        case 'error':
        case 'bad':
          this.playErrorSound();
          break;
        default:
          this.playClickSound();
          break;
      }
    } catch (err) {
      console.warn('[SoundManager SFX Error]', err);
    }
  }

  /** เสียงกดปุ่มทั่วไป */
  playClickSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

    gain.gain.setValueAtTime(0.2 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** เสียงทอยลูกเต๋า */
  playDiceSound() {
    const now = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const time = now + i * 0.05;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200 + Math.random() * 250, time);

      gain.gain.setValueAtTime(0.25 * this.sfxVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.04);
    }
  }

  /** เสียงก้าวเดินตัวหมาก */
  playMoveSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** เสียงเปิดการ์ด */
  playCardSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.12);

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** เสียงเดินหน้า (การ์ดดี) */
  playForwardSound() {
    const now = this.ctx.currentTime;
    const notes = [300, 450, 600];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.3 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.08);
    });
  }

  /** เสียงถอยหลัง (การ์ดไม่ดี) */
  playBackwardSound() {
    const now = this.ctx.currentTime;
    const notes = [500, 380, 250];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.07;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.3 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.09);
    });
  }

  /** เสียงกลับจุดเริ่มต้น */
  playBackToStartSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.35);

    gain.gain.setValueAtTime(0.4 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /** เสียงโดนหยุดเดิน 1 ตา */
  playSkipTurnSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.3);

    gain.gain.setValueAtTime(0.35 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** เสียงทุกคนถอยหลัง */
  playAllBackwardSound() {
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + i * 0.1;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320 - i * 60, t);

      gain.gain.setValueAtTime(0.3 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** เสียงเข้าเส้นชัย (Reach Goal) */
  playReachGoalSound() {
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = now + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.4 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  /** เสียงชนะเกม (Victory Fanfare) */
  playVictorySound() {
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.1;
      const duration = idx === notes.length - 1 ? 0.9 : 0.2;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.4 * this.sfxVolume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  }

  /** เสียงแจ้งเตือน */
  playNotifySound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880.00, now + 0.08); // A5

    gain.gain.setValueAtTime(0.3 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** เสียง Error */
  playErrorSound() {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(140, now + 0.08);

    gain.gain.setValueAtTime(0.25 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }
}

export const soundManager = new SoundManager();

if (typeof window !== 'undefined') {
  window.soundManager = soundManager;
}
