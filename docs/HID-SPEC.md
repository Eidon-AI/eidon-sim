# Eidon Sym – HID Protocol Specification (v0.2)

## 1 Overview
Eidon devices use USB HID with VID `0xE1D0`.  
There are two product IDs:  

| PID | Device | Reports |
|-----|--------|---------|
| `0x0002` | **Tracker** (IMU only) | Report ID 1 (10 B) |
| `0x0001` | **Glove** (IMU + 16 finger angles) | Report ID 1 (26 B) |

All devices share:
* **Output report ID 1** – `01 01` → enter calibration mode  
* **Feature report ID 1** – 3-byte RGB (persisted on device)

---

## 2 Tracker (PID 0x0002)

| Byte(s) | Field | Notes |
|---------|-------|-------|
| 0-1 | **q.i**  (u16 LE) |
| 2-3 | **q.j**  (u16 LE) |
| 4-5 | **q.k**  (u16 LE) |
| 6-7 | **q.r**  (u16 LE) |
| 8   | **Button byte 0**<br>bit 0 = side (0 L / 1 R)<br>bit 1 = level (0 upper / 1 lower) |
| 9   | **Padding** |

Total 10 bytes.

Quaternion components map u16 → float:
```
float = (raw / 32767) − 1
```

---

## 3 Glove (PID 0x0001)

| Byte(s) | Field | Notes |
|---------|-------|-------|
| 0-1 | **Button byte 0-1** (16 bits)<br>Lower byte is general buttons; **upper byte holds config bits** |
| 2-17 | **Finger angles** (16 × u8) 0–255 |
| 18-19 | **q.i** (u16) |
| 20-21 | **q.j** |
| 22-23 | **q.k** |
| 24-25 | **q.r** |
| 26-… | none (report length 26) |

Config bits (byte 1):

* bit 0 — side (0 L / 1 R)  
* bit 1 — tracker-level equivalent (0 upper / 1 lower)  
  *Glove uses `'hand'` level in software but we still read bit 1 for completeness.*

---

## 4 Calibration Output (same for both)

* **Report ID** 1  
* Payload `01 01`  
* Device zeros its orientation filter and (optionally) saves offsets.

---

## 5 Color Feature Report

| Report ID | Length | Payload | Meaning |
|-----------|--------|---------|---------|
| **0x01** | 3 B | `R G B` (0–255) | Saved LED / UI color |

* Fetch: `device.receiveFeatureReport(0x01)`  
* Set:   `device.sendFeatureReport(0x01, Uint8Array.of(r,g,b))`

---

## 6 USB Descriptors (excerpt)

### 6.1 Tracker

* Report ID 1 descriptor matches **10-byte layout** above.  
* Vendor page `0xFF00` output & feature items share report ID 1.

### 6.2 Glove

* Report ID 1 descriptor: 16 bits of buttons, 16 × 8-bit usages, quaternion (Sensor page).  
* Vendor output & feature items also under report ID 1.

Full raw hex descriptors are in `docs/hid-raw-descriptors/…`.

---

## 7 Version history

| v | Date | Notes |
|---|------|-------|
| 0.2 | 2025-05-25 | Glove byte map fixed; feature report ID 1 confirmed. |
| 0.1 | 2025-05-20 | Initial draft for tracker only. |
