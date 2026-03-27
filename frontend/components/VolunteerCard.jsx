import StatusBadge from './StatusBadge';

export default function VolunteerCard({ volunteer, reassigned }) {
  const data = volunteer || {
    name: 'Unit Alpha',
    resource: 'Medical Kit',
    matchedVictim: 'Jane Doe',
    distance: '2.4 km',
    need: 'medical'
  };

  return (
    <div className={`relative bg-white rounded-3xl p-6 md:p-8 shadow-xl border transition-all duration-500 hover:shadow-2xl ${reassigned ? 'border-red-300 ring-4 ring-red-100' : 'border-slate-100 hover:-translate-y-1'}`}>
      {reassigned && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-[#C0392B] text-white text-xs font-black px-4 py-1.5 rounded-full animate-pulse shadow-lg whitespace-nowrap uppercase tracking-widest">
          Priority Updated
        </div>
      )}
      
      <div className="flex flex-col h-full justify-between">
        <div>
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{data.name}</h3>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            Resource: <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md ml-1">{data.resource}</span>
          </p>
        </div>
        
        <div className={`mt-8 rounded-2xl p-5 border transition-colors duration-300 ${reassigned ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-3">Current Assignment</p>
          <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm">
            <span className="font-bold text-slate-800">{data.matchedVictim}</span>
            <StatusBadge urgency={data.need} />
          </div>
          <div className={`mt-4 flex items-center font-bold justify-between ${reassigned ? 'text-[#C0392B]' : 'text-slate-600'}`}>
            <p className="text-sm flex items-center">
              <svg className="w-5 h-5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              {data.distance} away
            </p>
            {data.score !== undefined && (
              <span className="text-xs px-2 py-1 bg-white rounded-md shadow-sm border border-slate-200 text-slate-700">
                Score: {data.score}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
