/**
 * Customer Data Lookup Tool Definition
 * Retrieves customer information based on phone number OR order number
 * Supports all data types: orders, accounting, support tickets, appointments, etc.
 * Used by AI assistant to access customer-specific data during calls/chats
 *
 * SECURITY: 2-way verification for sensitive data
 * - First query returns verification request
 * - Second query with both identifiers returns full data
 */

export default {
  name: 'customer_data_lookup',
  description: `Müşteri verilerini sorgular. SİPARİŞ, MUHASEBE, RANDEVU gibi VERİ TİPLERİNİ destekler.

⚠️ ARIZA/SERVİS TAKİP İÇİN BU ARACI KULLANMA → check_ticket_status_crm aracını kullan.

ÖNCELİKLİ SORGULAMA AKIŞI (query_type'a göre):

📦 SİPARİŞ SORGUSU (query_type: "siparis"):
1. SADECE sipariş numarası sor
2. EĞER kullanıcı bilmiyorsa telefon numarası sor
3. Doğrulama: İsim/soyisim sor

💰 MUHASEBE SORGUSU (query_type: "muhasebe", "sgk_borcu", "vergi_borcu"):
1. ÖNCE VKN veya TC Kimlik No sor
2. VKN/TC yoksa telefon numarası sor
3. Doğrulama: Firma ismi veya isim/soyisim sor

📅 RANDEVU SORGUSU (query_type: "randevu"):
1. Telefon numarası sor
2. Doğrulama: İsim/soyisim sor

GÜVENLİK:
- Sistem doğrulama isterse müşteriden telefon son 4 hanesi VEYA isim iste
- TEKRAR bu aracı çağır ve verification_input parametresine ekle

DOĞRULAMA AKIŞI:
1. İlk sorguda sistem "doğrulama gerekli" derse
2. Müşteriden telefon son 4 hanesi iste (4 haneli sayı)
3. Tool'u tekrar çağır: verification_input parametresine "8595" gibi 4 haneyi yaz
4. Eğer telefon yoksa isim/soyisim iste ve verification_input'a yaz

ÖNEMLİ:
- Her sorgu için SADECE primary bilgiyi sor (önce sipariş no, sonra telefon)
- Birden fazla seçenek sunma, tek tek sor
- 4 haneli sayı = telefon son 4 hanesi (verification_input'a yaz)`,
  parameters: {
    type: 'object',
    properties: {
      query_type: {
        type: 'string',
        enum: ['siparis', 'order', 'muhasebe', 'sgk_borcu', 'vergi_borcu', 'randevu', 'genel'],
        description: 'ZORUNLU: Sorgu türü. Sipariş için "siparis", muhasebe için "muhasebe", randevu için "randevu". Arıza/servis için bu aracı DEĞİL check_ticket_status_crm aracını kullan.'
      },
      order_number: {
        type: 'string',
        description: 'Sipariş numarası - SADECE sipariş sorgusunda PRIMARY bilgi'
      },
      phone: {
        type: 'string',
        description: 'Telefon numarası - SECONDARY bilgi veya muhasebe/randevu için PRIMARY'
      },
      vkn: {
        type: 'string',
        description: 'Vergi Kimlik No (10 haneli) - Muhasebe sorgusunda PRIMARY bilgi (firma için)'
      },
      tc: {
        type: 'string',
        description: 'TC Kimlik No (11 haneli) - Muhasebe sorgusunda PRIMARY bilgi (şahıs için)'
      },
      customer_name: {
        type: 'string',
        description: 'Müşteri isim/soyisim veya firma ismi - SADECE isim ile doğrulama gerektiğinde'
      },
      verification_input: {
        type: 'string',
        description: 'DOĞRULAMA BİLGİSİ: Telefon son 4 hanesi (örn: "8595") VEYA tam isim. 4 haneli sayı = telefon son 4 hane'
      }
    },
    required: ['query_type']
  },
  // Available for all business types - can store custom data
  allowedBusinessTypes: ['RESTAURANT', 'SALON', 'ECOMMERCE', 'CLINIC', 'SERVICE', 'OTHER'],
  requiredIntegrations: [] // No external integration needed, uses internal DB
};
