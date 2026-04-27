import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ComparePage from './pages/Compare';
import OffersComparePage from './pages/OffersCompare';
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Settings,
  Home
} from 'lucide-react';
// Teklifbul Rule v1.0 - Toast & Logger (ortak shared modüller)
// @ts-ignore
import { toast } from '../../../src/shared/ui/toast.js';
// @ts-ignore
import { logger } from '../../../src/shared/log/logger.js';
// @ts-ignore
import { MESSAGES } from '../../../src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - Permission Matrix (bids.compare)
// @ts-ignore
import { initPermissions, can as canPermission, getBidPerms } from '../../../assets/js/state/permissions.js';

function App() {
  const [activeTab, setActiveTab] = useState('offers-compare');
  const [permLoading, setPermLoading] = useState(true);
  const [canCompare, setCanCompare] = useState(true);

  // Teklifbul Rule v1.0 - Compare uygulaması için izin kontrolü (bids.compare)
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const permState = await initPermissions({ redirectOnPending: true });
        if (!permState) {
          if (mounted) {
            setCanCompare(false);
            setPermLoading(false);
          }
          return;
        }

        const bidPerms = getBidPerms();
        let allowed = true;
        if (bidPerms.compare) {
          allowed = canPermission(bidPerms.compare);
        }

        if (!allowed) {
          const msg =
            (MESSAGES &&
              (MESSAGES.ERROR_PERMISSION_BIDS_COMPARE ||
                MESSAGES.ERROR_PERMISSION_DENIED ||
                MESSAGES.ERROR_PERMISSION)) ||
            'Teklif karşılaştırma yetkiniz yok.';

          toast.error(msg);
          logger.warn('Compare app: bids.compare izni yok, ekran bloklandı', {
            permKey: bidPerms.compare,
            companyId: permState.companyId,
            roleKey: permState.roleKey,
          });
        }

        if (mounted) {
          setCanCompare(allowed);
          setPermLoading(false);
        }
      } catch (error) {
        logger.error('Compare app permission init error', error);
        if (mounted) {
          setCanCompare(false);
          setPermLoading(false);
        }
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  if (permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Yetki bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!canCompare) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md space-y-3">
          <h1 className="text-xl font-semibold text-red-600">
            Teklif karşılaştırma yetkiniz yok.
          </h1>
          <p className="text-sm text-muted-foreground">
            Bu ekrana erişebilmek için şirket yöneticinizden &quot;Teklif Karşılaştır&quot; yetkisi
            talep etmeniz gerekir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-bold">NEFISOFT - Teklif Karşılaştırma</h1>
              </div>
              <Badge variant="outline" className="ml-2">
                v2.0 Enhanced
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Ayarlar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="offers-compare" className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4" />
              <span>Teklif Karşılaştırması</span>
            </TabsTrigger>
            <TabsTrigger value="legacy-compare" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Klasik Karşılaştırma</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="offers-compare">
            <OffersComparePage />
          </TabsContent>

          <TabsContent value="legacy-compare">
            <ComparePage />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t bg-gray-50 mt-12">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              2026 NEFISOFT ©
            </div>
            <div className="flex items-center space-x-4">
              <span>Enhanced Offers Comparison System</span>
              <Badge variant="secondary">v2.0</Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
