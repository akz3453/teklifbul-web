# Enhanced Offers Comparison System

A comprehensive full-stack application for comparing vendor offers with advanced features including currency conversion, Excel template export, and membership-based restrictions.

## 🚀 Features

### Core Features
- **Enhanced Offer Comparison**: Compare vendor offers with detailed fields including shipping, payment terms, delivery methods
- **Currency Conversion**: Automatic conversion between TRY, USD, EUR, GBP with real-time rates
- **Vendor Ranking**: Automatic ranking based on total cost (including shipping) in TL
- **Membership Rules**: Standard (3 vendors) vs Premium (unlimited) with Excel sheet chunking
- **Excel Template Export**: Uses your custom Excel template with openpyxl injection
- **CSV Export**: Flat CSV export for data analysis
- **Advanced Filtering**: Filter by vendor, brand, lead time, payment terms
- **Pivot View**: Card-based comparison view for better visualization

### New Offer Fields
- `requestId`: Purchase request identifier
- `vendor`: Vendor/supplier name
- `productCode`: Product code identifier
- `qty`: Quantity
- `unit`: Unit of measurement
- `currency`: Currency code (TRY, USD, EUR, GBP)
- `price`: Unit price
- `brand`: Product brand
- `lead_time_days`: Lead time in days
- `delivery_date`: Specific delivery date
- `payment_terms`: Payment terms (e.g., "Peşin", "30 Gün")
- `shipping_type`: Shipping type (DAP, EXW, FOB, CIF)
- `shipping_cost`: Shipping cost
- `delivery_method`: Delivery method
- `min_order_qty`: Minimum order quantity
- `vat_rate`: VAT rate percentage
- `notes`: Additional notes

## 📁 Project Structure

```
teklifbul-compare-app/
├── server/
│   ├── src/
│   │   ├── data/
│   │   │   ├── types.ts              # Enhanced data types
│   │   │   └── repo.ts               # Mock data repository
│   │   ├── services/
│   │   │   ├── fx.ts                 # Currency conversion service
│   │   │   ├── matchService.ts       # Enhanced matching logic
│   │   │   └── exportExcel.ts        # Excel template export
│   │   ├── routes/
│   │   │   └── offers.ts             # Enhanced API routes
│   │   ├── migrations/
│   │   │   └── 2025_01_20_extend_offers.sql
│   │   └── tests/
│   │       └── enhanced.test.ts      # Comprehensive tests
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   └── OffersCompare.tsx     # Main comparison component
│   │   ├── pages/
│   │   │   └── OffersCompare.tsx     # Comparison page
│   │   ├── types/
│   │   │   └── index.ts              # Enhanced client types
│   │   └── lib/
│   │       └── api.ts                # Enhanced API client
└── assets/
    └── TEKLİF MUKAYESE FORMU.xlsx    # Excel template
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 18+
- Python 3.8+ (for openpyxl Excel export)
- PostgreSQL (for production)

### Backend Setup

```bash
cd server
npm install

# Install Python dependencies for Excel export
pip install openpyxl pandas

# Run database migration (if using PostgreSQL)
psql -d your_database -f src/migrations/2025_01_20_extend_offers.sql

# Start development server
npm run dev
```

### Frontend Setup

```bash
cd client
npm install

