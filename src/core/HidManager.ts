import {
  EIDON_VENDOR_ID,
  EIDON_GLOVE_PID,
  EIDON_TRACKER_PID,
  CALIBRATE_OUT_REPORT_ID,
  CALIBRATE_PAYLOAD,
  COLOR_FEATURE_REPORT_ID
} from './constants';

export type HidId = string;

/* helper to convert [r,g,b] → "#rrggbb" */
function rgbHex(rgb: [number, number, number]) {
  return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
}
export class HidManager extends EventTarget {
  /* ---------------- constructor ---------------- */
  constructor() {
    super();
    this.autoReconnect();
  }

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

  /* disconnectAll calls close but keep permissions */
  disconnectAll() {
    this.devices.forEach(d => d.close());
    this.devices.clear();
  }

  /** Disconnect + un-pair a single device */
  async unpair(id: HidId) {
    const dev = this.devices.get(id);
    if (!dev) return;
    await dev.close();
    // experimental: only some Chrome versions
    if ('forget' in dev) {
      try { await (dev as any).forget(); }
      catch (e) { console.warn('forget() failed', e); }
    }
    this.devices.delete(id);
    document.dispatchEvent(new CustomEvent('deviceRemoved', { detail: { id } }));
  }

  /* ---------------- public API ---------------- */
  async autoReconnect() {
    const granted = await navigator.hid.getDevices();
    for (const dev of granted) {
      await dev.open();
      this.addDevice(dev);
    }
  }

  startCalibration(deviceId: string | null = null) {
    console.log("Starting calibration");
    this.sendCalibrate(deviceId);
  }

  sendCalibrate(deviceId: string | null = null) {
    console.log("Sending calibration");
    if (deviceId) {
      const dev = this.devices.get(deviceId);
      if (dev) {
        const payload = new Uint8Array([CALIBRATE_PAYLOAD]);
        dev.sendReport(CALIBRATE_OUT_REPORT_ID, payload);
      }
    } else {
      this.devices.forEach(d => {
        const payload = new Uint8Array([CALIBRATE_PAYLOAD]);
        d.sendReport(CALIBRATE_OUT_REPORT_ID, payload);
      });
    }
  }

  /* -------- read 3-byte RGB feature report -------- */
  async getColor(dev: HIDDevice): Promise<[number, number, number]> {
    const dv = await dev.receiveFeatureReport(COLOR_FEATURE_REPORT_ID);
    return [dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)];
  }

  /* -------- write 3-byte RGB feature report -------- */
  setColor(dev: HIDDevice, rgb: [number, number, number]) {
    dev.sendFeatureReport(COLOR_FEATURE_REPORT_ID, Uint8Array.from(rgb));
    const id = [...this.devices.entries()]
                .find(([_, d]) => d === dev)?.[0];
    if (id) {
      document.dispatchEvent(
        new CustomEvent('deviceColor', { detail: { id, hex: rgbHex(rgb) } })
      );
    }
  }

  /* internal helpers -------------------------------------------------- */
  private addDevice(dev: HIDDevice) {
    const vid = dev.vendorId.toString(16).padStart(4, '0');
    const pid = dev.productId.toString(16).padStart(4, '0');
    const nameSlug = (dev.productName ?? 'device').trim().toLowerCase().replace(/\s+/g, '-');
    const idParts = [vid, pid, nameSlug];
    const id = idParts.join('-');

    this.getColor(dev).then(rgb => {
      document.dispatchEvent(
        new CustomEvent('deviceColor', { detail: { id, hex: rgbHex(rgb) } })
      );
    });

    this.devices.set(id, dev);
    dev.addEventListener('inputreport', (e: Event) => this.handleReport(e as HIDInputReportEvent, id));
  }
  private handleReport(e: HIDInputReportEvent, id: string) {
    const { data } = e;
    /* Emit "report" event with raw DataView for DeviceStore */
    this.dispatchEvent(new CustomEvent('report', { detail: { id, data } }));
  }

  public destroy(): void {
    // Close all HID connections
    this.devices.forEach(async (device) => {
      try {
        await device.close();
      } catch (e) {
        console.warn('Failed to close HID device:', e);
      }
    });
    
    // Clear device map
    this.devices.clear();
    
    console.log('HidManager destroyed');
  }
}
