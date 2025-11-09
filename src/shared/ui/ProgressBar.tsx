/**
 * Progress Bar Component
 * Teklifbul Rule v1.0
 * 
 * Uzun async işlemler için progress bar ve cancel butonu
 */

import React from 'react';

interface ProgressBarProps {
  value: number; // 0-100
  onCancel?: () => void;
  label?: string;
  showPercentage?: boolean;
}

export function ProgressBar({ 
  value, 
  onCancel, 
  label,
  showPercentage = true 
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  
  return (
    <div className="tb-progress" style={{
      width: '100%',
      padding: '12px',
      backgroundColor: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #e5e7eb'
    }}>
      {label && (
        <div style={{ 
          marginBottom: '8px', 
          fontSize: '14px', 
          fontWeight: 500,
          color: '#374151'
        }}>
          {label}
        </div>
      )}
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          flex: 1,
          height: '8px',
          backgroundColor: '#e5e7eb',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div 
            className="tb-progress-fill"
            style={{
              width: `${clampedValue}%`,
              height: '100%',
              backgroundColor: clampedValue === 100 ? '#10b981' : '#3b82f6',
              borderRadius: '4px',
              transition: 'width 0.3s ease, background-color 0.3s ease'
            }}
          />
        </div>
        
        {showPercentage && (
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: '#6b7280',
            minWidth: '45px',
            textAlign: 'right'
          }}>
            {Math.round(clampedValue)}%
          </span>
        )}
        
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#ef4444',
              backgroundColor: 'transparent',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fee2e2';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            İptal
          </button>
        )}
      </div>
    </div>
  );
}

