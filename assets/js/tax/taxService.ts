import { TaxOffice } from '../types/taxOffice';

export const MANUAL_TOKEN = 'custom';

type Params = { cityCode?: string; districtCode?: string };

export class TaxService {
  private offices: TaxOffice[] = [];

  constructor(initial: TaxOffice[] = []) {
    this.offices = initial.slice(); // shallow copy
  }

  setOffices(next: TaxOffice[]) {
    this.offices = next.slice();
  }

  splitByScope({ cityCode, districtCode }: Params) {
    const inCity = this.offices.filter(o => !cityCode || o.cityCode === cityCode);

    const districtList = districtCode
      ? inCity.filter(o => o.scope === 'district' && o.districtCode === districtCode)
      : [];

    const citywideList   = inCity.filter(o => o.scope === 'citywide');
    const nationwideList = inCity.filter(o => o.scope === 'nationwide');

    return { districtList, citywideList, nationwideList };
  }

  findById(id: string): TaxOffice | undefined {
    return this.offices.find(o => o.id === id);
  }

  getAll(): TaxOffice[] {
    return this.offices.slice();
  }
}

