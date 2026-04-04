'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { usePermissions, getRoleDisplayName, getRoleBadgeColor } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import {
  useTeamMembers,
  useTeamInvitations,
  useSendInvite,
  useUpdateRole,
  useRemoveMember,
  useCancelInvite,
  useResendInvite,
} from '@/hooks/useTeam';
import {
  Users,
  UserPlus,
  Mail,
  Clock,
  MoreVertical,
  Trash2,
  RefreshCw,
  Shield,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import PageIntro from '@/components/PageIntro';
import { getPageHelp } from '@/content/pageHelp';

export default function TeamPage() {
  const { t, locale } = useLanguage();
  const pageHelp = getPageHelp('team', locale);
  const { can, isOwner, user } = usePermissions();

  // React Query hooks
  const { data: members = [], isLoading: membersLoading } = useTeamMembers();
  const { data: invitations = [], isLoading: invitationsLoading } = useTeamInvitations();
  const sendInvite = useSendInvite();
  const updateRole = useUpdateRole();
  const removeMember = useRemoveMember();
  const cancelInvite = useCancelInvite();
  const resendInvite = useResendInvite();

  const loading = membersLoading || invitationsLoading;

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'STAFF' });
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email) {
      toast.error(t('dashboard.teamPage.errors.emailRequired'));
      return;
    }

    setInviting(true);
    try {
      const response = await sendInvite.mutateAsync(inviteForm);
      const inviteLink = response.data.inviteLink;

      // Show success with link
      if (inviteLink) {
        toast.success(
          <div className="space-y-2">
            <p>{t('dashboard.teamPage.invite.created')}</p>
            <p className="text-xs text-neutral-600">{t('dashboard.teamPage.invite.manualShare')}</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="text-xs bg-neutral-100 p-1 rounded flex-1"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  toast.success(t('dashboard.teamPage.invite.linkCopied'));
                }}
                className="text-xs bg-primary-600 text-white px-2 py-1 rounded"
              >
                {t('dashboard.teamPage.invite.copy')}
              </button>
            </div>
          </div>,
          { duration: 15000 }
        );
      } else {
        toast.success(t('dashboard.teamPage.invite.sent'));
      }

      setInviteModalOpen(false);
      setInviteForm({ email: '', role: 'STAFF' });
    } catch (error) {
      const message = error.response?.data?.error || t('dashboard.teamPage.errors.inviteFailed');
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success(t('dashboard.teamPage.members.roleUpdated'));
    } catch (error) {
      const message = error.response?.data?.error || t('dashboard.teamPage.errors.roleUpdateFailed');
      toast.error(message);
    }
  };

  const handleRemoveMember = async (userId, memberName) => {
    const confirmMessage = `${memberName || t('dashboard.teamPage.members.thisUser')} ${t('dashboard.teamPage.members.removeConfirm')}`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await removeMember.mutateAsync(userId);
      toast.success(t('dashboard.teamPage.members.removed'));
    } catch (error) {
      const message = error.response?.data?.error || t('dashboard.teamPage.errors.removeFailed');
      toast.error(message);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    try {
      await cancelInvite.mutateAsync(inviteId);
      toast.success(t('dashboard.teamPage.invitations.cancelled'));
    } catch (error) {
      toast.error(t('dashboard.teamPage.errors.cancelFailed'));
    }
  };

  const handleResendInvite = async (inviteId) => {
    try {
      await resendInvite.mutateAsync(inviteId);
      toast.success(t('dashboard.teamPage.invitations.resent'));
    } catch (error) {
      toast.error(t('dashboard.teamPage.errors.resendFailed'));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (!can('team:view')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <AlertCircle className="h-16 w-16 text-neutral-300 mb-4" />
        <h2 className="text-xl font-semibold text-neutral-700 mb-2">{t('dashboard.teamPage.accessDenied.title')}</h2>
        <p className="text-neutral-500">{t('dashboard.teamPage.accessDenied.message')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageIntro
        title={pageHelp.title}
        subtitle={pageHelp.subtitle}
        locale={locale}
        help={{
          tooltipTitle: pageHelp.tooltipTitle,
          tooltipBody: pageHelp.tooltipBody,
          quickSteps: pageHelp.quickSteps,
        }}
        actions={
          can('team:invite') ? (
            <Button onClick={() => setInviteModalOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('dashboard.teamPage.sendInvite')}
            </Button>
          ) : null
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Users className="h-7 w-7 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-sm text-neutral-600">{t('dashboard.teamPage.stats.totalMembers')}</p>
                <p className="text-2xl font-bold">{members.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Mail className="h-7 w-7 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-sm text-neutral-600">{t('dashboard.teamPage.stats.pendingInvites')}</p>
                <p className="text-2xl font-bold">{invitations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Shield className="h-7 w-7 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="text-sm text-neutral-600">{t('dashboard.teamPage.stats.yourRole')}</p>
                <p className="text-2xl font-bold">{getRoleDisplayName(user?.role, locale)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members">{t('dashboard.teamPage.tabs.members')} ({members.length})</TabsTrigger>
          {can('team:invite') && (
            <TabsTrigger value="invitations">
              {t('dashboard.teamPage.tabs.pendingInvites')} ({invitations.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.teamPage.members.title')}</CardTitle>
              <CardDescription>
                {t('dashboard.teamPage.members.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  {t('dashboard.teamPage.members.noMembers')}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.teamPage.members.tableHeaders.user')}</TableHead>
                      <TableHead>{t('dashboard.teamPage.members.tableHeaders.role')}</TableHead>
                      <TableHead>{t('dashboard.teamPage.members.tableHeaders.joinedAt')}</TableHead>
                      <TableHead>{t('dashboard.teamPage.members.tableHeaders.invitedBy')}</TableHead>
                      {isOwner && <TableHead className="text-right">{t('dashboard.teamPage.members.tableHeaders.actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-primary-700 font-semibold">
                                {(member.name || member.email)[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{member.name || t('dashboard.teamPage.members.unnamed')}</p>
                              <p className="text-sm text-neutral-500">{member.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isOwner && member.role !== 'OWNER' && member.id !== user?.id ? (
                            <Select
                              value={member.role}
                              onValueChange={(value) => handleRoleChange(member.id, value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MANAGER">{t('dashboard.teamPage.roles.manager')}</SelectItem>
                                <SelectItem value="STAFF">{t('dashboard.teamPage.roles.staff')}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={getRoleBadgeColor(member.role)}>
                              {getRoleDisplayName(member.role, locale)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(member.acceptedAt || member.createdAt)}</TableCell>
                        <TableCell>
                          {member.invitedBy ? (
                            <span className="text-sm text-neutral-600">
                              {member.invitedBy.name || member.invitedBy.email}
                            </span>
                          ) : (
                            <span className="text-sm text-neutral-400">-</span>
                          )}
                        </TableCell>
                        {isOwner && (
                          <TableCell className="text-right">
                            {member.role !== 'OWNER' && member.id !== user?.id && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => handleRemoveMember(member.id, member.name)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t('dashboard.teamPage.members.removeFromTeam')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invitations Tab */}
        {can('team:invite') && (
          <TabsContent value="invitations">
            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.teamPage.invitations.title')}</CardTitle>
                <CardDescription>
                  {t('dashboard.teamPage.invitations.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : invitations.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    {t('dashboard.teamPage.invitations.noPending')}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('dashboard.teamPage.invitations.tableHeaders.email')}</TableHead>
                        <TableHead>{t('dashboard.teamPage.invitations.tableHeaders.role')}</TableHead>
                        <TableHead>{t('dashboard.teamPage.invitations.tableHeaders.sentAt')}</TableHead>
                        <TableHead>{t('dashboard.teamPage.invitations.tableHeaders.expiresAt')}</TableHead>
                        <TableHead>{t('dashboard.teamPage.invitations.tableHeaders.invitedBy')}</TableHead>
                        <TableHead className="text-right">{t('dashboard.teamPage.invitations.tableHeaders.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((invite) => (
                        <TableRow key={invite.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-neutral-400" />
                              {invite.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getRoleBadgeColor(invite.role)}>
                              {getRoleDisplayName(invite.role, locale)}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(invite.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 text-neutral-400" />
                              {formatDate(invite.expiresAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {invite.invitedBy?.name || invite.invitedBy?.email || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendInvite(invite.id)}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                onClick={() => handleCancelInvite(invite.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Invite Modal */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.teamPage.inviteModal.title')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.teamPage.inviteModal.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('dashboard.teamPage.inviteModal.emailLabel')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('dashboard.teamPage.inviteModal.emailPlaceholder')}
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">{t('dashboard.teamPage.inviteModal.roleLabel')}</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANAGER">
                      <div className="flex flex-col">
                        <span>{t('dashboard.teamPage.roles.manager')}</span>
                        <span className="text-xs text-neutral-500">
                          {t('dashboard.teamPage.inviteModal.managerDesc')}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="STAFF">
                      <div className="flex flex-col">
                        <span>{t('dashboard.teamPage.roles.staff')}</span>
                        <span className="text-xs text-neutral-500">
                          {t('dashboard.teamPage.inviteModal.staffDesc')}
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    {t('dashboard.teamPage.inviteModal.sending')}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('dashboard.teamPage.sendInvite')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
