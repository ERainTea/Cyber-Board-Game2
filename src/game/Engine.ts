/**
 * @file src/game/Engine.ts
 * @description Game Engine หลักสำหรับควบคุม State กลาง (Single Source of Truth)
 * รองรับการส่ง Action, ประมวลผลเทิร์น, AI Bot และการแจ้งเตือนSubscriber
 */

import { INITIAL_BOARD } from './Board';

import { rollDice } from './Dice';
import { DEFAULT_PLAYERS, calculateNetWorth, shouldBotBuyProperty, shouldBotBuildHouse } from './Players';
import { loadGameState, loadSettings, saveGameState, saveSettings } from './Storage';
import { calculateRent, checkGameOver } from './Systems';
import { BoardTile, GameCard, GameSettings, GameState, PlayerState } from './types';
import { soundEngine } from './Audio';

export type StateSubscriber = (state: GameState) => void;

export class GameEngine {
  private state: GameState;
  private subscribers: Set<StateSubscriber> = new Set();
  private isProcessingBotTurn: boolean = false;

  constructor() {
    const loadedSettings = loadSettings();
    const savedState = loadGameState();

    if (savedState) {
      this.state = savedState;
    } else {
      this.state = this.createInitialState(loadedSettings);
    }
  }

  /** สร้าง GameState เริ่มต้น */
  private createInitialState(settings: GameSettings): GameState {
    const players = DEFAULT_PLAYERS.map((p) => ({
      ...p,
      cash: settings.startingCash,
      netWorth: settings.startingCash,
    }));

    return {
      roomId: 'THAI_MONOPOLY_LOCAL_' + Math.floor(1000 + Math.random() * 9000),
      turnNumber: 1,
      activePlayerIndex: 0,
      phase: 'READY_TO_ROLL',
      players,
      board: INITIAL_BOARD.map((tile) => ({ ...tile })),
      lastDiceResult: null,
      logs: [
        {
          id: 'log_start',
          timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          message: '🎉 ยินดีต้อนรับสู่เกมกระดานออนไลน์! เริ่มต้นเกมรอบที่ 1',
          type: 'INFO',
        },
      ],
      currentCardDrawn: null,
      currentLandedTileId: null,
      winnerPlayerId: null,
      settings,
      startTime: Date.now(),
    };
  }

  /** รับข้อมูล State ปัจจุบัน */
  public getState(): GameState {
    return this.state;
  }

  /** ลงทะเบียนรับฟังความเปลี่ยนแปลงของ State */
  public subscribe(subscriber: StateSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  /** อัปเดต State และแจ้งเตือนทุกคนที่ Subscribe ไว้ */
  private updateState(newStatePartial: Partial<GameState>): void {
    this.state = {
      ...this.state,
      ...newStatePartial,
    };

    // คำนวณ Net Worth ใหม่ของผู้เล่นทุกคน
    this.state.players = this.state.players.map((player) => ({
      ...player,
      netWorth: calculateNetWorth(player, this.state.board),
    }));

    // บันทึกลง LocalStorage
    saveGameState(this.state);

    // แจ้ง Subscribers
    this.subscribers.forEach((sub) => sub(this.state));

    // ตรวจสอบว่าเป็นตาของ Bot หรือไม่
    this.checkBotTurn();
  }

  /** เพิ่มบันทึกข้อความเหตุการณ์ */
  public addLog(message: string, type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER' | 'DICE' | 'CARD' = 'INFO', playerId?: number): void {
    const player = playerId !== undefined ? this.state.players.find((p) => p.id === playerId) : undefined;
    const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const newLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: time,
      playerId,
      playerName: player?.name,
      playerColor: player?.color,
      message,
      type,
    };

    this.updateState({
      logs: [newLog, ...this.state.logs.slice(0, 49)], // เก็บสูงสุด 50 รายการ
    });
  }

