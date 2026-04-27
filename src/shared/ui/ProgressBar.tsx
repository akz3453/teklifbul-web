/**
 * Progress Bar Component
 * Teklifbul Rule v1.0
 * 
 * Uzun async işlemler için progress bar ve cancel butonu
 */

// import React from 'react';
// Teklifbul Rule v1.0 - Constants import
// @ts-expect-error -- shared/constants/colors.js JS modülü, type tanımı eklenecek
import { UI_COLORS } from '../constants/colors.js';

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
      backgroundColor: UI_COLORS.GRAY_50,
      borderRadius: '8px',
      border: `1px solid ${UI_COLORS.GRAY_200}`
    }}>
      {label && (
        <div style={{ 
          marginBottom: '8px', 
          fontSize: '14px', 
          fontWeight: 500,
          color: UI_COLORS.GRAY_700
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
          backgroundColor: UI_COLORS.GRAY_200,
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div 
            className="tb-progress-fill"
            style={{
              width: `${clampedValue}%`,
              height: '100%',
              backgroundColor: clampedValue === 100 ? UI_COLORS.SUCCESS : UI_COLORS.PRIMARY,
              borderRadius: '4px',
              transition: 'width 0.3s ease, background-color 0.3s ease'
            }}
          />
        </div>
        
        {showPercentage && (
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: UI_COLORS.GRAY_500,
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
              color: UI_COLORS.ERROR,
              backgroundColor: 'transparent',
              border: `1px solid ${UI_COLORS.ERROR}`,
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = UI_COLORS.ERROR_BG;
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

