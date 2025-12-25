
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { MatchInfo, PreGoalAnalysis, OddsItem, ProcessedStats, AIPredictionResponse, OddsData } from '../types';
import { parseStats, getMatchDetails, getMatchOdds, getGeminiGoalPrediction } from '../services/api';
import { ArrowLeft, RefreshCw, Siren, TrendingUp, Info } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis, Tooltip, Cell, Line, Legend } from 'recharts';
import { LiveStatsTable } from './LiveStatsTable'; // Import the new component
import { TicketManager } from './TicketManager'; // Import the new TicketManager component

// --- Types for Highlights and Shots ---
interface Highlight {
    minute: number;
    level: 'weak' | 'medium' | 'strong';
    label: string;
}
interface AllHighlights {
    overUnder: Highlight[];
    homeOdds: Highlight[];
}
interface ShotEvent {
    minute: number;
    type: 'on' | 'off';
}

interface DashboardProps {
  token: string;
  match: MatchInfo;
  onBack: () => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const minute = label;
    const marketData = payload.find(p => p.dataKey === 'handicap')?.payload;
    const homeApiData = payload.find(p => p.dataKey === 'homeApi');
    const awayApiData = payload.find(p => p.dataKey === 'awayApi');

    return (
        <div className="bg-slate-800 text-white text-xs p-2 rounded shadow-lg border border-slate-700">
            <p className="font-bold">Phút: {minute}'</p>
            {marketData && (
                <>
                    <p>HDP: {typeof marketData.handicap === 'number' ? marketData.handicap.toFixed(2) : '-'}</p>
                    {marketData.over !== undefined && (
                        <p className="text-gray-400">Tỷ lệ Tài: {typeof marketData.over === 'number' ? marketData.over.toFixed(3) : '-'}</p>
                    )}
                    {marketData.home !== undefined && (
                         <p className="text-gray-400">Tỷ lệ Đội nhà: {typeof marketData.home === 'number' ? marketData.home.toFixed(3) : '-'}</p>
                    )}
                </>
            )}
            {homeApiData && homeApiData.value !== undefined && (
                 <p style={{ color: homeApiData.stroke }}>API Đội nhà: {homeApiData.value.toFixed(1)}</p>
            )}
             {awayApiData && awayApiData.value !== undefined && (
                 <p style={{ color: awayApiData.stroke }}>API Đội khách: {awayApiData.value.toFixed(1)}</p>
            )}
        </div>
    );
  }
  return null;
};

const OddsColorLegent = () => (
    <div className="flex items-center justify-center space-x-2 mt-3 text-xs text-gray-500">
        <span>Tỷ lệ thấp</span>
        <div className="w-24 h-2 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500"></div>
        <span>Tỷ lệ cao</span>
    </div>
);

// --- API Calculation ---
const calculateAPIScore = (stats: ProcessedStats | undefined, sideIndex: 0 | 1): number => {
    if (!stats) return 0;
    const onTarget = stats.on_target[sideIndex];
    const offTarget = stats.off_target[sideIndex];
    const shots = onTarget + offTarget;
    const corners = stats.corners[sideIndex];
    const dangerous = stats.dangerous_attacks[sideIndex];
    return (shots * 1.0) + (onTarget * 3.0) + (corners * 0.7) + (dangerous * 0.1);
};

// --- Overlay Components ---
const OverlayContainer = ({ children }: { children?: React.ReactNode }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            if (entries[0]) setWidth(entries[0].contentRect.width);
        });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {width > 0 && React.Children.map(children, child =>
                React.isValidElement(child) ? React.cloneElement(child, { containerWidth: width } as any) : child
            )}
        </div>
    );
};

const HighlightBands = ({ highlights, containerWidth }: { highlights: Highlight[], containerWidth?: number }) => {
    if (!containerWidth || highlights.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth;
    };

    const getHighlightColor = (level: Highlight['level']) => {
      switch (level) {
        case 'strong': return '#dc2626'; // Tailwind red-600
        case 'medium': return '#f97316'; // Tailwind orange-500
        case 'weak': return '#facc15';   // Tailwind yellow-400
        default: return '#cbd5e1';       // Tailwind slate-300 as fallback
      }
    };

    return <>
        {highlights.map((h, i) => (
            <div 
                key={i} 
                className={`goal-highlight`} 
                style={{ 
                    left: `${calculateLeft(h.minute)}px`,
                    backgroundColor: getHighlightColor(h.level) // Apply color directly
                }}
            >
                <div className={`highlight-label label-color-${h.level}`}>{h.label}</div>
            </div>
        ))}
    </>;
};

