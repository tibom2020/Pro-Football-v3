
import React from 'react';
import { MatchInfo } from '../types';
import { Clock, ChevronRight, Search } from 'lucide-react';

interface MatchListProps {
  events: MatchInfo[];
  onSelectMatch: (id: string) => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const MatchList: React.FC<MatchListProps> = ({ events, onSelectMatch, isLoading, searchQuery, onSearchChange }) => {
  if (isLoading) {
    return <div className="p-8 text-center text-gray-500 animate-pulse">Đang tải các trận đấu trực tiếp...</div>;
  }

  return (
    <div className="space-y-3 pb-20">
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Tìm theo đội hoặc giải đấu..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl bg-white border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder-gray-500"
        />
      </div>

      {events.length === 0 && searchQuery ? (
        <div className="p-8 text-center text-gray-500">
          Không tìm thấy trận đấu nào khớp với "{searchQuery}".
        </div>
      ) : (
        events.map((event) => (
          <div 
            key={event.id}
            onClick={() => onSelectMatch(event.id)}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md truncate max-w-[70%]">
                {event.league.name}
              </span>
              <div className="flex items-center text-red-500 text-xs font-bold">
                <Clock className="w-3 h-3 mr-1" />
                {event.timer?.tm || event.time || "0"}'
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 text-right pr-3">
                <div className="font-bold text-gray-900 leading-tight">{event.home.name}</div>
              </div>
              
              <div className="bg-gray-100 px-3 py-1 rounded-lg font-mono font-bold text-lg text-gray-800 tracking-widest">
                {event.ss || "0-0"}
              </div>

              <div className="flex-1 text-left pl-3">
                <div className="font-bold text-gray-900 leading-tight">{event.away.name}</div>
              </div>
            </div>
            
            <div className="mt-3 flex justify-center">
              <span className="text-xs text-gray-400 flex items-center">
                Tap for Analysis <ChevronRight className="w-3 h-3 ml-1" />
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
