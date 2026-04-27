/**
 * Delivery Note Types - E-Belge Modülü
 * Teklifbul Rule v1.0 - Snapshot bazlı delivery note type tanımları
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Delivery Note Status
 */
export type DeliveryNoteStatus = 'draft' | 'ready' | 'sent' | 'accepted' | 'rejected' | 'cancelled';

/**
 * Shipment Snapshot
 */
export interface ShipmentSnapshot {
  shipDate: Timestamp;
  shipToAddress: {
    line1: string;
    line2?: string;
    city: string;
    district?: string;
    postalCode?: string;
    country: string; // default 'TR'
  };
  fromLocationId?: string;
  fromLocationName?: string;
}

/**
 * Delivery Note Item Snapshot
 */
export interface DeliveryNoteItemSnapshot {
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  saleItemId?: string; // Sale item referansı
}

/**
 * Delivery Note Snapshot
 */
export interface DeliveryNoteSnapshot {
  seller: {
    vkn: string;
    title: string;
    taxOffice?: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      district?: string;
      postalCode?: string;
      country: string;
    };
  };
  buyer: {
    taxNumber?: string;
    name?: string;
    title?: string;
    taxOffice?: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      district?: string;
      postalCode?: string;
      country: string;
    };
    email?: string;
  };
  shipment: ShipmentSnapshot;
  items: DeliveryNoteItemSnapshot[];
  totals?: {
    // Opsiyonel: Sadece miktar bazlı da olabilir ama satışla uyumlu kalsın
    subtotal?: number;
    totalVat?: number;
    totalAmount?: number;
    currency?: string;
  };
}

/**
 * E-Document Metadata
 */
export interface DeliveryNoteEdoc {
  providerKey: string | null;
  externalId: string | null;
  uuid: string | null;
  sentAt: Timestamp | null;
  responseLogs?: any[];
  pdfUrl?: string | null;
}

/**
 * Delivery Note Document (Firestore)
 */
export interface DeliveryNote {
  id: string;
  companyId: string;
  saleId: string | null; // direct irsaliye için null olabilir
  number: string; // IRS-YYYY-XXX format
  status: DeliveryNoteStatus;
  snapshot: DeliveryNoteSnapshot;
  edoc: DeliveryNoteEdoc;
  requestId?: string; // Idempotency için
  origin?: 'sale' | 'direct';
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
}