const ShotBalls = ({ shots, containerWidth }: { shots: ShotEvent[], containerWidth?: number }) => {
    if (!containerWidth || shots.length === 0) return null;
    
    const calculateLeft = (minute: number) => {
        const yAxisLeftWidth = 45;
        const yAxisRightWidth = 35;
        const chartAreaWidth = containerWidth - yAxisLeftWidth - yAxisRightWidth;
        const leftOffset = yAxisLeftWidth;
        return leftOffset + (minute / 90) * chartAreaWidth - 10; // Center the ball (20px wide)
    };

    const shotsByMinute = shots.reduce((acc, shot) => {
        if (!acc[shot.minute]) acc[shot.minute] = [];
        acc[shot.minute].push(shot.type);
        return acc;
    }, {} as Record<number, ('on' | 'off')[]>);

    return <>
        {Object.entries(shotsByMinute).map(([minute, types]) => 
            types.map((type, index) => (
                 <div 
                    key={`${minute}-${index}`} 
                    className={`ball-icon ${type === 'on' ? 'ball-on' : 'ball-off'}`}
                    style={{ left: `${calculateLeft(Number(minute))}px`, top: `${-10 + index * 24}px` }}
                    title={`Shot ${type}-target at ${minute}'`}
                >
                    ⚽
                </div>
            ))
        )}
    </>;
};

