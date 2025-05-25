interface HIDDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  serialNumber?: string;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
}

interface HIDInputReportEvent extends Event {
  data: DataView;
}

interface Navigator {
  hid: {
    requestDevice(options: { filters: Array<{ vendorId: number; productId: number }> }): Promise<HIDDevice[]>;
  };
} 