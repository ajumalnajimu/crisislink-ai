import StatusBadge from './StatusBadge';

export default function VictimCard({ victim }) {
  const data = victim || {
    name: 'Jane Doe',
    need: 'medical',
    status: 'Rescue En Route',
    eta: '5 mins',
    location: '12.9716, 77.5946'
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{data.name}</h3>
          <p className="text-sm text-slate-500 mt-1 flex items-center">
            <svg className="w-4 h-4 mr-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            {data.location}
          </p>
        </div>
        <StatusBadge urgency={data.need} />
      </div>
      
      <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50 -mx-6 md:-mx-8 -my-6 p-6 md:p-8 rounded-b-3xl">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Live Status</span>
            <span className="text-sm font-semibold text-slate-800 flex items-center">
               <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
               {data.status}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">ETA</span>
            <span className="text-2xl font-black text-[#C0392B]">{data.eta}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
