/**
 * @file src/Engine/CommandSystem.js
 * @description ระบบ Command Pattern สำหรับจัดการการกระทำในเกม (Commands) (Phase 17)
 * รองรับการ Serialization และประมวลผลคำสั่งจากทั้ง Local และ Server ในอนาคต
 */

import { gameStateStore } from '../GameState.js';
import { eventBus, GAME_EVENTS } from './EventBus.js';

export const COMMAND_TYPES = {
  ROLL_DICE: 'ROLL_DICE',
  MOVE_PLAYER: 'MOVE_PLAYER',
  DRAW_CARD: 'DRAW_CARD',
  SKIP_TURN: 'SKIP_TURN',
  WIN_GAME: 'WIN_GAME',
};

/**
 * Base Command Class
 */
export class BaseCommand {
  constructor(type, playerId, payload = {}) {
    this.id = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.type = type;
    this.playerId = playerId;
    this.payload = payload;
    this.timestamp = Date.now();
  }

  execute() {
    throw new Error('Command execute method must be implemented.');
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      playerId: this.playerId,
      payload: this.payload,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Command: ทอยลูกเต๋า
 */
export class RollDiceCommand extends BaseCommand {
  constructor(playerId, diceValue) {
    super(COMMAND_TYPES.ROLL_DICE, playerId, { diceValue });
  }

  execute() {
    const diceValue = this.payload.diceValue;
    const currentState = gameStateStore.getState();
    gameStateStore.setState({
      lastDiceResult: { diceValue, playerId: this.playerId, timestamp: this.timestamp },
    });

    eventBus.emit(GAME_EVENTS.DICE_ROLLED, {
      playerId: this.playerId,
      diceValue,
    });
    return { success: true, diceValue };
  }
}

/**
 * Command: เดินหมากผู้เล่น
 */
export class MovePlayerCommand extends BaseCommand {
  constructor(playerId, fromPosition, toPosition, isBounceBack = false) {
    super(COMMAND_TYPES.MOVE_PLAYER, playerId, { fromPosition, toPosition, isBounceBack });
  }

  execute() {
    const { fromPosition, toPosition, isBounceBack } = this.payload;
    const currentState = gameStateStore.getState();
    const updatedPlayers = currentState.players.map((p) => {
      if (p.id === this.playerId || p.color === this.playerId) {
        return { ...p, position: toPosition };
      }
      return p;
    });

    gameStateStore.setState({ players: updatedPlayers });

    eventBus.emit(GAME_EVENTS.PLAYER_MOVED, {
      playerId: this.playerId,
      fromPosition,
      toPosition,
      isBounceBack,
    });

    return { success: true, toPosition };
  }
}

/**
 * Command: สุ่มจับการ์ด
 */
export class DrawCardCommand extends BaseCommand {
  constructor(playerId, cardData, tileType) {
    super(COMMAND_TYPES.DRAW_CARD, playerId, { cardData, tileType });
  }

  execute() {
    eventBus.emit(GAME_EVENTS.CARD_DRAWN, {
      playerId: this.playerId,
      card: this.payload.cardData,
      tileType: this.payload.tileType,
    });
    return { success: true, card: this.payload.cardData };
  }
}

/**
 * Command: ข้ามเทิร์นผู้เล่น
 */
export class SkipTurnCommand extends BaseCommand {
  constructor(playerId, turnsToSkip = 1) {
    super(COMMAND_TYPES.SKIP_TURN, playerId, { turnsToSkip });
  }

  execute() {
    const currentState = gameStateStore.getState();
    const updatedPlayers = currentState.players.map((p) => {
      if (p.id === this.playerId || p.color === this.playerId) {
        return { ...p, skipTurns: (p.skipTurns || 0) + this.payload.turnsToSkip };
      }
      return p;
    });

    gameStateStore.setState({ players: updatedPlayers });

    eventBus.emit(GAME_EVENTS.PLAYER_SKIPPED, {
      playerId: this.playerId,
      turnsToSkip: this.payload.turnsToSkip,
    });

    return { success: true };
  }
}

/**
 * Command: ผู้เล่นชนะเกม
 */
export class WinCommand extends BaseCommand {
  constructor(winnerPlayer) {
    super(COMMAND_TYPES.WIN_GAME, winnerPlayer.id || winnerPlayer.color, { winner: winnerPlayer });
  }

  execute() {
    gameStateStore.setState({ phase: 'FINISHED' });

    eventBus.emit(GAME_EVENTS.PLAYER_WON, {
      winner: this.payload.winner,
    });

    eventBus.emit(GAME_EVENTS.GAME_ENDED, {
      winner: this.payload.winner,
    });

    return { success: true, winner: this.payload.winner };
  }
}

/**
 * Command Processor Class
 */
export class CommandProcessor {
  constructor() {
    /** @type {BaseCommand[]} */
    this.history = [];
  }

  /**
   * รันประมวลผล Command
   * @param {BaseCommand} command
   */
  process(command) {
    if (!command || typeof command.execute !== 'function') {
      console.error('[CommandProcessor] Invalid command object:', command);
      return null;
    }
    const result = command.execute();
    this.history.push(command.toJSON());
    return result;
  }

  /**
   * ดึงประวัติ Command ที่เคยรันทั้งหมด
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * ล้างประวัติ
   */
  clearHistory() {
    this.history = [];
  }
}

export const commandProcessor = new CommandProcessor();

if (typeof window !== 'undefined') {
  window.commandProcessor = commandProcessor;
}