  /**
   * Action หลัก: ทอดลูกเต๋า
   */
  public rollDiceAction(): void {
    if (this.state.phase !== 'READY_TO_ROLL' && this.state.phase !== 'IN_JAIL_DECISION') return;

    const activePlayer = this.state.players[this.state.activePlayerIndex];
    if (activePlayer.isBankrupt) {
      this.nextTurn();
      return;
    }

    // เสียงทอดลูกเต๋า
    soundEngine.playDiceRoll();

    this.updateState({ phase: 'ROLLING_DICE' });

    // จำลองแอนิเมชันทอดลูกเต๋าหมุน 1 วินาที
    setTimeout(() => {
      const dice = rollDice(this.state.lastDiceResult?.consecutiveDoubles || 0);

      this.addLog(`${activePlayer.name} ทอดลูกเต๋าได้ [${dice.die1}] + [${dice.die2}] = ${dice.total} แต้ม${dice.isDouble ? ' (หน้าคู่! 🎲)' : ''}`, 'DICE', activePlayer.id);

      // กรณีอยู่ในคุก
      if (activePlayer.isInJail) {
        if (dice.isDouble) {
          // ออกจากคุกได้เพราะทอดได้หน้าคู่
          const updatedPlayers = [...this.state.players];
          updatedPlayers[this.state.activePlayerIndex] = {
            ...activePlayer,
            isInJail: false,
            jailTurns: 0,
          };
          this.addLog(`🎉 ${activePlayer.name} ทอดได้หน้าคู่! ได้ออกจากคุกฟรี`, 'SUCCESS', activePlayer.id);
          this.updateState({ players: updatedPlayers, lastDiceResult: dice });
          this.movePlayerStepByStep(dice.total);
          return;
        } else {
          // ทอดไม่ได้หน้าคู่
          const jailTurns = activePlayer.jailTurns + 1;
          const updatedPlayers = [...this.state.players];

          if (jailTurns >= 3) {
            // อยู่คุกครบ 3 ตา จ่าย 500 บาทเพื่ออก
            const cash = Math.max(0, activePlayer.cash - 500);
            updatedPlayers[this.state.activePlayerIndex] = {
              ...activePlayer,
              isInJail: false,
              jailTurns: 0,
              cash,
            };
            this.addLog(`${activePlayer.name} อยู่คุกครบ 3 ตา จ่ายค่าปรับ 500 บาทออกจากคุก`, 'WARNING', activePlayer.id);
            this.updateState({ players: updatedPlayers, lastDiceResult: dice });
            this.movePlayerStepByStep(dice.total);
            return;
          } else {
            updatedPlayers[this.state.activePlayerIndex] = {
              ...activePlayer,
              jailTurns,
            };
            this.addLog(`${activePlayer.name} ยังคงต้องอยู่ในคุกต่อไป (เหลืออีก ${3 - jailTurns} ตา)`, 'WARNING', activePlayer.id);
            this.updateState({ players: updatedPlayers, lastDiceResult: dice, phase: 'READY_TO_ROLL' });
            this.nextTurn();
            return;
          }
        }
      }

      // ตรวจสอบเงื่อนไขทอดได้หน้าคู่ติดกัน 3 ครั้ง -> ส่งเข้าคุก
      if (dice.consecutiveDoubles >= this.state.settings.maxDoublesCount) {
        this.addLog(`🚨 ${activePlayer.name} ทอดได้หน้าคู่ติดต่อกัน ${this.state.settings.maxDoublesCount} ครั้ง! ถูกส่งเข้าคุกทันที`, 'DANGER', activePlayer.id);
        soundEngine.playJail();
        const updatedPlayers = [...this.state.players];
        updatedPlayers[this.state.activePlayerIndex] = {
          ...activePlayer,
          isInJail: true,
          jailTurns: 0,
          position: 6, // ตำแหน่งคุก
        };
        this.updateState({ players: updatedPlayers, lastDiceResult: dice });
        this.nextTurn();
        return;
      }

      this.updateState({ lastDiceResult: dice });
      this.movePlayerStepByStep(dice.total);
    }, this.state.settings.gameSpeed === 'INSTANT' ? 10 : 800);
  }

  /** เดินตัวหมากทีละช่องเพื่อให้มีแอนิเมชันสวยงาม */
  private movePlayerStepByStep(steps: number): void {
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    let currentPos = activePlayer.position;
    let stepsLeft = steps;

    this.updateState({ phase: 'MOVING_PLAYER' });

    const moveInterval = setInterval(() => {
      if (stepsLeft <= 0) {
        clearInterval(moveInterval);
        this.handleTileLanded(currentPos);
        return;
      }

      currentPos = (currentPos + 1) % this.state.board.length;
      stepsLeft--;

      soundEngine.playMoveStep();

      const updatedPlayers = [...this.state.players];
      const p = { ...updatedPlayers[this.state.activePlayerIndex] };

      // เช็กกรณีผ่านจุดเริ่มต้น (Pass GO)
      if (currentPos === 0) {
        p.cash += this.state.settings.passGoSalary;
        p.lapsCompleted += 1;
        this.addLog(`🚩 ${p.name} เดินผ่านจุดเริ่มต้น! ได้รับเงิน +${this.state.settings.passGoSalary.toLocaleString()} บาท`, 'SUCCESS', p.id);
        soundEngine.playCash();
      }

      p.position = currentPos;
      updatedPlayers[this.state.activePlayerIndex] = p;

      this.updateState({ players: updatedPlayers });
    }, this.state.settings.gameSpeed === 'FAST' ? 100 : this.state.settings.gameSpeed === 'INSTANT' ? 10 : 250);
  }

