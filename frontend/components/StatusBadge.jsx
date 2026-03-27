export default function StatusBadge({ urgency }) {
  const colors = {
    medical: 'bg-[#C0392B] text-white',
    rescue: 'bg-[#E67E22] text-white',
    shelter: 'bg-[#F1C40F] text-black',
    food: 'bg-[#27AE60] text-white',
  };
  const colorClass = colors[urgency?.toLowerCase()] || 'bg-gray-500 text-white';
  
  return (
    <span className={`px-3 py-1.5 text-xs font-bold rounded-full shadow-sm uppercase tracking-wide border border-black/5 ${colorClass}`}>
      {urgency ? urgency : 'UNKNOWN'}
    </span>
  );
}
