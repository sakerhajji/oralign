'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { PhoneInput } from '@/components/ui/phone-input';
import { User, UserRole } from '@/lib/types';
import { useUpdateUser } from '@/lib/hooks/use-users';
import { useAuth } from '@/lib/providers/auth-provider';
import { updateUserSchema, UpdateUserFormData } from '@/lib/schemas';
import { getAvatarUrl } from '@/lib/utils';
import { useT } from '@/lib/i18n/lang-context';
import { Upload, User as UserIcon, Shield, Mail, Phone, Key } from 'lucide-react';

interface EditUserDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const dialogVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2,
    },
  },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
    },
  }),
};

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const { t } = useT();
  // `avatarPreview` may hold three kinds of value:
  //   • a backend-relative path like `/uploads/avatars/<uuid>.jpg`
  //     (we always wrap it through getAvatarUrl() before rendering)
  //   • a `data:` URL while the user is previewing a freshly-picked file
  //   • '' (empty) → AvatarFallback shows the user's initials
  // We always store the RESOLVED absolute URL so a single <AvatarImage src>
  // read just works regardless of source.
  const [avatarPreview, setAvatarPreview] = useState<string>(
    getAvatarUrl(user.avatarUrl),
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutate: updateUser, isPending } = useUpdateUser();
  const { user: currentUser, isAdmin, login } = useAuth();
  
  const canEditPassword = isAdmin || currentUser?.id === user.id;
  const canEditRole = isAdmin;
  const canEditVerification = isAdmin;
  
  const { 
    register, 
    handleSubmit, 
    formState: { errors }, 
    reset, 
    control,
    setValue,
    watch,
  } = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      fullName: user.fullName,
      phone: user.phone || '',
      country: user.country || 'TN',
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        fullName: user.fullName,
        phone: user.phone || '',
        country: user.country || 'TN',
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      });
      setAvatarPreview(getAvatarUrl(user.avatarUrl));
      setAvatarFile(null);
    }
  }, [open, user, reset]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type and size
      if (!file.type.startsWith('image/')) {
        return; // TODO: Add toast notification
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        return; // TODO: Add toast notification
      }

      // Store the file for upload
      setAvatarFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setAvatarPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: UpdateUserFormData) => {
    setIsUploading(true);
    try {
      // If there's a new avatar file, upload it first. Capture the
      // response so we can refresh the auth context immediately when
      // an admin is editing themselves — otherwise the sidebar avatar
      // would stay stale until the next React Query refetch lands.
      if (avatarFile) {
        const { usersService } = await import('@/lib/api');
        const updatedUser = await usersService.uploadAvatar(user.id, avatarFile);
        setAvatarPreview(getAvatarUrl(updatedUser.avatarUrl));
        setAvatarFile(null);
        if (currentUser?.id === user.id) {
          login(updatedUser);
        }
      }

      // Remove empty password field if not editing
      const submitData = { ...data };
      if (!submitData.password || submitData.password.trim() === '') {
        delete submitData.password;
      }
      const trimmedPhone = submitData.phone?.trim();
      if (!trimmedPhone) {
        delete submitData.phone;
        delete submitData.country;
      } else {
        submitData.phone = trimmedPhone;
        submitData.country = submitData.country?.trim();
      }

      updateUser({ id: user.id, data: submitData }, {
        onSuccess: () => {
          onOpenChange(false);
        },
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    reset();
    setAvatarPreview(getAvatarUrl(user.avatarUrl));
    setAvatarFile(null);
    onOpenChange(false);
  };

  const isSubmitting = isPending || isUploading;
  const countryValue = watch('country');

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogContent className="sm:max-w-[800px] lg:max-w-[900px] h-[90vh] max-h-[90vh] p-0 overflow-hidden">
            <motion.div
              variants={dialogVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col h-full max-h-[90vh]"
            >
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b">
                <DialogTitle className="text-xl font-semibold">
                  {t('usersUi.editDialog.title')}
                </DialogTitle>
                <DialogDescription>
                  {t('usersUi.editDialog.desc')}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="px-6 py-4">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {/* Profile Picture Section */}
                  <motion.div
                    custom={0}
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center space-x-6">
                          <div className="relative">
                            <Avatar className="w-20 h-20 border-2 border-muted">
                              <AvatarImage src={avatarPreview} alt={user.fullName} />
                              <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                {user.fullName
                                  .split(' ')
                                  .map(n => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <Label className="text-sm font-medium">
                                {t('usersUi.editDialog.profilePicture')}
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                {t('usersUi.editDialog.pictureHint')}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {t('usersUi.editDialog.uploadImage')}
                              </Button>
                              {avatarPreview && avatarPreview !== getAvatarUrl(user.avatarUrl) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setAvatarPreview(getAvatarUrl(user.avatarUrl));
                                    setAvatarFile(null);
                                  }}
                                >
                                  {t('usersUi.reset')}
                                </Button>
                              )}
                              <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Identity Section */}
                  <motion.div
                    custom={1}
                    variants={sectionVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Card>
                      <CardContent className="pt-6">
                        <h4 className="font-semibold mb-4 flex items-center">
                          <UserIcon className="w-4 h-4 mr-2" />
                          {t('usersUi.editDialog.identity')}
                        </h4>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="fullName">{t('usersUi.fullNameRequired')}</Label>
                            <Input
                              id="fullName"
                              {...register('fullName')}
                              placeholder={t('usersUi.editDialog.fullNamePh')}
                            />
                            {errors.fullName && (
                              <p className="text-sm text-red-500">{errors.fullName.message}</p>
                            )}
                          </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone" className="flex items-center">
                            <Phone className="w-4 h-4 mr-2" />
                            {t('usersUi.editDialog.phoneNumber')}
                          </Label>
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
                                  setValue('country', next.country, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
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
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Security Section */}
                  {canEditPassword && (
                    <motion.div
                      custom={2}
                      variants={sectionVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="font-semibold mb-4 flex items-center">
                            <Key className="w-4 h-4 mr-2" />
                            {t('usersUi.editDialog.security')}
                          </h4>

                          <div className="space-y-2">
                            <Label htmlFor="password">{t('usersUi.newPassword')}</Label>
                            <Input
                              id="password"
                              type="password"
                              placeholder={t('usersUi.keepPasswordHint')}
                              {...register('password')}
                            />
                            <p className="text-sm text-muted-foreground">
                              {t('usersUi.editDialog.passwordHint')}
                            </p>
                            {errors.password && (
                              <p className="text-sm text-red-500">{errors.password.message}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* Permissions Section (Admin Only) */}
                  {(canEditRole || canEditVerification) && (
                    <motion.div
                      custom={3}
                      variants={sectionVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="font-semibold mb-4 flex items-center">
                            <Shield className="w-4 h-4 mr-2" />
                            {t('usersUi.editDialog.permissions')}
                          </h4>

                          <div className="space-y-6">
                            {canEditRole && (
                              <div className="space-y-2">
                                <Label htmlFor="role">{t('usersUi.editDialog.userRole')}</Label>
                                <Controller
                                  name="role"
                                  control={control}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder={t('usersUi.selectRole')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={UserRole.ADMIN}>
                                          {t('usersUi.roles.admin')}
                                        </SelectItem>
                                        <SelectItem value={UserRole.DENTIST}>
                                          {t('usersUi.roles.dentist')}
                                        </SelectItem>
                                        <SelectItem value={UserRole.DESIGNER}>
                                          {t('usersUi.roles.designer')}
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                                {errors.role && (
                                  <p className="text-sm text-red-500">{errors.role.message}</p>
                                )}
                              </div>
                            )}

                            {canEditVerification && (
                              <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <Label className="flex items-center">
                                    <Mail className="w-4 h-4 mr-2" />
                                    {t('usersUi.emailVerified')}
                                  </Label>
                                  <p className="text-sm text-muted-foreground">
                                    {t('usersUi.editDialog.markVerified')}
                                  </p>
                                </div>
                                <Controller
                                  name="isEmailVerified"
                                  control={control}
                                  render={({ field }) => (
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  )}
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </form>
                </div>
              </ScrollArea>
              </div>

              <div className="px-6 pt-4 pb-6 border-t shrink-0 bg-background">
                <div className="flex space-x-2 justify-end">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={handleSubmit(onSubmit)}
                  >
                    {isSubmitting
                      ? t('usersUi.editDialog.updating')
                      : t('usersUi.editDialog.updateProfile')}
                  </Button>
                </div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
