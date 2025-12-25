
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MatchInfo, PreGoalAnalysis, ProcessedStats, Bet, BetType, BetStatus } from '../types';
import { parseStats, getMatchDetails, getMatchOdds } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Activity, Target, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Line } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable';
import { BettingHistory } from './BettingHistory';

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

const calculateAPIScore = (stats: ProcessedStats | undefined, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    const onTarget = stats.on_target[sideIndex];
    const offTarget = stats.off_target[sideIndex];
    const shots = onTarget + offTarget;
    const corners = stats.corners[sideIndex];
    const dangerous = stats.dangerous_attacks[sideIndex];
    return (shots * 1.0) + (onTarget * 3.0) + (corners * 0.7) + (dangerous * 0.1);
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; away: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [bets, setBets] = useState<Bet[]>([]);

  // Sync bets with localStorage
  useEffect(() => {
    const savedBets = localStorage.getItem(`bets_${match.id}`);
    if (savedBets) {
      try {
        setBets(JSON.parse(savedBets));
      } catch (e) {
        console.error("Failed to parse bets from localStorage", e);
      }
    }
  }, [match.id]);

  useEffect(() => {
    localStorage.setItem(`bets_${match.id}`, JSON.stringify(bets));
  }, [bets, match.id]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
        const updatedDetails = await getMatchDetails(token, liveMatch.id);
        if (updatedDetails) {
          setLiveMatch(updatedDetails);
          const minute = updatedDetails.timer?.tm || parseInt(updatedDetails.time) || 0;
          const newStats = parseStats(updatedDetails.stats);
          if (minute > 0) {
            setStatsHistory(prev => ({ ...prev, [minute]: newStats }));
          }
        }
        
        const updatedOdds = await getMatchOdds(token, liveMatch.id);
        if (updatedOdds) {
            const overMarkets = updatedOdds.results?.odds?.['1_3'];
            if (overMarkets) {
              setOddsHistory(overMarkets.filter(m => m.time_str).map(m => ({ 
                minute: parseInt(m.time_str), 
                over: parseFloat(m.over_od || '0'), 
                under: parseFloat(m.under_od || '0'), 
                handicap: m.handicap || '0' 
              })));
            }
            
            const homeMarkets = updatedOdds.results?.odds?.['1_2'];
            if (homeMarkets) {
              setHomeOddsHistory(homeMarkets.filter(m => m.time_str).map(m => ({ 
                minute: parseInt(m.time_str), 
                home: parseFloat(m.home_od || '0'), 
                away: parseFloat(m.away_od || '0'), 
                handicap: m.handicap || '0' 
              })));
            }
        }

    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
        setIsRefreshing(false);
    }
  }, [token, liveMatch.id, isRefreshing]);

  useEffect(() => {
    handleRefresh();
    const interval = setInterval(handleRefresh, 45000); // Auto-refresh every 45 seconds
    return () => clearInterval(interval);
  }, [handleRefresh]);

  const handlePlaceBet = (type: BetType, handicap: string, odds: number) => {
    const stakeStr = prompt(`XÁC NHẬN CƯỢC:\n${type} HDP ${handicap} @${odds.toFixed(2)}\n\nNhập số tiền cược:`, "1000");
    if (!stakeStr) return;
    
    const stake = parseFloat(stakeStr);
    if (isNaN(stake) || stake <= 0) {
        alert("Số tiền cược không hợp lệ.");
        return;
    }

    const newBet: Bet = {
      id: Math.random().toString(36).substr(2, 9),
      matchId: liveMatch.id,
      matchName: `${liveMatch.home.name} vs ${liveMatch.away.name}`,
      type,
      handicap: parseFloat(handicap),
      odds,
      stake,
      scoreAtBet: liveMatch.ss || "0-0",
      status: 'PENDING',
      profit: 0,
      timestamp: Date.now()
    };
    setBets(prev => [newBet, ...prev]);
  };

  const calculateSettlement = (bet: Bet, finalScore: string): { status: BetStatus, profit: number } => {
    const [finalHome, finalAway] = finalScore.split('-').map(Number);
    const [homeAtBet, awayAtBet] = bet.scoreAtBet.split('-').map(Number);
    
    if (bet.type === 'OVER' || bet.type === 'UNDER') {
      const goalsAfterBet = (finalHome + finalAway) - (homeAtBet + awayAtBet);
      const diff = goalsAfterBet - bet.handicap;

      if (bet.type === 'OVER') {
        if (diff > 0.25) return { status: 'WON', profit: bet.stake * (bet.odds - 1) };
        if (diff === 0.25) return { status: 'HALF_WON', profit: bet.stake * (bet.odds - 1) * 0.5 };
        if (diff === 0) return { status: 'PUSH', profit: 0 };
        if (diff === -0.25) return { status: 'HALF_LOST', profit: -bet.stake * 0.5 };
        return { status: 'LOST', profit: -bet.stake };
      } else { // UNDER
        if (diff < -0.25) return { status: 'WON', profit: bet.stake * (bet.odds - 1) };
        if (diff === -0.25) return { status: 'HALF_WON', profit: bet.stake * (bet.odds - 1) * 0.5 };
        if (diff === 0) return { status: 'PUSH', profit: 0 };
        if (diff === 0.25) return { status: 'HALF_LOST', profit: -bet.stake * 0.5 };
        return { status: 'LOST', profit: -bet.stake };
      }
    } else { // HOME or AWAY
      const homeGoalsAfterBet = finalHome - homeAtBet;
      const awayGoalsAfterBet = finalAway - awayAtBet;
      
      const diffForCheck = (bet.type === 'HOME') 
        ? (homeGoalsAfterBet - awayGoalsAfterBet) + bet.handicap
        : (awayGoalsAfterBet - homeGoalsAfterBet) + bet.handicap;

      if (diffForCheck > 0.25) return { status: 'WON', profit: bet.stake * (bet.odds - 1) };
      if (diffForCheck === 0.25) return { status: 'HALF_WON', profit: bet.stake * (bet.odds - 1) * 0.5 };
      if (diffForCheck === 0) return { status: 'PUSH', profit: 0 };
      if (diffForCheck === -0.25) return { status: 'HALF_LOST', profit: -bet.stake * 0.5 };
      return { status: 'LOST', profit: -bet.stake };
    }
  };

  const handleSettle = (id: string, finalScore: string) => {
    setBets(prev => prev.map(bet => {
      if (bet.id === id) {
        const { status, profit } = calculateSettlement(bet, finalScore);
        return { ...bet, status, profit, finalScore };
      }
      return bet;
    }));
  };

  const handleDeleteBet = (id: string) => {
    if (window.confirm("Bạn có chắc muốn xóa vé cược này không?")) {
      setBets(prev => prev.filter(b => b.id !== id));
    }
  };

  const apiChartData = useMemo(() => {
    const minutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
    return minutes.map(min => ({
      minute: min,
      homeApi: calculateAPIScore(statsHistory[min], 0),
      awayApi: calculateAPIScore(statsHistory[min], 1)
    }));
  }, [statsHistory]);

  const latestOver = oddsHistory.length > 0 ? oddsHistory[oddsHistory.length - 1] : null;
  const latestHome = homeOddsHistory.length > 0 ? homeOddsHistory[homeOddsHistory.length - 1] : null;

  return (
    <div className="pb-24 max-w-md mx-auto bg-slate-50 min-h-screen">
      <div className="bg-white sticky top-0 z-20 shadow-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft /></button>
        <div className="text-center">
            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Live Analysis & Tracker</div>
            <div className="flex items-center justify-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <div className="text-slate-900 font-black text-base">{liveMatch.timer?.tm || liveMatch.time}'</div>
            </div>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-slate-600 active:scale-95 transition-transform">
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 py-5 space-y-6">
        {/* Scoreboard */}
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <div className="text-center flex-1 min-w-0">
                <div className="font-black text-slate-800 text-sm truncate uppercase tracking-tight">{liveMatch.home.name}</div>
                <div className="text-[9px] font-bold text-slate-400 mt-1">HOME</div>
            </div>
            <div className="flex items-center gap-3 px-4">
              <span className="text-5xl font-black text-slate-900 tabular-nums">{(liveMatch.ss || "0-0").split('-')[0]}</span>
              <span className="text-slate-300 font-light text-3xl">:</span>
              <span className="text-5xl font-black text-slate-900 tabular-nums">{(liveMatch.ss || "0-0").split('-')[1]}</span>
            </div>
            <div className="text-center flex-1 min-w-0">
                <div className="font-black text-slate-800 text-sm truncate uppercase tracking-tight">{liveMatch.away.name}</div>
                <div className="text-[9px] font-bold text-slate-400 mt-1">AWAY</div>
            </div>
        </div>

        {/* Live Betting Interface */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-2xl p-4 shadow-lg shadow-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 opacity-70" />
              <span className="text-[10px] font-black uppercase tracking-wider">Kèo Châu Á (AH)</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button 
                disabled={!latestHome || !latestHome.home}
                onClick={() => latestHome && handlePlaceBet('HOME', latestHome.handicap, latestHome.home)}
                className="bg-white/10 hover:bg-white/20 active:bg-white/30 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-[11px] font-medium">Home {latestHome?.handicap}</span>
                <span className="font-black text-sm">@{latestHome?.home.toFixed(2)}</span>
              </button>
              <button 
                disabled={!latestHome || !latestHome.away}
                onClick={() => latestHome && handlePlaceBet('AWAY', latestHome.handicap, latestHome.away)}
                className="bg-white/10 hover:bg-white/20 active:bg-white/30 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-[11px] font-medium">Away {latestHome?.handicap}</span>
                <span className="font-black text-sm">@{latestHome?.away.toFixed(2)}</span>
              </button>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-lg shadow-emerald-200">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 opacity-70" />
              <span className="text-[10px] font-black uppercase tracking-wider">Kèo Tài Xỉu (O/U)</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button 
                disabled={!latestOver || !latestOver.over}
                onClick={() => latestOver && handlePlaceBet('OVER', latestOver.handicap, latestOver.over)}
                className="bg-white/10 hover:bg-white/20 active:bg-white/30 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-[11px] font-medium">Tài {latestOver?.handicap}</span>
                <span className="font-black text-sm">@{latestOver?.over.toFixed(2)}</span>
              </button>
              <button 
                disabled={!latestOver || !latestOver.under}
                onClick={() => latestOver && handlePlaceBet('UNDER', latestOver.handicap, latestOver.under)}
                className="bg-white/10 hover:bg-white/20 active:bg-white/30 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-[11px] font-medium">Xỉu {latestOver?.handicap}</span>
                <span className="font-black text-sm">@{latestOver?.under.toFixed(2)}</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Momentum Chart */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-500"/> Biểu đồ API Momentum</h3>
            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={apiChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <XAxis dataKey="minute" unit="'" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                        <Tooltip contentStyle={{ fontSize: '12px', padding: '5px', borderRadius: '8px' }} />
                        <Line type="monotone" dataKey="homeApi" name="Home API" stroke="#3b82f6" strokeWidth={3} dot={false} />
                        <Line type="monotone" dataKey="awayApi" name="Away API" stroke="#f97316" strokeWidth={3} dot={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>

        <LiveStatsTable 
          liveMatch={liveMatch} 
          oddsHistory={oddsHistory} 
          homeOddsHistory={homeOddsHistory} 
          apiChartData={apiChartData} 
        />
        
        {/* Betting History Ledger */}
        <BettingHistory
          bets={bets}
          onDelete={handleDeleteBet}
          onSettle={handleSettle}
        />
      </div>
    </div>
  );
};
