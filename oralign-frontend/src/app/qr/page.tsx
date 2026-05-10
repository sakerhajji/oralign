export default function QRPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="px-4 lg:px-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">QR Code</h1>
            <p className="text-sm text-muted-foreground">
              Generate and manage your QR code for patient check-ins.
            </p>
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-md">
            <p className="text-muted-foreground">QR code will be displayed here.</p>      </div>    </div>  </div></div>
  );
}