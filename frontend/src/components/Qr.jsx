// QR code drawn locally (no internet needed). Scanning it opens the roll page.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function Qr({ text, size = 120 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setSvg); }, [text]);
  return <div className="qr" style={{ width: size, height: size }} role="img" aria-label={`QR code for ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
