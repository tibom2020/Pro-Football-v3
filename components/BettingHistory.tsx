
import React from 'react';
import { Bet } from '../types';
import { Trash2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface BettingHistoryProps {
  bets: Bet[];
  onDelete: (id: string) => void;
  onSettle: (id: string, finalScore: string) => void;
}

export const BettingHistory: React.FC<BettingHistoryProps> = ({ bets, onDelete, onSettle }) => {
  const totalPL = bets.reduce((acc, bet) => acc + (bet.status !== 'PENDING' ? bet.profit : 0), 0);

  const getStatusInfo = (status: Bet['status']) => {
    switch (status) {
      case 'WON': return { color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'THẮNG' };
      case 'HALF_WON': return { color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'THẮNG 1/2' };
      case 'LOST': return { color: 'text-rose-600', bg: 'bg-rose-50', label: 'THUA' };
      case 'HALF_LOST': return { color: 'text-rose-500', bg: 'bg-rose-50', label: 'THUA 1/2' };
      case 'PUSH': return { color: 'text-slate-500', bg: 'bg-slate-100', label: 'HÒA' };
      default: return { color: 'text-blue-500', bg: 'bg-blue-50', label: 'ĐANG CHỜ' };
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mt-6">
      <div className="bg-slate-900 p-5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-xl">
            <Clock className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-black text-sm uppercase tracking-wider">Ticket Manager</h3>
            <p className="text-[9px] text-slate-500 font-bold">LỊCH SỬ CƯỢC TRONG TRẬN</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`font-black text-xl tabular-nums ${totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalPL > 0 ? '+' : ''}{totalPL.toLocaleString()}
          </div>
          <div className="text-[9px] text-slate-500 font-black uppercase">Net Profit (P/L)</div>
        </div>
      </div>

      <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto no-scrollbar">
        {bets.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-xs font-bold uppercase tracking-tight">Chưa có vé cược nào</p>
          </div>
        ) : (
          bets.sort((a, b) => b.timestamp - a.timestamp).map((bet) => {
            const status = getStatusInfo(bet.status);
            return (
              <div key={bet.id} className="p-5 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                       <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${bet.type === 'OVER' || bet.type === 'UNDER' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {bet.type} {bet.handicap > 0 ? `+${bet.handicap}` : bet.handicap}
                      </span>
                      <span className={`${status.bg} ${status.color} text-[8px] font-black px-2 py-0.5 rounded-full`}>
                        {status.label}
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-800 leading-tight">{bet.matchName}</span>
                  </div>
                  <button onClick={() => onDelete(bet.id)} className="text-slate-300 hover:text-rose-500 p-1 -mr-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="space-y-1">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Tiền / Odds</div>
                    <div className="font-black text-slate-700 text-xs">{bet.stake.toLocaleString()} / <span className="text-blue-600">@{bet.odds.toFixed(2)}</span></div>
                  </div>
                  <div className="space-y-1 text-center">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Tỷ số lúc cược</div>
                    <div className="font-black text-slate-700 text-xs">{bet.scoreAtBet}</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Lời/Lỗ</div>
                    <div className={`font-black text-sm ${bet.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {bet.profit > 0 ? '+' : ''}{bet.profit.toLocaleString()}
                    </div>
                  </div>
                </div>

                {bet.status === 'PENDING' ? (
                  <button 
                    onClick={() => {
                      const score = prompt("NHẬP TỶ SỐ KẾT THÚC (Ví dụ: 2-1):", bet.scoreAtBet);
                      if (score && /^\d+-\d+$/.test(score)) {
                        onSettle(bet.id, score);
                      } else if (score !== null) { // Handle case where user enters invalid format but doesn't cancel
                        alert("Định dạng tỷ số không hợp lệ. Vui lòng nhập theo dạng SỐ-SỐ, ví dụ: 2-1");
                      }
                    }}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.1em] shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Quyết toán vé cược
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 py-1 border-t border-slate-50 mt-2">
                    <span className="text-[9px] font-bold text-slate-400 italic">Kết quả cuối: {bet.finalScore}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
