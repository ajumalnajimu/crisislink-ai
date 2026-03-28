'use client';
import { useState, useEffect } from 'react';

export default function AIBriefing({ role, content }) {
  const [briefing, setBriefing] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (content) {
      setBriefing(content);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchBriefing = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? 'http://' + window.location.hostname + ':5000' : 'http://localhost:5000')}/api/briefing/${role}`);
        const data = await res.json();
        
        if (isMounted) {
          if (data.success) {
            setBriefing(data.briefing);
          } else {
            setBriefing("Unable to fetch strategic briefing at this time.");
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setBriefing("Connection error. Standby for manual briefing.");
          setLoading(false);
        }
      }
    };

    fetchBriefing();

    return () => { isMounted = false; };
  }, [role, content]);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-700 relative overflow-hidden group hover:border-slate-500 transition-colors">
      {/* Decorative pulse effect */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500 opacity-20 rounded-full blur-3xl group-hover:bg-indigo-500 transition-colors duration-1000 animate-pulse"></div>
      
      <div className="flex items-center mb-6 relative z-10">
        <div className="bg-blue-500/20 p-3 rounded-xl mr-4 border border-blue-500/30">
          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight flex items-center">
            AI Briefing
            <span className="ml-3 px-2 py-0.5 bg-slate-800 rounded text-xs font-mono text-slate-400 uppercase tracking-wider">{role || 'GENERAL'}</span>
          </h3>
        </div>
      </div>
      
      <div className="relative z-10 bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50 min-h-[100px] flex flex-col justify-center">
        {loading ? (
           <div className="flex items-center justify-center space-x-3 text-blue-400">
             <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
             <span className="font-mono text-sm uppercase tracking-widest animate-pulse">Generating Details...</span>
           </div>
        ) : (
           <p className="text-slate-300 leading-relaxed font-medium">
             {briefing}
           </p>
        )}
      </div>
      
      <div className="mt-6 pt-5 border-t border-slate-700/50 flex justify-between items-center text-xs text-slate-400 font-mono relative z-10">
        <span className="flex items-center text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-ping"></span> Live Link Active
        </span>
        <span>Generated Just Now</span>
      </div>
    </div>
  );
}
