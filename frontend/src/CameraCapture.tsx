import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Dialog, ErrorNotice } from './ui';
import './camera.css';

const captureError = 'Không lưu được ảnh từ camera. Hãy chọn ảnh từ thư viện.';

export function CameraCapture({ onClose, onPick, onCapture, title = 'Chụp ảnh lá' }: {
  title?: string;
  onClose: () => void;
  onPick: () => void;
  onCapture: (photo: File) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let closed = false;
    let stream: MediaStream | null = null;

    async function openCamera() {
      try {
        const result = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (closed) {
          result.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = result;
        if (video.current) video.current.srcObject = result;
      } catch {
        if (!closed) setError('Chưa mở được camera. Hãy kiểm tra quyền camera hoặc chọn ảnh từ thư viện.');
      }
    }

    void openCamera();
    return () => {
      closed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function takePhoto() {
    const source = video.current;
    if (!source?.videoWidth || capturing) return;

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1440 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale);
    canvas.height = Math.round(source.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) {
      setError(captureError);
      return;
    }

    setCapturing(true);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      setCapturing(false);
      if (blob) onCapture(new File([blob], 'anh-la.jpg', { type: 'image/jpeg' }));
      else setError(captureError);
    }, 'image/jpeg', 0.9);
  }

  return (
    <Dialog title={title} busy={capturing} onDismiss={onClose}>
      <ErrorNotice message={error} />
      <video className="camera-preview" aria-label="Xem trước camera" ref={video} autoPlay playsInline muted onPlaying={() => setReady(true)} />
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onPick} disabled={capturing}>Chọn ảnh có sẵn</button>
        <button type="button" className="button button-primary" disabled={!ready || capturing} onClick={takePhoto}>
          <Camera size={18} aria-hidden="true" /> Chụp
        </button>
      </div>
    </Dialog>
  );
}
