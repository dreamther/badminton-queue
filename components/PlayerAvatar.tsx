import React, { useMemo } from 'react';

interface PlayerAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ name, size = 'md', className = '' }) => {
  const initials = name.slice(0, 2).toUpperCase();
  
  // Deterministic color based on name
  const bgColor = useMemo(() => {
    const colors = [
      'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
      'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 
      'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 
      'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 
      'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [name]);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  return (
    <div className={`${sizeClasses[size]} ${bgColor} ${className} rounded-full flex items-center justify-center font-bold text-white shadow-sm shrink-0`}>
      {initials}
    </div>
  );
};