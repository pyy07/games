import { Vector2, Ball } from '../types';

export const distance = (p1: Vector2, p2: Vector2): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const subtractVector = (v1: Vector2, v2: Vector2): Vector2 => {
  return { x: v1.x - v2.x, y: v1.y - v2.y };
};

export const addVector = (v1: Vector2, v2: Vector2): Vector2 => {
  return { x: v1.x + v2.x, y: v1.y + v2.y };
};

export const multiplyVector = (v: Vector2, scalar: number): Vector2 => {
  return { x: v.x * scalar, y: v.y * scalar };
};

export const dotProduct = (v1: Vector2, v2: Vector2): number => {
  return v1.x * v2.x + v1.y * v2.y;
};

export const normalizeVector = (v: Vector2): Vector2 => {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
};

export const magnitude = (v: Vector2): number => {
  return Math.sqrt(v.x * v.x + v.y * v.y);
};

// Check collision between two balls
export const checkCollision = (b1: Ball, b2: Ball): boolean => {
  if (!b1.active || !b2.active) return false;
  const dist = distance(b1.position, b2.position);
  return dist < b1.radius + b2.radius;
};

// Resolve collision between two balls
export const resolveCollision = (b1: Ball, b2: Ball) => {
  const diff = subtractVector(b2.position, b1.position);
  const dist = magnitude(diff);
  const normal = normalizeVector(diff);
  
  // Separation (prevent overlap)
  const overlap = b1.radius + b2.radius - dist;
  if (overlap > 0) {
      const separation = multiplyVector(normal, overlap / 2);
      b1.position = subtractVector(b1.position, separation);
      b2.position = addVector(b2.position, separation);
  }

  // Elastic collision
  const relativeVelocity = subtractVector(b2.velocity, b1.velocity);
  const velocityAlongNormal = dotProduct(relativeVelocity, normal);

  if (velocityAlongNormal > 0) return; // Moving apart

  const restitution = 0.9; // Bounciness
  const impulseScalar = -(1 + restitution) * velocityAlongNormal / 2; // Assuming equal mass

  const impulse = multiplyVector(normal, impulseScalar);
  b1.velocity = subtractVector(b1.velocity, impulse);
  b2.velocity = addVector(b2.velocity, impulse);
};