export const Dashboard: React.FC<DashboardProps> = ({ token, match, onBack }) => {
  // AUTO_REFRESH_INTERVAL_MS is for match details and odds (every 40s)
  const AUTO_REFRESH_INTERVAL_MS = 40000; // 40 seconds for individual match auto-refresh

  const [liveMatch, setLiveMatch] = useState<MatchInfo>(match);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAIPredicting, setIsAIPredicting] = useState(false); // New state for AI prediction loading
  const [oddsHistory, setOddsHistory] = useState<{ minute: number; over: number; under: number; handicap: string }[]>([]);
  const [homeOddsHistory, setHomeOddsHistory] = useState<{ minute: number; home: number; away: number; handicap: string }[]>([]);
  const [statsHistory, setStatsHistory] = useState<Record<number, ProcessedStats>>({});
  const [highlights, setHighlights] = useState<AllHighlights>({ overUnder: [], homeOdds: [] });
  const [shotEvents, setShotEvents] = useState<ShotEvent[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<PreGoalAnalysis[]>([]);
  
  const stats = useMemo(() => parseStats(liveMatch.stats), [liveMatch.stats]);
  const latestAnalysis = useMemo(() => analysisHistory[0] || null, [analysisHistory]);

  // --- Persistence Effects ---
  useEffect(() => {
    const savedStats = localStorage.getItem(`statsHistory_${match.id}`);
    if (savedStats) setStatsHistory(JSON.parse(savedStats)); else setStatsHistory({});
    
    const savedHighlights = localStorage.getItem(`highlights_${match.id}`);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights)); else setHighlights({ overUnder: [], homeOdds: [] });

    const savedAnalysis = localStorage.getItem(`analysisHistory_${match.id}`);
    if (savedAnalysis) setAnalysisHistory(JSON.parse(savedAnalysis)); else setAnalysisHistory([]);

  }, [match.id]);

  useEffect(() => {
     if (Object.keys(statsHistory).length > 0) {
        localStorage.setItem(`statsHistory_${match.id}`, JSON.stringify(statsHistory));
     }
  }, [statsHistory, match.id]);

  useEffect(() => {
    if (highlights.overUnder.length > 0 || highlights.homeOdds.length > 0) {
        localStorage.setItem(`highlights_${match.id}`, JSON.stringify(highlights));
    }
  }, [highlights, match.id]);

  useEffect(() => {
    if (analysisHistory.length > 0) {
        localStorage.setItem(`analysisHistory_${match.id}`, JSON.stringify(analysisHistory));
    }
  }, [analysisHistory, match.id]);


  const marketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; over: number; under: number; handicap: string; }[]> = {};
    oddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            if (index > 0) {
                const diff = point.over - points[index - 1].over;
                if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
            }
            return { ...point, handicap: parseFloat(point.handicap), color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [oddsHistory]);

  const homeMarketChartData = useMemo(() => {
    const dataByHandicap: Record<string, { minute: number; home: number; away: number; handicap: string; }[]> = {};
    homeOddsHistory.forEach(p => {
        if (!dataByHandicap[p.handicap]) dataByHandicap[p.handicap] = [];
        dataByHandicap[p.handicap].push(p);
    });
    const finalData: any[] = [];
    for (const handicapKey in dataByHandicap) {
        const points = dataByHandicap[handicapKey];
        const coloredPoints = points.map((point, index) => {
            let color = '#f87171', colorName = 'red';
            const handicapValue = parseFloat(point.handicap);
            if (index > 0) {
                const diff = point.home - points[index - 1].home;
                if (handicapValue < 0) {
                    if (diff < -0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                } else {
                    if (diff > 0.02) { color = '#facc15'; colorName = 'yellow'; }
                    else if (Math.abs(diff) <= 0.02) { color = '#4ade80'; colorName = 'green'; }
                }
            }
            return { ...point, handicap: handicapValue, color, colorName, highlight: false };
        });
        for (let i = 0; i <= coloredPoints.length - 3; i++) {
            const [b1, b2, b3] = [coloredPoints[i], coloredPoints[i+1], coloredPoints[i+2]];
            if (b3.minute - b1.minute < 5 && (b1.colorName === 'yellow' || b1.colorName === 'green') && b1.colorName === b2.colorName && b2.colorName === b3.colorName && !b1.highlight) {
                b1.highlight = b2.highlight = b3.highlight = true;
            }
        }
        finalData.push(...coloredPoints);
    }
    return finalData;
  }, [homeOddsHistory]);

  const runPatternDetection = useCallback(async (aiScore: number, aiLevel: PreGoalAnalysis['level']) => {
    const currentMinute = parseInt(liveMatch.timer?.tm?.toString() || liveMatch.time || "0");
    if (!currentMinute || currentMinute < 10) return;

    let highlightLevel: Highlight['level'] | null = null;
    if (aiLevel === 'rất cao') highlightLevel = 'strong';
    else if (aiLevel === 'cao') highlightLevel = 'medium';
    else if (aiLevel === 'trung bình') highlightLevel = 'weak';
    
    if (highlightLevel) {
        const newHighlight: Highlight = { minute: currentMinute, level: highlightLevel, label: `${aiScore}%` };
        setHighlights(prev => {
            const alreadyExists = prev.overUnder.some(h => h.minute === newHighlight.minute && h.level === newHighlight.level);
            if (!alreadyExists) {
                return {
                    overUnder: [...prev.overUnder, newHighlight],
                    homeOdds: [...prev.homeOdds, newHighlight]
                };
            }
            return prev;
        });
    }
  }, [liveMatch.timer, liveMatch.time]);

  const fetchGeminiPrediction = useCallback(async () => {
    setIsAIPredicting(true);
    try {
        const latestDetails = await getMatchDetails(token, liveMatch.id);
        if (!latestDetails) {
            console.warn("Could not get latest match details for AI prediction.");
            return;
        }

        setLiveMatch(latestDetails); 
        const currentParsedStats = parseStats(latestDetails.stats);
        const currentTime = latestDetails.timer?.tm;
        if (currentTime && latestDetails.stats) {
            setStatsHistory(prev => ({ ...prev, [currentTime]: currentParsedStats }));
        }

        const latestOddsData = await getMatchOdds(token, liveMatch.id); 
        const tempOddsHistory = latestOddsData?.results?.odds?.['1_3']
            ?.filter(m => m.time_str && m.over_od && m.under_od && m.handicap)
            .map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! }))
            .sort((a, b) => a.minute - b.minute) || oddsHistory;

        const tempHomeOddsHistory = latestOddsData?.results?.odds?.['1_2']
            ?.filter(m => m.time_str && m.home_od && m.away_od && m.handicap)
            .map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! }))
            .sort((a,b) => a.minute - b.minute) || homeOddsHistory;
        
        setOddsHistory(tempOddsHistory);
        setHomeOddsHistory(tempHomeOddsHistory);

        const currentMinute = parseInt(latestDetails?.timer?.tm?.toString() || latestDetails?.time || "0");
        const homeScore = parseInt((latestDetails?.ss || "0-0").split("-")[0]);
        const awayScore = parseInt((latestDetails?.ss || "0-0").split("-")[1]);
        const homeTeamName = latestDetails?.home.name || "Home";
        const awayTeamName = latestDetails?.away.name || "Away";

        const currentLatestOverOdds = tempOddsHistory.length > 0 ? tempOddsHistory[tempOddsHistory.length - 1] : null;
        const currentLatestHomeOdds = tempHomeOddsHistory.length > 0 ? tempHomeOddsHistory[tempHomeOddsHistory.length - 1] : null;

        const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
        const getAPIMomentumAt = (minute: number, window: number) => {
            if (!currentParsedStats) return 0;
            const currentTotal = calculateAPIScore(currentParsedStats, 0) + calculateAPIScore(currentParsedStats, 1);
            const pastMinute = Math.max(0, minute - window);
            const pastTimes = allTimes.filter(t => t <= pastMinute);
            const pastTime = pastTimes.length > 0 ? Math.max(...pastTimes) : (allTimes[0] || 0);
            const pastStats = statsHistory[pastTime] || { attacks:[0,0], dangerous_attacks:[0,0], on_target:[0,0], off_target:[0,0], corners:[0,0], yellowcards:[0,0], redcards:[0,0] };
            const pastTotal = calculateAPIScore(pastStats, 0) + calculateAPIScore(pastStats, 1);
            return currentTotal - pastTotal;
        };
        const getShotClusterScore = (minute: number, window: number) => {
            const minT = Math.max(0, minute - window + 1);
            let score = 0;
            allTimes.filter(t => t >= minT && t <= minute).forEach(t => {
                const s = statsHistory[t];
                if (s) score += (s.on_target[0] + s.on_target[1]) * 3.0 + (s.off_target[0] + s.off_target[1]) * 1.0;
            });
            return score;
        };
        const getBubbleIntensity = (chartData: any[], minute: number, range: number) => {
            const minT = Math.max(0, minute - range);
            return chartData.filter(b => b.minute >= minT && b.minute <= minute && (b.colorName==='green' || b.colorName==='yellow' || b.highlight))
                            .reduce((acc, b) => acc + (b.highlight ? 1.6 : 1.0), 0);
        };
        const apiMomentum = getAPIMomentumAt(currentMinute, 5);
        const shotCluster = getShotClusterScore(currentMinute, 5);
        const pressure = getBubbleIntensity(marketChartData, currentMinute, 3) + getBubbleIntensity(homeMarketChartData, currentMinute, 3);
        
        const homeApiScore = currentParsedStats ? calculateAPIScore(currentParsedStats, 0) : 0;
        const awayApiScore = currentParsedStats ? calculateAPIScore(currentParsedStats, 1) : 0;

        const aiPrediction = await getGeminiGoalPrediction(
            liveMatch.id, currentMinute, homeTeamName, awayTeamName, homeScore, awayScore,
            currentParsedStats, homeApiScore, awayApiScore, currentLatestOverOdds, 
            currentLatestHomeOdds, apiMomentum, shotCluster, pressure
        );

        if (aiPrediction) {
            const newAnalysis: PreGoalAnalysis = {
                minute: currentMinute,
                score: aiPrediction.goal_probability,
                level: aiPrediction.confidence_level,
                factors: { apiMomentum, shotCluster, pressure },
                reasoning: aiPrediction.reasoning,
            };
            setAnalysisHistory(prev => [newAnalysis, ...prev.filter(a => a.minute !== currentMinute)]);
            runPatternDetection(aiPrediction.goal_probability, aiPrediction.confidence_level);
        } else {
            console.warn("Gemini AI prediction failed, analysis not updated.");
        }
    } catch (error) {
        console.error("Error fetching Gemini prediction:", error);
    } finally {
        setIsAIPredicting(false);
    }
  }, [token, liveMatch.id, oddsHistory, homeOddsHistory, statsHistory, marketChartData, homeMarketChartData, runPatternDetection]);


  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
        const updatedDetails = await getMatchDetails(token, liveMatch.id);
        if (updatedDetails) {
            setLiveMatch(updatedDetails);
            const currentTime = updatedDetails.timer?.tm;
            if (currentTime && updatedDetails.stats) {
                const currentParsedStats = parseStats(updatedDetails.stats);
                setStatsHistory(prev => ({ ...prev, [currentTime]: currentParsedStats }));
            }
            
            const currentMinute = updatedDetails.timer?.tm;
            if (currentMinute && !isAIPredicting) {
                const lastAnalysisMinute = latestAnalysis?.minute;
                
                const shouldPredict = lastAnalysisMinute === undefined
                    ? currentMinute >= 10
                    : currentMinute >= lastAnalysisMinute + 10;

                if (shouldPredict) {
                    fetchGeminiPrediction();
                }
            }
        }
        
        const updatedOdds = await getMatchOdds(token, liveMatch.id);
        if (updatedOdds) {
            const overMarkets = updatedOdds.results?.odds?.['1_3'];
            if (overMarkets) {
                const newHistory = overMarkets
                    .filter(m => m.time_str && m.over_od && m.under_od && m.handicap)
                    .map(m => ({ minute: parseInt(m.time_str), over: parseFloat(m.over_od!), under: parseFloat(m.under_od!), handicap: m.handicap! }))
                    .sort((a, b) => a.minute - b.minute);
                setOddsHistory(newHistory);
            }
            const homeMarkets = updatedOdds.results?.odds?.['1_2'];
            if (homeMarkets) {
                const newHomeHistory = homeMarkets
                    .filter(m => m.time_str && m.home_od && m.away_od && m.handicap)
                    .map(m => ({ minute: parseInt(m.time_str), home: parseFloat(m.home_od!), away: parseFloat(m.away_od!), handicap: m.handicap! }))
                    .sort((a,b) => a.minute - b.minute);
                setHomeOddsHistory(newHomeHistory);
            }
        }
        
        if (latestAnalysis) {
            runPatternDetection(latestAnalysis.score, latestAnalysis.level); 
        }

    } catch (error) {
        console.error("Error during data refresh:", error);
    } finally {
        setIsRefreshing(false);
    }
  }, [token, liveMatch.id, latestAnalysis, runPatternDetection, fetchGeminiPrediction, isAIPredicting]); 
  
  useEffect(() => {
    let isMounted = true;
    handleRefresh();
    const intervalId = window.setInterval(() => {
      if (isMounted) {
        handleRefresh();
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [handleRefresh, AUTO_REFRESH_INTERVAL_MS]);
  
  useEffect(() => {
      const allTimes = Object.keys(statsHistory).map(Number).sort((a,b)=>a-b);
      if (allTimes.length < 2) return;
      const newShots: ShotEvent[] = [];
      for(let i=1; i<allTimes.length; i++) {
          const t = allTimes[i];
          const prevT = allTimes[i-1];
          const stat = statsHistory[t];
          const prevStat = statsHistory[prevT];
          if(!stat || !prevStat) continue;

          const onTargetDelta = (stat.on_target[0] + stat.on_target[1]) - (prevStat.on_target[0] + prevStat.on_target[1]);
          const offTargetDelta = (stat.off_target[0] + stat.off_target[1]) - (prevStat.off_target[0] + prevStat.off_target[1]);
          
          for(let j=0; j<onTargetDelta; j++) newShots.push({ minute: t, type: 'on' });
          for(let j=0; j<offTargetDelta; j++) newShots.push({ minute: t, type: 'off' });
      }
      setShotEvents(newShots);
  }, [statsHistory]);


  const scoreParts = (liveMatch.ss || "0-0").split("-");
  
  const apiChartData = useMemo(() => {
      const sortedMinutes = Object.keys(statsHistory).map(Number).sort((a, b) => a - b);
      return sortedMinutes.map(minute => ({ minute, homeApi: calculateAPIScore(statsHistory[minute], 0), awayApi: calculateAPIScore(statsHistory[minute], 1) }));
  }, [statsHistory]);
  
  const currentMinute = useMemo(() => liveMatch.timer?.tm || parseInt(liveMatch.time || '0'), [liveMatch.timer, liveMatch.time]);
  const hasRecentAnalysis = useMemo(() => {
      if (!latestAnalysis) return false;
      const lastAnalysisMinute = latestAnalysis.minute;
      return currentMinute < lastAnalysisMinute + 10;
  }, [currentMinute, latestAnalysis]);

  return (
    <div className="pb-10">
      <div className="bg-white sticky top-0 z-10 shadow-sm border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
             <span className="text-xs font-bold text-gray-400">PHÂN TÍCH TRỰC TIẾP</span>
             <span className="text-red-500 font-bold flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                {liveMatch.timer?.tm || liveMatch.time}'
             </span>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={fetchGeminiPrediction} 
              disabled={isAIPredicting || hasRecentAnalysis} 
              className="p-2 -mr-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Phân tích AI"
              title={hasRecentAnalysis ? `Đã có phân tích gần đây lúc ${latestAnalysis?.minute}'. Vui lòng đợi đến phút ${latestAnalysis && latestAnalysis.minute + 10}'` : 'Chạy phân tích AI'}
            >
              {isAIPredicting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="p-2 -mr-2 text-gray-600 active:bg-gray-100 rounded-full">
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center px-6 pb-4">
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.home.name}</div>
                <div className="text-xs text-gray-400">Đội nhà</div>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-4xl font-black text-slate-800">{scoreParts[0]}</span>
                <span className="text-gray-300 text-2xl font-light">-</span>
                <span className="text-4xl font-black text-slate-800">{scoreParts[1]}</span>
            </div>
            <div className="flex flex-col items-center w-1/3">
                <div className="font-bold text-lg text-center leading-tight mb-1">{liveMatch.away.name}</div>
                <div className="text-xs text-gray-400">Đội khách</div>
            </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Lịch sử Phân tích AI Gemini</h3>
            {isAIPredicting && analysisHistory.length === 0 && (
                <p className="text-xs text-gray-500 animate-pulse text-center p-4">Đang chạy phân tích AI lần đầu...</p>
            )}
            {analysisHistory.length === 0 && !isAIPredicting && (
                 <p className="text-xs text-gray-500 text-center p-4">Chưa có phân tích AI nào cho trận đấu này.</p>
            )}
            {analysisHistory.length > 0 && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                    {analysisHistory.map((item, index) => (
                        <div key={index} className={`p-3 rounded-lg ${index === 0 ? 'border-2 border-blue-500 bg-blue-50' : 'bg-gray-50 border border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${item.level === 'rất cao' ? 'bg-red-500 text-white' : index === 0 ? 'bg-blue-500 text-white' : 'bg-white text-gray-500'}`}>
                                        <Siren className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            PHÚT {item.minute}'
                                        </div>
                                        <div className={`text-xl font-black ${item.level === 'rất cao' ? 'text-red-600' : 'text-gray-800'}`}>
                                            Xác suất: {item.score}%
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500">Độ tin cậy:</div>
                                    <div className={`font-bold ${item.level === 'rất cao' ? 'text-red-600' : item.level === 'cao' ? 'text-orange-500' : item.level === 'trung bình' ? 'text-yellow-500' : 'text-gray-500'}`}>
                                        {item.level.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                            {item.reasoning && (
                                <div className="bg-white p-3 rounded-xl border border-gray-100 text-xs text-gray-700 flex items-start gap-2 mt-3">
                                    <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                    <p className="flex-grow">{item.reasoning}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Traditional Factors Section */}
        {latestAnalysis && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Các yếu tố truyền thống (Phút {latestAnalysis.minute}')</h3>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <StatItem label="Động lực" value={typeof latestAnalysis.factors.apiMomentum === 'number' ? latestAnalysis.factors.apiMomentum.toFixed(1) : '-'} color="text-indigo-600" />
                    <StatItem label="Cụm sút" value={typeof latestAnalysis.factors.shotCluster === 'number' ? latestAnalysis.factors.shotCluster.toFixed(1) : '-'} color="text-green-600" />
                    <StatItem label="Áp lực" value={typeof latestAnalysis.factors.pressure === 'number' ? latestAnalysis.factors.pressure.toFixed(1) : '-'} color="text-purple-600" />
                </div>
            </div>
        )}

        {/* New Live Stats Table */}
        <LiveStatsTable
          liveMatch={liveMatch}
          oddsHistory={oddsHistory}
          homeOddsHistory={homeOddsHistory}
          apiChartData={apiChartData}
        />

        {(marketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" />Thị trường Tài/Xỉu (1_3) & Dòng thời gian API</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Phút" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={['dataMin - 0.25', 'dataMax + 0.25']} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} tickCount={8} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Thị trường" data={marketChartData} fill="#8884d8">{marketChartData.map((e, i) => ( <Cell key={`c-${i}`} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="API Đội nhà" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="API Đội khách" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                  <OverlayContainer>
                      <HighlightBands highlights={highlights.overUnder} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}

        {(homeMarketChartData.length > 0 || apiChartData.length > 0) && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-500" />Tỷ lệ Đội nhà (1_2) & Dòng thời gian API</h3>
              <div className="relative h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 10, right: 10, bottom: 0, left: -15 }}>
                          <XAxis type="number" dataKey="minute" name="Phút" unit="'" domain={[0, 90]} ticks={[0, 15, 30, 45, 60, 75, 90]} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                          <YAxis yAxisId="left" dataKey="handicap" name="HDP" width={45} domain={['dataMin - 0.25', 'dataMax + 0.25']} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} allowDecimals={true} tickCount={8} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} width={35} domain={['dataMin - 5', 'dataMax + 10']} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                          <Scatter yAxisId="left" name="Thị trường" data={homeMarketChartData} fill="#8884d8">{homeMarketChartData.map((e, i) => ( <Cell key={`c-${i}`} fill={e.color} /> ))}</Scatter>
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="homeApi" name="API Đội nhà" stroke="#2563eb" strokeWidth={2} dot={false} />
                          <Line yAxisId="right" type="monotone" data={apiChartData} dataKey="awayApi" name="API Đội khách" stroke="#ea580c" strokeWidth={2} dot={false} />
                      </ComposedChart>
                  </ResponsiveContainer>
                   <OverlayContainer>
                      <HighlightBands highlights={highlights.homeOdds} />
                      <ShotBalls shots={shotEvents} />
                  </OverlayContainer>
                  <OddsColorLegent />
              </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3">
            <StatBox label="Tấn công" home={stats.attacks[0]} away={stats.attacks[1]} />
            <StatBox label="Nguy hiểm" home={stats.dangerous_attacks[0]} away={stats.dangerous_attacks[1]} highlight />
            <StatBox label="Trúng đích" home={stats.on_target[0]} away={stats.on_target[1]} highlight />
            <StatBox label="Phạt góc" home={stats.corners[0]} away={stats.corners[1]} />
        </div>

        {/* Ticket Manager Component */}
        <TicketManager 
            match={liveMatch} 
            latestOverOdds={oddsHistory[oddsHistory.length - 1]}
            latestHomeOdds={homeOddsHistory[homeOddsHistory.length - 1]}
        />
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex justify-between items-center border-b border-gray-100 last:border-b-0 py-1">
    <span className="text-gray-500 font-medium">{label}:</span>
    <span className={`font-bold ${color || 'text-gray-800'}`}>{value}</span>
  </div>
);

const StatBox = ({ label, home, away, highlight }: { label: string, home: number, away: number, highlight?: boolean }) => {
    const total = home + away;
    const homePct = total === 0 ? 50 : (home / total) * 100;
    
    return (
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-xs text-gray-400 text-center mb-2 uppercase font-semibold">{label}</div>
            <div className="flex justify-between items-end mb-1">
                <span className={`text-lg font-bold ${highlight && home > away ? 'text-blue-600' : 'text-gray-800'}`}>{home}</span>
                <span className={`text-lg font-bold ${highlight && away > home ? 'text-orange-600' : 'text-gray-800'}`}>{away}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${homePct}%` }}></div>
                <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${100 - homePct}%` }}></div>
            </div>
        </div>
    );
};
