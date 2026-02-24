import React from 'react';
import { User } from 'lucide-react';

// A deterministic hashing function to consistently assign a shape and color based on a string (player name or id)
const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

// Available colors (Blue to Purple spectrum)
const COLORS = [
    'text-blue-400',
    'text-blue-500',
    'text-indigo-400',
    'text-indigo-500',
    'text-violet-400',
    'text-violet-500',
    'text-purple-400',
    'text-purple-500',
    'text-fuchsia-400',
    'text-fuchsia-500',
];

interface PlayerAvatarProps {
    identifier: string; // The string used for hashing (name or id)
    className?: string; // Optional extra classes for sizing (e.g., 'w-3 h-3')
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ identifier, className = 'w-3.5 h-3.5' }) => {
    const hash = hashCode(identifier);
    const colorClass = COLORS[hash % COLORS.length];

    return <User className={`${className} ${colorClass} shrink-0`} />;
};
