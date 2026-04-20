'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Utensils, Scissors, ShoppingCart, Sparkles, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/lib/api';
import { toast } from 'sonner';

const TEMPLATE_ICONS = {
  'Restaurant': Utensils,
  'Salon': Scissors,
  'E-commerce': ShoppingCart,
};

export default function AssistantTemplates({ onTemplateUsed }) {
  const { t, locale } = useLanguage();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingTemplate, setCreatingTemplate] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await api.templates.getAll();
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      // Fallback templates
      setTemplates([
        {
          id: 'restaurant-en',
          name: 'Restaurant Reservation',
          language: 'EN',
          industry: 'Restaurant',
          description: 'AI assistant that handles restaurant reservations',
        },
        {
          id: 'salon-en',
          name: 'Salon Appointment',
          language: 'EN',
          industry: 'Salon',
          description: 'AI assistant for beauty salons',
        },
        {
          id: 'ecommerce-en',
          name: 'E-commerce Support',
          language: 'EN',
          industry: 'E-commerce',
          description: 'AI assistant for online stores',
        },
        {
          id: 'restaurant-tr',
          name: 'Restoran Rezervasyonu',
          language: 'TR',
          industry: 'Restaurant',
          description: 'Türkçe restoran rezervasyon asistanı',
        },
        {
          id: 'salon-tr',
          name: 'Kuaför Randevusu',
          language: 'TR',
          industry: 'Salon',
          description: 'Türkçe kuaför randevu asistanı',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = async (template) => {
    setCreatingTemplate(template.id);
    try {
      const response = await api.templates.createFromTemplate({
        templateId: template.id
      });
      
      toast.success(t('templates.createdFromTemplate', { name: template.name }));
      
      if (onTemplateUsed) {
        onTemplateUsed(response.data.assistant);
      }
    } catch (error) {
      console.error('Error creating from template:', error);
      toast.error(t('templates.createFailed'));
    } finally {
      setCreatingTemplate(null);
    }
  };

  // Filter templates by current language
  const currentLanguageCode = locale === 'tr' ? 'TR' : 'EN';
  const filteredTemplates = templates.filter(
    tmpl => tmpl.language === currentLanguageCode
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">{t('templates.title')}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('templates.description')}
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => {
          const Icon = TEMPLATE_ICONS[template.industry] || Sparkles;
          return (
            <Card key={template.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {template.language}
                  </Badge>
                </div>
                <CardTitle className="text-base mt-3">{template.name}</CardTitle>
                <CardDescription className="text-sm">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => applyTemplate(template)}
                  disabled={creatingTemplate === template.id}
                >
                  {creatingTemplate === template.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('templates.creating')}
                    </>
                  ) : (
                    t('templates.useTemplate')
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
