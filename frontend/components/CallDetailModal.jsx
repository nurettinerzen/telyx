/**
 * CallDetailModal Component
 * Modal showing detailed call information including transcript
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Phone,
  Clock,
  Calendar,
  DollarSign,
  User,
  MessageSquare,
  Download,
} from 'lucide-react';
import { formatDate, formatDuration, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CallDetailModal({ call, isOpen, onClose }) {
  const { locale } = useLanguage();
  if (!call) return null;

  const statusColors = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    queued: 'bg-amber-100 text-amber-800',
  };

  const handleDownloadTranscript = () => {
    if (!call.transcript) return;
    
    const blob = new Blob([call.transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-transcript-${call.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] !overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-primary-600" />
            Call Details
          </DialogTitle>
          <DialogDescription>
            Complete information about this call
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            <Badge className={statusColors[call.status] || 'bg-neutral-100 text-neutral-800'}>
              {call.status}
            </Badge>
            <span className="text-sm text-neutral-500">Call ID: {call.id}</span>
          </div>

          {/* Basic info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Phone className="h-4 w-4 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Phone Number</p>
                <p className="text-sm font-medium text-neutral-900">{call.phoneNumber || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <User className="h-4 w-4 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Assistant</p>
                <p className="text-sm font-medium text-neutral-900">{call.assistantName || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Calendar className="h-4 w-4 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Date & Time</p>
                <p className="text-sm font-medium text-neutral-900">
                  {formatDate(call.createdAt, 'long', locale)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Clock className="h-4 w-4 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Duration</p>
                <p className="text-sm font-medium text-neutral-900">
                  {formatDuration(call.duration)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Cost</p>
                <p className="text-sm font-medium text-neutral-900">
                  {formatCurrency(call.cost)}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Call summary */}
          {call.summary && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 mb-2">Call Summary</h4>
                <p className="text-sm text-neutral-600">{call.summary}</p>
              </div>
              <Separator />
            </>
          )}

          {/* Transcript */}
          {call.transcript && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-neutral-600" />
                  <h4 className="text-sm font-semibold text-neutral-900">Transcript</h4>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTranscript}
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download
                </Button>
              </div>
              <div className="bg-neutral-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-sans">
                  {call.transcript}
                </pre>
              </div>
            </div>
          )}

          {/* Analysis/metadata */}
          {call.analysis && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-neutral-900 mb-2">Analysis</h4>
                <div className="space-y-2">
                  {call.analysis.sentiment && (
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-600">Sentiment:</span>
                      <Badge variant="outline">{call.analysis.sentiment}</Badge>
                    </div>
                  )}
                  {call.analysis.intent && (
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-600">Intent:</span>
                      <span className="font-medium text-neutral-900">{call.analysis.intent}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-neutral-200 pt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
