import React, { useState, useRef, memo, InputHTMLAttributes, useEffect } from 'react';

interface PressureInputProps extends InputHTMLAttributes<HTMLInputElement> {
  basePressure?: number;
  maxPressure?: number;
  variant?: 'strong' | 'medium' | 'lite';
}

export const PressureInput = memo(({
  className = "",
  basePressure = 0.6,
  maxPressure = 3.2,
  variant = 'strong',
  style,
  onKeyDown,
  onKeyUp,
  onChange,
  value,
  placeholder,
  ...props
}: PressureInputProps) => {
  const [pressure, setPressure] = useState(basePressure);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setPressure(maxPressure);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onKeyDown?.(e);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Return to base pressure smoothly
    timeoutRef.current = setTimeout(() => {
      setPressure(basePressure);
    }, 200);
    onKeyUp?.(e);
  };

  return (
    <input
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      placeholder={placeholder}
      className={className}
      style={{
        "--pressure-depth": pressure,
        fontFamily: "'Patrick Hand', cursive",
        ...style,
      } as React.CSSProperties}
      data-pressure-variant={variant}
      {...props}
    />
  );
});

PressureInput.displayName = 'PressureInput';
