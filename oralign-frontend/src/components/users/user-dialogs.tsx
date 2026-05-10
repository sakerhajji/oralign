'use client';

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput } from "@/components/ui/phone-input";
import { CountryPhoneDisplay } from "@/components/ui/phone-display";
import { useCreateUser, useDeleteUser } from '@/lib/hooks';
import { createUserSchema, CreateUserFormData } from '@/lib/schemas';
import { User, UserRole } from '@/lib/types';
import { EditUserDialog } from './edit-user-dialog';
import { format } from 'date-fns';
import { Mail, Phone, Shield, CheckCircle, XCircle, Calendar, User as UserIcon } from 'lucide-react';

// Create User Dialog
export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate: createUser, isPending } = useCreateUser();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    control,
    watch,
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      phone: '',
      country: 'TN',
    },
  });

  const onSubmit = (data: CreateUserFormData) => {
    const trimmedPhone = data.phone?.trim();
    const submitData = {
      ...data,
      phone: trimmedPhone || undefined,
      country: trimmedPhone ? data.country?.trim() : undefined,
    };
    createUser(submitData, {
      onSuccess: () => {
        reset();
        onOpenChange(false);
      },
    });
  };

  const countryValue = watch('country');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>Add a new user to the system</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input id="fullName" {...register('fullName')} />
            {errors.fullName && <p className="text-sm text-red-500">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInput
                  id="phone"
                  name={field.name}
                  value={field.value}
                  country={countryValue}
                  defaultCountry="TN"
                  onBlur={field.onBlur}
                  onChange={(next) => {
                    field.onChange(next.phone);
                    setValue('country', next.country, { shouldDirty: true, shouldValidate: true });
                  }}
                  placeholder="+216 71 000 000"
                  isInvalid={!!errors.phone || !!errors.country}
                />
              )}
            />
            <input type="hidden" {...register('country')} />
            {(errors.phone || errors.country) && (
              <p className="text-sm text-red-500">
                {errors.phone?.message ?? errors.country?.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select onValueChange={(value) => setValue('role', value as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.DENTIST}>Dentist</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                <SelectItem value={UserRole.DESIGNER}>Designer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Creating...' : 'Create User'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Export the new EditUserDialog from the separate file

// View User Details Dialog
export function ViewUserDialog({ user, open, onOpenChange }: { user: User; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] lg:max-w-[1100px] xl:max-w-[1200px] h-[90vh] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="text-xl font-semibold">User Profile Details</DialogTitle>
          <DialogDescription>Complete user information and account details</DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 h-[calc(90vh-140px)]">
          <div className="space-y-6 p-6">
            {/* Profile Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-6">
                  <div className="relative">
                    <Avatar className="w-24 h-24 border-2 border-muted">
                      <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                      <AvatarFallback className="text-xl font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                        {user.fullName
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold">{user.fullName}</h3>
                    <div className="flex items-center space-x-2 mt-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                      <Badge variant={user.isActive ? 'default' : 'secondary'} className="text-xs">
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant={user.role === UserRole.ADMIN ? 'destructive' : 'outline'} className="text-xs">
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role}
                      </Badge>
                      <Badge variant={user.isEmailVerified ? 'default' : 'outline'} className="text-xs">
                        {user.isEmailVerified ? (
                          <CheckCircle className="w-3 h-3 mr-1" />
                        ) : (
                          <XCircle className="w-3 h-3 mr-1" />
                        )}
                        {user.isEmailVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold mb-4 flex items-center">
                  <UserIcon className="w-4 h-4 mr-2" />
                  Contact Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Email Address</Label>
                    <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Full Name</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <span className="font-medium">{user.fullName}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                    <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <CountryPhoneDisplay phone={user.phone} country={user.country} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Status */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold mb-4 flex items-center">
                  <Shield className="w-4 h-4 mr-2" />
                  Account Status & Permissions
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Role</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <Badge variant={user.role === UserRole.ADMIN ? 'destructive' : 'outline'}>
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Account Status</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Email Verified</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <Badge variant={user.isEmailVerified ? 'default' : 'outline'}>
                        {user.isEmailVerified ? (
                          <><CheckCircle className="w-3 h-3 mr-1" />Verified</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" />Unverified</>
                        )}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Verification Status</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <Badge variant="outline">{user.verificationStatus}</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Activity */}
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-semibold mb-4 flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  Account Activity & Timeline
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
                    <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{format(new Date(user.createdAt), 'MMM d, yyyy')}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(user.createdAt), 'HH:mm:ss')}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Profile Updated</Label>
                    <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{format(new Date(user.updatedAt), 'MMM d, yyyy')}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(user.updatedAt), 'HH:mm:ss')}</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">Last Login</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <div className="font-medium">
                        {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MMM d, yyyy HH:mm') : 'Never'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
                    <div className="p-3 bg-muted/50 rounded-md">
                      <span className="font-mono text-xs text-muted-foreground break-all">{user.id}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          </ScrollArea>

        <div className="border-t px-6 py-4 shrink-0 bg-background">
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Keep UserDetailsDialog for backward compatibility
export const UserDetailsDialog = ViewUserDialog;

// Delete Confirmation Dialog
export function DeleteUserDialog({ user, open, onOpenChange }: { user: User; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate: deleteUser, isPending } = useDeleteUser();

  const handleDelete = () => {
    deleteUser(user.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this user? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p><strong>User:</strong> {user.fullName}</p>
          <p><strong>Email:</strong> {user.email}</p>
          <p className="text-sm text-muted-foreground">
            All associated data will be permanently deleted.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Deleting...' : 'Delete User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export the enhanced EditUserDialog
export { EditUserDialog };
