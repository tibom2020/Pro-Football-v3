
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MatchInfo, PreGoalAnalysis, ProcessedStats, Bet, BetType, BetStatus } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Activity, Target } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Area } from 'recharts';
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

  const [aiResult, setAiResult] = useState<{ score: number; reasoning: string }>({
    score: 0,
    reasoning: "Đang chờ dữ liệu để AI phân tích..."
  });
  
  // Sync bets with localStorage
  useEffect(() => {
    const savedBets = localStorage.getItem(`bets_${token}_${match.id}`);
    if (savedBets) setBets(JSON.parse(savedBets));
  }, [token, match.id]);

  useEffect(() => {
    if (bets.length > 0) {
      localStorage.setItem(`bets_${token}_${match.id}`, JSON.stringify(bets));
    }
  }, [bets, token, match.id]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
        const updatedDetails = await getMatchDetails(token, liveMatch.id);
        if (updatedDetails) {
          setLiveMatch(updatedDetails);
          const minute = updatedDetails.timer?.tm || parseInt(updatedDetails.time) || 0;
          const newStats = parseStats(updatedDetails.stats);
          setStatsHistory(prev => ({ ...prev, [minute]: newStats }));
        }
        
        const updatedOdds = await getMatchOdds(token, liveMatch.id);
        if (updatedOdds) {
            const overMarkets = updatedOdds.results?.odds?.['1_3'];
            if (overMarkets) setOddsHistory(overMarkets.filter(m => m.time_str).map(m => ({ 
              minute: parseInt(m.time_str), 
              over: parseFloat(m.over_od || '0'), 
              under: parseFloat(m.under_od || '0'), 
              handicap: m.handicap || '0' 
            })));
            
            const homeMarkets = updatedOdds.results?.odds?.['1_2'];
            if (homeMarkets) setHomeOddsHistory(homeMarkets.filter(m => m.time_str).map(m => ({ 
              minute: parseInt(m.time_str), 
              home: parseFloat(m.home_od || '0'), 
              away: parseFloat(m.away_od || '0'), 
              handicap: m.handicap || '0' 
            })));
        }

        // Trigger AI Prediction after refresh
        const latestStats = parseStats(updatedDetails?.stats);
        const [hScore, aScore] = (updatedDetails?.ss || "0-0").split('-').map(Number);
        const prediction = await getGeminiGoalPrediction(
          liveMatch.id,
          updatedDetails?.timer?.tm || 0,
          updatedDetails?.home.name || "",
          updatedDetails?.away.name || "",
          hScore, aScore,
          latestStats,
          calculateAPIScore(latestStats, 0),
          calculateAPIScore(latestStats, 1),
          null, null, 0, 0, 0
        );
        if (prediction) {
          setAiResult({ score: prediction.goal_probability, reasoning: prediction.reasoning || "" });
        }

    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
        setIsRefreshing(false);
    }
  }, [token, liveMatch.id, isRefreshing]);

  useEffect(() => {
    handleRefresh();
  }, []);

  const handlePlaceBet = (type: BetType, handicap: string, odds: number) => {
    const stakeStr = prompt(`XÁC NHẬN CƯỢC:\n${type} HDP ${handicap} @${odds.toFixed(2)}\n\nNhập số tiền cược:`, "1000");
    if (!stakeStr) return;
    
    const stake = parseFloat(stakeStr);
    if (isNaN(stake) || stake <= 0) return;

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
      } else {
        if (diff < -0.25) return { status: 'WON', profit: bet.stake * (bet.odds - 1) };
        if (diff === -0.25) return { status: 'HALF_WON', profit: bet.stake * (bet.odds - 1) * 0.5 };
        if (diff === 0) return { status: 'PUSH', profit: 0 };
        if (diff === 0.25) return { status: 'HALF_LOST', profit: -bet.stake * 0.5 };
        return { status: 'LOST', profit: -bet.stake };
      }
    } else {
      const homeDiff = finalHome - homeAtBet;
      const awayDiff = finalAway - awayAtBet;
      const scoreDiff = homeDiff - awayDiff;
      const diff = bet.type === 'HOME' ? (scoreDiff + bet.handicap) : (awayDiff - homeDiff + bet.handicap);

      if (diff > 0.25) return { status: 'WON', profit: bet.stake * (bet.odds - 1) };
      if (diff === 0.25) return { status: 'HALF_WON', profit: bet.stake * (bet.odds - 1) * 0.5 };
      if (diff === 0) return { status: 'PUSH', profit: 0 };
      if (diff === -0.25) return { status: 'HALF_LOST', profit: -bet.stake * 0.5 };
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
    if (window.confirm("Xóa vé cược này?")) {
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

  const latestOver = oddsHistory.length > 0 ? oddsHistory[oddsHistory.length-1] : null;
  const latestHome = homeOddsHistory.length > 0 ? homeOddsHistory[homeOddsHistory.length-1] : null;

  return (
    <div className="pb-24 max-w-md mx-auto bg-slate-50 min-h-screen">
      <div className="bg-white sticky top-0 z-20 shadow-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full"><ArrowLeft /></button>
        <div className="text-center">
            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Live Analysis & Tracker</div>
            <div className="flex items-center justify-center gap-1">
              <Activity className="w-3 h-3 text-red-500 animate-pulse" />
              <div className="text-slate-900 font-black text-base">{liveMatch.timer?.tm || liveMatch.time}'</div>
            </div>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-slate-600">
          <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Scoreboard */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <div className="text-center flex-1 min-w-0">
                <div className="font-black text-slate-800 text-sm truncate uppercase">{liveMatch.home.name}</div>
                <div className="text-[9px] font-bold text-slate-400 mt-1">HOME</div>
            </div>
            <div className="flex flex-col items-center px-4">
                <div className="flex items-center gap-3">
                  <span className="text-5xl font-black text-slate-900 tabular-nums">{liveMatch.ss?.split('-')[0] || 0}</span>
                  <span className="text-slate-300 font-light text-3xl">:</span>
                  <span className="text-5xl font-black text-slate-900 tabular-nums">{liveMatch.ss?.split('-')[1] || 0}</span>
                </div>
            </div>
            <div className="text-center flex-1 min-w-0">
                <div className="font-black text-slate-800 text-sm truncate uppercase">{liveMatch.away.name}</div>
                <div className="text-[9px] font-bold text-slate-400 mt-1">AWAY</div>
            </div>
        </div>

        {/* Betting Interface */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 opacity-70" />
              <span className="text-[10px] font-black uppercase tracking-wider">Handicap (AH)</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button 
                disabled={!latestHome}
                onClick={() => latestHome && handlePlaceBet('HOME', latestHome.handicap, latestHome.home)}
                className="bg-white/10 hover:bg-white/20 active:scale-95 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all"
              >
                <span className="text-[11px] font-medium">H {latestHome?.handicap}</span>
                <span className="font-black text-sm">@{latestHome?.home.toFixed(2)}</span>
              </button>
              <button 
                disabled={!latestHome}
                onClick={() => latestHome && handlePlaceBet('AWAY', latestHome.handicap, latestHome.away)}
                className="bg-white/10 hover:bg-white/20 active:scale-95 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all"
              >
                <span className="text-[11px] font-medium">A {latestHome?.handicap}</span>
                <span className="font-black text-sm">@{latestHome?.away.toFixed(2)}</span>
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 opacity-70" />
              <span className="text-[10px] font-black uppercase tracking-wider">Over / Under</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button 
                disabled={!latestOver}
                onClick={() => latestOver && handlePlaceBet('OVER', latestOver.handicap, latestOver.over)}
                className="bg-white/10 hover:bg-white/20 active:scale-95 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all"
              >
                <span className="text-[11px] font-medium">Over {latestOver?.handicap}</span>
                <span className="font-black text-sm">@{latestOver?.over.toFixed(2)}</span>
              </button>
              <button 
                disabled={!latestOver}
                onClick={() => latestOver && handlePlaceBet('UNDER', latestOver.handicap, latestOver.under)}
                className="bg-white/10 hover:bg-white/20 active:scale-95 py-2.5 rounded-xl flex justify-between px-3 items-center border border-white/10 transition-all"
              >
                <span className="text-[11px] font-medium">Under {latestOver?.handicap}</span>
                <span className="font-black text-sm">@{latestOver?.under.toFixed(2)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* AI Insight */}
        <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Siren className="w-20 h-20" /></div>
            <div className="flex items-center gap-3 mb-4">
                <Siren className="text-red-500 w-5 h-5 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">AI Momentum Detector</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <div className="text-4xl font-black">{aiResult.score}%</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase">Goal Probability</div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">{aiResult.reasoning}</p>
        </div>

        {/* Momentum Chart */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" /> API Momentum
            </h3>
            <div className="flex gap-3 text-[9px] font-bold">
              <div className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> Home</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded-full"></span> Away</div>
            </div>
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={apiChartData}>
                <XAxis dataKey="minute" hide />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip content={<div className="bg-slate-800 text-white p-2 rounded text-[10px] font-bold">...</div>} />
                <Area type="monotone" dataKey="homeApi" stroke="#3b82f6" fillOpacity={0.1} fill="#3b82f6" strokeWidth={3} />
                <Area type="monotone" dataKey="awayApi" stroke="#f97316" fillOpacity={0.1} fill="#f97316" strokeWidth={3} />
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

        <BettingHistory 
          bets={bets} 
          onDelete={handleDeleteBet}
          onSettle={handleSettle}
        />
      </div>
    </div>
  );
};
