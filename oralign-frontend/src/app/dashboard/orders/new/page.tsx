import { OrderWizard } from '@/components/orders/order-wizard';

export default function NewOrderPage() {
  return (
    <div className="@container/main flex flex-1 flex-col bg-muted/20 p-4 lg:p-6">
      <OrderWizard />
    </div>
  );
}
