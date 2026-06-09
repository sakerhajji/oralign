'use client';

import Link from 'next/link';
import { User } from '@/lib/types';
import { getAvatarUrl } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/lib/i18n/lang-context';

export function AccountOverviewCard({ user }: { user: User }) {
  const { t } = useT();
  const initials = user.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const roleLabels: Record<string, string> = {
    admin: t('accountHome.roleAdmin'),
    super_admin: t('accountHome.roleSuperAdmin'),
    dentist: t('accountHome.roleDentist'),
    designer: t('accountHome.roleDesigner'),
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={getAvatarUrl(user.avatarUrl)} alt={user.fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold">{user.fullName}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/account/profile">{t('accountHome.editProfile')}</Link>
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="grid gap-4 py-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">{t('accountHome.roleLabel')}</p>
          <Badge variant="secondary" className="mt-2">
            {roleLabels[user.role] ?? user.role}
          </Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('accountHome.phoneLabel')}</p>
          <p className="mt-2 text-sm">{user.phone || t('accountHome.notProvided')}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('accountHome.statusLabel')}</p>
          <p className="mt-2 text-sm">
            {user.isActive ? t('accountHome.statusActive') : t('accountHome.statusInactive')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
