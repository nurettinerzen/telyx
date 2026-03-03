'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import {
  Package,
  Box,
  Wrench,
  Search,
  Download,
  RefreshCw,
  Calendar,
  Phone,
  Truck,
  MapPin,
  DollarSign,
  User,
  Hash,
  Clock,
  ExternalLink,
  Mail,
  ShoppingBag,
  FileText,
  AlertCircle,
  CircleDollarSign
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const ORDER_STATUS_LABELS = {
  pending: 'Beklemede',
  confirmed: 'Onaylandı',
  processing: 'Hazırlanıyor',
  shipped: 'Kargoya Verildi',
  in_transit: 'Yolda',
  out_for_delivery: 'Dağıtımda',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi',
  returned: 'İade Edildi',
  refunded: 'İade Edildi (Ödeme)',
};

const ORDER_STATUS_COLORS = {
  pending: 'text-yellow-600 dark:text-yellow-400',
  confirmed: 'text-blue-600 dark:text-blue-400',
  processing: 'text-purple-600 dark:text-purple-400',
  shipped: 'text-indigo-600 dark:text-indigo-400',
  in_transit: 'text-blue-600 dark:text-blue-400',
  out_for_delivery: 'text-teal-600 dark:text-teal-400',
  delivered: 'text-green-600 dark:text-green-400',
  cancelled: 'text-red-600 dark:text-red-400',
  returned: 'text-orange-600 dark:text-orange-400',
  refunded: 'text-gray-600 dark:text-gray-400',
};

const TICKET_STATUS_LABELS = {
  open: 'Açık',
  pending: 'Beklemede',
  received: 'Teslim Alındı',
  in_review: 'İnceleniyor',
  in_progress: 'Tamir Ediliyor',
  waiting_parts: 'Parça Bekleniyor',
  escalated: 'Yönlendirildi',
  completed: 'Tamir Edildi',
  resolved: 'Çözüldü',
  ready: 'Teslime Hazır',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi',
  closed: 'Kapatıldı',
};

const TICKET_STATUS_COLORS = {
  open: 'text-yellow-600 dark:text-yellow-400',
  pending: 'text-yellow-600 dark:text-yellow-400',
  received: 'text-blue-600 dark:text-blue-400',
  in_review: 'text-purple-600 dark:text-purple-400',
  in_progress: 'text-blue-600 dark:text-blue-400',
  waiting_parts: 'text-orange-600 dark:text-orange-400',
  escalated: 'text-red-600 dark:text-red-400',
  completed: 'text-green-600 dark:text-green-400',
  resolved: 'text-green-600 dark:text-green-400',
  ready: 'text-teal-600 dark:text-teal-400',
  delivered: 'text-gray-600 dark:text-gray-400',
  cancelled: 'text-red-600 dark:text-red-400',
  closed: 'text-gray-600 dark:text-gray-400',
};

