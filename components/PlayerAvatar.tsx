import React from 'react';

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

// Available shapes and colors
const SHAPES = ['circle', 'square', 'triangle', 'diamond'];
const COLORS = [
    { bg: 'bg-emerald-400', text: 'text-emerald-400' },
    { bg: 'bg-indigo-400', text: 'text-indigo-400' },
    { bg: 'bg-amber-400', text: 'text-amber-400' },
    { bg: 'bg-rose-400', text: 'text-rose-400' },
    { bg: 'bg-cyan-400', text: 'text-cyan-400' },
    { bg: 'bg-violet-400', text: 'text-violet-400' },
    { bg: 'bg-fuchsia-400', text: 'text-fuchsia-400' }
];

interface PlayerAvatarProps {
    identifier: string; // The string used for hashing (name or id)
    className?: string; // Optional extra classes for sizing (e.g., 'w-3 h-3')
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({ identifier, className = 'w-2 h-2' }) => {
    const hash = hashCode(identifier);

    const shape = SHAPES[hash % SHAPES.length];
    const color = COLORS[hash % COLORS.length];

    // Base classes for the shape
    const baseClasses = `inline-block ${className} ${color.bg}`;

    switch (shape) {
        case 'circle':
            return <span className={`${baseClasses} rounded-full shrink-0`} />;
        case 'square':
            return <span className={`${baseClasses} rounded-[2px] shrink-0`} />;
        case 'triangle':
            return (
                <svg viewBox="0 0 10 10" className={`inline-block ${className} ${color.text} fill-current shrink-0`} xmlns="http://www.w3.org/2000/svg">
                    <polygon points="5,0 10,10 0,10" />
                </svg>
            );
        case 'diamond':
            return <span className={`${baseClasses} rounded-[1px] rotate-45 transform shrink-0`} />;
        default:
            return <span className={`${baseClasses} rounded-full shrink-0`} />;
    }
};
