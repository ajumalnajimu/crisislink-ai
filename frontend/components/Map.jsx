'use client';
import dynamic from 'next/dynamic';

const DynamicMapInner = dynamic(() => import('./MapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-50 border border-slate-200 rounded-3xl flex items-center justify-center min-h-[400px] shadow-inner relative overflow-hidden">
      {/* Decorative pulse back */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse mix-blend-multiply"></div>
      <div className="flex flex-col items-center relative z-10">
        <svg className="w-10 h-10 animate-spin text-slate-400 mb-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Initializing Map Data</p>
      </div>
    </div>
  )
});

export default function Map(props) {
  return <DynamicMapInner {...props} />;
}