export default function CRMDataPage() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'orders');
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    ordersCount: 0,
    stockCount: 0,
    ticketsCount: 0
  });

  // Fetch orders
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/crm/orders?limit=100');
      setOrders(response.data.orders || []);
      setStats(prev => ({ ...prev, ordersCount: response.data.total || 0 }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Siparişler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stock
  const fetchStock = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/crm/stock?limit=100');
      setStock(response.data.stock || []);
      setStats(prev => ({ ...prev, stockCount: response.data.total || 0 }));
    } catch (error) {
      console.error('Error fetching stock:', error);
      toast.error('Stok verileri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Fetch tickets
  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/crm/tickets?limit=100');
      setTickets(response.data.tickets || []);
      setStats(prev => ({ ...prev, ticketsCount: response.data.total || 0 }));
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Servis kayıtları yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOrders();
    fetchStock();
    fetchTickets();
  }, []);

  // Filter data
  const filterOrders = orders.filter(order =>
    order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customerPhone?.includes(searchTerm) ||
    order.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filterStock = stock.filter(item =>
    item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filterTickets = tickets.filter(ticket =>
    ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.customerPhone?.includes(searchTerm) ||
    ticket.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Refresh data
  const handleRefresh = () => {
    if (activeTab === 'orders') fetchOrders();
    else if (activeTab === 'stock') fetchStock();
    else if (activeTab === 'tickets') fetchTickets();
  };

  // Export to CSV
  const exportToCSV = () => {
    let data = [];
    let filename = 'export.csv';

    if (activeTab === 'orders') {
      data = filterOrders;
      filename = 'siparisler.csv';
    } else if (activeTab === 'stock') {
      data = filterStock;
      filename = 'stok.csv';
    } else if (activeTab === 'tickets') {
      data = filterTickets;
      filename = 'servis-kayitlari.csv';
    }

    if (data.length === 0) {
      toast.error('Dışa aktarılacak veri yok');
      return;
    }

    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    toast.success('Veriler dışa aktarıldı');
  };

  const convertToCSV = (data) => {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
      Object.values(row).map(val =>
        typeof val === 'string' ? `"${val}"` : val
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">CRM Verileri</h1>
        <p className="text-muted-foreground mt-2">
          Webhook ile gelen sipariş, stok ve servis verilerinizi görüntüleyin
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Toplam Sipariş</p>
              <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                {stats.ordersCount}
              </p>
            </div>
            <Package className="w-12 h-12 text-blue-500 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 p-6 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">Stok Ürünleri</p>
              <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-1">
                {stats.stockCount}
              </p>
            </div>
            <Box className="w-12 h-12 text-green-500 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">Servis Kayıtları</p>
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-100 mt-1">
                {stats.ticketsCount}
              </p>
            </div>
            <Wrench className="w-12 h-12 text-orange-500 opacity-50" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="orders" className="gap-2">
              <Package className="w-4 h-4" />
              Siparişler
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2">
              <Box className="w-4 h-4" />
              Stok
            </TabsTrigger>
            <TabsTrigger value="tickets" className="gap-2">
              <Wrench className="w-4 h-4" />
              Servis
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="text"
                placeholder="Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="w-4 h-4 mr-2" />
              Dışa Aktar
            </Button>
          </div>
        </div>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filterOrders.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Henüz sipariş verisi yok"
              description="Webhook ile sipariş verileri geldiğinde burada görünecek"
            />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1200px] w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Sipariş No</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Müşteri</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Ürünler</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Durum</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Kargo</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Tutar</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Tah. Teslimat</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Güncellenme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterOrders.map((order) => (
                      <tr key={order.id} className="border-t hover:bg-muted/50">
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-muted-foreground" />
                            <span className="font-mono">{order.orderNumber}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{order.customerName || 'N/A'}</span>
                            </div>
                            {order.customerPhone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Phone className="w-3 h-3" />
                                {order.customerPhone}
                              </div>
                            )}
                            {order.customerEmail && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Mail className="w-3 h-3" />
                                {order.customerEmail}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-sm">
                          {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                            <div className="space-y-1">
                              {order.items.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <ShoppingBag className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="truncate max-w-[200px]">
                                    {item.name || item.productName || item.title || JSON.stringify(item)}
                                    {item.quantity ? ` ×${item.quantity}` : ''}
                                  </span>
                                </div>
                              ))}
                              {order.items.length > 3 && (
                                <span className="text-muted-foreground text-xs">+{order.items.length - 3} ürün daha</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || 'text-gray-600 dark:text-gray-400'}>
                            {ORDER_STATUS_LABELS[order.status] || order.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {order.trackingNumber ? (
                            <div className="text-sm">
                              <div className="flex items-center gap-2">
                                <Truck className="w-4 h-4 text-muted-foreground" />
                                <span className="font-mono">{order.trackingNumber}</span>
                              </div>
                              {order.carrier && (
                                <div className="text-muted-foreground mt-1">{order.carrier}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {order.totalAmount ? (
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{order.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                          {order.estimatedDelivery ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {formatDate(order.estimatedDelivery)}
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {formatDate(order.updatedAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Stock Tab */}
        <TabsContent value="stock" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filterStock.length === 0 ? (
            <EmptyState
              icon={Box}
              title="Henüz stok verisi yok"
              description="Webhook ile stok verileri geldiğinde burada görünecek"
            />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[800px] w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-medium whitespace-nowrap">SKU</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Ürün Adı</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Stok</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Fiyat</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Güncellenme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterStock.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-muted/50">
                        <td className="p-3 font-mono">{item.sku}</td>
                        <td className="p-3 font-medium">{item.productName}</td>
                        <td className="p-3">
                          <Badge variant={item.quantity > 0 ? 'default' : 'destructive'}>
                            {item.quantity} adet
                          </Badge>
                        </td>
                        <td className="p-3">
                          {item.price ? (
                            <span className="font-medium">{item.price.toFixed(2)} ₺</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {formatDate(item.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filterTickets.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Henüz servis kaydı yok"
              description="Webhook ile servis kayıtları geldiğinde burada görünecek"
            />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1400px] w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Servis No</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Müşteri</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">E-posta</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Ürün</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Durum</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Sorun</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Notlar</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Maliyet</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Tah. Tamamlanma</th>
                      <th className="text-left p-3 font-medium whitespace-nowrap">Güncellenme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterTickets.map((ticket) => (
                      <tr key={ticket.id} className="border-t hover:bg-muted/50">
                        <td className="p-3 font-mono whitespace-nowrap">{ticket.ticketNumber}</td>
                        <td className="p-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{ticket.customerName || 'N/A'}</span>
                            </div>
                            {ticket.customerPhone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <Phone className="w-3 h-3" />
                                {ticket.customerPhone}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {ticket.customerEmail ? (
                            <div className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <span>{ticket.customerEmail}</span>
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm">
                          {ticket.product || '-'}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={TICKET_STATUS_COLORS[ticket.status] || 'text-gray-600 dark:text-gray-400'}>
                            {TICKET_STATUS_LABELS[ticket.status] || ticket.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm max-w-[200px]">
                          {ticket.issue || '-'}
                        </td>
                        <td className="p-3 text-sm max-w-[200px] text-muted-foreground">
                          {ticket.notes || '-'}
                        </td>
                        <td className="p-3 text-sm whitespace-nowrap">
                          {ticket.cost ? (
                            <div className="flex items-center gap-1">
                              <CircleDollarSign className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium">{ticket.cost.toLocaleString('tr-TR')} ₺</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                          {ticket.estimatedCompletion ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {formatDate(ticket.estimatedCompletion)}
                            </div>
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {formatDate(ticket.updatedAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