  /**
   * จัดการเมื่อผู้เล่นเดินตกช่องบนกระดาน
   */
  private handleTileLanded(tileId: number): void {
    const tile = this.state.board.find((t) => t.id === tileId);
    if (!tile) return;

    const activePlayer = this.state.players[this.state.activePlayerIndex];
    this.updateState({ currentLandedTileId: tileId });

    this.addLog(`${activePlayer.name} เดินมาตกช่อง "${tile.name}"`, 'INFO', activePlayer.id);

    switch (tile.type) {
      case 'PROPERTY':
      case 'UTILITY':
      case 'TRANSPORT':
        this.handlePropertyTileLanded(tile, activePlayer);
        break;

      case 'CHANCE':
      case 'CHEST': {
        this.addLog(`📍 ${activePlayer.name} พักผ่อนที่ช่อง "${tile.name}"`, 'INFO', activePlayer.id);
        this.updateState({ phase: 'TILE_ACTION' });
        break;
      }

      case 'TAX': {
        const taxAmount = 1000;
        const updatedPlayers = [...this.state.players];
        const p = { ...updatedPlayers[this.state.activePlayerIndex] };
        p.cash = Math.max(0, p.cash - taxAmount);
        updatedPlayers[this.state.activePlayerIndex] = p;
        this.addLog(`💸 ${p.name} จ่ายภาษีบำรุงเมือง 1,000 บาท`, 'DANGER', p.id);
        soundEngine.playCash();
        this.updateState({ players: updatedPlayers, phase: 'TILE_ACTION' });
        break;
      }

      case 'GO_TO_JAIL': {
        this.addLog(`🚨 ${activePlayer.name} ตกช่องส่งเข้าคุก! ถูกส่งเข้าคุกทันที`, 'DANGER', activePlayer.id);
        soundEngine.playJail();
        const updatedPlayers = [...this.state.players];
        updatedPlayers[this.state.activePlayerIndex] = {
          ...activePlayer,
          isInJail: true,
          jailTurns: 0,
          position: 6,
        };
        this.updateState({ players: updatedPlayers, phase: 'READY_TO_ROLL' });
        this.nextTurn();
        return;
      }

      case 'START':
      case 'JAIL':
      case 'FREE_PARKING':
      default:
        this.updateState({ phase: 'TILE_ACTION' });
        break;
    }
  }

  /** จัดการกรณีตกช่องอสังหาริมทรัพย์ */
  private handlePropertyTileLanded(tile: BoardTile, player: PlayerState): void {
    if (tile.ownerId === null) {
      // ไม่มีเจ้าของ -> สามารถซื้อได้
      this.updateState({ phase: 'PROPERTY_DECISION' });
    } else if (tile.ownerId === player.id) {
      // เป็นเจ้าของเอง -> สามารถสร้างบ้านได้
      if (tile.type === 'PROPERTY' && tile.houseCount < 5 && player.cash >= (tile.housePrice || 0)) {
        this.updateState({ phase: 'BUILDING_DECISION' });
      } else {
        this.updateState({ phase: 'TILE_ACTION' });
      }
    } else {
      // มีเจ้าของเป็นผู้อื่น -> ต้องจ่ายค่าเช่า!
      const owner = this.state.players.find((p) => p.id === tile.ownerId);
      if (owner && !owner.isBankrupt && !tile.isMortgaged) {
        const rent = calculateRent(tile, this.state.board);
        this.payRent(player, owner, rent, tile.name);
      } else {
        this.updateState({ phase: 'TILE_ACTION' });
      }
    }
  }

  /** จ่ายค่าเช่า */
  private payRent(payer: PlayerState, recipient: PlayerState, amount: number, propertyName: string): void {
    const actualPay = Math.min(payer.cash, amount);

    const updatedPlayers = [...this.state.players];
    const payerIndex = updatedPlayers.findIndex((p) => p.id === payer.id);
    const recipientIndex = updatedPlayers.findIndex((p) => p.id === recipient.id);

    updatedPlayers[payerIndex] = {
      ...payer,
      cash: payer.cash - actualPay,
      stats: { ...payer.stats, rentPaidTotal: payer.stats.rentPaidTotal + actualPay },
    };

    updatedPlayers[recipientIndex] = {
      ...recipient,
      cash: recipient.cash + actualPay,
      stats: { ...recipient.stats, rentCollectedTotal: recipient.stats.rentCollectedTotal + actualPay },
    };

    this.addLog(`🏠 ${payer.name} จ่ายค่าเช่าช่อง "${propertyName}" ให้กับ ${recipient.name} จำนวน ${actualPay.toLocaleString()} บาท`, 'WARNING', payer.id);
    soundEngine.playCash();

    // เช็กกรณีเงินหมด (ล้มละลาย)
    if (payer.cash - actualPay <= 0 && calculateNetWorth(payer, this.state.board) <= 0) {
      this.handleBankruptcy(payerIndex);
    } else {
      this.updateState({ players: updatedPlayers, phase: 'TILE_ACTION' });
    }
  }

