export function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#060912' }}>
      <div className="flex flex-col items-center gap-6">
        {/* Logo mark */}
        <div className="relative w-16 h-16">
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: '0 0 30px rgba(99,102,241,0.5)',
              animation: 'spin 3s linear infinite',
            }}
          />
          <div
            className="absolute inset-1 rounded-xl flex items-center justify-center"
            style={{ background: '#060912' }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path
                d="M14 4L22 9V19L14 24L6 19V9L14 4Z"
                stroke="url(#pg)"
                strokeWidth="2"
                fill="none"
              />
              <path d="M14 4V24M6 9L22 19M22 9L6 19" stroke="url(#pg)" strokeWidth="1" opacity="0.4" />
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#818cf8" />
                  <stop offset="1" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: '#6366f1',
                animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  )
}
