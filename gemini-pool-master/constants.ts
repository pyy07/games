import { GameConfig } from './types';

export const TABLE_WIDTH = 800;
export const TABLE_HEIGHT = 400;
export const CUSHION_WIDTH = 32; // Width of the wood/rail border
export const BALL_RADIUS = 10;
export const POCKET_RADIUS = 16; // Reduced from 22 for tighter pockets

export const PHYSICS_CONFIG: GameConfig = {
  friction: 0.985,
  wallBounciness: 0.8,
  ballBounciness: 0.9,
  maxPower: 15, // Maximum impulse magnitude
};

export const COLORS = {
  TABLE_FELT: '#15803d', // green-700
  TABLE_BORDER: '#451a03', // amber-950
  POCKET: '#000000',
  CUE_STICK: '#f59e0b', // amber-500
  GUIDE_LINE: 'rgba(255, 255, 255, 0.5)',
};

// Standard pool ball colors
export const BALL_COLORS = [
  '#ffffff', // 0 - Cue Ball (Special handling)
  '#fbbf24', // 1 - Solid Yellow
  '#2563eb', // 2 - Solid Blue
  '#dc2626', // 3 - Solid Red
  '#7e22ce', // 4 - Solid Purple
  '#f97316', // 5 - Solid Orange
  '#16a34a', // 6 - Solid Green
  '#881337', // 7 - Solid Maroon
  '#000000', // 8 - Black
  '#fbbf24', // 9 - Stripe Yellow
  '#2563eb', // 10 - Stripe Blue
  '#dc2626', // 11 - Stripe Red
  '#7e22ce', // 12 - Stripe Purple
  '#f97316', // 13 - Stripe Orange
  '#16a34a', // 14 - Stripe Green
  '#881337', // 15 - Stripe Maroon
];