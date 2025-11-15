export default function Home() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 overflow-hidden">
      <div className="relative">
        {/* Glowing orbs in background - more visible */}
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-cyan-400 rounded-full mix-blend-screen filter blur-3xl opacity-25 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-20 left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
        
        {/* Main content with enhanced glassmorphism */}
        <div className="relative backdrop-blur-xl bg-white/5 p-12 rounded-3xl border border-white/10 shadow-2xl shadow-cyan-500/10">
          <div className="text-center space-y-4">
            <div className="inline-block">
              <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-white animate-gradient drop-shadow-[0_0_30px_rgba(34,211,238,0.5)]">
                hello world
              </h1>
            </div>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <span className="text-xl md:text-2xl text-gray-400 font-mono">with</span>
              <div className="px-6 py-3 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 backdrop-blur-md rounded-full shadow-lg shadow-cyan-500/30 border border-cyan-400/30 transform hover:scale-105 hover:shadow-cyan-400/50 transition-all duration-300">
                <span className="text-xl md:text-2xl font-bold text-white font-mono drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                  NAME={process.env.NAME}
                </span>
              </div>
            </div>
            {/* Pulsing dot indicator */}
            <div className="flex items-center justify-center gap-2 pt-4">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/80"></div>
              <span className="text-sm text-gray-500 font-mono">SYSTEM ONLINE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
