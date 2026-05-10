'use client';

import Link from 'next/link';
import { User } from '@/lib/types';
import { getAvatarUrl } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  dentist: 'Dentist',
  designer: 'Designer',
};

export function AccountOverviewCard({ user }: { user: User }) {
  const initials = user.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
          <Link href="/account/profile">Edit Profile</Link>
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="grid gap-4 py-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Role</p>
          <Badge variant="secondary" className="mt-2">
            {ROLE_LABELS[user.role] ?? user.role}
          </Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Phone</p>
          <p className="mt-2 text-sm">{user.phone || 'Not provided'}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="mt-2 text-sm">{user.isActive ? 'Active' : 'Inactive'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
