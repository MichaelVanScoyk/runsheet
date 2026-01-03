// InfoTooltip - displays official NERIS descriptions on hover
export default function InfoTooltip({ text }) {
  if (!text) return null;
  return (
    <span className="relative inline-flex items-center ml-1.5 group">
      <span className="inline-flex items-center justify-center w-4 h-4 text-xs text-theme-hint cursor-help rounded-full group-hover:text-accent-red transition-colors">
        ℹ
      </span>
      <span className="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 bg-white text-theme-primary px-3 py-2 rounded-md text-xs font-normal min-w-[200px] max-w-[300px] z-50 border border-theme shadow-lg transition-all text-left leading-relaxed mb-1.5">
        {text}
        <span className="absolute top-full left-1/2 -ml-1.5 border-[6px] border-transparent border-t-theme" />
      </span>
    </span>
  );
}