# Start development server
npm run dev
```

## 🎯 Usage

### API Endpoints

#### Enhanced Comparison
```http
GET /api/compare?requestId=PR-2025-001&membership={"tier":"standard","maxVendors":3,"maxVendorsPerSheet":5}
```

#### Offers by Request ID
```http
GET /api/offers?requestId=PR-2025-001
```

#### Vendor Ranking
```http
GET /api/ranking/PRD001
```

#### Savings Calculation
```http
GET /api/savings?requestId=PR-2025-001
```

#### Export with Template
```http
GET /api/export/compare?requestId=PR-2025-001&mode=template&membership={"tier":"premium"}
```

#### CSV Export
```http
GET /api/export/compare?mode=csv
```

### Frontend Usage

1. **Navigate to Offers Comparison**: Use the "Teklif Karşılaştırması" tab
2. **Set Filters**: Enter request ID, select membership tier
3. **View Results**: Switch between table and pivot views
4. **Export Data**: Use the export dropdown for Excel or CSV

### Membership Rules

#### Standard Membership
- Maximum 3 vendors per product
- Single Excel sheet
- Basic comparison features

#### Premium Membership
- Unlimited vendors
- Multiple Excel sheets (5 vendors per sheet)
- Advanced filtering and analysis

## 🔧 Configuration

### Currency Rates
Edit `server/src/services/fx.ts` to update exchange rates:

```typescript
const baseRates = [
  { from: 'USD', to: 'TRY', rate: 30.5 },
  { from: 'EUR', to: 'TRY', rate: 33.2 },
  { from: 'GBP', to: 'TRY', rate: 38.7 },
  // Add more rates...
];
```

### Excel Template Mapping
Edit `server/src/services/exportExcel.ts` to adjust template mapping:

```typescript
const templateMap = {
  headerRow: 7,
  dataStartRow: 9,
  cols: {
    no: "A",
    urun: "B",
    qty: "C",
    unit: "D",
    vendors: [
      { unitPrice: "F", total: "G", totalTL: "H" },
      // Add more vendor columns...
    ]
  }
};
```

## 🧪 Testing

### Run Unit Tests
```bash
cd server
npm test
```

### Run System Test
```bash
node test-system.js
```

### Test Coverage
- FX Service: Currency conversion and formatting
- Match Service: Enhanced comparison and ranking
- Export Service: Template injection and CSV export
- API Routes: All endpoints and error handling
- Integration: Complete workflow testing

## 📊 Data Model

### Offer Structure
```typescript
interface Offer {
  id: string;
  requestId: string;
  vendor: string;
  productCode: string;
  qty: number;
  unit: string;
  currency: string;
  price: number;
  brand?: string;
  lead_time_days?: number;
  delivery_date?: string;
  payment_terms?: string;
  shipping_type?: string;
  shipping_cost?: number;
  delivery_method?: string;
  min_order_qty?: number;
  vat_rate?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive' | 'pending';
}
```

### Comparison Result
```typescript
interface ComparisonResult {
  requestId: string;
  rows: ComparisonRow[];
  bestOverallVendor: string;
  bestOverallTotal: number;
  totalProducts: number;
  totalVendors: number;
  generatedAt: string;
}
```

## 🚀 Deployment

### Production Setup

1. **Database Migration**:
```bash
psql -d production_db -f server/src/migrations/2025_01_20_extend_offers.sql
```

2. **Environment Variables**:
```bash
# Server
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@host:port/db

# Client
VITE_API_URL=https://your-api-domain.com/api
```

3. **Build & Deploy**:
```bash
# Build client
cd client && npm run build

# Start server
cd server && npm start
```

## 🔍 Troubleshooting

### Common Issues

1. **Excel Template Missing**: 
   - Ensure `assets/TEKLİF MUKAYESE FORMU.xlsx` exists
   - System will fallback to programmatic export

2. **Python/Openpyxl Not Found**:
   - Install Python 3.8+ and openpyxl
   - System will fallback to ExcelJS export

3. **Currency Conversion Errors**:
   - Check exchange rates in `fx.ts`
   - Verify currency codes are supported

4. **Membership Restrictions Not Applied**:
   - Verify membership config is passed correctly
   - Check API parameters

### Debug Mode

Enable debug logging:
```bash
DEBUG=teklifbul:* npm run dev
```

## 📈 Performance

### Optimization Features
- Lazy loading of comparison data
- Pagination for large datasets
- Caching of exchange rates
- Background processing for exports
- Debounced search and filtering

### Scalability
- Horizontal scaling with load balancer
- Database connection pooling
- Redis caching for frequently accessed data
- CDN for static assets

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

---

**Version**: 2.0 Enhanced  
**Last Updated**: January 2025  
**Compatibility**: Node.js 18+, React 18+, PostgreSQL 12+
