import React, { useState } from 'react';
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

function App() {
  const [activeTab, setActiveTab] = useState('offers-compare');

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Header */}
      <div className="border-b bg-white">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-bold">Teklifbul Compare</h1>
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
              © 2025 Teklifbul. Tüm hakları saklıdır.
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
