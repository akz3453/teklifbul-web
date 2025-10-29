import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  Filter, 
  Download, 
  Settings,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import OffersCompare from '../components/OffersCompare';
import type { MembershipConfig } from '../types';

export const OffersComparePage: React.FC = () => {
  const [requestId, setRequestId] = useState('');
  const [membership, setMembership] = useState<MembershipConfig>({
    tier: 'standard',
    maxVendors: 3,
    maxVendorsPerSheet: 5
  });
  const [exportStatus, setExportStatus] = useState<{
    type: 'template' | 'csv' | null;
    status: 'success' | 'error' | null;
    message: string;
  }>({ type: null, status: null, message: '' });

  const handleExport = (mode: 'template' | 'csv') => {
    setExportStatus({
      type: mode,
      status: 'success',
      message: `${mode === 'template' ? 'Excel şablonu' : 'CSV dosyası'} başarıyla indirildi`
    });
    
    // Clear status after 3 seconds
    setTimeout(() => {
      setExportStatus({ type: null, status: null, message: '' });
    }, 3000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teklif Karşılaştırması</h1>
          <p className="text-muted-foreground mt-1">
            Tedarikçi tekliflerini karşılaştırın ve en uygun seçenekleri belirleyin
          </p>
        </div>
      </div>

      {/* Export Status */}
      {exportStatus.status && (
        <Alert className={exportStatus.status === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          {exportStatus.status === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <AlertDescription className={exportStatus.status === 'success' ? 'text-green-800' : 'text-red-800'}>
            {exportStatus.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Filters and Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtreler ve Ayarlar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="requestId">Talep ID</Label>
              <Input
                id="requestId"
                placeholder="PR-2025-001 (opsiyonel)"
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="membership">Üyelik Tipi</Label>
              <Select 
                value={membership.tier} 
                onValueChange={(value: 'standard' | 'premium') => 
                  setMembership(prev => ({
                    ...prev,
                    tier: value,
                    maxVendors: value === 'standard' ? 3 : 999,
                    maxVendorsPerSheet: 5
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">
                    Standard (Max 3 tedarikçi)
                  </SelectItem>
                  <SelectItem value="premium">
                    Premium (Sınırsız tedarikçi)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Excel Sayfa Başına Tedarikçi</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={membership.maxVendorsPerSheet}
                onChange={(e) => setMembership(prev => ({
                  ...prev,
                  maxVendorsPerSheet: parseInt(e.target.value) || 5
                }))}
                disabled={membership.tier === 'standard'}
              />
              {membership.tier === 'standard' && (
                <p className="text-xs text-muted-foreground">
                  Standard üyelikte maksimum 3 tedarikçi gösterilir
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="compare" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compare">Teklif Karşılaştırması</TabsTrigger>
          <TabsTrigger value="settings">Ayarlar</TabsTrigger>
        </TabsList>

        <TabsContent value="compare">
          <OffersCompare
            requestId={requestId || undefined}
            membership={membership}
            onExport={handleExport}
          />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Sistem Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">Üyelik Ayarları</h3>
                  <div className="space-y-2">
                    <Label>Mevcut Üyelik</Label>
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="capitalize">{membership.tier}</span>
                        <Badge variant={membership.tier === 'premium' ? 'default' : 'secondary'}>
                          {membership.tier === 'premium' ? 'Premium' : 'Standard'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {membership.tier === 'standard' 
                          ? 'Maksimum 3 tedarikçi karşılaştırması'
                          : 'Sınırsız tedarikçi karşılaştırması'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Export Ayarları</h3>
                  <div className="space-y-2">
                    <Label>Excel Şablon Formatı</Label>
                    <div className="p-3 border rounded-lg">
                      <p className="text-sm">
                        Şablon dosyası: <code className="bg-gray-100 px-1 rounded">assets/TEKLİF MUKAYESE FORMU.xlsx</code>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Bu şablon dosyası mevcut değilse sistem otomatik olarak programatik export kullanacaktır.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Sistem Bilgileri</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium">Para Birimleri</h4>
                    <p className="text-sm text-muted-foreground">TRY, USD, EUR, GBP</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium">Nakliye Tipleri</h4>
                    <p className="text-sm text-muted-foreground">DAP, EXW, FOB, CIF</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <h4 className="font-medium">Ödeme Şartları</h4>
                    <p className="text-sm text-muted-foreground">Peşin, 15/30/45/60 gün</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OffersComparePage;