  /** ซื้ออสังหาริมทรัพย์ */
  public buyPropertyAction(): void {
    if (this.state.phase !== 'PROPERTY_DECISION' || this.state.currentLandedTileId === null) return;

    const activePlayer = this.state.players[this.state.activePlayerIndex];
    const tileIndex = this.state.board.findIndex((t) => t.id === this.state.currentLandedTileId);
    const tile = this.state.board[tileIndex];

    if (!tile || !tile.price || activePlayer.cash < tile.price) {
      this.addLog(`❌ ${activePlayer.name} มีเงินไม่พอซื้อ "${tile.name}"`, 'DANGER', activePlayer.id);
      return;
    }

    const updatedBoard = [...this.state.board];
    updatedBoard[tileIndex] = {
      ...tile,
      ownerId: activePlayer.id,
    };

    const updatedPlayers = [...this.state.players];
    updatedPlayers[this.state.activePlayerIndex] = {
      ...activePlayer,
      cash: activePlayer.cash - tile.price,
      stats: {
        ...activePlayer.stats,
        propertiesBought: activePlayer.stats.propertiesBought + 1,
      },
    };

    soundEngine.playBuyProperty();
    this.addLog(`🏡 ${activePlayer.name} ซื้อที่ดิน "${tile.name}" ในราคา ${tile.price.toLocaleString()} บาท`, 'SUCCESS', activePlayer.id);

    this.updateState({
      board: updatedBoard,
      players: updatedPlayers,
      phase: 'TILE_ACTION',
    });
  }

  /** สร้างบ้าน/อัปเกรดแลนด์มาร์ก */
  public buildHouseAction(): void {
    if (this.state.phase !== 'BUILDING_DECISION' || this.state.currentLandedTileId === null) return;

    const activePlayer = this.state.players[this.state.activePlayerIndex];
    const tileIndex = this.state.board.findIndex((t) => t.id === this.state.currentLandedTileId);
    const tile = this.state.board[tileIndex];

    if (!tile || !tile.housePrice || activePlayer.cash < tile.housePrice || tile.houseCount >= 5) return;

    const updatedBoard = [...this.state.board];
    const newCount = tile.houseCount + 1;
    updatedBoard[tileIndex] = {
      ...tile,
      houseCount: newCount,
    };

    const updatedPlayers = [...this.state.players];
    updatedPlayers[this.state.activePlayerIndex] = {
      ...activePlayer,
      cash: activePlayer.cash - tile.housePrice,
      stats: {
        ...activePlayer.stats,
        housesBuilt: activePlayer.stats.housesBuilt + 1,
      },
    };

    soundEngine.playBuyProperty();
    const typeName = newCount === 5 ? 'โรงแรม/แลนด์มาร์ก 🏰' : `บ้านหลังที่ ${newCount} 🏠`;
    this.addLog(`🏗️ ${activePlayer.name} สร้าง ${typeName} บนช่อง "${tile.name}" (จ่าย ${tile.housePrice.toLocaleString()} บาท)`, 'SUCCESS', activePlayer.id);

    this.updateState({
      board: updatedBoard,
      players: updatedPlayers,
      phase: 'TILE_ACTION',
    });
  }

