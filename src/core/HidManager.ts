import {
  EIDON_VENDOR_ID,
  EIDON_GLOVE_PID,
  EIDON_TRACKER_PID,
  CALIBRATE_OUT_REPORT_ID,
  CALIBRATE_PAYLOAD
} from './constants';

// TODO: move constants to ./constants.ts
export class HidManager extends EventTarget {
  private devices = new Map<string, HIDDevice>();

  async connect(): Promise<void> {
    const filters = [
      { vendorId: EIDON_VENDOR_ID, productId: EIDON_GLOVE_PID },
      { vendorId: EIDON_VENDOR_ID, productId: EIDON_TRACKER_PID }
    ];
    const ports = await navigator.hid.requestDevice({ filters });
    await Promise.all(ports.map(d => d.open()));
    ports.forEach(d => this.addDevice(d));
  }

  disconnectAll() {
    this.devices.forEach(d => d.close());
    this.devices.clear();
  }

  sendCalibrateAll() {
    this.devices.forEach(d => {
      d.sendReport(CALIBRATE_OUT_REPORT_ID, CALIBRATE_PAYLOAD);
    });
  }

  /* internal helpers -------------------------------------------------- */
  private addDevice(dev: HIDDevice) {
    const vid = dev.vendorId.toString(16).padStart(4, '0');
    const pid = dev.productId.toString(16).padStart(4, '0');
    const nameSlug = (dev.productName ?? 'device').trim().toLowerCase().replace(/\s+/g, '-');
    const idParts = [vid, pid, nameSlug];
    const id = idParts.join('-');
  
    this.devices.set(id, dev);
    dev.addEventListener('inputreport', (e: Event) => this.handleReport(e as HIDInputReportEvent, id));
  }
  private handleReport(e: HIDInputReportEvent, id: string) {
    const { data } = e;
    /* Emit "report" event with raw DataView for DeviceStore */
    this.dispatchEvent(new CustomEvent('report', { detail: { id, data } }));
  }
}
