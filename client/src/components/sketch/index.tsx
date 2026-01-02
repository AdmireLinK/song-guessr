import { motion } from 'framer-motion';
import { Music, Users, Sparkles } from 'lucide-react';

export function SketchLogo({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-6xl',
  };

  return (
    <motion.div
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="relative">
        <motion.div
          className={`font-hand font-bold ${sizes[size]} text-sketch-ink relative`}
          animate={{ rotate: [-1, 1, -1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="relative">
            Song
            <Sparkles className="absolute -top-2 -right-4 w-5 h-5 text-yellow-500" />
          </span>
          {' '}
          <span className="text-primary">Guessr</span>
        </motion.div>
        
        {/* 装饰性音符 */}
        <motion.div
          className="absolute -left-8 top-1/2 -translate-y-1/2"
          animate={{ y: [-5, 5, -5], rotate: [-10, 10, -10] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Music className="w-6 h-6 text-sketch-pencil" />
        </motion.div>
        
        <motion.div
          className="absolute -right-8 top-1/2 -translate-y-1/2"
          animate={{ y: [5, -5, 5], rotate: [10, -10, 10] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        >
          <Music className="w-6 h-6 text-sketch-pencil" />
        </motion.div>
      </div>
      
      <motion.p
        className="font-sketch text-muted-foreground mt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        🎵 猜歌游戏 - 和朋友一起猜歌曲！
      </motion.p>
    </motion.div>
  );
}

export function SketchDivider() {
  return (
    <div className="relative w-full h-4 my-4">
      <svg
        className="w-full h-full"
        viewBox="0 0 400 20"
        preserveAspectRatio="none"
      >
        <path
          d="M0,10 Q50,5 100,10 T200,10 T300,10 T400,10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-sketch-pencil opacity-30"
          strokeDasharray="5,5"
        />
      </svg>
    </div>
  );
}

export function SketchDecoration({ type }: { type: 'stars' | 'music' | 'dots' }) {
  if (type === 'stars') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-yellow-400"
            style={{
              left: `${20 + i * 15}%`,
              top: `${10 + (i % 3) * 20}%`,
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.3,
            }}
          >
            ✦
          </motion.div>
        ))}
      </div>
    );
  }

  if (type === 'music') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {['♪', '♫', '♩', '♬'].map((note, i) => (
          <motion.div
            key={i}
            className="absolute text-sketch-pencil/20 text-2xl"
            style={{
              left: `${10 + i * 25}%`,
              top: `${15 + (i % 2) * 30}%`,
            }}
            animate={{
              y: [-10, 10, -10],
              rotate: [-15, 15, -15],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: i * 0.5,
            }}
          >
            {note}
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-sketch-pencil/10"
          style={{
            left: `${5 + i * 12}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <motion.div
        className="w-8 h-8 border-4 border-sketch-pencil/30 border-t-primary rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

export function PlayerAvatar({ name, isHost }: { name: string; isHost?: boolean }) {
  const initials = name.substring(0, 2).toUpperCase();
  
  return (
    <div className="relative">
      <div className="w-10 h-10 rounded-full border-2 border-sketch-ink bg-sketch-paper flex items-center justify-center font-hand font-bold shadow-sketch">
        {initials}
      </div>
      {isHost && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-400 border border-sketch-ink flex items-center justify-center text-xs">
          👑
        </div>
      )}
    </div>
  );
}
