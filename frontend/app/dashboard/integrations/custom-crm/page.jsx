'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Copy,
  CheckCircle2,
  RefreshCw,
  Database,
  Package,
  ShoppingCart,
  Wrench,
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowLeft,
  Lock
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CustomCrmPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [webhook, setWebhook] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteType, setDeleteType] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Accordion states
  const [openAccordion, setOpenAccordion] = useState(null);

  useEffect(() => {
    fetchWebhookData();
  }, []);

  const fetchWebhookData = async () => {
    try {
      const res = await apiClient.get('/api/crm/webhook');
      const data = res.data;

      if (data.error === 'upgrade_required') {
        setUpgradeRequired(true);
        setCurrentPlan(data.currentPlan);
        setLoading(false);
        return;
      }

      setWebhook(data.webhook);
      setStats(data.stats);
    } catch (err) {
      if (err.response?.data?.error === 'upgrade_required') {
        setUpgradeRequired(true);
        setCurrentPlan(err.response?.data?.currentPlan);
      } else {
        setError(err.response?.data?.error || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhook.url);
    setCopied(true);
    toast.success('URL kopyalandı!');
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateSecret = async () => {
    if (!confirm('Webhook URL yenilenecek. Eski URL artık çalışmayacak. Devam etmek istiyor musunuz?')) {
      return;
    }

    setRegenerating(true);
    try {
      const res = await apiClient.post('/api/crm/webhook/regenerate');
      const data = res.data;
      setWebhook(prev => ({ ...prev, ...data }));
      toast.success('Webhook URL yenilendi!');
    } catch (err) {
      toast.error('Hata: ' + (err.response?.data?.error || err.message));
    } finally {
      setRegenerating(false);
    }
  };

  const toggleWebhook = async () => {
    setToggling(true);
    try {
      const res = await apiClient.patch('/api/crm/webhook/toggle');
      const data = res.data;
      setWebhook(prev => ({ ...prev, isActive: data.isActive }));
      toast.success(data.isActive ? 'Webhook aktif edildi!' : 'Webhook pasif edildi!');
    } catch (err) {
      toast.error('Hata: ' + (err.response?.data?.error || err.message));
    } finally {
      setToggling(false);
    }
  };

  const openDeleteModal = (type) => {
    setDeleteType(type);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiClient.delete(`/api/crm/data/${deleteType}`);
      const data = res.data;
      toast.success(`${data.deleted} kayıt silindi!`);
      setDeleteModalOpen(false);
      await fetchWebhookData();
    } catch (err) {
      toast.error('Hata: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('tr-TR');
  };

  const toggleAccordion = (key) => {
    setOpenAccordion(openAccordion === key ? null : key);
  };

  // Upgrade Required Screen
  if (upgradeRequired) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.push('/dashboard/integrations')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Entegrasyonlara Dön
          </Button>
        </div>

        <div className="bg-gradient-to-r from-primary-50 to-cyan-50 dark:from-primary-950/30 dark:to-cyan-950/30 border border-primary-200 dark:border-primary-800 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-primary-600 dark:text-cyan-300" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Pro Pakete Yükseltin
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
            Özel CRM entegrasyonu Pro ve Kurumsal paketlerde kullanılabilir.
            Kendi sisteminizi bağlayarak sipariş, stok ve servis bilgilerinizi
            asistanınızla paylaşın.
          </p>
          {currentPlan && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Mevcut paketiniz: <Badge variant="outline">{currentPlan}</Badge>
            </p>
          )}
          <Button
            onClick={() => router.push('/dashboard/settings/subscription')}
            className="px-6 py-3"
          >
            Paketleri İncele
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 text-red-700 dark:text-red-400">
          Hata: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Back Button */}
      <div className="mb-2">
        <Button variant="ghost" onClick={() => router.push('/dashboard/integrations')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Entegrasyonlara Dön
        </Button>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
            <Database className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Özel CRM Entegrasyonu</h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Kendi sisteminizden Telyx&apos;e sipariş, stok ve servis bilgileri gönderin.
            </p>
          </div>
        </div>
      </div>

      {/* Webhook URL Card */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Webhook URL</h2>
          <Button
            variant={webhook?.isActive ? 'default' : 'outline'}
            size="sm"
            onClick={toggleWebhook}
            disabled={toggling}
            className={webhook?.isActive ? 'bg-green-600 hover:bg-green-700' : ''}
          >
            {toggling ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              webhook?.isActive ? 'Aktif' : 'Pasif'
            )}
          </Button>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          IT ekibiniz bu URL&apos;e POST request atarak sisteminizden veri gönderebilir.
        </p>

        <div className="flex gap-2">
          <Input
            type="text"
            value={webhook?.url || ''}
            readOnly
            className="flex-1 font-mono text-sm bg-neutral-50 dark:bg-neutral-800"
          />
          <Button
            variant="outline"
            onClick={copyToClipboard}
          >
            {copied ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-4 flex gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={regenerateSecret}
            disabled={regenerating}
            className="text-neutral-600 dark:text-neutral-400"
          >
            {regenerating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Yenileniyor...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                URL Yenile
              </>
            )}
          </Button>
        </div>

        {webhook?.lastDataAt && (
          <p className="text-xs text-neutral-500 mt-4">
            Son veri alımı: {formatDate(webhook.lastDataAt)}
          </p>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Orders Card - Clickable */}
        <div
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all"
          onClick={() => router.push('/dashboard/crm-data?tab=orders')}
        >
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Siparişler</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats?.orders?.count || 0}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Son: {formatDate(stats?.orders?.lastUpdate)}
          </div>
          {stats?.orders?.count > 0 && (
            <div className="flex gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/dashboard/crm-data?tab=orders');
                }}
              >
                Görüntüle →
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal('orders');
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Temizle
              </Button>
            </div>
          )}
        </div>

        {/* Stock Card - Clickable */}
        <div
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-green-300 dark:hover:border-green-600 transition-all"
          onClick={() => router.push('/dashboard/crm-data?tab=stock')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Stok Kayıtları</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats?.stock?.count || 0}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Son: {formatDate(stats?.stock?.lastUpdate)}
          </div>
          {stats?.stock?.count > 0 && (
            <div className="flex gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-green-600 hover:text-green-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/dashboard/crm-data?tab=stock');
                }}
              >
                Görüntüle →
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal('stock');
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Temizle
              </Button>
            </div>
          )}
        </div>

        {/* Tickets Card - Clickable */}
        <div
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-600 transition-all"
          onClick={() => router.push('/dashboard/crm-data?tab=tickets')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Servis/Arıza</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-white">{stats?.tickets?.count || 0}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Son: {formatDate(stats?.tickets?.lastUpdate)}
          </div>
          {stats?.tickets?.count > 0 && (
            <div className="flex gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-orange-600 hover:text-orange-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/dashboard/crm-data?tab=tickets');
                }}
              >
                Görüntüle →
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 p-0 h-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal('tickets');
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Temizle
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Data Formats */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">Veri Formatları</h2>

        <div className="space-y-3">
          {/* Order Format */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              onClick={() => toggleAccordion('order')}
            >
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Sipariş Verisi</span>
              {openAccordion === 'order' ? (
                <ChevronUp className="h-5 w-5 text-neutral-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-neutral-500" />
              )}
            </button>
            {openAccordion === 'order' && (
              <pre className="p-4 bg-neutral-900 text-neutral-100 text-sm overflow-x-auto">
{`{
  "type": "order",
  "order_number": "ORD-12345",
  "customer_phone": "5551234567",
  "customer_name": "Ahmet Yılmaz",
  "customer_email": "ahmet@example.com",
  "status": "kargoda",
  "tracking_number": "ABC123456",
  "carrier": "Yurtiçi Kargo",
  "total_amount": 1250.00,
  "estimated_delivery": "2024-12-25",
  "items": [{"name": "Ürün 1", "qty": 2}],
  "updated_at": "2024-12-19T10:30:00Z"
}`}
              </pre>
            )}
          </div>

          {/* Stock Format */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              onClick={() => toggleAccordion('stock')}
            >
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Stok Verisi</span>
              {openAccordion === 'stock' ? (
                <ChevronUp className="h-5 w-5 text-neutral-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-neutral-500" />
              )}
            </button>
            {openAccordion === 'stock' && (
              <pre className="p-4 bg-neutral-900 text-neutral-100 text-sm overflow-x-auto">
{`{
  "type": "stock",
  "sku": "IPHONE15-128-BLACK",
  "product_name": "iPhone 15 128GB Siyah",
  "in_stock": true,
  "quantity": 25,
  "price": 42000,
  "estimated_restock": "2024-12-30",
  "updated_at": "2024-12-19T10:30:00Z"
}`}
              </pre>
            )}
          </div>

          {/* Ticket Format */}
          <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              onClick={() => toggleAccordion('ticket')}
            >
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Servis/Arıza Verisi</span>
              {openAccordion === 'ticket' ? (
                <ChevronUp className="h-5 w-5 text-neutral-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-neutral-500" />
              )}
            </button>
            {openAccordion === 'ticket' && (
              <pre className="p-4 bg-neutral-900 text-neutral-100 text-sm overflow-x-auto">
{`{
  "type": "ticket",
  "ticket_number": "SRV-5678",
  "customer_phone": "5551234567",
  "customer_name": "Mehmet Demir",
  "customer_email": "mehmet@example.com",
  "product": "iPhone 13 Pro",
  "issue": "Ekran kırık",
  "status": "tamir_ediliyor",
  "notes": "Ekran değişimi yapılacak",
  "estimated_completion": "2024-12-22",
  "cost": 3500,
  "updated_at": "2024-12-19T10:30:00Z"
}`}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4">Nasıl Çalışır?</h2>
        <ol className="text-sm text-blue-800 dark:text-blue-300 space-y-2 list-decimal list-inside">
          <li>Yukarıdaki webhook URL&apos;ini kopyalayın</li>
          <li>Sisteminizdeki siparişler, stok veya servis kayıtları değiştiğinde bu URL&apos;e POST isteği gönderin</li>
          <li>Her veri tipini (<code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">order</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">stock</code>, <code className="bg-blue-100 dark:bg-blue-900/50 px-1 rounded">ticket</code>) JSON formatında gönderin</li>
          <li>Veriler Telyx&apos;e kaydedilir ve AI asistanınız bu bilgilere erişebilir</li>
          <li>Müşterileriniz sipariş durumu, stok veya servis sorgusu yaptığında AI otomatik olarak yanıt verir</li>
        </ol>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verileri Sil</DialogTitle>
            <DialogDescription>
              {deleteType === 'orders' && 'Tüm sipariş verileri silinecek.'}
              {deleteType === 'stock' && 'Tüm stok verileri silinecek.'}
              {deleteType === 'tickets' && 'Tüm servis/arıza verileri silinecek.'}
              {deleteType === 'all' && 'Tüm CRM verileri silinecek.'}
              {' '}Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Siliniyor...
                </>
              ) : (
                'Sil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
