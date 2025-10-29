"""
Mapping service for normalizing vendor column names
"""
import json
import os
from typing import Dict, List, Any, Optional
import pandas as pd


class MappingService:
    """Vendor kolon adlarını normalize eden servis"""
    
    def __init__(self, mapping_file_path: Optional[str] = None):
        if mapping_file_path is None:
            # Default path
            current_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            mapping_file_path = os.path.join(current_dir, "assets", "mapping.json")
        
        self.mapping_config = self._load_mapping_config(mapping_file_path)
    
    def _load_mapping_config(self, file_path: str) -> Dict[str, Any]:
        """Mapping konfigürasyonunu yükle"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            # Default mapping if file not found
            return {
                "match_key": "urun_kodu",
                "vendor_columns": ["ÜRÜN KODU", "STOK KODU", "SKU", "ITEM CODE"],
                "offer_price_keys": ["TEKLİF FİYATI", "BİRİM FİYAT", "FİYAT"],
                "offer_currency_keys": ["PARA BİRİMİ", "CURRENCY"],
                "offer_date_keys": ["TEKLİF TARİHİ", "DATE"],
                "offer_lead_time_keys": ["TESLİMAT SÜRESİ", "LEAD TIME"],
                "offer_min_order_keys": ["MİN SİPARİŞ", "MIN ORDER"],
                "offer_payment_keys": ["ÖDEME ŞEKLİ", "PAYMENT TERMS"],
                "offer_delivery_keys": ["TESLİM ŞEKLİ", "DELIVERY METHOD"],
                "offer_notes_keys": ["NOT", "NOTLAR", "AÇIKLAMA"]
            }
    
    def normalize_vendor_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Vendor verisini normalize et"""
        if df.empty:
            return df
        
        normalized_df = df.copy()
        
        # Ürün kodu kolonunu normalize et
        normalized_df = self._normalize_match_key(normalized_df)
        
        # Fiyat kolonlarını normalize et
        normalized_df = self._normalize_price_columns(normalized_df)
        
        # Para birimi kolonunu normalize et
        normalized_df = self._normalize_currency_column(normalized_df)
        
        # Tarih kolonunu normalize et
        normalized_df = self._normalize_date_column(normalized_df)
        
        # Diğer kolonları normalize et
        normalized_df = self._normalize_other_columns(normalized_df)
        
        return normalized_df
    
    def _normalize_match_key(self, df: pd.DataFrame) -> pd.DataFrame:
        """Ürün kodu kolonunu normalize et"""
        match_key = self.mapping_config.get("match_key", "urun_kodu")
        vendor_columns = self.mapping_config.get("vendor_columns", [])
        
        # Mevcut kolonları kontrol et
        for col in df.columns:
            if any(vendor_col.lower() in col.lower() for vendor_col in vendor_columns):
                # Kolonu yeniden adlandır
                df = df.rename(columns={col: match_key})
                break
        
        return df
    
    def _normalize_price_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fiyat kolonlarını normalize et"""
        price_keys = self.mapping_config.get("offer_price_keys", [])
        
        for col in df.columns:
            if any(price_key.lower() in col.lower() for price_key in price_keys):
                df = df.rename(columns={col: "birim_fiyat"})
                break
        
        return df
    
    def _normalize_currency_column(self, df: pd.DataFrame) -> pd.DataFrame:
        """Para birimi kolonunu normalize et"""
        currency_keys = self.mapping_config.get("offer_currency_keys", [])
        
        for col in df.columns:
            if any(currency_key.lower() in col.lower() for currency_key in currency_keys):
                df = df.rename(columns={col: "para_birimi"})
                break
        
        return df
    
    def _normalize_date_column(self, df: pd.DataFrame) -> pd.DataFrame:
        """Tarih kolonunu normalize et"""
        date_keys = self.mapping_config.get("offer_date_keys", [])
        
        for col in df.columns:
            if any(date_key.lower() in col.lower() for date_key in date_keys):
                df = df.rename(columns={col: "teklif_tarihi"})
                break
        
        return df
    
    def _normalize_other_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Diğer kolonları normalize et"""
        # Teslim süresi
        lead_time_keys = self.mapping_config.get("offer_lead_time_keys", [])
        for col in df.columns:
            if any(lead_time.lower() in col.lower() for lead_time in lead_time_keys):
                df = df.rename(columns={col: "teslim_suresi"})
                break
        
        # Min sipariş
        min_order_keys = self.mapping_config.get("offer_min_order_keys", [])
        for col in df.columns:
            if any(min_order.lower() in col.lower() for min_order in min_order_keys):
                df = df.rename(columns={col: "min_siparis"})
                break
        
        # Ödeme şekli
        payment_keys = self.mapping_config.get("offer_payment_keys", [])
        for col in df.columns:
            if any(payment.lower() in col.lower() for payment in payment_keys):
                df = df.rename(columns={col: "odeme_sekli"})
                break
        
        # Teslim şekli
        delivery_keys = self.mapping_config.get("offer_delivery_keys", [])
        for col in df.columns:
            if any(delivery.lower() in col.lower() for delivery in delivery_keys):
                df = df.rename(columns={col: "teslim_sekli"})
                break
        
        # Notlar
        notes_keys = self.mapping_config.get("offer_notes_keys", [])
        for col in df.columns:
            if any(note.lower() in col.lower() for note in notes_keys):
                df = df.rename(columns={col: "notlar"})
                break
        
        return df
    
    def get_match_key(self) -> str:
        """Eşleştirme anahtarını getir"""
        return self.mapping_config.get("match_key", "urun_kodu")
    
    def validate_mapping(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Mapping validasyonu yap"""
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "matched_columns": {}
        }
        
        if df.empty:
            result["valid"] = False
            result["errors"].append("DataFrame boş")
            return result
        
        # Ürün kodu kontrolü
        match_key = self.get_match_key()
        if match_key not in df.columns:
            result["warnings"].append(f"Ürün kodu kolonu bulunamadı: {match_key}")
        
        # Fiyat kolonu kontrolü
        if "birim_fiyat" not in df.columns:
            result["warnings"].append("Fiyat kolonu bulunamadı")
        
        # Para birimi kontrolü
        if "para_birimi" not in df.columns:
            result["warnings"].append("Para birimi kolonu bulunamadı")
        
        return result
    
    def create_sample_mapping(self, df: pd.DataFrame) -> Dict[str, str]:
        """Örnek mapping oluştur"""
        sample_mapping = {}
        
        for col in df.columns:
            col_lower = col.lower()
            
            # Ürün kodu
            if any(keyword in col_lower for keyword in ["kod", "code", "sku"]):
                sample_mapping[col] = "urun_kodu"
            
            # Fiyat
            elif any(keyword in col_lower for keyword in ["fiyat", "price", "tutar"]):
                sample_mapping[col] = "birim_fiyat"
            
            # Para birimi
            elif any(keyword in col_lower for keyword in ["para", "currency", "döviz"]):
                sample_mapping[col] = "para_birimi"
            
            # Tarih
            elif any(keyword in col_lower for keyword in ["tarih", "date"]):
                sample_mapping[col] = "teklif_tarihi"
            
            # Teslim süresi
            elif any(keyword in col_lower for keyword in ["süre", "time", "teslim"]):
                sample_mapping[col] = "teslim_suresi"
        
        return sample_mapping
