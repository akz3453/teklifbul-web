export type TaxOfficeScope = 'district' | 'citywide' | 'nationwide';

export type TaxOffice = {
  id: string;           // stable ID (slug/uuid)
  name: string;         // "Kadıköy Vergi Dairesi"
  cityCode: string;     // TR-34 gibi, ya da "34"
  districtCode?: string;// "Kadıköy" kodu (id)
  scope: TaxOfficeScope;
};
