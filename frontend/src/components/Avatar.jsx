import React from 'react';

export const Avatar = ({ url, name, size = 36, className = '' }) => {
  const sourceUrl = url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=0B1C30&color=fff&size=${size}`;
  
  return (
    <img 
      className={`w-full h-full object-cover ${className}`} 
      src={sourceUrl}
      alt={name || "User Avatar"} 
    />
  );
};
