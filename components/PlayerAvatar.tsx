import React from 'react';
import { User } from 'lucide-react';
import { MemberIdentity, IDENTITIES } from '../types';

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
    identity?: MemberIdentity; // Optional identity for custom colors
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ identifier, className = 'w-3.5 h-3.5', identity }) => {
    const hash = hashCode(identifier);
    
    // If identity is provided and valid, use its configured iconColor. Otherwise fall back to hash color.
    const colorClass = identity && IDENTITIES[identity] 
        ? IDENTITIES[identity].iconColor 
        : COLORS[hash % COLORS.length];

    return <User className={`${className} ${colorClass} shrink-0`} />;
};
