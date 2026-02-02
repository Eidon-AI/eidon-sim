import { SensorRecording } from '../types/sensorData';

/**
 * Fetches sensor data from a URL, handling both raw JSON (legacy) and
 * gzip-compressed JSON (new uploads).
 *
 * Detection is done via gzip magic bytes (0x1f 0x8b) at the start of the response,
 * not via Content-Type or Content-Encoding headers.
 */
export async function fetchSensorData(url: string): Promise<SensorRecording> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sensor data: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Check for gzip magic bytes (0x1f 0x8b) and decompress if needed
  let jsonString: string;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // Gzip compressed - decompress using native DecompressionStream
    const decompressedStream = new Response(
      new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    );
    jsonString = await decompressedStream.text();
  } else {
    // Raw JSON (legacy uploads)
    jsonString = new TextDecoder().decode(bytes);
  }

  return JSON.parse(jsonString) as SensorRecording;
}
