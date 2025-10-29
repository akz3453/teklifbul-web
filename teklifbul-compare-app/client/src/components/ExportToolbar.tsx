import React from 'react';
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { apiService, downloadFile } from '../lib/api';

interface ExportToolbarProps {
  requestId?: string;
  membership: "standard" | "premium";
  onExportStart?: () => void;
  onExportComplete?: () => void;
  onExportError?: (error: string) => void;
}

export function ExportToolbar({ 
  requestId, 
  membership, 
  onExportStart, 
  onExportComplete, 
  onExportError 
}: ExportToolbarProps) {
  
  const downloadCompareExcel = async () => {
    try {
      onExportStart?.();
      
      const blob = await apiService.exportComparison(requestId, 'template', { 
        tier: membership,
        maxVendors: membership === "standard" ? 3 : undefined,
        maxVendorsPerSheet: 5
      });
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
      const filename = `mukayese_${timestamp}.xlsx`;
      
      downloadFile(blob, filename);
      onExportComplete?.();
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || "Excel üretilemedi";
      onExportError?.(errorMessage);
      console.error('Export error:', error);
    }
  };

  const downloadCompareCSV = async () => {
    try {
      onExportStart?.();
      
      const blob = await apiService.exportComparison(requestId, 'csv', { 
        tier: membership,
        maxVendors: membership === "standard" ? 3 : undefined,
        maxVendorsPerSheet: 5
      });
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
      const filename = `mukayese_${timestamp}.csv`;
      
      downloadFile(blob, filename);
      onExportComplete?.();
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || "CSV üretilemedi";
      onExportError?.(errorMessage);
      console.error('Export error:', error);
    }
  };

  return (
    <div className="flex gap-2 p-4 bg-gray-50 rounded-lg border">
      <Button 
        onClick={downloadCompareExcel}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        size="sm"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Excel Olarak İndir
      </Button>
      
      <Button 
        onClick={downloadCompareCSV}
        variant="outline"
        className="flex items-center gap-2"
        size="sm"
      >
        <Download className="w-4 h-4" />
        CSV Olarak İndir
      </Button>
      
      <div className="text-sm text-gray-600 ml-auto flex items-center">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {membership === "premium" ? "Premium" : "Standard"}
        </span>
        {membership === "standard" && (
          <span className="ml-2 text-xs text-gray-500">
            (Max 3 tedarikçi)
          </span>
        )}
      </div>
    </div>
  );
}

export default ExportToolbar;
