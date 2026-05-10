import apiClient from './client';
import {
  CreateOrderDto,
  DentalOrder,
  MessageResponse,
  OrderFile,
  OrderFileCategory,
  OrderFilterParams,
  PaginatedResponse,
  ToothInstruction,
  UpdateOrderDto,
} from '@/lib/types';

export const ordersService = {
  getOrders: async (
    params?: OrderFilterParams,
  ): Promise<PaginatedResponse<DentalOrder>> => {
    const response = await apiClient.get<PaginatedResponse<DentalOrder>>(
      '/orders',
      { params },
    );
    return response.data;
  },

  getOrderById: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.get<DentalOrder>(`/orders/${id}`);
    return response.data;
  },

  createOrder: async (data: CreateOrderDto): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>('/orders', data);
    return response.data;
  },

  updateOrder: async (
    id: string,
    data: UpdateOrderDto,
  ): Promise<DentalOrder> => {
    const response = await apiClient.put<DentalOrder>(`/orders/${id}`, data);
    return response.data;
  },

  deleteOrder: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(`/orders/${id}`);
    return response.data;
  },

  permanentDeleteOrder: async (id: string): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/orders/${id}/permanent`,
    );
    return response.data;
  },

  submitOrder: async (id: string): Promise<DentalOrder> => {
    const response = await apiClient.post<DentalOrder>(`/orders/${id}/submit`);
    return response.data;
  },

  updateToothInstructions: async (
    id: string,
    instructions: ToothInstruction[],
  ): Promise<DentalOrder> => {
    const response = await apiClient.put<DentalOrder>(
      `/orders/${id}/tooth-instructions`,
      { instructions },
    );
    return response.data;
  },

  uploadFiles: async (
    id: string,
    files: File[],
    category: OrderFileCategory,
  ): Promise<OrderFile[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const response = await apiClient.post<OrderFile[]>(
      `/orders/${id}/files`,
      formData,
      {
        params: { category },
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  },

  getFiles: async (id: string): Promise<OrderFile[]> => {
    const response = await apiClient.get<OrderFile[]>(`/orders/${id}/files`);
    return response.data;
  },

  deleteFile: async (
    id: string,
    fileId: string,
  ): Promise<MessageResponse> => {
    const response = await apiClient.delete<MessageResponse>(
      `/orders/${id}/files/${fileId}`,
    );
    return response.data;
  },

  getDownloadUrl: (id: string, fileId: string) =>
    `/orders/${id}/files/${fileId}/download`,
};
