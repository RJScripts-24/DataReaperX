import React, { useState, memo, ElementType, HTMLAttributes } from 'react';

interface PressureTextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  basePressure?: number;
  maxPressure?: number;
  isInteractive?: boolean;
  variant?: 'strong' | 'medium' | 'lite';
}

export const PressureText = memo(({ 
  children, 
  className = "", 
  as: Component = "span", 
  basePressure = 0.6,
  maxPressure = 3.2,
  isInteractive = true,
  variant = 'medium',
  style,
  onMouseEnter,
  onMouseLeave,
  onMouseDown,
  onMouseUp,
  ...props 
}: PressureTextProps) => {
  // Effective pressure is now static as per user request
  const effectivePressure = basePressure * basePressure * 0.8; 

  return (
    <Component
      className={`pressure-text ${className}`}
      style={{
        '--pressure-depth': effectivePressure,
        filter: `url(#paper-indentation-${variant}) contrast(0.95) brightness(0.98)`,
        ...style
      } as React.CSSProperties}
      {...props}
    >
      {children}
    </Component>
  );
});

PressureText.displayName = 'PressureText';
