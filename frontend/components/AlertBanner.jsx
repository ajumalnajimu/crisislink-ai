export default function AlertBanner({ message, type = 'shortage' }) {
  const isShortage = type === 'shortage';
  
  return (
    <div className={`w-full rounded-2xl p-5 mb-6 shadow-lg flex items-start border-l-8 transition-all hover:scale-[1.01] ${isShortage ? 'bg-red-50 border-[#C0392B]' : 'bg-blue-50 border-blue-500'}`}>
      <div className="flex-shrink-0 mt-0.5 bg-white p-2 rounded-full shadow-sm">
        {isShortage ? (
          <svg className="h-6 w-6 text-[#C0392B]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="ml-4">
        <h3 className={`text-sm font-black tracking-widest uppercase ${isShortage ? 'text-red-800' : 'text-blue-800'}`}>
          {isShortage ? 'Predictive Shortage Alert' : 'System Update'}
        </h3>
        <div className={`mt-2 text-base font-medium ${isShortage ? 'text-red-900' : 'text-blue-900'}`}>
          <p>{message || 'Medical supplies running critically low in North Sector. ETA to zero: 15 mins.'}</p>
        </div>
      </div>
    </div>
  );
}
