/**
 * @file src/game/UI.tsx
 * @description ส่วนแสดงผลอินเทอร์เฟซผู้ใช้ (User Interface Component) ภาษาไทยทั้งหมด
 * แสดงกระดาน 26 ช่อง, HUD, ลูกเต๋า, การ์ด, บันทึกเหตุการณ์ และกล่องโต้ตอบตัดสินใจ
 */

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Crown,
  Dice5,
  Home,
  Info,
  Layers,
  LogOut,
  Maximize2,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { getColorGroupMeta } from './Board';

import { gameEngine } from './Engine';
import { BoardTile, GameCard, GameState, PlayerState } from './types';
import { soundEngine } from './Audio';
import { ASSET_URLS } from './Assets';

export const BoardGameUI: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(gameEngine.getState());
  const [selectedTile, setSelectedTile] = useState<BoardTile | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  useEffect(() => {
    // สมัครรับฟังข้อมูล GameState กลาง
    const unsubscribe = gameEngine.subscribe((state) => {
      setGameState(state);
    });
    return () => unsubscribe();
  }, []);

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isHumanTurn = activePlayer?.type === 'HUMAN' && !activePlayer.isBankrupt;

  /** สลับปิด/เปิดเสียง */
  const toggleSound = () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    soundEngine.setMuted(newMute);
    soundEngine.playClick();
  };

  /** ปุ่มทอดลูกเต๋า */
  const handleRollDice = () => {
    soundEngine.playClick();
    gameEngine.rollDiceAction();
  };

  /** ปุ่มซื้ออสังหาริมทรัพย์ */
  const handleBuyProperty = () => {
    soundEngine.playClick();
    gameEngine.buyPropertyAction();
  };

  /** ปุ่มสร้างบ้าน */
  const handleBuildHouse = () => {
    soundEngine.playClick();
    gameEngine.buildHouseAction();
  };

  /** ปุ่มผ่าน/จบเทิร์น */
  const handleNextTurn = () => {
    soundEngine.playClick();
    gameEngine.nextTurn();
  };

  /** ปุ่มเริ่มเกมใหม่ */
  const handleRestart = () => {
    soundEngine.playClick();
    if (window.confirm('คุณต้องการเริ่มเกมใหม่ใช่หรือไม่? ข้อมูลปัจจุบันจะถูกรีเซ็ตทั้งหมด')) {
      gameEngine.restartGame();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* --- HEADER HUD --- */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between shadow-lg backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-red-600 flex items-center justify-center shadow-md shadow-amber-500/20">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-300 via-amber-100 to-white bg-clip-text text-transparent">
              เกมกระดานเศรษฐีไทย
            </h1>
            <p className="text-xs text-slate-400">
              ห้อง: <span className="font-mono text-amber-400">{gameState.roomId}</span> | รอบที่ {gameState.turnNumber}
            </p>
          </div>
        </div>

        {/* แถบแจ้งสถานะผู้เล่นปัจจุบัน */}
        <div className="flex items-center gap-4 my-1 sm:my-0">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-xs text-slate-400">ตาของคุณ:</span>
            <div
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ backgroundColor: activePlayer?.color || '#3b82f6' }}
            />
            <span className="font-bold text-sm text-slate-100">{activePlayer?.name}</span>
            {activePlayer?.type !== 'HUMAN' && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                บอท AI
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
              title={isMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              onClick={handleRestart}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700 flex items-center gap-1 text-xs"
              title="เริ่มเกมใหม่"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">เริ่มใหม่</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- MAIN GAME BODY --- */}
      <main className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* --- LEFT / TOP: GAME BOARD CANVAS/GRID (8 COLUMNS) --- */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-2xl relative overflow-hidden flex items-center justify-center min-h-[500px]">
            {/* โครงสร้างตารางกระดาน 26 ช่อง แบบสี่เหลี่ยมผืนผ้า */}
            <div className="w-full max-w-[700px] aspect-square relative bg-slate-950 rounded-xl border border-slate-800 p-2 grid grid-cols-7 grid-rows-7 gap-1">
              {/* เรนเดอร์ช่องกระดานทั้ง 26 ช่องตามตำแหน่ง */}
              {renderBoardGrid(gameState, (tile) => setSelectedTile(tile))}

              {/* ตรงกลางกระดาน CENTER ARENA */}
              <div className="col-start-2 col-span-5 row-start-2 row-span-5 bg-slate-900/90 rounded-lg border border-slate-800 p-4 flex flex-col items-center justify-between relative shadow-inner overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-events-none" />

                {/* สัญลักษณ์กลางกระดาน */}
                <div className="text-center mt-2 z-10">
                  <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full text-amber-300 text-xs font-semibold">
                    <Sparkles className="w-3.5 h-3.5" />
                    แผนที่ท่องเที่ยวประเทศไทย
                  </div>
                </div>

                {/* แสดงผลการทอดลูกเต๋า */}
                <div className="flex flex-col items-center justify-center my-auto z-10 gap-3">
                  {gameState.lastDiceResult && (
                    <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800 shadow-xl backdrop-blur">
                      <div className="w-12 h-12 bg-amber-500 text-slate-950 font-black text-2xl rounded-lg flex items-center justify-center shadow-md">
                        {gameState.lastDiceResult.die1}
                      </div>
                      <span className="text-xl font-bold text-slate-500">+</span>
                      <div className="w-12 h-12 bg-amber-500 text-slate-950 font-black text-2xl rounded-lg flex items-center justify-center shadow-md">
                        {gameState.lastDiceResult.die2}
                      </div>
                      <div className="text-left ml-2 border-l border-slate-800 pl-3">
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">ผลรวมแต้ม</div>
                        <div className="text-xl font-black text-amber-400">
                          {gameState.lastDiceResult.total} แต้ม
                        </div>
                      </div>
                    </div>
                  )}

                  {/* แผงควบคุมแอคชั่นสำหรับผู้เล่นมนุษย์ */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    {isHumanTurn && (gameState.phase === 'READY_TO_ROLL' || gameState.phase === 'IN_JAIL_DECISION') && (
                      <button
                        onClick={handleRollDice}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base shadow-lg shadow-amber-500/25 flex items-center gap-2 transition transform active:scale-95"
                      >
                        <Dice5 className="w-5 h-5" />
                        ทอดลูกเต๋า!
                      </button>
                    )}

                    {isHumanTurn && gameState.phase === 'PROPERTY_DECISION' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleBuyProperty}
                          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition"
                        >
                          <Building2 className="w-4 h-4" />
                          ซื้อที่ดินนี้
                        </button>
                        <button
                          onClick={handleNextTurn}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition border border-slate-700"
                        >
                          ผ่าน / ข้าม
                        </button>
                      </div>
                    )}

                    {isHumanTurn && gameState.phase === 'BUILDING_DECISION' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleBuildHouse}
                          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 flex items-center gap-2 transition"
                        >
                          <Home className="w-4 h-4" />
                          สร้างบ้าน/แลนด์มาร์ก
                        </button>
                        <button
                          onClick={handleNextTurn}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition border border-slate-700"
                        >
                          จบเทิร์น
                        </button>
                      </div>
                    )}

                    {isHumanTurn && (gameState.phase === 'TILE_ACTION' || gameState.phase === 'CARD_DRAWN') && (
                      <button
                        onClick={handleNextTurn}
                        className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-sm transition border border-slate-700 flex items-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        จบเทิร์นส่งต่อ
                      </button>
                    )}

                    {!isHumanTurn && gameState.phase !== 'GAME_OVER' && (
                      <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2 rounded-xl text-amber-300 text-xs font-semibold border border-slate-700 animate-pulse">
                        <Zap className="w-4 h-4 text-amber-400" />
                        บอท AI กำลังประมวลผลการเล่น...
                      </div>
                    )}
                  </div>
                </div>

                {/* คำแนะนำด้านล่าง */}
                <div className="text-[11px] text-slate-400 text-center mb-1">
                  คลิกที่ช่องบนกระดานเพื่อดูรายละเอียดราคาและค่าเช่า
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- RIGHT: PLAYER LIST & EVENT LOGS (4 COLUMNS) --- */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          {/* ข้อมูลตารางผู้เล่น (Leaderboard) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              สถานะผู้เล่นในเกม
            </h2>

            <div className="flex flex-col gap-2.5">
              {gameState.players.map((player) => {
                const isActive = player.id === activePlayer.id;

                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-xl border transition-all ${
                      player.isBankrupt
                        ? 'bg-slate-950/50 border-slate-800 opacity-50'
                        : isActive
                        ? 'bg-slate-800/90 border-amber-500/50 shadow-md shadow-amber-500/10'
                        : 'bg-slate-950/80 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-4 h-4 rounded-full border border-slate-700 flex-shrink-0"
                          style={{ backgroundColor: player.color }}
                        />
                        <div>
                          <div className="font-bold text-sm flex items-center gap-1.5">
                            <span className={player.isBankrupt ? 'line-through text-slate-500' : 'text-slate-100'}>
                              {player.name}
                            </span>
                            {player.isInJail && (
                              <span className="text-[10px] bg-red-500/20 text-red-300 px-1 py-0.2 rounded border border-red-500/30">
                                ในคุก
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            ทรัพย์สินรวม: <span className="text-emerald-400 font-semibold">{player.netWorth.toLocaleString()} ฿</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-black text-amber-400">
                          {player.cash.toLocaleString()} ฿
                        </div>
                        <div className="text-[10px] text-slate-400">เงินสด</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* บันทึกประวัติเหตุการณ์ในเกม (Event Log) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col min-h-[250px]">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              บันทึกเหตุการณ์
            </h2>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px] text-xs font-mono">
              {gameState.logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2 rounded-lg border text-xs leading-relaxed ${getLogBgColor(log.type)}`}
                >
                  <span className="text-[10px] text-slate-400 font-sans mr-1.5">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* --- MODAL DIALOG: PROPERTY DETAILS POPUP --- */}
      {selectedTile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setSelectedTile(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              ✕
            </button>

            <div className="text-center mb-4">
              <div
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                  getColorGroupMeta(selectedTile.colorGroup).bg
                } ${getColorGroupMeta(selectedTile.colorGroup).text}`}
              >
                {getColorGroupMeta(selectedTile.colorGroup).name}
              </div>
              <h3 className="text-xl font-black text-slate-100">{selectedTile.name}</h3>
              {selectedTile.description && (
                <p className="text-xs text-slate-400 mt-1">{selectedTile.description}</p>
              )}
            </div>

            {selectedTile.price && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs mb-4">
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">ราคาซื้อที่ดิน:</span>
                  <span className="font-bold text-amber-400">{selectedTile.price.toLocaleString()} บาท</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">ค่าเช่าพื้นฐาน:</span>
                  <span className="font-semibold text-emerald-400">{selectedTile.baseRent?.toLocaleString()} บาท</span>
                </div>
                {selectedTile.housePrice && (
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">ค่าสร้างบ้านหลังละ:</span>
                    <span className="font-semibold text-blue-400">{selectedTile.housePrice.toLocaleString()} บาท</span>
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">เจ้าของปัจจุบัน:</span>
                  <span className="font-bold text-slate-200">
                    {selectedTile.ownerId
                      ? gameState.players.find((p) => p.id === selectedTile.ownerId)?.name
                      : 'ยังไม่มีเจ้าของ'}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => setSelectedTile(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DIALOG: CARD DRAWN POPUP --- */}
      {gameState.phase === 'CARD_DRAWN' && gameState.currentCardDrawn && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 mx-auto flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-amber-300">{gameState.currentCardDrawn.title}</h3>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800 my-4">
              "{gameState.currentCardDrawn.description}"
            </p>

            <button
              onClick={handleNextTurn}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition shadow-lg shadow-amber-500/20"
            >
              รับทราบ / ดำเนินการต่อ
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DIALOG: GAME OVER VICTORY SCREEN --- */}
      {gameState.phase === 'GAME_OVER' && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500 rounded-3xl max-w-md w-full p-8 text-center shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500 text-amber-400 mx-auto flex items-center justify-center mb-4 animate-bounce">
              <Trophy className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-amber-300">ขอแสดงความยินดี!</h2>
            <p className="text-slate-300 text-sm mt-1">
              ผู้ชนะเลิศเพียงหนึ่งเดียวคือ{' '}
              <span className="font-bold text-amber-400">
                {gameState.players.find((p) => p.id === gameState.winnerPlayerId)?.name}
              </span>
            </p>

            <button
              onClick={() => gameEngine.restartGame()}
              className="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base shadow-xl shadow-amber-500/30 transition"
            >
              เริ่มเล่นเกมใหม่อีกครั้ง
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * เรนเดอร์ช่องตารางกระดาน 26 ช่องตามพิกัด Grid สี่เหลี่ยม
 */
function renderBoardGrid(state: GameState, onSelectTile: (tile: BoardTile) => void) {
  // สร้างแมปตำแหน่ง Grid cell สำหรับช่องทั้ง 26 ช่อง
  const tilePositions: Record<number, { col: number; row: number }> = {
    // แถวล่าง (Row 7, Col 7 -> 1)
    0: { col: 7, row: 7 },
    1: { col: 6, row: 7 },
    2: { col: 5, row: 7 },
    3: { col: 4, row: 7 },
    4: { col: 3, row: 7 },
    5: { col: 2, row: 7 },
    6: { col: 1, row: 7 },

    // คอลัมน์ซ้าย (Col 1, Row 6 -> 2)
    7: { col: 1, row: 6 },
    8: { col: 1, row: 5 },
    9: { col: 1, row: 4 },
    10: { col: 1, row: 3 },
    11: { col: 1, row: 2 },

    // แถวบน (Row 1, Col 1 -> 7)
    12: { col: 1, row: 1 },
    13: { col: 2, row: 1 },
    14: { col: 3, row: 1 },
    15: { col: 4, row: 1 },
    16: { col: 5, row: 1 },
    17: { col: 6, row: 1 },
    18: { col: 7, row: 1 },

    // คอลัมน์ขวา (Col 7, Row 2 -> 6)
    19: { col: 7, row: 2 },
    20: { col: 7, row: 3 },
    21: { col: 7, row: 4 },
    22: { col: 7, row: 5 },
    23: { col: 7, row: 6 },
  };

  return state.board.map((tile) => {
    const pos = tilePositions[tile.id] || { col: 1, row: 1 };
    const colorMeta = getColorGroupMeta(tile.colorGroup);
    const owner = state.players.find((p) => p.id === tile.ownerId);

    // ผู้เล่นที่ยืนอยู่ในช่องนี้
    const playersHere = state.players.filter((p) => p.position === tile.id && !p.isBankrupt);

    return (
      <div
        key={tile.id}
        onClick={() => onSelectTile(tile)}
        style={{ gridColumnStart: pos.col, gridRowStart: pos.row }}
        className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex flex-col justify-between relative cursor-pointer hover:border-amber-500/50 transition group overflow-hidden"
      >
        {/* แถบสีประจำกลุ่มที่ดิน */}
        {tile.type === 'PROPERTY' && (
          <div className={`h-2.5 w-full rounded-t ${colorMeta.bg}`} />
        )}

        <div className="flex flex-col items-center justify-center flex-1 py-0.5 text-center">
          <span className="text-[10px] font-bold text-slate-200 line-clamp-1 group-hover:text-amber-300">
            {tile.name}
          </span>

          {tile.price && (
            <span className="text-[9px] font-mono text-amber-400/90">{tile.price}฿</span>
          )}
        </div>

        {/* ตัวบ่งชี้เจ้าของ / บ้าน */}
        {owner && (
          <div
            className="w-2.5 h-2.5 rounded-full absolute top-1 right-1 border border-slate-900 shadow"
            style={{ backgroundColor: owner.color }}
            title={`เจ้าของ: ${owner.name}`}
          />
        )}

        {/* ตัวหมากผู้เล่นที่ยืนอยู่ในช่องนี้ */}
        {playersHere.length > 0 && (
          <div className="flex items-center justify-center gap-0.5 mt-0.5 z-10">
            {playersHere.map((p) => (
              <div
                key={p.id}
                className="w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center text-[8px] font-black text-white shadow-md animate-bounce"
                style={{ backgroundColor: p.color }}
                title={p.name}
              >
                P{p.id}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });
}

function getLogBgColor(type: string): string {
  switch (type) {
    case 'SUCCESS':
      return 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300';
    case 'DANGER':
      return 'bg-red-950/40 border-red-800/40 text-red-300';
    case 'WARNING':
      return 'bg-amber-950/40 border-amber-800/40 text-amber-300';
    case 'DICE':
      return 'bg-blue-950/40 border-blue-800/40 text-blue-300';
    case 'CARD':
      return 'bg-purple-950/40 border-purple-800/40 text-purple-300';
    default:
      return 'bg-slate-950/40 border-slate-800/40 text-slate-300';
  }
}