  /** สลับไปเล่นเทิร์นถัดไป */
  public nextTurn(): void {
    const { isGameOver, winnerId } = checkGameOver(this.state);
    if (isGameOver && winnerId !== null) {
      const winner = this.state.players.find((p) => p.id === winnerId);
      soundEngine.playVictory();
      this.addLog(`🏆 จบเกม! ${winner?.name} เป็นผู้ชนะเลิศเพียงหนึ่งเดียว!`, 'SUCCESS');
      this.updateState({ phase: 'GAME_OVER', winnerPlayerId: winnerId });
      return;
    }

    // หากเปิดลูกเต๋าได้หน้าคู่ และไม่อยู่ในคุก -> ได้เล่นอีกเทิร์น
    const dice = this.state.lastDiceResult;
    const activePlayer = this.state.players[this.state.activePlayerIndex];

    if (dice && dice.isDouble && !activePlayer.isInJail && !activePlayer.isBankrupt && this.state.phase !== 'READY_TO_ROLL') {
      this.addLog(`🎲 ${activePlayer.name} ทอดได้หน้าคู่ ได้เล่นอีก 1 เทิร์น!`, 'INFO', activePlayer.id);
      this.updateState({
        phase: 'READY_TO_ROLL',
        currentCardDrawn: null,
      });
      return;
    }

    // หาผู้เล่นถัดไปที่ไม่ล้มละลาย
    let nextIndex = (this.state.activePlayerIndex + 1) % this.state.players.length;
    while (this.state.players[nextIndex].isBankrupt) {
      nextIndex = (nextIndex + 1) % this.state.players.length;
    }

    const nextPlayer = this.state.players[nextIndex];
    const newTurnNumber = nextIndex === 0 ? this.state.turnNumber + 1 : this.state.turnNumber;

    this.addLog(`--- เริ่มเทิร์นของ ${nextPlayer.name} (รอบที่ ${newTurnNumber}) ---`, 'INFO', nextPlayer.id);

    this.updateState({
      turnNumber: newTurnNumber,
      activePlayerIndex: nextIndex,
      phase: nextPlayer.isInJail ? 'IN_JAIL_DECISION' : 'READY_TO_ROLL',
      lastDiceResult: null,
      currentCardDrawn: null,
      currentLandedTileId: null,
    });
  }

  /** จัดการผู้เล่นล้มละลาย */
  private handleBankruptcy(playerIndex: number): void {
    const player = this.state.players[playerIndex];
    this.addLog(`💀 ${player.name} สินทรัพย์หมดสิ้นและประกาศล้มละลาย!`, 'DANGER', player.id);

    // ปลดล็อกอสังหาริมทรัพย์ของทุกคน
    const updatedBoard = this.state.board.map((tile) => {
      if (tile.ownerId === player.id) {
        return { ...tile, ownerId: null, houseCount: 0, isMortgaged: false };
      }
      return tile;
    });

    const updatedPlayers = [...this.state.players];
    updatedPlayers[playerIndex] = {
      ...player,
      isBankrupt: true,
      cash: 0,
      netWorth: 0,
    };

    this.updateState({ board: updatedBoard, players: updatedPlayers });
    this.nextTurn();
  }

  /** ตรวจสอบและรันเทิร์นอัตโนมัติสำหรับ AI Bot */
  private checkBotTurn(): void {
    const activePlayer = this.state.players[this.state.activePlayerIndex];

    if (activePlayer.type === 'HUMAN' || activePlayer.isBankrupt || this.state.phase === 'GAME_OVER' || this.isProcessingBotTurn) {
      return;
    }

    this.isProcessingBotTurn = true;
    const delay = this.state.settings.gameSpeed === 'INSTANT' ? 50 : 1200;

    setTimeout(() => {
      this.isProcessingBotTurn = false;

      if (this.state.phase === 'READY_TO_ROLL' || this.state.phase === 'IN_JAIL_DECISION') {
        this.rollDiceAction();
      } else if (this.state.phase === 'PROPERTY_DECISION') {
        const tile = this.state.board.find((t) => t.id === this.state.currentLandedTileId);
        if (tile && shouldBotBuyProperty(activePlayer, tile, activePlayer.cash)) {
          this.buyPropertyAction();
        }
        setTimeout(() => this.nextTurn(), delay / 2);
      } else if (this.state.phase === 'BUILDING_DECISION') {
        const tile = this.state.board.find((t) => t.id === this.state.currentLandedTileId);
        if (tile && shouldBotBuildHouse(activePlayer, tile)) {
          this.buildHouseAction();
        }
        setTimeout(() => this.nextTurn(), delay / 2);
      } else if (this.state.phase === 'TILE_ACTION' || this.state.phase === 'CARD_DRAWN') {
        this.nextTurn();
      }
    }, delay);
  }

  /** เริ่มเกมใหม่ทั้งหมด */
  public restartGame(): void {
    const newState = this.createInitialState(this.state.settings);
    this.updateState(newState);
    this.addLog('🔄 เริ่มเกมใหม่เรียบร้อยแล้ว!', 'SUCCESS');
  }

  /** เปลี่ยนแปลงการตั้งค่า */
  public updateSettings(newSettings: Partial<GameSettings>): void {
    const updated = { ...this.state.settings, ...newSettings };
    saveSettings(updated);
    soundEngine.setVolume(updated.soundVolume);
    this.updateState({ settings: updated });
  }
}

export const gameEngine = new GameEngine();
